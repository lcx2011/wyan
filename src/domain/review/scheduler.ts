import { toMistakeRecords } from '../exam/attempt';
import type { ExamAttempt, Passage, ReviewItem } from '../../types';
import { buildClauseReviewItems } from './item';
import { getNeededItems } from './selection';

export {
  getNeededItems,
  reviewNeedScore,
  selectReviewGroup,
  REVIEW_GROUP_MAX_HAN,
  REVIEW_GROUP_MAX_ITEMS,
} from './selection';
export {
  answerReview,
  createReviewSession,
} from './session';
export type { ReviewAnswer, ReviewSession } from './session';

/** Builds immediately available punctuation-clause tasks from a settled Boss attempt. */
export function buildReviewItems(attempt: ExamAttempt, passage: Passage, today: string): ReviewItem[] {
  return toMistakeRecords(attempt, passage, today)
    .flatMap((record) => buildClauseReviewItems(passage, record));
}

/** Backward-compatible name. Future due dates no longer hide pending items. */
export function getDueItems(items: readonly ReviewItem[], today: string, limit = 5): ReviewItem[] {
  return getNeededItems(items, limit, today);
}
