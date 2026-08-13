import { describe, expect, it } from 'vitest';
import type { Card, Segment, Sentence } from '../../src/types';
import { nextSnowballUnit } from '../../src/domain/training/snowball';

function card(id: string): Card {
  const sentence: Sentence = { id: `${id}:sentence`, text: '学', meaning: '', acceptedInitials: [['x']] };
  return { id, sentences: [sentence] };
}

const segment: Segment = { id: 'segment:one', index: 0, cards: [card('card:one'), card('card:two'), card('card:three')] };

describe('snowball scheduler', () => {
  it('interleaves each newly learned card with its adjacent link', () => {
    const first = nextSnowballUnit(segment, {
      cardBlindPassed: { 'card:one': true, 'card:two': true },
      linkSnowballPassed: {},
      segmentSnowballPassed: {},
    });
    const waitingForThirdCard = nextSnowballUnit(segment, {
      cardBlindPassed: { 'card:one': true, 'card:two': true },
      linkSnowballPassed: { 'card:card:one|card:card:two': true },
      segmentSnowballPassed: {},
    });
    const second = nextSnowballUnit(segment, {
      cardBlindPassed: { 'card:one': true, 'card:two': true, 'card:three': true },
      linkSnowballPassed: { 'card:card:one|card:card:two': true },
      segmentSnowballPassed: {},
    });
    const complete = nextSnowballUnit(segment, {
      cardBlindPassed: { 'card:one': true, 'card:two': true, 'card:three': true },
      linkSnowballPassed: {
        'card:card:one|card:card:two': true,
        'card:card:two|card:card:three': true,
      },
      segmentSnowballPassed: {},
    });

    expect(first).toMatchObject({ kind: 'link', key: 'card:card:one|card:card:two', cardIds: ['card:one', 'card:two'] });
    expect(waitingForThirdCard).toBeNull();
    expect(second).toMatchObject({ kind: 'link', key: 'card:card:two|card:card:three', cardIds: ['card:two', 'card:three'] });
    expect(complete).toMatchObject({ kind: 'segment', key: 'segment:one', cardIds: ['card:one', 'card:two', 'card:three'] });
  });

  it('never schedules a segment before every adjacent link has passed and skips persisted units', () => {
    const beforeFinalLink = nextSnowballUnit(segment, {
      cardBlindPassed: { 'card:one': true, 'card:two': true, 'card:three': true },
      linkSnowballPassed: { 'card:card:one|card:card:two': true },
      segmentSnowballPassed: {},
    });
    const allPassed = nextSnowballUnit(segment, {
      cardBlindPassed: { 'card:one': true, 'card:two': true, 'card:three': true },
      linkSnowballPassed: {
        'card:card:one|card:card:two': true,
        'card:card:two|card:card:three': true,
      },
      segmentSnowballPassed: { 'segment:one': true },
    });

    expect(beforeFinalLink?.kind).toBe('link');
    expect(allPassed).toBeNull();
  });

  it('does not create a link for the first or only card', () => {
    const oneCard: Segment = { ...segment, cards: [segment.cards[0]] };

    expect(nextSnowballUnit(oneCard, {
      cardBlindPassed: { 'card:one': true },
      linkSnowballPassed: {},
      segmentSnowballPassed: {},
    })).toMatchObject({
      kind: 'segment',
      key: 'segment:one',
    });
  });
});
