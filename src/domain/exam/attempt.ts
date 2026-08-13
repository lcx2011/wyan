import { countPassageHan } from '../../utils/text';
import { formatDateLocal, nowISO } from '../../utils/time';
import type { Passage, ExamAttempt, MistakeRecord, Sentence } from '../../types';
import type { TypingState } from '../typing/engine';
import { passageRegistry } from '../../data/passages';
import { useAttemptStore, type SettleResult } from '../../stores/attemptStore';
import { useBadgeStore } from '../../stores/badgeStore';
import { useMistakeStore } from '../../stores/mistakeStore';
import { usePassageStore } from '../../stores/passageStore';
import { useProgressStore } from '../../stores/progressStore';
import { useReviewStore } from '../../stores/reviewStore';

/** Starts a fresh, unfinished Boss attempt with a stable deterministic id. */
export function createAttempt(passageId: string, contentVersion: string, now: string): ExamAttempt {
  return {
    id: `attempt:${passageId}:${now}`,
    passageId,
    contentVersion,
    startedAt: now,
    completedAt: null,
    elapsedMs: 0,
    passed: false,
    elapsedSeconds: null,
    wrongPositions: [],
    timeoutPositions: [],
    completed: false,
    settledAt: null,
  };
}

/**
 * Finishes an attempt from the engine's final state. Reaching the end marks it
 * completed; zero wrong positions is what makes it passed. Pauses (timeouts)
 * are recorded but never block a pass.
 */
export function finishAttempt(attempt: ExamAttempt, state: TypingState, now: string = nowISO()): ExamAttempt {
  return {
    ...attempt,
    completed: true,
    completedAt: now,
    elapsedMs: state.elapsedMs,
    elapsedSeconds: Math.round(state.elapsedMs / 1000),
    passed: state.wrongPositions.length === 0,
    wrongPositions: state.wrongPositions.map((position) => ({
      ...position,
      count: state.wrongCountByPosition[`${position.sentenceId}:${position.charIndex}`] ?? 1,
    })),
    timeoutPositions: state.timeoutPositions.map((position) => ({ ...position })),
  };
}

function findSentence(passage: Passage, sentenceId: string): Sentence | undefined {
  for (const segment of passage.segments) {
    for (const card of segment.cards) {
      const found = card.sentences.find((candidate) => candidate.id === sentenceId);
      if (found) return found;
    }
  }
  return undefined;
}

interface SentenceBucket {
  sentence: string;
  wrong: Array<{ index: number; char: string; count: number }>;
  timeouts: number[];
}

/**
 * Derives the per-sentence mistake records (wrong + pause positions) that feed
 * the mistake book and the next-day review queue. Positions are deduplicated
 * and sorted by stable sentence-local character index.
 */
export function toMistakeRecords(attempt: ExamAttempt, passage: Passage, date: string): MistakeRecord[] {
  const buckets = new Map<string, SentenceBucket>();
  const bucketFor = (sentenceId: string): SentenceBucket | undefined => {
    const sentence = findSentence(passage, sentenceId);
    if (!sentence) return undefined;
    let bucket = buckets.get(sentenceId);
    if (!bucket) {
      bucket = { sentence: sentence.text, wrong: [], timeouts: [] };
      buckets.set(sentenceId, bucket);
    }
    return bucket;
  };

  for (const position of attempt.wrongPositions) {
    bucketFor(position.sentenceId)?.wrong.push({
      index: position.charIndex,
      char: position.expectedChar,
      count: position.count ?? 1,
    });
  }
  for (const position of attempt.timeoutPositions) {
    bucketFor(position.sentenceId)?.timeouts.push(position.charIndex);
  }

  return [...buckets.entries()].map(([sentenceId, bucket]) => {
    const wrongByPosition = new Map<number, { char: string; count: number }>();
    for (const entry of bucket.wrong) {
      const previous = wrongByPosition.get(entry.index);
      wrongByPosition.set(entry.index, {
        char: entry.char,
        count: (previous?.count ?? 0) + entry.count,
      });
    }
    const wrongDedup = [...wrongByPosition.entries()]
      .map(([index, value]) => ({ index, ...value }))
      .sort((left, right) => left.index - right.index);
    const timeoutDedup = [...new Set(bucket.timeouts)].sort((left, right) => left - right);
    return {
      sentence: bucket.sentence,
      sentenceKey: sentenceId,
      wrongChars: wrongDedup.map((entry) => entry.char),
      wrongPositions: wrongDedup.map((entry) => entry.index),
      timeoutPositions: timeoutDedup,
      date,
      count: wrongDedup.reduce((sum, entry) => sum + entry.count, 0) + timeoutDedup.length,
      wrongCountByPosition: Object.fromEntries(
        wrongDedup.map((entry) => [String(entry.index), entry.count]),
      ),
      contentVersion: attempt.contentVersion,
      sentenceId,
    };
  });
}

function resolvePassage(passageId: string): Passage | undefined {
  return passageRegistry.get(passageId) ?? usePassageStore.getState().getOnlinePassage(passageId);
}

/**
 * Idempotent settlement transaction: writes mistakes, next-day review items,
 * progress (best passed time) and the pass badge exactly once per attempt id.
 * The attempt's settledAt acts as the re-entry guard.
 */
export function settleAttempt(attemptId: string, now: string = nowISO()): SettleResult {
  const attempt = useAttemptStore.getState().getAttempt(attemptId);
  if (!attempt) {
    return { ok: false, alreadySettled: false };
  }
  if (attempt.settledAt) {
    return { ok: true, alreadySettled: true, attempt };
  }

  const passage = resolvePassage(attempt.passageId);
  const date = formatDateLocal(new Date(attempt.completedAt ?? now));
  const records = passage ? toMistakeRecords(attempt, passage, date) : [];
  if (records.length > 0) {
    useMistakeStore.getState().addMistakes(attempt.passageId, records);
    if (passage) {
      useReviewStore.getState().generateFromMistakes(passage, records);
    }
  }
  if (attempt.completed) {
    useProgressStore.getState().recordExamCompletion(attempt.passageId, {
      passed: attempt.passed,
      elapsedMs: attempt.elapsedMs,
      completedAt: attempt.completedAt ?? now,
    });
  }
  if (attempt.passed && passage) {
    const charCount = countPassageHan(
      passage.segments.flatMap((segment) => segment.cards.flatMap((card) => card.sentences))
    );
    useBadgeStore.getState().recordPass(`pass:${attemptId}`, attempt.passageId, charCount);
  }

  return useAttemptStore.getState().settleAttempt(attemptId, now);
}
