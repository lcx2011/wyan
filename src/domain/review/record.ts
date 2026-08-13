import type { ExamAttempt, Passage } from '../../types';
import type { TypingState } from '../typing/engine';
import { toMistakeRecords } from '../exam/attempt';
import { useMistakeStore } from '../../stores/mistakeStore';
import { useReviewStore } from '../../stores/reviewStore';
import { buildUnreviewedClauseItems } from './item';
import { formatDateLocal, nowISO } from '../../utils/time';

/** Persists the weak positions observed in a learning/snowball typing unit. */
export function recordTypingWeakness(
  passage: Passage,
  state: TypingState,
  completedAt: string = nowISO(),
): void {
  // Training pauses affect mastery, but they are not mistakes that should
  // create a review item. Boss attempts have their own reporting path.
  if (state.wrongPositions.length === 0) return;
  const attempt: ExamAttempt = {
    id: `training:${passage.id}:${completedAt}`,
    passageId: passage.id,
    contentVersion: passage.contentVersion,
    startedAt: completedAt,
    completedAt,
    elapsedMs: state.elapsedMs,
    passed: false,
    elapsedSeconds: null,
    wrongPositions: state.wrongPositions.map((position) => ({
      ...position,
      count: state.wrongCountByPosition[`${position.sentenceId}:${position.charIndex}`] ?? 1,
    })),
    timeoutPositions: [],
    completed: true,
    settledAt: completedAt,
  };
  const date = formatDateLocal(new Date(completedAt));
  const records = toMistakeRecords(attempt, passage, date);
  if (records.length === 0) return;
  useMistakeStore.getState().addMistakes(passage.id, records);
  useReviewStore.getState().generateFromMistakes(passage, records);
}

/** Adds immediate, low-priority first-review tasks after whole-card blind success. */
export function enqueueFirstReview(
  passage: Passage,
  sentenceIds: readonly string[],
  createdAt: string = nowISO(),
): void {
  const learned = new Set(sentenceIds);
  useReviewStore.getState().addItems(
    buildUnreviewedClauseItems(
      passage,
      learned,
      formatDateLocal(new Date(createdAt)),
      createdAt,
    ),
  );
}
