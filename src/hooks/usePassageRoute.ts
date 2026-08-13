import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { passageRegistry } from '../data/passages';
import { usePassageStore } from '../stores/passageStore';
import { useProgressStore } from '../stores/progressStore';
import type { Card, GlobalPosition, Passage, Segment } from '../types';

export interface PassageRoute {
  passageId: string;
  passage: Passage | undefined;
}

/** A card together with its position inside the passage. */
export interface CardLocation {
  segmentIndex: number;
  cardIndex: number;
  segment: Segment;
  card: Card;
}

/**
 * Resolves the :passageId route param to a formal Passage. Built-in passages
 * come from the registry; online passages (id `online:{uuid}`) from the
 * persisted passage store. Returns undefined for unknown or failed passages so
 * pages can render a recoverable empty state instead of crashing.
 */
export function usePassageRoute(): PassageRoute {
  const { passageId } = useParams<{ passageId: string }>();
  const onlinePassage = usePassageStore((s) => (passageId ? s.onlinePassages[passageId] : undefined));
  const syncContentVersion = useProgressStore((s) => s.syncContentVersion);
  const passage = useMemo(() => {
    const id = passageId ?? '';
    return passageRegistry.get(id) ?? onlinePassage;
  }, [passageId, onlinePassage]);
  useEffect(() => {
    if (passage) {
      syncContentVersion(passage.id, passage.contentVersion);
    }
  }, [passage, syncContentVersion]);
  return { passageId: passageId ?? '', passage };
}

/** Flattens every card of a passage into an ordered, indexable list. */
export function flattenCards(passage: Passage): CardLocation[] {
  const locations: CardLocation[] = [];
  passage.segments.forEach((segment, segmentIndex) => {
    segment.cards.forEach((card, cardIndex) => {
      locations.push({ segmentIndex, cardIndex, segment, card });
    });
  });
  return locations;
}

/** Finds a card's location by its stable id. */
export function locateCard(passage: Passage, cardId: string): CardLocation | undefined {
  return flattenCards(passage).find((location) => location.card.id === cardId);
}

/** Builds the stable GlobalPosition of a card for progress checkpoints. */
export function cardPosition(passageId: string, segment: Segment, card: Card): GlobalPosition {
  return {
    passageId,
    segmentId: segment.id,
    cardId: card.id,
    sentenceId: card.sentences[0]?.id ?? '',
  };
}
