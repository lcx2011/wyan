import type { ReviewItem } from '../../types';
import { countHan } from '../../utils/text';
import { todayISO } from '../../utils/time';

export const REVIEW_GROUP_MAX_ITEMS = 10;
export const REVIEW_GROUP_MAX_HAN = 150;

function daysSince(value: string, today: string): number {
  const start = Date.parse(`${value}T00:00:00`);
  const end = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/** Explainable, server/client identical need score. Dates only rank pending work. */
export function reviewNeedScore(item: ReviewItem, today: string = todayISO()): number {
  const base = item.priority ?? (item.reason === 'unreviewed' ? 30 : 80);
  const mistakeSignal = Math.min(60, (item.mistakeCount ?? 0) * 10);
  const retrySignal = Math.min(30, item.attempts * 5);
  const unresolvedAge = Math.min(30, daysSince(item.sourceDate, today));
  return base + mistakeSignal + retrySignal + unresolvedAge;
}

export function getNeededItems(
  items: readonly ReviewItem[],
  limit = Number.POSITIVE_INFINITY,
  today: string = todayISO(),
): ReviewItem[] {
  return items
    .filter((entry) => entry.status === 'pending' && entry.answer.trim() !== '')
    .sort((left, right) =>
      reviewNeedScore(right, today) - reviewNeedScore(left, today)
      || right.sourceDate.localeCompare(left.sourceDate)
      || (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
      || left.id.localeCompare(right.id)
    )
    .slice(0, limit);
}

function isAdjacent(left: ReviewItem, right: ReviewItem): boolean {
  return left.passageId === right.passageId
    && left.targetOrder !== undefined
    && right.targetOrder !== undefined
    && Math.abs(left.targetOrder - right.targetOrder) <= 1;
}

function interleaveAdjacent(items: readonly ReviewItem[]): ReviewItem[] {
  const remaining = [...items];
  const result: ReviewItem[] = [];
  while (remaining.length > 0) {
    const previous = result[result.length - 1];
    const index = previous
      ? remaining.findIndex((candidate) => !isAdjacent(previous, candidate))
      : 0;
    result.push(remaining.splice(index < 0 ? 0 : index, 1)[0]);
  }
  return result;
}

export function selectReviewGroup(
  items: readonly ReviewItem[],
  options: { maxItems?: number; maxHan?: number; today?: string } = {},
): ReviewItem[] {
  const maxItems = options.maxItems ?? REVIEW_GROUP_MAX_ITEMS;
  const maxHan = options.maxHan ?? REVIEW_GROUP_MAX_HAN;
  const ranked = getNeededItems(items, Number.POSITIVE_INFINITY, options.today);
  const selected: ReviewItem[] = [];
  let totalHan = 0;

  for (const item of ranked) {
    if (selected.length >= maxItems) break;
    const itemHan = countHan(item.answer);
    if (selected.length > 0 && totalHan + itemHan > maxHan) continue;
    selected.push(item);
    totalHan += itemHan;
  }
  return interleaveAdjacent(selected);
}
