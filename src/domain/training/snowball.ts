import type { Card, Segment } from '../../types';

export interface SnowballProgress {
  cardBlindPassed: Readonly<Record<string, boolean | undefined>>;
  cardMastery?: Readonly<Record<string, number | undefined>>;
  linkSnowballPassed: Readonly<Record<string, boolean | undefined>>;
  segmentSnowballPassed: Readonly<Record<string, boolean | undefined>>;
}

export interface LinkSnowballUnit {
  kind: 'link';
  /** Persistent progress key: card:prev|card:current. */
  key: string;
  id: string;
  segmentId: string;
  cardIds: readonly [string, string];
  cards: readonly [Card, Card];
}

export interface SegmentSnowballUnit {
  kind: 'segment';
  /** The segment's stable id is its persistent progress key. */
  key: string;
  id: string;
  segmentId: string;
  cardIds: readonly string[];
  cards: readonly Card[];
}

export type SnowballUnit = LinkSnowballUnit | SegmentSnowballUnit;

export function linkSnowballKey(previousCardId: string, currentCardId: string): string {
  return `card:${previousCardId}|card:${currentCardId}`;
}

/**
 * Selects the first unpassed adjacent pair.  The whole segment is eligible
 * only after every pair passed, including the final pair.
 */
export function nextSnowballUnit(segment: Segment, progress: SnowballProgress): SnowballUnit | null {
  const cardReady = (cardId: string): boolean => progress.cardMastery
    ? progress.cardMastery[cardId] === undefined
      ? progress.cardBlindPassed[cardId] === true
      : progress.cardMastery[cardId] >= 100 && progress.cardBlindPassed[cardId] === true
    : progress.cardBlindPassed[cardId] === true;

  for (let index = 1; index < segment.cards.length; index += 1) {
    const previous = segment.cards[index - 1];
    const current = segment.cards[index];
    // Link n-(n+1) is offered as soon as both cards have passed blind mode.
    // Returning null here hands control back to the card-learning page instead
    // of batching every link only after the whole segment was learned.
    if (!cardReady(previous.id) || !cardReady(current.id)) {
      return null;
    }
    const key = linkSnowballKey(previous.id, current.id);
    if (!progress.linkSnowballPassed[key]) {
      return {
        kind: 'link',
        key,
        id: key,
        segmentId: segment.id,
        cardIds: [previous.id, current.id],
        cards: [previous, current],
      };
    }
  }

  if (segment.cards.some((card) => !cardReady(card.id))) {
    return null;
  }

  if (progress.segmentSnowballPassed[segment.id]) {
    return null;
  }
  return {
    kind: 'segment',
    key: segment.id,
    id: segment.id,
    segmentId: segment.id,
    cardIds: segment.cards.map((card) => card.id),
    cards: [...segment.cards],
  };
}
