import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Passage, ReviewItem } from '../src/types.js';
import { answerReview, createReviewSession } from '../src/domain/review/session.js';
import { selectReviewGroup } from '../src/domain/review/selection.js';
import type {
  ArchiveNamespace,
  ArchiveSnapshot,
  NamespaceRoots,
  ReviewSessionAttemptResult,
  ReviewSessionRecord,
  StoredRoot,
} from './types.js';
import { isArchiveNamespace, queueFromRoot, rootWithQueue } from './types.js';

interface NamespaceRow {
  namespace: ArchiveNamespace;
  schema_version: number;
  data_json: string;
}

interface SessionRow {
  id: string;
  status: 'active' | 'completed';
  passage_id: string | null;
  state_json: string;
  created_at: string;
  updated_at: string;
}

interface ReviewSessionLike {
  items?: Array<{ passageId?: string }>;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isoNow(): string {
  return new Date().toISOString();
}

function defaultDbPath(): string {
  return resolve(process.cwd(), 'data', 'wenyan.sqlite');
}

export class ArchiveDatabase {
  readonly db: Database.Database;

  constructor(filename = process.env.WENYAN_DB_PATH ?? defaultDbPath()) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS archive_namespaces (
        namespace TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS content_passages (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL DEFAULT 'builtin',
        content_version TEXT NOT NULL,
        passage_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS learning_entries (
        passage_id TEXT PRIMARY KEY,
        added_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS learning_progress (
        passage_id TEXT PRIMARY KEY,
        content_version TEXT,
        progress_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mistake_records (
        passage_id TEXT NOT NULL,
        sentence_key TEXT NOT NULL,
        record_date TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY(passage_id, sentence_key, record_date)
      );
      CREATE TABLE IF NOT EXISTS exam_attempts (
        id TEXT PRIMARY KEY,
        passage_id TEXT NOT NULL,
        completed_at TEXT,
        attempt_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS badge_state (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        badges_json TEXT NOT NULL,
        processed_event_ids_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_items (
        id TEXT PRIMARY KEY,
        passage_id TEXT NOT NULL,
        target_clause_id TEXT,
        status TEXT NOT NULL,
        item_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_review_items_pending
        ON review_items(status, passage_id);
      CREATE TABLE IF NOT EXISTS review_sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        passage_id TEXT,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_attempts (
        operation_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        result TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
    `);
    const passageColumns = this.db.prepare('PRAGMA table_info(content_passages)').all() as Array<{ name: string }>;
    if (!passageColumns.some((column) => column.name === 'source_type')) {
      this.db.exec("ALTER TABLE content_passages ADD COLUMN source_type TEXT NOT NULL DEFAULT 'builtin'");
    }
    const reviewSessionColumns = this.db.prepare('PRAGMA table_info(review_sessions)').all() as Array<{ name: string }>;
    if (!reviewSessionColumns.some((column) => column.name === 'passage_id')) {
      this.db.exec('ALTER TABLE review_sessions ADD COLUMN passage_id TEXT');
    }
    // Keep one resumable session per selected passage. The second index keeps
    // pre-selection legacy sessions (passage_id IS NULL) unique as well.
    this.db.exec(`
      DROP INDEX IF EXISTS idx_active_review_session;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_review_session_passage
        ON review_sessions(status, passage_id)
        WHERE status = 'active' AND passage_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_review_session_legacy
        ON review_sessions(status)
        WHERE status = 'active' AND passage_id IS NULL;
    `);
    this.db.prepare(`
      INSERT INTO app_meta(key, value) VALUES ('archive_initialized', '0')
      ON CONFLICT(key) DO NOTHING
    `).run();
  }

  close(): void {
    this.db.close();
  }

  private readRoots(): NamespaceRoots {
    const rows = this.db.prepare('SELECT namespace, schema_version, data_json FROM archive_namespaces').all() as NamespaceRow[];
    return Object.fromEntries(rows.map((row) => [row.namespace, {
      schemaVersion: row.schema_version,
      data: parseJson(row.data_json, {}),
    }])) as NamespaceRoots;
  }

  private writeNamespace(namespace: ArchiveNamespace, root: StoredRoot, updatedAt = isoNow()): void {
    this.db.prepare(`
      INSERT INTO archive_namespaces(namespace, schema_version, data_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace) DO UPDATE SET
        schema_version = excluded.schema_version,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(namespace, root.schemaVersion, JSON.stringify(root.data), updatedAt);
  }

  private bumpRevision(): number {
    const row = this.db.prepare("SELECT value FROM app_meta WHERE key = 'archive_revision'").get() as { value: string } | undefined;
    const next = Number(row?.value ?? 0);
    const revision = next + 1;
    this.db.prepare("INSERT INTO app_meta(key, value) VALUES ('archive_revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(revision));
    return revision;
  }

  private setInitialized(): void {
    this.db.prepare("UPDATE app_meta SET value = '1' WHERE key = 'archive_initialized'").run();
  }

  private materializeReviewQueue(root: StoredRoot): void {
    const queue = queueFromRoot(root);
    this.db.prepare('DELETE FROM review_items').run();
    const insert = this.db.prepare(`
      INSERT INTO review_items(id, passage_id, target_clause_id, status, item_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updatedAt = isoNow();
    for (const item of queue) {
      insert.run(item.id, item.passageId, item.targetClauseId ?? null, item.status, JSON.stringify(item), updatedAt);
    }
  }

  private materializeLearning(root: StoredRoot): void {
    const data = recordValue(root.data);
    const entries = Array.isArray(data.entries) ? data.entries : [];
    this.db.prepare('DELETE FROM learning_entries').run();
    const insertEntry = this.db.prepare('INSERT INTO learning_entries(passage_id, added_at) VALUES (?, ?)');
    for (const raw of entries) {
      const entry = recordValue(raw);
      if (typeof entry.id === 'string' && typeof entry.addedAt === 'string') insertEntry.run(entry.id, entry.addedAt);
    }
    const onlinePassages = recordValue(data.onlinePassages);
    this.db.prepare("DELETE FROM content_passages WHERE source_type = 'online'").run();
    this.upsertPassages(Object.values(onlinePassages).filter((value): value is Passage => {
      const passage = recordValue(value);
      return typeof passage.id === 'string' && typeof passage.contentVersion === 'string';
    }));
  }

  private materializeProgress(root: StoredRoot): void {
    const progress = recordValue(recordValue(root.data).progress);
    this.db.prepare('DELETE FROM learning_progress').run();
    const insert = this.db.prepare('INSERT INTO learning_progress(passage_id, content_version, progress_json, updated_at) VALUES (?, ?, ?, ?)');
    for (const [passageId, raw] of Object.entries(progress)) {
      const value = recordValue(raw);
      insert.run(
        passageId,
        typeof value.contentVersion === 'string' ? value.contentVersion : null,
        JSON.stringify(raw),
        typeof value.updatedAt === 'string' ? value.updatedAt : isoNow(),
      );
    }
  }

  private materializeMistakes(root: StoredRoot): void {
    const mistakes = recordValue(recordValue(root.data).mistakes);
    this.db.prepare('DELETE FROM mistake_records').run();
    const insert = this.db.prepare('INSERT INTO mistake_records(passage_id, sentence_key, record_date, record_json) VALUES (?, ?, ?, ?)');
    for (const [passageId, rawRecords] of Object.entries(mistakes)) {
      if (!Array.isArray(rawRecords)) continue;
      for (const raw of rawRecords) {
        const value = recordValue(raw);
        if (typeof value.sentenceKey !== 'string' || typeof value.date !== 'string') continue;
        insert.run(passageId, value.sentenceKey, value.date, JSON.stringify(raw));
      }
    }
  }

  private materializeAttempts(root: StoredRoot): void {
    const attempts = recordValue(recordValue(root.data).attempts);
    this.db.prepare('DELETE FROM exam_attempts').run();
    const insert = this.db.prepare('INSERT INTO exam_attempts(id, passage_id, completed_at, attempt_json) VALUES (?, ?, ?, ?)');
    for (const [id, raw] of Object.entries(attempts)) {
      const value = recordValue(raw);
      if (typeof value.passageId !== 'string') continue;
      insert.run(id, value.passageId, typeof value.completedAt === 'string' ? value.completedAt : null, JSON.stringify(raw));
    }
  }

  private materializeBadges(root: StoredRoot): void {
    const data = recordValue(root.data);
    const badges = recordValue(data.badges);
    const eventIds = Array.isArray(data.processedEventIds) ? data.processedEventIds : [];
    this.db.prepare(`
      INSERT INTO badge_state(id, badges_json, processed_event_ids_json) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET badges_json = excluded.badges_json, processed_event_ids_json = excluded.processed_event_ids_json
    `).run(JSON.stringify(badges), JSON.stringify(eventIds));
  }

  private materializeNamespace(namespace: ArchiveNamespace, root: StoredRoot): void {
    if (namespace === 'learning') this.materializeLearning(root);
    else if (namespace === 'progress') this.materializeProgress(root);
    else if (namespace === 'mistakes') this.materializeMistakes(root);
    else if (namespace === 'reviewQueue') this.materializeReviewQueue(root);
    else if (namespace === 'attempts') this.materializeAttempts(root);
    else if (namespace === 'badges') this.materializeBadges(root);
  }

  private syncReviewNamespace(queue: ReviewItem[]): void {
    const current = this.getNamespace('reviewQueue');
    this.writeNamespace('reviewQueue', rootWithQueue(current, queue));
  }

  getNamespace(namespace: ArchiveNamespace): StoredRoot | undefined {
    const row = this.db.prepare('SELECT schema_version, data_json FROM archive_namespaces WHERE namespace = ?').get(namespace) as { schema_version: number; data_json: string } | undefined;
    return row ? { schemaVersion: row.schema_version, data: parseJson(row.data_json, {}) } : undefined;
  }

  getArchive(): ArchiveSnapshot {
    const initialized = (this.db.prepare("SELECT value FROM app_meta WHERE key = 'archive_initialized'").get() as { value: string } | undefined)?.value === '1';
    const revision = Number((this.db.prepare("SELECT value FROM app_meta WHERE key = 'archive_revision'").get() as { value: string } | undefined)?.value ?? 0);
    return {
      initialized,
      revision: Number.isFinite(revision) ? revision : 0,
      namespaces: this.readRoots(),
      activeReviewSession: this.getActiveReviewSession(),
    };
  }

  importArchive(namespaces: NamespaceRoots): ArchiveSnapshot {
    const transaction = this.db.transaction(() => {
      for (const [name, root] of Object.entries(namespaces)) {
        if (!root || !isArchiveNamespace(name)) continue;
        this.writeNamespace(name, root);
        this.materializeNamespace(name, root);
      }
      this.setInitialized();
      this.bumpRevision();
    });
    transaction();
    return this.getArchive();
  }

  putNamespace(namespace: ArchiveNamespace, root: StoredRoot): ArchiveSnapshot {
    const transaction = this.db.transaction(() => {
      this.writeNamespace(namespace, root);
      this.materializeNamespace(namespace, root);
      this.setInitialized();
      this.bumpRevision();
    });
    transaction();
    return this.getArchive();
  }

  private upsertPassages(passages: readonly Passage[]): void {
    const insert = this.db.prepare(`
      INSERT INTO content_passages(id, source_type, content_version, passage_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_type = excluded.source_type,
        content_version = excluded.content_version,
        passage_json = excluded.passage_json,
        updated_at = excluded.updated_at
    `);
    for (const passage of passages) {
      insert.run(passage.id, passage.sourceType, passage.contentVersion, JSON.stringify(passage), isoNow());
    }
  }

  seedPassages(passages: readonly Passage[]): void {
    const transaction = this.db.transaction(() => this.upsertPassages(passages));
    transaction();
  }

  listPassages(): Passage[] {
    return (this.db.prepare('SELECT passage_json FROM content_passages ORDER BY id').all() as Array<{ passage_json: string }>)
      .map((row) => parseJson<Passage | null>(row.passage_json, null))
      .filter((passage): passage is Passage => passage !== null);
  }

  private sessionFromRow(row: SessionRow): ReviewSessionRecord {
    return {
      id: row.id,
      status: row.status,
      passageId: row.passage_id,
      state: parseJson(row.state_json, createReviewSession([])),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getActiveReviewSession(): ReviewSessionRecord | null {
    const row = this.db.prepare("SELECT * FROM review_sessions WHERE status = 'active' LIMIT 1").get() as SessionRow | undefined;
    return row ? this.sessionFromRow(row) : null;
  }

  getReviewSession(id: string): ReviewSessionRecord | null {
    const row = this.db.prepare('SELECT * FROM review_sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? this.sessionFromRow(row) : null;
  }

  createOrResumeReviewSession(passageId?: string): { session: ReviewSessionRecord; source: 'created' | 'resumed' } {
    const active = passageId
      ? (this.db.prepare("SELECT * FROM review_sessions WHERE status = 'active' AND passage_id = ? LIMIT 1").get(passageId) as SessionRow | undefined)
      : (this.db.prepare("SELECT * FROM review_sessions WHERE status = 'active' LIMIT 1").get() as SessionRow | undefined);
    const activeSession = active ? this.sessionFromRow(active) : null;
    if (activeSession) return { session: activeSession, source: 'resumed' };
    const rows = passageId
      ? this.db.prepare("SELECT item_json FROM review_items WHERE status = 'pending' AND passage_id = ?").all(passageId) as Array<{ item_json: string }>
      : this.db.prepare("SELECT item_json FROM review_items WHERE status = 'pending'").all() as Array<{ item_json: string }>;
    const items = rows.map((row) => parseJson<ReviewItem | null>(row.item_json, null)).filter((item): item is ReviewItem => item !== null);
    const session = createReviewSession(selectReviewGroup(items));
    const id = `review-session:${randomUUID()}`;
    const createdAt = isoNow();
    this.db.prepare(`
      INSERT INTO review_sessions(id, status, passage_id, state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, session.completed ? 'completed' : 'active', passageId ?? null, JSON.stringify(session), createdAt, createdAt);
    return { session: { id, status: session.completed ? 'completed' : 'active', passageId: passageId ?? null, state: session, createdAt, updatedAt: createdAt }, source: 'created' };
  }

  resetPassageData(passageId: string): { ok: true; passageId: string } {
    const transaction = this.db.transaction(() => {
      const namespaces: Array<ArchiveNamespace> = ['progress', 'mistakes', 'reviewQueue', 'attempts'];
      for (const namespace of namespaces) {
        const root = this.getNamespace(namespace);
        if (!root || typeof root.data !== 'object' || root.data === null) continue;
        const data = recordValue(root.data);
        if (namespace === 'progress') {
          const progress = recordValue(data.progress);
          delete progress[passageId];
          this.writeNamespace(namespace, { ...root, data: { ...data, progress } });
        } else if (namespace === 'mistakes') {
          const mistakes = recordValue(data.mistakes);
          delete mistakes[passageId];
          this.writeNamespace(namespace, { ...root, data: { ...data, mistakes } });
        } else if (namespace === 'reviewQueue') {
          const queue = Array.isArray(data.queue)
            ? data.queue.filter((item) => recordValue(item).passageId !== passageId)
            : [];
          this.writeNamespace(namespace, { ...root, data: { ...data, queue } });
        } else {
          const attempts = recordValue(data.attempts);
          const filtered = Object.fromEntries(
            Object.entries(attempts).filter(([, attempt]) => recordValue(attempt).passageId !== passageId),
          );
          this.writeNamespace(namespace, { ...root, data: { ...data, attempts: filtered } });
        }
        this.materializeNamespace(namespace, this.getNamespace(namespace) as StoredRoot);
      }

      // The archive namespace may not have been imported yet, but its
      // materialized table can still contain data from an earlier sync.
      const sessions = this.db.prepare(`
        SELECT DISTINCT review_sessions.id, review_sessions.passage_id, review_sessions.state_json,
          CASE WHEN review_items.passage_id = ? THEN 1 ELSE 0 END AS has_passage_item
        FROM review_sessions
        LEFT JOIN review_attempts ON review_attempts.session_id = review_sessions.id
        LEFT JOIN review_items ON review_items.id = review_attempts.item_id
        WHERE review_sessions.passage_id = ? OR review_items.passage_id = ? OR review_sessions.passage_id IS NULL
      `).all(passageId, passageId, passageId) as Array<{
        id: string;
        passage_id: string | null;
        state_json: string;
        has_passage_item: number;
      }>;
      this.db.prepare('DELETE FROM learning_progress WHERE passage_id = ?').run(passageId);
      this.db.prepare('DELETE FROM mistake_records WHERE passage_id = ?').run(passageId);
      this.db.prepare('DELETE FROM exam_attempts WHERE passage_id = ?').run(passageId);
      this.db.prepare('DELETE FROM review_items WHERE passage_id = ?').run(passageId);
      const sessionIds = sessions
        .filter((session) => session.passage_id === passageId || session.has_passage_item === 1 || (
          session.passage_id === null
          && (parseJson<ReviewSessionLike>(session.state_json, { items: [] }).items ?? [])
            .some((item) => item.passageId === passageId)
        ))
        .map((session) => session.id);
      for (const sessionId of sessionIds) {
        this.db.prepare('DELETE FROM review_attempts WHERE session_id = ?').run(sessionId);
        this.db.prepare('DELETE FROM review_sessions WHERE id = ?').run(sessionId);
      }
      this.bumpRevision();
    });
    transaction();
    return { ok: true, passageId };
  }

  applyReviewAttempt(sessionId: string, input: ReviewSessionAttemptResult): { session: ReviewSessionRecord; source: 'updated' | 'already-applied' } {
    const transaction = this.db.transaction(() => {
      const existingAttempt = this.db.prepare('SELECT operation_id FROM review_attempts WHERE operation_id = ?').get(input.operationId);
      const row = this.db.prepare('SELECT * FROM review_sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
      if (!row) throw new Error('review session not found');
      const current = this.sessionFromRow(row);
      if (existingAttempt) return { session: current, source: 'already-applied' as const };
      if (current.status !== 'active') throw new Error('review session is not active');
      if (current.state.items[0]?.id !== input.itemId) throw new Error('review item is not current');

      const next = answerReview(current.state, input.result);
      const now = input.occurredAt ?? isoNow();
      const currentItem = current.state.items[0];
      if (input.result === 'miss') {
        const updatedItem = { ...currentItem, attempts: currentItem.attempts + 1 };
        this.db.prepare('UPDATE review_items SET item_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedItem), now, currentItem.id);
      } else if (!next.items.some((item) => item.id === currentItem.id)) {
        const completedItem = { ...currentItem, status: 'completed' as const, completedAt: now };
        this.db.prepare('UPDATE review_items SET status = ?, item_json = ?, updated_at = ? WHERE id = ?').run('completed', JSON.stringify(completedItem), now, currentItem.id);
      }

      const status = next.completed ? 'completed' : 'active';
      this.db.prepare('UPDATE review_sessions SET status = ?, state_json = ?, updated_at = ? WHERE id = ?').run(status, JSON.stringify(next), now, sessionId);
      this.db.prepare('INSERT INTO review_attempts(operation_id, session_id, item_id, result, occurred_at) VALUES (?, ?, ?, ?, ?)').run(input.operationId, sessionId, input.itemId, input.result, now);

      const queue = (this.db.prepare('SELECT item_json FROM review_items').all() as Array<{ item_json: string }>)
        .map((item) => parseJson<ReviewItem | null>(item.item_json, null)).filter((item): item is ReviewItem => item !== null);
      this.syncReviewNamespace(queue);
      this.bumpRevision();
      const updated = this.getReviewSession(sessionId);
      if (!updated) throw new Error('review session disappeared');
      return { session: updated, source: 'updated' as const };
    });
    return transaction() as { session: ReviewSessionRecord; source: 'updated' | 'already-applied' };
  }

  completeReviewSession(id: string): ReviewSessionRecord {
    const session = this.getReviewSession(id);
    if (!session) throw new Error('review session not found');
    if (session.status !== 'completed') throw new Error('review session is not complete');
    return session;
  }
}
