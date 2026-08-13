import { describe, expect, it } from 'vitest';
import type { Card, PassageProgress, Sentence } from '../../src/types';
import {
  advanceCardPlan,
  createCardPlan,
  createCardTrainingState,
  createSnowballPlan,
  createSnowballTrainingState,
  resetBlindUnit,
} from '../../src/domain/training/cardMachine';

function sentence(id: string): Sentence {
  return { id, text: '学', meaning: '', acceptedInitials: [['x']] };
}

function card(sentences: Sentence[]): Card {
  return { id: 'card:one', sentences };
}

describe('card training machine', () => {
  it('plans a one-sentence card as gap, initial, then the full-card blind unit', () => {
    expect(createCardPlan(card([sentence('sentence:one')])).map((unit) => unit.kind)).toEqual([
      'gap',
      'initial',
      'blind-card',
    ]);
  });

  it('plans a two-sentence card as one whole-card unit through gap → initial → blind-card', () => {
    expect(
      createCardPlan(card([sentence('sentence:one'), sentence('sentence:two')])).map(
        (unit) => `${unit.kind}:${unit.sentenceIds.join('+')}`
      )
    ).toEqual([
      'gap:sentence:one+sentence:two',
      'initial:sentence:one+sentence:two',
      'blind-card:sentence:one+sentence:two',
    ]);
  });

  it('exposes the full card sentence ids for every plan unit', () => {
    const plan = createCardPlan(card([sentence('sentence:one'), sentence('sentence:two')]));

    expect(plan.map((unit) => unit.sentenceIds)).toEqual([
      ['sentence:one', 'sentence:two'],
      ['sentence:one', 'sentence:two'],
      ['sentence:one', 'sentence:two'],
    ]);
  });

  it('plans a multi-clause card (3 sentences) as one whole-card unit, not per-sentence', () => {
    const plan = createCardPlan(card([
      sentence('sentence:one'),
      sentence('sentence:two'),
      sentence('sentence:three'),
    ]));

    expect(plan.map((unit) => `${unit.kind}:${unit.sentenceIds.join('+')}`)).toEqual([
      'gap:sentence:one+sentence:two+sentence:three',
      'initial:sentence:one+sentence:two+sentence:three',
      'blind-card:sentence:one+sentence:two+sentence:three',
    ]);
  });

  it('rejects cards with more than the supported number of sentences', () => {
    const tooMany = Array.from({ length: 7 }, (_, index) => sentence(`sentence:${index}`));
    expect(() => createCardPlan(card(tooMany))).toThrow(/between one and 6 sentences/);
  });

  it('allows a snowball target to span more than six sentences', () => {
    const sentences = Array.from({ length: 11 }, (_, index) => sentence(`sentence:${index}`));
    const target = card(sentences);

    expect(createSnowballPlan(target)).toHaveLength(3);
    expect(createSnowballTrainingState(target)).toMatchObject({
      currentIndex: 0,
      completed: false,
      plan: [
        { kind: 'gap', sentenceIds: sentences.map((item) => item.id) },
        { kind: 'initial', sentenceIds: sentences.map((item) => item.id) },
        { kind: 'blind-card', sentenceIds: sentences.map((item) => item.id) },
      ],
    });
  });

  it('keeps gap and initial on their current unit after a miss', () => {
    const start = createCardTrainingState(card([sentence('sentence:one')]));
    const gapMiss = advanceCardPlan(start, 'miss');
    const initial = advanceCardPlan(gapMiss, 'pass');
    const initialMiss = advanceCardPlan(initial, 'miss');

    expect(gapMiss).toMatchObject({ currentIndex: 0, blindResetVersion: 0, feedback: 'miss' });
    expect(initialMiss).toMatchObject({ currentIndex: 1, blindResetVersion: 0, feedback: 'miss' });
  });

  it('resets only the active blind unit after a blind miss without revoking passed predecessors', () => {
    const start = createCardTrainingState(card([sentence('sentence:one')]));
    const blind = advanceCardPlan(advanceCardPlan(start, 'pass'), 'pass');
    const reset = resetBlindUnit(blind);

    expect(reset).toMatchObject({ currentIndex: 2, completedUnitIndexes: [0, 1], blindResetVersion: 1 });
    expect(advanceCardPlan(reset, 'pass')).toMatchObject({ completed: true, completedUnitIndexes: [0, 1, 2] });
  });

  it('restores the first unfinished whole-card stage from persisted progress', () => {
    const target = card([sentence('sentence:one'), sentence('sentence:two')]);
    const progress = {
      sentenceStates: {
        'sentence:one': { phase: 2, passed: true },
        'sentence:two': { phase: 2, passed: true },
      },
      cardBlindPassed: {},
    } as unknown as PassageProgress;

    expect(createCardTrainingState(target, progress)).toMatchObject({
      currentIndex: 1,
      completedUnitIndexes: [0],
      completed: false,
    });
    expect(createCardTrainingState(target, {
      ...progress,
      cardBlindPassed: { 'card:one': true },
    })).toMatchObject({ currentIndex: 3, completed: true });
  });
});
