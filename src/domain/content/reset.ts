import { useAttemptStore } from '../../stores/attemptStore';
import { useMistakeStore } from '../../stores/mistakeStore';
import { useProgressStore } from '../../stores/progressStore';
import { useReviewStore } from '../../stores/reviewStore';

/**
 * Clears every learner-owned record belonging to one passage while leaving the
 * passage itself in the learning list. Global badge statistics are deliberately
 * preserved because they describe the learner rather than this passage.
 */
export function resetPassageData(passageId: string): void {
  useProgressStore.getState().removeProgress(passageId);
  useMistakeStore.getState().removeByPassage(passageId);
  useReviewStore.getState().removeByPassage(passageId);
  useAttemptStore.getState().removeByPassage(passageId);
}
