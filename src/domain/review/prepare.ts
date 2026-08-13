import type { Passage, PassageProgress, ReviewItem } from '../../types';
import { todayISO } from '../../utils/time';
import {
  buildUnreviewedClauseItems,
  mergeReviewItem,
  upgradeLegacyReviewItem,
} from './item';

export interface PreparedReviewQueue {
  items: ReviewItem[];
  removeIds: string[];
  additions: ReviewItem[];
}

function identity(item: ReviewItem): string {
  return item.targetClauseId
    ? `${item.passageId}:${item.targetClauseId}`
    : item.id;
}

function merge(items: readonly ReviewItem[]): ReviewItem[] {
  const merged: ReviewItem[] = [];
  for (const item of items) {
    const index = merged.findIndex((candidate) => identity(candidate) === identity(item));
    if (index < 0) merged.push(item);
    else merged[index] = mergeReviewItem(merged[index], item);
  }
  return merged;
}

/**
 * Reconciles persisted review data at page entry: upgrades old blank items,
 * drops removed/content-changed passage tasks, and backfills first-review
 * clauses for cards learned before the clause-review feature existed.
 */
export function prepareReviewQueue(
  queue: readonly ReviewItem[],
  passages: ReadonlyMap<string, Passage>,
  progressByPassage: Readonly<Record<string, PassageProgress>>,
  today: string = todayISO(),
): PreparedReviewQueue {
  const removeIds: string[] = [];
  const retained: ReviewItem[] = [];
  const additions: ReviewItem[] = [];

  for (const item of queue) {
    const passage = passages.get(item.passageId);
    if (!passage || (item.contentVersion && item.contentVersion !== passage.contentVersion)) {
      removeIds.push(item.id);
      continue;
    }
    if (!item.targetClauseId && item.status === 'pending') {
      removeIds.push(item.id);
      additions.push(...upgradeLegacyReviewItem(item, passage));
      continue;
    }
    retained.push(item);
  }

  for (const [passageId, progress] of Object.entries(progressByPassage)) {
    const passage = passages.get(passageId);
    if (!passage) continue;
    const learnedSentenceIds = new Set(
      Object.entries(progress.sentenceStates)
        .filter(([, state]) => state.passed && state.phase >= 3)
        .map(([sentenceId]) => sentenceId),
    );
    additions.push(...buildUnreviewedClauseItems(passage, learnedSentenceIds, today));
  }

  return {
    items: merge([...retained, ...additions]),
    removeIds,
    additions,
  };
}

