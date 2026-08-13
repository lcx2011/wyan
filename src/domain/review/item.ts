import type { MistakeRecord, Passage, ReviewItem } from '../../types';
import { isHan } from '../../utils/text';
import { nowISO, todayISO } from '../../utils/time';
import { buildReviewClauses, type ReviewClause } from './clause';

function dedupePositions(values: readonly number[]): number[] {
  return Array.from(new Set(values))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((left, right) => left - right);
}

export function nextLocalDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(year, month - 1, day + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function hanCount(sentence: string): number {
  return Array.from(sentence).filter(isHan).length;
}

function boundedPositions(sentence: string, positions: readonly number[]): number[] {
  const count = hanCount(sentence);
  return dedupePositions(positions).filter((position) => position < count);
}

/** Legacy blank renderer, retained only to read and upgrade version-3 queues. */
export function renderReviewPrompt(
  sourceSentence: string,
  hiddenPositions: readonly number[],
): { sentence: string; answer: string; hiddenPositions: number[] } {
  const validPositions = boundedPositions(sourceSentence, hiddenPositions);
  const hidden = new Set(validPositions);
  let sentence = '';
  let answer = '';
  let hanIndex = 0;
  for (const character of Array.from(sourceSentence)) {
    if (!isHan(character)) {
      sentence += character;
      continue;
    }
    if (hidden.has(hanIndex)) {
      sentence += '____';
      answer += character;
    } else {
      sentence += character;
    }
    hanIndex += 1;
  }
  return { sentence, answer, hiddenPositions: validPositions };
}

function positionsForRecord(record: MistakeRecord): number[] {
  const merged = boundedPositions(
    record.sentence,
    [...record.wrongPositions, ...record.timeoutPositions],
  );
  const count = hanCount(record.sentence);
  if (merged.length <= count * 0.6) return merged;

  const wrongOnly = boundedPositions(record.sentence, record.wrongPositions);
  if (wrongOnly.length > 0) return wrongOnly;

  const maximum = Math.max(1, Math.floor(count * 0.6));
  return merged.slice(0, maximum);
}

/** Builds a version-3 blank item. New code should use buildClauseReviewItems. */
export function buildReviewItem(
  passageId: string,
  record: MistakeRecord,
  createdAt: string = nowISO(),
): ReviewItem {
  const sentenceId = record.sentenceId ?? record.sentenceKey;
  const rendered = renderReviewPrompt(record.sentence, positionsForRecord(record));
  return {
    id: `${passageId}:${sentenceId}:${record.date}`,
    dueDate: nextLocalDay(record.date),
    status: 'pending',
    attempts: 0,
    completedAt: null,
    passageId,
    sentence: rendered.sentence,
    answer: rendered.answer,
    sourceSentence: record.sentence,
    hiddenPositions: rendered.hiddenPositions,
    sourceDate: record.date,
    contentVersion: record.contentVersion,
    sentenceId,
    mistakeCount: record.count ?? 1,
    createdAt,
    reason: 'legacy',
    priority: 80,
  };
}

function countAtPosition(record: MistakeRecord, position: number): number {
  const wrongCount = record.wrongCountByPosition?.[String(position)]
    ?? (record.wrongPositions.includes(position) ? 1 : 0);
  const timeoutCount = record.timeoutPositions.includes(position) ? 1 : 0;
  return wrongCount + timeoutCount;
}

function reviewItemForClause(
  passage: Passage,
  clause: ReviewClause,
  options: {
    sourceDate: string;
    createdAt: string;
    contentVersion?: string;
    reason: 'mistake' | 'unreviewed' | 'legacy';
    positions?: readonly number[];
    mistakeCount?: number;
  },
): ReviewItem {
  const positions = dedupePositions(options.positions ?? []);
  const priority = options.reason === 'mistake' ? 100 : options.reason === 'legacy' ? 80 : 30;
  return {
    id: `review:${passage.id}:${clause.id}`,
    dueDate: options.sourceDate,
    status: 'pending',
    attempts: 0,
    completedAt: null,
    passageId: passage.id,
    sentence: clause.prompt,
    answer: clause.text,
    sourceSentence: clause.text,
    hiddenPositions: positions,
    sourceDate: options.sourceDate,
    contentVersion: options.contentVersion ?? passage.contentVersion,
    sentenceId: clause.sentenceId,
    targetClauseId: clause.id,
    targetStartCharIndex: clause.startCharIndex,
    targetEndCharIndex: clause.endCharIndex,
    targetOrder: clause.order,
    promptType: clause.promptType,
    reason: options.reason,
    priority,
    mistakeCount: options.mistakeCount ?? 0,
    createdAt: options.createdAt,
  };
}

/**
 * Maps a sentence-level mistake record to one or more punctuation-clause
 * retrieval tasks. Only clauses containing an actual wrong/timeout position
 * are produced, and their answers are always the complete target clauses.
 */
export function buildClauseReviewItems(
  passage: Passage,
  record: MistakeRecord,
  createdAt: string = nowISO(),
): ReviewItem[] {
  const sentenceId = record.sentenceId ?? record.sentenceKey;
  const positions = dedupePositions([...record.wrongPositions, ...record.timeoutPositions]);
  if (positions.length === 0) return [];

  return buildReviewClauses(passage)
    .filter((clause) => clause.sentenceId === sentenceId)
    .flatMap((clause) => {
      const sourcePositions = positions.filter((position) =>
        position >= clause.startCharIndex && position < clause.endCharIndex,
      );
      if (sourcePositions.length === 0) return [];
      const relativePositions = sourcePositions.map((position) => position - clause.startCharIndex);
      const mistakeCount = sourcePositions.reduce(
        (sum, position) => sum + countAtPosition(record, position),
        0,
      );
      return [reviewItemForClause(passage, clause, {
        sourceDate: record.date,
        createdAt,
        contentVersion: record.contentVersion,
        reason: 'mistake',
        positions: relativePositions,
        mistakeCount: Math.max(1, mistakeCount),
      })];
    });
}

/** Creates low-priority first-review tasks for newly learned Sentence ids. */
export function buildUnreviewedClauseItems(
  passage: Passage,
  learnedSentenceIds: ReadonlySet<string>,
  sourceDate: string = todayISO(),
  createdAt: string = nowISO(),
): ReviewItem[] {
  return buildReviewClauses(passage)
    .filter((clause) => learnedSentenceIds.has(clause.sentenceId))
    .map((clause) => reviewItemForClause(passage, clause, {
      sourceDate,
      createdAt,
      reason: 'unreviewed',
    }));
}

/** Converts one pending legacy blank item into punctuation-clause items. */
export function upgradeLegacyReviewItem(
  item: ReviewItem,
  passage: Passage,
  createdAt: string = nowISO(),
): ReviewItem[] {
  if (item.targetClauseId) return [item];
  if (!item.sentenceId) return [];
  const sourceSentence = item.sourceSentence;
  if (!sourceSentence) return [];

  const record: MistakeRecord = {
    sentence: sourceSentence,
    sentenceKey: item.sentenceId,
    sentenceId: item.sentenceId,
    wrongChars: [],
    wrongPositions: item.hiddenPositions,
    timeoutPositions: [],
    date: item.sourceDate,
    count: item.mistakeCount ?? Math.max(1, item.hiddenPositions.length),
    contentVersion: item.contentVersion,
  };
  return buildClauseReviewItems(passage, record, item.createdAt ?? createdAt).map((upgraded) => ({
    ...upgraded,
    attempts: item.attempts,
    reason: 'legacy',
    priority: Math.max(upgraded.priority ?? 0, 80),
  }));
}

/** Merges the same target clause and reopens it only when a new weakness arrives. */
export function mergeReviewItem(previous: ReviewItem, addition: ReviewItem): ReviewItem {
  const reopens = addition.reason === 'mistake' || addition.reason === 'legacy';
  const reason = previous.reason === 'mistake' && addition.reason === 'unreviewed'
    ? previous.reason
    : addition.reason ?? previous.reason;
  const hiddenPositions = dedupePositions([
    ...previous.hiddenPositions,
    ...addition.hiddenPositions,
  ]);
  const merged: ReviewItem = {
    ...previous,
    ...addition,
    status: reopens ? 'pending' : previous.status,
    completedAt: reopens ? null : previous.completedAt,
    attempts: previous.attempts,
    reason,
    hiddenPositions,
    mistakeCount: (previous.mistakeCount ?? 0) + (addition.mistakeCount ?? 0),
    priority: Math.max(previous.priority ?? 0, addition.priority ?? 0),
    createdAt: previous.createdAt ?? addition.createdAt,
    sourceDate: previous.sourceDate.localeCompare(addition.sourceDate) >= 0
      ? previous.sourceDate
      : addition.sourceDate,
  };
  if (!previous.targetClauseId && !addition.targetClauseId) {
    const sourceSentence = addition.sourceSentence ?? previous.sourceSentence;
    if (sourceSentence) {
      const rendered = renderReviewPrompt(sourceSentence, hiddenPositions);
      return {
        ...merged,
        sourceSentence,
        sentence: rendered.sentence,
        answer: rendered.answer,
        hiddenPositions: rendered.hiddenPositions,
      };
    }
  }
  return merged;
}
