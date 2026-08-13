import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Passage, ReviewItem } from '../src/types.js';
import { answerReview, createReviewSession } from '../src/domain/review/session.js';
import { selectReviewGroup } from '../src/domain/review/selection.js';
import { hashPassword, isValidPassword } from './auth.js';
import type {
  ArchiveNamespace,
  ArchiveSnapshot,
  AuthUser,
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
  user_id: number;
  status: 'active' | 'completed';
  passage_id: string | null;
  state_json: string;
  created_at: string;
  updated_at: string;
}

interface ReviewSessionLike {
  items?: Array<{ passageId?: string }>;
}

interface LoginUserRow {
  id: number;
  username: string;
  password_hash: string;
}

const LEGACY_TABLES = [
  'archive_namespaces',
  'content_passages',
  'learning_entries',
  'learning_progress',
  'mistake_records',
  'exam_attempts',
  'badge_state',
  'review_items',
  'review_sessions',
  'review_attempts',
] as const;

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

  private tableExists(name: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  }

  private tableColumns(name: string): string[] {
    if (!this.tableExists(name)) return [];
    return (this.db.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>).map((column) => column.name);
  }

  private hasLegacySchema(): boolean {
    return (
      this.tableExists('archive_namespaces') && !this.tableColumns('archive_namespaces').includes('user_id')
      || this.tableExists('content_passages') && !this.tableColumns('content_passages').includes('owner_user_id')
      || this.tableExists('learning_entries') && !this.tableColumns('learning_entries').includes('user_id')
      || this.tableExists('learning_progress') && !this.tableColumns('learning_progress').includes('user_id')
      || this.tableExists('mistake_records') && !this.tableColumns('mistake_records').includes('user_id')
      || this.tableExists('exam_attempts') && !this.tableColumns('exam_attempts').includes('user_id')
      || this.tableExists('badge_state') && !this.tableColumns('badge_state').includes('user_id')
      || this.tableExists('review_items') && !this.tableColumns('review_items').includes('user_id')
      || this.tableExists('review_sessions') && !this.tableColumns('review_sessions').includes('user_id')
      || this.tableExists('review_attempts') && !this.tableColumns('review_attempts').includes('user_id')
    );
  }

  private tableCount(name: string): number {
    if (!this.tableExists(name)) return 0;
    return Number((this.db.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get() as { count: number }).count);
  }

  private hasLegacyUserData(): boolean {
    if (this.tableCount('archive_namespaces') > 0) return true;
    if (this.tableCount('learning_entries') > 0) return true;
    if (this.tableCount('learning_progress') > 0) return true;
    if (this.tableCount('mistake_records') > 0) return true;
    if (this.tableCount('exam_attempts') > 0) return true;
    if (this.tableCount('badge_state') > 0) return true;
    if (this.tableCount('review_items') > 0) return true;
    if (this.tableCount('review_sessions') > 0) return true;
    if (this.tableCount('review_attempts') > 0) return true;
    return Boolean(this.db.prepare("SELECT 1 FROM content_passages WHERE source_type = 'online' LIMIT 1").get());
  }

  private createUserTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS user_meta (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY(user_id, key)
      );
    `);
  }

  private findAdmin(): AuthUser | null {
    const row = this.db.prepare('SELECT id, username FROM users WHERE username = ?').get('admin') as { id: number; username: string } | undefined;
    return row ? { id: row.id, username: row.username } : null;
  }

  private createAdminForMigration(): AuthUser {
    const configuredPassword = process.env.WENYAN_ADMIN_PASSWORD;
    if (!configuredPassword && process.env.NODE_ENV !== 'test') {
      throw new Error('WENYAN_ADMIN_PASSWORD is required when migrating an existing archive');
    }
    const password = configuredPassword ?? 'test-admin-password';
    if (!isValidPassword(password)) throw new Error('WENYAN_ADMIN_PASSWORD must be 8-128 characters');
    const now = isoNow();
    const result = this.db.prepare('INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)').run('admin', hashPassword(password), now);
    return { id: Number(result.lastInsertRowid), username: 'admin' };
  }

  private renameLegacyTables(): void {
    this.db.exec(`
      DROP INDEX IF EXISTS idx_review_items_pending;
      DROP INDEX IF EXISTS idx_active_review_session;
      DROP INDEX IF EXISTS idx_active_review_session_passage;
      DROP INDEX IF EXISTS idx_active_review_session_legacy;
    `);
    for (const table of LEGACY_TABLES) {
      if (!this.tableExists(table)) continue;
      const legacyName = `legacy_${table}`;
      if (!this.tableExists(legacyName)) this.db.exec(`ALTER TABLE "${table}" RENAME TO "${legacyName}"`);
    }
  }

  private createUserScopedTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS archive_namespaces (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        namespace TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, namespace)
      );
      CREATE TABLE IF NOT EXISTS content_passages (
        id TEXT NOT NULL,
        owner_user_id INTEGER NOT NULL DEFAULT 0,
        source_type TEXT NOT NULL DEFAULT 'builtin',
        content_version TEXT NOT NULL,
        passage_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_user_id, id)
      );
      CREATE TABLE IF NOT EXISTS learning_entries (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        passage_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY(user_id, passage_id)
      );
      CREATE TABLE IF NOT EXISTS learning_progress (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        passage_id TEXT NOT NULL,
        content_version TEXT,
        progress_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, passage_id)
      );
      CREATE TABLE IF NOT EXISTS mistake_records (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        passage_id TEXT NOT NULL,
        sentence_key TEXT NOT NULL,
        record_date TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY(user_id, passage_id, sentence_key, record_date)
      );
      CREATE TABLE IF NOT EXISTS exam_attempts (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        passage_id TEXT NOT NULL,
        completed_at TEXT,
        attempt_json TEXT NOT NULL,
        PRIMARY KEY(user_id, id)
      );
      CREATE TABLE IF NOT EXISTS badge_state (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        badges_json TEXT NOT NULL,
        processed_event_ids_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_items (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        passage_id TEXT NOT NULL,
        target_clause_id TEXT,
        status TEXT NOT NULL,
        item_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_review_items_pending
        ON review_items(user_id, status, passage_id);
      CREATE TABLE IF NOT EXISTS review_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        passage_id TEXT,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_attempts (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        operation_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        result TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        PRIMARY KEY(user_id, operation_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_review_session_passage
        ON review_sessions(user_id, status, passage_id)
        WHERE status = 'active' AND passage_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_active_review_session_legacy
        ON review_sessions(user_id, status)
        WHERE status = 'active' AND passage_id IS NULL;
    `);
  }

  private copyLegacyData(admin: AuthUser): void {
    const legacyPrefix = 'legacy_';
    if (this.tableExists(`${legacyPrefix}archive_namespaces`)) {
      this.db.prepare(`
        INSERT INTO archive_namespaces(user_id, namespace, schema_version, data_json, updated_at)
        SELECT ?, namespace, schema_version, data_json, updated_at
        FROM legacy_archive_namespaces
      `).run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}content_passages`)) {
      this.db.prepare(`
        INSERT INTO content_passages(id, owner_user_id, source_type, content_version, passage_json, updated_at)
        SELECT id, CASE WHEN source_type = 'online' THEN ? ELSE 0 END, source_type, content_version, passage_json, updated_at
        FROM legacy_content_passages
      `).run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}learning_entries`)) {
      this.db.prepare('INSERT INTO learning_entries(user_id, passage_id, added_at) SELECT ?, passage_id, added_at FROM legacy_learning_entries').run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}learning_progress`)) {
      this.db.prepare('INSERT INTO learning_progress(user_id, passage_id, content_version, progress_json, updated_at) SELECT ?, passage_id, content_version, progress_json, updated_at FROM legacy_learning_progress').run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}mistake_records`)) {
      this.db.prepare('INSERT INTO mistake_records(user_id, passage_id, sentence_key, record_date, record_json) SELECT ?, passage_id, sentence_key, record_date, record_json FROM legacy_mistake_records').run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}exam_attempts`)) {
      this.db.prepare('INSERT INTO exam_attempts(user_id, id, passage_id, completed_at, attempt_json) SELECT ?, id, passage_id, completed_at, attempt_json FROM legacy_exam_attempts').run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}badge_state`)) {
      this.db.prepare('INSERT INTO badge_state(user_id, badges_json, processed_event_ids_json) SELECT ?, badges_json, processed_event_ids_json FROM legacy_badge_state').run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}review_items`)) {
      this.db.prepare('INSERT INTO review_items(user_id, id, passage_id, target_clause_id, status, item_json, updated_at) SELECT ?, id, passage_id, target_clause_id, status, item_json, updated_at FROM legacy_review_items').run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}review_sessions`)) {
      this.db.prepare('INSERT INTO review_sessions(id, user_id, status, passage_id, state_json, created_at, updated_at) SELECT id, ?, status, passage_id, state_json, created_at, updated_at FROM legacy_review_sessions').run(admin.id);
    }
    if (this.tableExists(`${legacyPrefix}review_attempts`)) {
      this.db.prepare('INSERT INTO review_attempts(user_id, operation_id, session_id, item_id, result, occurred_at) SELECT ?, operation_id, session_id, item_id, result, occurred_at FROM legacy_review_attempts').run(admin.id);
    }
    const initialized = (this.db.prepare("SELECT value FROM app_meta WHERE key = 'archive_initialized'").get() as { value: string } | undefined)?.value ?? '0';
    const revision = (this.db.prepare("SELECT value FROM app_meta WHERE key = 'archive_revision'").get() as { value: string } | undefined)?.value ?? '0';
    this.setUserMeta(admin.id, 'archive_initialized', initialized);
    this.setUserMeta(admin.id, 'archive_revision', revision);
    this.setUserMeta(admin.id, 'legacy_migrated', '1');
  }

  private dropLegacyTables(): void {
    for (const table of LEGACY_TABLES) {
      const legacyName = `legacy_${table}`;
      if (this.tableExists(legacyName)) this.db.exec(`DROP TABLE "${legacyName}"`);
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.createUserTable();

    const legacy = this.hasLegacySchema();
    let admin = this.findAdmin();
    if (legacy) {
      if (!admin && this.hasLegacyUserData()) admin = this.createAdminForMigration();
      if (this.tableExists('content_passages') && !this.tableColumns('content_passages').includes('source_type')) {
        this.db.exec("ALTER TABLE content_passages ADD COLUMN source_type TEXT NOT NULL DEFAULT 'builtin'");
      }
      if (this.tableExists('review_sessions') && !this.tableColumns('review_sessions').includes('passage_id')) {
        this.db.exec('ALTER TABLE review_sessions ADD COLUMN passage_id TEXT');
      }
      const transaction = this.db.transaction(() => {
        this.renameLegacyTables();
        this.createUserScopedTables();
        if (admin) this.copyLegacyData(admin);
        this.dropLegacyTables();
      });
      transaction();
    } else {
      this.createUserScopedTables();
      if (!admin && process.env.WENYAN_ADMIN_PASSWORD) {
        if (!isValidPassword(process.env.WENYAN_ADMIN_PASSWORD)) throw new Error('WENYAN_ADMIN_PASSWORD must be 8-128 characters');
        const now = isoNow();
        this.db.prepare('INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)').run('admin', hashPassword(process.env.WENYAN_ADMIN_PASSWORD), now);
      }
    }
  }

  close(): void {
    this.db.close();
  }

  ensureTestUser(): AuthUser {
    const existing = this.findAdmin();
    if (existing) return existing;
    const now = isoNow();
    const result = this.db.prepare('INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)').run('admin', hashPassword('test-admin-password'), now);
    return { id: Number(result.lastInsertRowid), username: 'admin' };
  }

  countUsers(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count);
  }

  createUser(username: string, passwordHash: string): AuthUser {
    const now = isoNow();
    const result = this.db.prepare('INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)').run(username, passwordHash, now);
    return { id: Number(result.lastInsertRowid), username };
  }

  findUserForLogin(username: string): { user: AuthUser; passwordHash: string } | null {
    const row = this.db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username) as LoginUserRow | undefined;
    return row ? { user: { id: row.id, username: row.username }, passwordHash: row.password_hash } : null;
  }

  createSession(userId: number, tokenHash: string, expiresAt: string): void {
    this.db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(isoNow());
    this.db.prepare('INSERT INTO user_sessions(id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), userId, tokenHash, expiresAt, isoNow());
  }

  getUserBySessionToken(tokenHash: string): AuthUser | null {
    const row = this.db.prepare(`
      SELECT users.id, users.username, user_sessions.expires_at
      FROM user_sessions JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.token_hash = ?
    `).get(tokenHash) as { id: number; username: string; expires_at: string } | undefined;
    if (!row) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      this.deleteSession(tokenHash);
      return null;
    }
    return { id: row.id, username: row.username };
  }

  getUserById(id: number): AuthUser | null {
    const row = this.db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) as { id: number; username: string } | undefined;
    return row ? { id: row.id, username: row.username } : null;
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(tokenHash);
  }

  private readRoots(userId: number): NamespaceRoots {
    const rows = this.db.prepare('SELECT namespace, schema_version, data_json FROM archive_namespaces WHERE user_id = ?').all(userId) as NamespaceRow[];
    return Object.fromEntries(rows.map((row) => [row.namespace, {
      schemaVersion: row.schema_version,
      data: parseJson(row.data_json, {}),
    }])) as NamespaceRoots;
  }

  private writeNamespace(userId: number, namespace: ArchiveNamespace, root: StoredRoot, updatedAt = isoNow()): void {
    this.db.prepare(`
      INSERT INTO archive_namespaces(user_id, namespace, schema_version, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, namespace) DO UPDATE SET
        schema_version = excluded.schema_version,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(userId, namespace, root.schemaVersion, JSON.stringify(root.data), updatedAt);
  }

  private getUserMeta(userId: number, key: string, fallback: string): string {
    return (this.db.prepare('SELECT value FROM user_meta WHERE user_id = ? AND key = ?').get(userId, key) as { value: string } | undefined)?.value ?? fallback;
  }

  private setUserMeta(userId: number, key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO user_meta(user_id, key, value) VALUES (?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
    `).run(userId, key, value);
  }

  private bumpRevision(userId: number): number {
    const next = Number(this.getUserMeta(userId, 'archive_revision', '0'));
    const revision = Number.isFinite(next) ? next + 1 : 1;
    this.setUserMeta(userId, 'archive_revision', String(revision));
    return revision;
  }

  private setInitialized(userId: number): void {
    this.setUserMeta(userId, 'archive_initialized', '1');
  }

  private materializeReviewQueue(userId: number, root: StoredRoot): void {
    const queue = queueFromRoot(root);
    this.db.prepare('DELETE FROM review_items WHERE user_id = ?').run(userId);
    const insert = this.db.prepare(`
      INSERT INTO review_items(user_id, id, passage_id, target_clause_id, status, item_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updatedAt = isoNow();
    for (const item of queue) {
      insert.run(userId, item.id, item.passageId, item.targetClauseId ?? null, item.status, JSON.stringify(item), updatedAt);
    }
  }

  private materializeLearning(userId: number, root: StoredRoot): void {
    const data = recordValue(root.data);
    const entries = Array.isArray(data.entries) ? data.entries : [];
    this.db.prepare('DELETE FROM learning_entries WHERE user_id = ?').run(userId);
    const insertEntry = this.db.prepare('INSERT INTO learning_entries(user_id, passage_id, added_at) VALUES (?, ?, ?)');
    for (const raw of entries) {
      const entry = recordValue(raw);
      if (typeof entry.id === 'string' && typeof entry.addedAt === 'string') insertEntry.run(userId, entry.id, entry.addedAt);
    }
    const onlinePassages = recordValue(data.onlinePassages);
    this.db.prepare("DELETE FROM content_passages WHERE owner_user_id = ? AND source_type = 'online'").run(userId);
    this.upsertPassages(Object.values(onlinePassages).filter((value): value is Passage => {
      const passage = recordValue(value);
      return typeof passage.id === 'string' && typeof passage.contentVersion === 'string';
    }), userId);
  }

  private materializeProgress(userId: number, root: StoredRoot): void {
    const progress = recordValue(recordValue(root.data).progress);
    this.db.prepare('DELETE FROM learning_progress WHERE user_id = ?').run(userId);
    const insert = this.db.prepare('INSERT INTO learning_progress(user_id, passage_id, content_version, progress_json, updated_at) VALUES (?, ?, ?, ?, ?)');
    for (const [passageId, raw] of Object.entries(progress)) {
      const value = recordValue(raw);
      insert.run(userId, passageId, typeof value.contentVersion === 'string' ? value.contentVersion : null, JSON.stringify(raw), typeof value.updatedAt === 'string' ? value.updatedAt : isoNow());
    }
  }

  private materializeMistakes(userId: number, root: StoredRoot): void {
    const mistakes = recordValue(recordValue(root.data).mistakes);
    this.db.prepare('DELETE FROM mistake_records WHERE user_id = ?').run(userId);
    const insert = this.db.prepare('INSERT INTO mistake_records(user_id, passage_id, sentence_key, record_date, record_json) VALUES (?, ?, ?, ?, ?)');
    for (const [passageId, rawRecords] of Object.entries(mistakes)) {
      if (!Array.isArray(rawRecords)) continue;
      for (const raw of rawRecords) {
        const value = recordValue(raw);
        if (typeof value.sentenceKey !== 'string' || typeof value.date !== 'string') continue;
        insert.run(userId, passageId, value.sentenceKey, value.date, JSON.stringify(raw));
      }
    }
  }

  private materializeAttempts(userId: number, root: StoredRoot): void {
    const attempts = recordValue(recordValue(root.data).attempts);
    this.db.prepare('DELETE FROM exam_attempts WHERE user_id = ?').run(userId);
    const insert = this.db.prepare('INSERT INTO exam_attempts(user_id, id, passage_id, completed_at, attempt_json) VALUES (?, ?, ?, ?, ?)');
    for (const [id, raw] of Object.entries(attempts)) {
      const value = recordValue(raw);
      if (typeof value.passageId !== 'string') continue;
      insert.run(userId, id, value.passageId, typeof value.completedAt === 'string' ? value.completedAt : null, JSON.stringify(raw));
    }
  }

  private materializeBadges(userId: number, root: StoredRoot): void {
    const data = recordValue(root.data);
    const badges = recordValue(data.badges);
    const eventIds = Array.isArray(data.processedEventIds) ? data.processedEventIds : [];
    this.db.prepare(`
      INSERT INTO badge_state(user_id, badges_json, processed_event_ids_json) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET badges_json = excluded.badges_json, processed_event_ids_json = excluded.processed_event_ids_json
    `).run(userId, JSON.stringify(badges), JSON.stringify(eventIds));
  }

  private materializeNamespace(userId: number, namespace: ArchiveNamespace, root: StoredRoot): void {
    if (namespace === 'learning') this.materializeLearning(userId, root);
    else if (namespace === 'progress') this.materializeProgress(userId, root);
    else if (namespace === 'mistakes') this.materializeMistakes(userId, root);
    else if (namespace === 'reviewQueue') this.materializeReviewQueue(userId, root);
    else if (namespace === 'attempts') this.materializeAttempts(userId, root);
    else if (namespace === 'badges') this.materializeBadges(userId, root);
  }

  private syncReviewNamespace(userId: number, queue: ReviewItem[]): void {
    const current = this.getNamespace(userId, 'reviewQueue');
    this.writeNamespace(userId, 'reviewQueue', rootWithQueue(current, queue));
  }

  getNamespace(userId: number, namespace: ArchiveNamespace): StoredRoot | undefined {
    const row = this.db.prepare('SELECT schema_version, data_json FROM archive_namespaces WHERE user_id = ? AND namespace = ?').get(userId, namespace) as { schema_version: number; data_json: string } | undefined;
    return row ? { schemaVersion: row.schema_version, data: parseJson(row.data_json, {}) } : undefined;
  }

  getArchive(userId: number): ArchiveSnapshot {
    const initialized = this.getUserMeta(userId, 'archive_initialized', '0') === '1';
    const revision = Number(this.getUserMeta(userId, 'archive_revision', '0'));
    return {
      initialized,
      revision: Number.isFinite(revision) ? revision : 0,
      namespaces: this.readRoots(userId),
      activeReviewSession: this.getActiveReviewSession(userId),
    };
  }

  importArchive(userId: number, namespaces: NamespaceRoots): ArchiveSnapshot {
    const transaction = this.db.transaction(() => {
      for (const [name, root] of Object.entries(namespaces)) {
        if (!root || !isArchiveNamespace(name)) continue;
        this.writeNamespace(userId, name, root);
        this.materializeNamespace(userId, name, root);
      }
      this.setInitialized(userId);
      this.bumpRevision(userId);
    });
    transaction();
    return this.getArchive(userId);
  }

  putNamespace(userId: number, namespace: ArchiveNamespace, root: StoredRoot): ArchiveSnapshot {
    const transaction = this.db.transaction(() => {
      this.writeNamespace(userId, namespace, root);
      this.materializeNamespace(userId, namespace, root);
      this.setInitialized(userId);
      this.bumpRevision(userId);
    });
    transaction();
    return this.getArchive(userId);
  }

  private upsertPassages(passages: readonly Passage[], ownerUserId = 0): void {
    const insert = this.db.prepare(`
      INSERT INTO content_passages(id, owner_user_id, source_type, content_version, passage_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_user_id, id) DO UPDATE SET
        source_type = excluded.source_type,
        content_version = excluded.content_version,
        passage_json = excluded.passage_json,
        updated_at = excluded.updated_at
    `);
    for (const passage of passages) {
      insert.run(passage.id, ownerUserId, passage.sourceType, passage.contentVersion, JSON.stringify(passage), isoNow());
    }
  }

  seedPassages(passages: readonly Passage[]): void {
    const transaction = this.db.transaction(() => this.upsertPassages(passages));
    transaction();
  }

  listPassages(userId: number): Passage[] {
    return (this.db.prepare('SELECT passage_json FROM content_passages WHERE owner_user_id IN (0, ?) ORDER BY id').all(userId) as Array<{ passage_json: string }>)
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

  getActiveReviewSession(userId: number): ReviewSessionRecord | null {
    const row = this.db.prepare("SELECT * FROM review_sessions WHERE user_id = ? AND status = 'active' LIMIT 1").get(userId) as SessionRow | undefined;
    return row ? this.sessionFromRow(row) : null;
  }

  getReviewSession(userId: number, id: string): ReviewSessionRecord | null {
    const row = this.db.prepare('SELECT * FROM review_sessions WHERE user_id = ? AND id = ?').get(userId, id) as SessionRow | undefined;
    return row ? this.sessionFromRow(row) : null;
  }

  createOrResumeReviewSession(userId: number, passageId?: string): { session: ReviewSessionRecord; source: 'created' | 'resumed' } {
    const active = passageId
      ? (this.db.prepare("SELECT * FROM review_sessions WHERE user_id = ? AND status = 'active' AND passage_id = ? LIMIT 1").get(userId, passageId) as SessionRow | undefined)
      : (this.db.prepare("SELECT * FROM review_sessions WHERE user_id = ? AND status = 'active' LIMIT 1").get(userId) as SessionRow | undefined);
    const activeSession = active ? this.sessionFromRow(active) : null;
    if (activeSession) return { session: activeSession, source: 'resumed' };
    const rows = passageId
      ? this.db.prepare("SELECT item_json FROM review_items WHERE user_id = ? AND status = 'pending' AND passage_id = ?").all(userId, passageId) as Array<{ item_json: string }>
      : this.db.prepare("SELECT item_json FROM review_items WHERE user_id = ? AND status = 'pending'").all(userId) as Array<{ item_json: string }>;
    const items = rows.map((row) => parseJson<ReviewItem | null>(row.item_json, null)).filter((item): item is ReviewItem => item !== null);
    const session = createReviewSession(selectReviewGroup(items));
    const id = `review-session:${randomUUID()}`;
    const createdAt = isoNow();
    this.db.prepare(`
      INSERT INTO review_sessions(id, user_id, status, passage_id, state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, session.completed ? 'completed' : 'active', passageId ?? null, JSON.stringify(session), createdAt, createdAt);
    return { session: { id, status: session.completed ? 'completed' : 'active', passageId: passageId ?? null, state: session, createdAt, updatedAt: createdAt }, source: 'created' };
  }

  resetPassageData(userId: number, passageId: string): { ok: true; passageId: string } {
    const transaction = this.db.transaction(() => {
      const namespaces: Array<ArchiveNamespace> = ['progress', 'mistakes', 'reviewQueue', 'attempts'];
      for (const namespace of namespaces) {
        const root = this.getNamespace(userId, namespace);
        if (!root || typeof root.data !== 'object' || root.data === null) continue;
        const data = recordValue(root.data);
        if (namespace === 'progress') {
          const progress = recordValue(data.progress);
          delete progress[passageId];
          this.writeNamespace(userId, namespace, { ...root, data: { ...data, progress } });
        } else if (namespace === 'mistakes') {
          const mistakes = recordValue(data.mistakes);
          delete mistakes[passageId];
          this.writeNamespace(userId, namespace, { ...root, data: { ...data, mistakes } });
        } else if (namespace === 'reviewQueue') {
          const queue = Array.isArray(data.queue) ? data.queue.filter((item) => recordValue(item).passageId !== passageId) : [];
          this.writeNamespace(userId, namespace, { ...root, data: { ...data, queue } });
        } else {
          const attempts = recordValue(data.attempts);
          const filtered = Object.fromEntries(Object.entries(attempts).filter(([, attempt]) => recordValue(attempt).passageId !== passageId));
          this.writeNamespace(userId, namespace, { ...root, data: { ...data, attempts: filtered } });
        }
        this.materializeNamespace(userId, namespace, this.getNamespace(userId, namespace) as StoredRoot);
      }

      const sessions = this.db.prepare('SELECT id, passage_id, state_json FROM review_sessions WHERE user_id = ?').all(userId) as Array<{
        id: string;
        passage_id: string | null;
        state_json: string;
      }>;
      this.db.prepare('DELETE FROM learning_progress WHERE user_id = ? AND passage_id = ?').run(userId, passageId);
      this.db.prepare('DELETE FROM mistake_records WHERE user_id = ? AND passage_id = ?').run(userId, passageId);
      this.db.prepare('DELETE FROM exam_attempts WHERE user_id = ? AND passage_id = ?').run(userId, passageId);
      this.db.prepare('DELETE FROM review_items WHERE user_id = ? AND passage_id = ?').run(userId, passageId);
      const sessionIds = sessions
        .filter((session) => session.passage_id === passageId || (parseJson<ReviewSessionLike>(session.state_json, { items: [] }).items ?? []).some((item) => item.passageId === passageId))
        .map((session) => session.id);
      for (const sessionId of sessionIds) {
        this.db.prepare('DELETE FROM review_attempts WHERE user_id = ? AND session_id = ?').run(userId, sessionId);
        this.db.prepare('DELETE FROM review_sessions WHERE user_id = ? AND id = ?').run(userId, sessionId);
      }
      this.bumpRevision(userId);
    });
    transaction();
    return { ok: true, passageId };
  }

  applyReviewAttempt(userId: number, sessionId: string, input: ReviewSessionAttemptResult): { session: ReviewSessionRecord; source: 'updated' | 'already-applied' } {
    const transaction = this.db.transaction(() => {
      const existingAttempt = this.db.prepare('SELECT operation_id FROM review_attempts WHERE user_id = ? AND operation_id = ?').get(userId, input.operationId);
      const row = this.db.prepare('SELECT * FROM review_sessions WHERE user_id = ? AND id = ?').get(userId, sessionId) as SessionRow | undefined;
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
        this.db.prepare('UPDATE review_items SET item_json = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(JSON.stringify(updatedItem), now, userId, currentItem.id);
      } else if (!next.items.some((item) => item.id === currentItem.id)) {
        const completedItem = { ...currentItem, status: 'completed' as const, completedAt: now };
        this.db.prepare('UPDATE review_items SET status = ?, item_json = ?, updated_at = ? WHERE user_id = ? AND id = ?').run('completed', JSON.stringify(completedItem), now, userId, currentItem.id);
      }

      const status = next.completed ? 'completed' : 'active';
      this.db.prepare('UPDATE review_sessions SET status = ?, state_json = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(status, JSON.stringify(next), now, userId, sessionId);
      this.db.prepare('INSERT INTO review_attempts(user_id, operation_id, session_id, item_id, result, occurred_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, input.operationId, sessionId, input.itemId, input.result, now);

      const queue = (this.db.prepare('SELECT item_json FROM review_items WHERE user_id = ?').all(userId) as Array<{ item_json: string }>)
        .map((item) => parseJson<ReviewItem | null>(item.item_json, null)).filter((item): item is ReviewItem => item !== null);
      this.syncReviewNamespace(userId, queue);
      this.bumpRevision(userId);
      const updated = this.getReviewSession(userId, sessionId);
      if (!updated) throw new Error('review session disappeared');
      return { session: updated, source: 'updated' as const };
    });
    return transaction() as { session: ReviewSessionRecord; source: 'updated' | 'already-applied' };
  }

  completeReviewSession(userId: number, id: string): ReviewSessionRecord {
    const session = this.getReviewSession(userId, id);
    if (!session) throw new Error('review session not found');
    if (session.status !== 'completed') throw new Error('review session is not complete');
    return session;
  }
}
