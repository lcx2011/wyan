import { createFormalPassage, type ExamAttempt, type LearningEntry, type Passage, type PassageProgress, type ReviewItem } from '../types';
import { SCHEMA_VERSIONS, type MigrationNotice, type PersistedRoot } from './schema';
import { decodeStorageValue, withStoragePrefix } from './raw';
import { clampMastery } from '../domain/training/mastery';

export interface LearningData {
  entries: LearningEntry[];
  onlinePassages: Record<string, Passage>;
  migrationNotices: MigrationNotice[];
}

export interface ProgressData {
  progress: Record<string, PassageProgress>;
}

export interface ReviewData {
  queue: ReviewItem[];
}

// Progress version 3 already stored elapsed times in milliseconds. New
// schema fields must not make version-3 data look like the old seconds format.
const PROGRESS_MILLISECONDS_VERSION = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function isFormalPassage(value: unknown): value is Passage {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.contentVersion !== 'string') return false;
  if (value.sourceType !== 'online' && value.sourceType !== 'builtin') return false;
  if (!Array.isArray(value.segments)) return false;
  return value.segments.every((segment) =>
    isRecord(segment)
      && typeof segment.id === 'string'
      && Array.isArray(segment.cards)
      && segment.cards.every((card) =>
        isRecord(card)
          && typeof card.id === 'string'
          && Array.isArray(card.sentences)
          && card.sentences.every((sentence) => isRecord(sentence) && typeof sentence.id === 'string')
      )
  );
}

function migrateLegacyPassage(value: unknown): Passage | null {
  if (isFormalPassage(value)) return value;
  if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.segments)) return null;
  try {
    const segments = value.segments.map((segment, index) => {
      if (!isRecord(segment)) throw new Error('invalid segment');
      const rawCards = Array.isArray(segment.cards) ? segment.cards : [];
      const cards = rawCards.map((card) => {
        const sentences = isRecord(card) && Array.isArray(card.sentences)
          ? card.sentences
          : Array.isArray(card) ? card : [];
        return sentences.map((sentence) => {
          if (!isRecord(sentence) || typeof sentence.text !== 'string') throw new Error('invalid sentence');
          return {
            text: sentence.text,
            meaning: stringValue(sentence.meaning),
            hint: typeof sentence.hint === 'string' ? sentence.hint : undefined,
            pinyin: typeof sentence.pinyin === 'string' ? sentence.pinyin : undefined,
          };
        });
      });
      return {
        index: typeof segment.index === 'number' ? segment.index : index,
        cards,
        hint: typeof segment.hint === 'string' ? segment.hint : undefined,
      };
    });
    if (segments.length === 0 || segments.every((segment) => segment.cards.length === 0)) return null;
    return createFormalPassage({
      id: value.id,
      sourceId: stringValue(value.sourceId, value.id),
      title: stringValue(value.title),
      author: stringValue(value.author),
      dynasty: stringValue(value.dynasty),
      grade: typeof value.grade === 'string' ? value.grade : undefined,
      aliases: Array.isArray(value.aliases) ? value.aliases.filter((item): item is string => typeof item === 'string') : undefined,
      segments,
      updatedAt: stringValue(value.cachedAt, stringValue(value.updatedAt, new Date(0).toISOString())),
    });
  } catch {
    return null;
  }
}

export function migrateLearningData(data: unknown): LearningData {
  const source = isRecord(data) ? data : {};
  const rawEntries = Array.isArray(source.entries) ? source.entries : [];
  const entries = rawEntries.filter((entry): entry is LearningEntry =>
    isRecord(entry) && typeof entry.id === 'string' && typeof entry.addedAt === 'string'
  );
  const rawPassages = isRecord(source.onlinePassages) ? source.onlinePassages : {};
  const onlinePassages: Record<string, Passage> = {};
  const removedIds: string[] = [];
  for (const [id, rawPassage] of Object.entries(rawPassages)) {
    const passage = migrateLegacyPassage(rawPassage);
    if (passage) onlinePassages[id] = passage;
    else removedIds.push(id);
  }
  const priorNotices = Array.isArray(source.migrationNotices)
    ? source.migrationNotices.filter((notice): notice is MigrationNotice => isRecord(notice) && typeof notice.id === 'string')
    : [];
  const createdAt = new Date().toISOString();
  const migrationNotices = [
    ...priorNotices,
    ...removedIds.map((passageId): MigrationNotice => ({
      id: `passage-reset:${passageId}`,
      kind: 'passage-reset',
      namespace: 'learning',
      passageId,
      message: `篇目 ${passageId} 无法迁移，已仅重置该篇目的本地关联数据。`,
      createdAt,
    })),
  ];
  return {
    entries: entries.filter((entry) => !removedIds.includes(entry.id)),
    onlinePassages,
    migrationNotices,
  };
}

