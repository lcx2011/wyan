import type { ReviewItem } from '../../types.js';

const RETRY_INSERT_DISTANCE = 2;
const PASSES_AFTER_MISS = 2;

export interface ReviewSession {
  items: readonly ReviewItem[];
  index: number;
  completed: boolean;
  initialCount: number;
  completedCount: number;
  revision: number;
  passesRemaining: Readonly<Record<string, number>>;
}

export type ReviewAnswer = 'pass' | 'miss';

export function createReviewSession(items: readonly ReviewItem[]): ReviewSession {
  return {
    items: [...items],
    index: 0,
    completed: items.length === 0,
    initialCount: items.length,
    completedCount: 0,
    revision: 0,
    passesRemaining: {},
  };
}

function insertLater(items: ReviewItem[], item: ReviewItem): ReviewItem[] {
  const index = Math.min(RETRY_INSERT_DISTANCE, items.length);
  return [...items.slice(0, index), item, ...items.slice(index)];
}

export function answerReview(session: ReviewSession, result: ReviewAnswer): ReviewSession {
  const current = session.items[0];
  if (!current) return session;
  const remaining = session.items.slice(1);

  if (result === 'miss') {
    const updated = { ...current, attempts: current.attempts + 1 };
    return {
      ...session,
      items: insertLater([...remaining], updated),
      index: 0,
      completed: false,
      passesRemaining: { ...session.passesRemaining, [current.id]: PASSES_AFTER_MISS },
      revision: session.revision + 1,
    };
  }

  const required = session.passesRemaining[current.id] ?? 1;
  if (required > 1) {
    return {
      ...session,
      items: insertLater([...remaining], current),
      index: 0,
      completed: false,
      passesRemaining: { ...session.passesRemaining, [current.id]: required - 1 },
      revision: session.revision + 1,
    };
  }

  const passesRemaining = { ...session.passesRemaining };
  delete passesRemaining[current.id];
  return {
    ...session,
    items: remaining,
    index: 0,
    completed: remaining.length === 0,
    completedCount: session.completedCount + 1,
    passesRemaining,
    revision: session.revision + 1,
  };
}
