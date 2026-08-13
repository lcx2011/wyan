import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateReviewData, normalizeReviewRecord } from '../storage/migrations';
import { SCHEMA_VERSIONS } from '../storage/schema';
import type { MistakeRecord, Passage, ReviewItem } from '../types';
import { todayISO } from '../utils/time';
import { createPersistedRootStorage } from '../utils/storage';
import { buildClauseReviewItems, mergeReviewItem } from '../domain/review/item';

function reviewIdentity(item: ReviewItem): string {
  return item.targetClauseId
    ? `${item.passageId}:${item.targetClauseId}`
    : `${item.passageId}:${item.sentenceId ?? item.id}:${item.sourceDate}`;
}

export function normalizeReviewItem(raw: unknown, dueDate: string, index: number): ReviewItem {
  return normalizeReviewRecord(raw, dueDate, index);
}

/** Backward-compatible export; the formal queue is now a flat array. */
export function migrateReviewState(state: unknown): { queue: ReviewItem[] } {
  return migrateReviewData(state);
}

export interface ReviewStoreState {
  queue: ReviewItem[];
  addItems: (items: ReviewItem[]) => void;
  generateFromMistakes: (passage: Passage, records: MistakeRecord[]) => void;
  /** Replaces migrated legacy ids and upserts their clause-pair equivalents. */
  replaceLegacyItems: (legacyIds: string[], items: ReviewItem[]) => void;
  getNeededItems: (limit?: number, today?: string) => ReviewItem[];
  getDueItems: (today?: string, limit?: number) => ReviewItem[];
  getTodayItems: () => ReviewItem[];
  hasReview: () => boolean;
  hasTodayReview: (today?: string) => boolean;
  recordAttempt: (itemId: string) => void;
  completeItem: (itemId: string, completedAt?: string) => void;
  removeByPassage: (passageId: string) => void;
}

function mergeItems(existing: ReviewItem[], additions: ReviewItem[]): ReviewItem[] {
  const result = [...existing];
  for (const addition of additions) {
    const index = result.findIndex((item) => reviewIdentity(item) === reviewIdentity(addition));
    if (index < 0) {
      result.push(addition);
      continue;
    }
    const previous = result[index];
    result[index] = mergeReviewItem(previous, addition);
  }
  return result;
}

function daysSince(value: string, today: string): number {
  const start = Date.parse(`${value}T00:00:00`);
  const end = Date.parse(`${today}T00:00:00`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.floor((end - start) / 86_400_000))
    : 0;
}

function needScore(item: ReviewItem, today: string): number {
  return (item.priority ?? (item.reason === 'unreviewed' ? 30 : 80))
    + Math.min(60, (item.mistakeCount ?? 0) * 10)
    + Math.min(30, item.attempts * 5)
    + Math.min(30, daysSince(item.sourceDate, today));
}

function neededItems(queue: readonly ReviewItem[], limit: number, today: string): ReviewItem[] {
  return queue
    .filter((item) => item.status === 'pending' && item.answer.trim() !== '')
    .sort((left, right) =>
      needScore(right, today) - needScore(left, today)
      || right.sourceDate.localeCompare(left.sourceDate)
      || (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
      || left.id.localeCompare(right.id)
    )
    .slice(0, limit);
}

export const useReviewStore = create<ReviewStoreState>()(
  persist(
    (set, get) => ({
      queue: [],
      addItems: (items) => set((state) => ({ queue: mergeItems(state.queue, items) })),
      generateFromMistakes: (passage, records) =>
        set((state) => ({
          queue: mergeItems(
            state.queue,
            records.flatMap((record) => buildClauseReviewItems(passage, record)),
          ),
        })),
      replaceLegacyItems: (legacyIds, items) =>
        set((state) => ({
          queue: mergeItems(
            state.queue.filter((item) => !legacyIds.includes(item.id)),
            items,
          ),
        })),
      getNeededItems: (limit = Number.POSITIVE_INFINITY, today = todayISO()) =>
        neededItems(get().queue, limit, today),
      getDueItems: (today = todayISO(), limit = 5) =>
        neededItems(get().queue, limit, today),
      getTodayItems: () => get().getNeededItems(5, todayISO()),
      hasReview: () => get().getNeededItems(1).length > 0,
      hasTodayReview: (today = todayISO()) => get().getNeededItems(1, today).length > 0,
      recordAttempt: (itemId) =>
        set((state) => ({
          queue: state.queue.map((item) => item.id === itemId
            ? { ...item, attempts: item.attempts + 1 }
            : item),
        })),
      completeItem: (itemId, completedAt = new Date().toISOString()) =>
        set((state) => ({
          queue: state.queue.map((item) => item.id === itemId
            ? { ...item, status: 'completed' as const, completedAt }
            : item),
        })),
      removeByPassage: (passageId) =>
        set((state) => ({
          queue: state.queue.filter((item) => item.passageId !== passageId),
        })),
    }),
    {
      name: 'wenyan:reviewQueue',
      version: SCHEMA_VERSIONS.reviewQueue,
      storage: createPersistedRootStorage<ReviewStoreState>(
        { version: SCHEMA_VERSIONS.reviewQueue, migrate: migrateReviewData },
        { queue: [] }
      ),
      partialize: (state) => ({ queue: state.queue }) as ReviewStoreState,
    }
  )
);