function defaultProgress(updatedAt = new Date().toISOString()): PassageProgress {
  return {
    contentVersion: undefined,
    cursor: null,
    currentSegment: 0,
    currentCardIndex: 0,
    cardMastery: {},
    sentenceStates: {},
    cardBlindPassed: {},
    linkSnowballPassed: {},
    segmentSnowballPassed: {},
    snowballPassed: [],
    fullTextCompleted: false,
    fullTextPassed: false,
    lastAttemptTime: null,
    bestPassedTime: null,
    bestTime: 0,
    updatedAt,
  };
}

function boolRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'boolean')) as Record<string, boolean>;
}

function masteryRecord(value: unknown, legacyCardBlindPassed: Readonly<Record<string, boolean>>): Record<string, number> {
  const result: Record<string, number> = {};
  if (isRecord(value)) {
    for (const [cardId, mastery] of Object.entries(value)) {
      if (typeof mastery === 'number' && Number.isFinite(mastery)) {
        result[cardId] = clampMastery(mastery);
      }
    }
  }
  for (const [cardId, passed] of Object.entries(legacyCardBlindPassed)) {
    if (passed && result[cardId] === undefined) result[cardId] = 100;
  }
  return result;
}

export function normalizeProgressRecord(
  passageId: string,
  raw: unknown,
  legacySeconds = false
): PassageProgress {
  const value = isRecord(raw) ? raw : {};
  const base = defaultProgress(stringValue(value.updatedAt, new Date().toISOString()));
  const cursor = isRecord(value.cursor)
    && value.cursor.passageId === passageId
    && typeof value.cursor.segmentId === 'string'
    && typeof value.cursor.cardId === 'string'
    && typeof value.cursor.sentenceId === 'string'
      ? value.cursor as unknown as PassageProgress['cursor']
      : null;
  const unitScale = legacySeconds ? 1_000 : 1;
  const bestPassedTime = typeof value.bestPassedTime === 'number' && value.bestPassedTime > 0
    ? value.bestPassedTime * unitScale
    : null;
  return {
    ...base,
    contentVersion: typeof value.contentVersion === 'string' ? value.contentVersion : undefined,
    cursor,
    currentSegment: typeof value.currentSegment === 'number' ? value.currentSegment : 0,
    currentCardIndex: typeof value.currentCardIndex === 'number' ? value.currentCardIndex : 0,
    cardMastery: masteryRecord(value.cardMastery, boolRecord(value.cardBlindPassed)),
    sentenceStates: isRecord(value.sentenceStates) ? value.sentenceStates as PassageProgress['sentenceStates'] : {},
    cardBlindPassed: boolRecord(value.cardBlindPassed),
    linkSnowballPassed: boolRecord(value.linkSnowballPassed),
    segmentSnowballPassed: boolRecord(value.segmentSnowballPassed),
    snowballPassed: Array.isArray(value.snowballPassed) ? value.snowballPassed.map(Boolean) : [],
    fullTextCompleted: value.fullTextCompleted === true || value.fullTextPassed === true,
    fullTextPassed: value.fullTextPassed === true,
    lastAttemptTime: typeof value.lastAttemptTime === 'string' ? value.lastAttemptTime : null,
    bestPassedTime,
    bestTime: typeof value.bestTime === 'number' ? value.bestTime * unitScale : (bestPassedTime ?? 0),
  };
}

export function migrateProgressData(data: unknown, fromVersion = 0): ProgressData {
  const source = isRecord(data) && isRecord(data.progress) ? data.progress : {};
  const legacySeconds = fromVersion < PROGRESS_MILLISECONDS_VERSION;
  return {
    progress: Object.fromEntries(
      Object.entries(source).map(([passageId, progress]) => [
        passageId,
        normalizeProgressRecord(passageId, progress, legacySeconds),
      ])
    ),
  };
}

export function normalizeReviewRecord(raw: unknown, dueDate: string, index: number): ReviewItem {
  const value = isRecord(raw) ? raw : {};
  const passageId = stringValue(value.passageId);
  const resolvedDueDate = stringValue(value.dueDate, dueDate);
  return {
    id: stringValue(value.id, `${passageId}:${resolvedDueDate}:${index}`),
    dueDate: resolvedDueDate,
    status: value.status === 'completed' ? 'completed' : 'pending',
    attempts: typeof value.attempts === 'number' && value.attempts >= 0 ? value.attempts : 0,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
    passageId,
    sentence: stringValue(value.sentence),
    answer: stringValue(value.answer),
    sourceSentence: typeof value.sourceSentence === 'string' ? value.sourceSentence : undefined,
    hiddenPositions: Array.isArray(value.hiddenPositions)
      ? value.hiddenPositions.filter((position): position is number => typeof position === 'number')
      : [],
    sourceDate: stringValue(value.sourceDate, resolvedDueDate),
    contentVersion: typeof value.contentVersion === 'string' ? value.contentVersion : undefined,
    sentenceId: typeof value.sentenceId === 'string' ? value.sentenceId : undefined,
    targetClauseId: typeof value.targetClauseId === 'string' ? value.targetClauseId : undefined,
    targetStartCharIndex: typeof value.targetStartCharIndex === 'number' ? value.targetStartCharIndex : undefined,
    targetEndCharIndex: typeof value.targetEndCharIndex === 'number' ? value.targetEndCharIndex : undefined,
    targetOrder: typeof value.targetOrder === 'number' ? value.targetOrder : undefined,
    promptType: value.promptType === 'title' || value.promptType === 'previous-clause'
      ? value.promptType
      : undefined,
    reason: value.reason === 'mistake' || value.reason === 'unreviewed' || value.reason === 'legacy'
      ? value.reason
      : undefined,
    priority: typeof value.priority === 'number' ? value.priority : undefined,
    mistakeCount: typeof value.mistakeCount === 'number' ? value.mistakeCount : undefined,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
  };
}

export function migrateReviewData(data: unknown): ReviewData {
  const source = isRecord(data) ? data.queue : undefined;
  if (Array.isArray(source)) {
    return { queue: source.map((item, index) => normalizeReviewRecord(item, '', index)) };
  }
  if (!isRecord(source)) return { queue: [] };
  return {
    queue: Object.entries(source).flatMap(([dueDate, items]) =>
      Array.isArray(items) ? items.map((item, index) => normalizeReviewRecord(item, dueDate, index)) : []
    ),
  };
}

export function migrateAttemptData(data: unknown): { attempts: Record<string, ExamAttempt> } {
  const attempts = isRecord(data) && isRecord(data.attempts) ? data.attempts : {};
  return { attempts: attempts as Record<string, ExamAttempt> };
}

export function migrateMistakeData(data: unknown): { mistakes: Record<string, unknown[]> } {
  const source = isRecord(data) && isRecord(data.mistakes) ? data.mistakes : {};
  return {
    mistakes: Object.fromEntries(
      Object.entries(source).map(([passageId, records]) => [passageId, Array.isArray(records) ? records : []])
    ),
  };
}

export function migrateBadgeData(data: unknown): {
  badges: Record<string, unknown>;
  processedEventIds: string[];
} {
  const source = isRecord(data) ? data : {};
  return {
    badges: isRecord(source.badges) ? source.badges : {},
    processedEventIds: Array.isArray(source.processedEventIds)
      ? source.processedEventIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

let lastBootstrapFingerprint: string | null = null;

function rawNamespace(key: string): string | null {
  return window.localStorage.getItem(withStoragePrefix(key));
}

function bootstrapFingerprint(): string {
  return JSON.stringify([
    rawNamespace('learning'),
    rawNamespace('progress'),
    rawNamespace('attempts'),
  ]);
}

function writeCanonicalRoot<T>(key: string, root: PersistedRoot<T>): void {
  try {
    window.localStorage.setItem(withStoragePrefix(key), JSON.stringify(root));
  } catch (error) {
    console.warn(`[storage] 协调迁移写入失败 ${withStoragePrefix(key)}`, error);
  }
}

function decodeNamespace(key: string): { data: unknown; version: number; canonical: boolean } | null {
  const raw = rawNamespace(key);
  if (raw === null) return null;
  try {
    return decodeStorageValue(raw);
  } catch {
    // The namespace's own readRoot call performs corruption recovery.
    return null;
  }
}

/**
 * Runs before every Zustand namespace read. A three-key fingerprint makes the
 * operation effectively once-per-storage-state while still detecting a stale
 * store that persisted a removed passage again before a repeated hydration.
 */
export function bootstrapStorageMigrations(): void {
  const fingerprint = bootstrapFingerprint();
  if (fingerprint === lastBootstrapFingerprint) return;

  const learningEnvelope = decodeNamespace('learning');
  if (learningEnvelope) {
    const learning = migrateLearningData(learningEnvelope.data);
    writeCanonicalRoot('learning', {
      schemaVersion: SCHEMA_VERSIONS.learning,
      data: learning,
    });
    const removedPassageIds = Array.from(new Set(
      learning.migrationNotices
        .filter((notice) => notice.kind === 'passage-reset' && notice.passageId)
        .map((notice) => notice.passageId as string)
    ));

    const progressEnvelope = decodeNamespace('progress');
    if (progressEnvelope) {
      const progressData = migrateProgressData(progressEnvelope.data, progressEnvelope.version);
      for (const passageId of removedPassageIds) delete progressData.progress[passageId];
      writeCanonicalRoot('progress', {
        schemaVersion: SCHEMA_VERSIONS.progress,
        data: progressData,
      });
    }

    const attemptEnvelope = decodeNamespace('attempts');
    if (attemptEnvelope) {
      const attemptData = migrateAttemptData(attemptEnvelope.data);
      attemptData.attempts = Object.fromEntries(
        Object.entries(attemptData.attempts)
          .filter(([, attempt]) => !removedPassageIds.includes(attempt.passageId))
      );
      writeCanonicalRoot('attempts', {
        schemaVersion: SCHEMA_VERSIONS.attempts,
        data: attemptData,
      });
    }
  }

  lastBootstrapFingerprint = bootstrapFingerprint();
}
