import { describe, expect, it } from 'vitest';
import {
  cardMasteryFromSentences,
  GAP_ANCHOR_THRESHOLD,
  gapHiddenRatio,
  initialSentenceMastery,
  scoreWholeCardAttempt,
  stageForMastery,
} from '../../src/domain/training/mastery';
import { initTyping, handleInput, tickTimeout } from '../../src/domain/typing/engine';
import { buildTarget } from '../../src/domain/typing/target';
import { acceptedInitials } from '../../src/domain/typing/pinyin';
import type { Sentence } from '../../src/types';

function sentence(text: string, id: string): Sentence {
  return { id, text, meaning: '', acceptedInitials: acceptedInitials(text) };
}

function doneState(sentences: Sentence[], initials: string[], now = 0) {
  const target = buildTarget(sentences);
  let state = initTyping(target, { now });
  for (const initial of initials) {
    const result = handleInput(state, initial, now + 1);
    state = result.state;
  }
  return state;
}

describe('card mastery', () => {
  it('uses the weakest sentence as the whole-card mastery', () => {
    expect(cardMasteryFromSentences({ a: 90, b: 70, c: 95 })).toBe(70);
    expect(initialSentenceMastery(['a', 'b'], 72)).toEqual({ a: 72, b: 72 });
  });

  it('maps the three whole-card stages to the requested thresholds', () => {
    expect(stageForMastery(0)).toBe('gap');
    expect(stageForMastery(99)).toBe('gap');
    expect(stageForMastery(100)).toBe('initial');
    expect(GAP_ANCHOR_THRESHOLD).toBe(45);
  });

  it('scales the gap difficulty from about 25% to about 60%', () => {
    expect(gapHiddenRatio(0)).toBeCloseTo(0.25);
    expect(gapHiddenRatio(40)).toBeCloseTo(0.39);
    expect(gapHiddenRatio(100)).toBeCloseTo(0.60);
  });

  it('adds 15 for a clean whole-card answer and deducts for a wrong sentence', () => {
    const first = sentence('学而', 's1');
    const second = sentence('温故', 's2');
    const target = buildTarget([first, second]);
    let state = initTyping(target, { now: 0 });
    state = handleInput(state, 'x', 1).state;
    state = handleInput(state, 'e', 2).state;
    state = handleInput(state, 'w', 3).state;
    state = handleInput(state, 'g', 4).state;

    const clean = scoreWholeCardAttempt('gap', { s1: 0, s2: 0 }, ['s1', 's2'], state);
    expect(clean.deltas).toEqual({ s1: 15, s2: 15 });
    expect(clean.cardMastery).toBe(15);

    const wrong = handleInput(initTyping(target, { now: 0 }), 'z', 1).state;
    const penalized = scoreWholeCardAttempt('gap', { s1: 72, s2: 72 }, ['s1', 's2'], wrong);
    expect(penalized.deltas).toEqual({ s1: -10, s2: 0 });
    expect(penalized.cardMastery).toBe(62);
  });

  it('deducts a pause without turning it into a failed answer', () => {
    const s1 = sentence('学而', 's1');
    const target = buildTarget([s1]);
    const paused = tickTimeout(initTyping(target, { now: 0 }), 3_000).state;
    const completed = doneState([s1], ['x', 'e']);
    const result = scoreWholeCardAttempt('gap', { s1: 72 }, ['s1'], completed);
    const pausedResult = scoreWholeCardAttempt('gap', { s1: 72 }, ['s1'], {
      ...completed,
      timeoutPositions: paused.timeoutPositions,
    });

    expect(result.cardMastery).toBe(87);
    expect(pausedResult.cardMastery).toBe(85);
  });

  it('only penalizes the sentence that has already failed in an interrupted blind attempt', () => {
    const s1 = sentence('学而', 's1');
    const s2 = sentence('温故', 's2');
    const target = buildTarget([s1, s2]);
    const missed = handleInput(initTyping(target, { now: 0 }), 'z', 1).state;
    const result = scoreWholeCardAttempt('blind-card', { s1: 80, s2: 80 }, ['s1', 's2'], missed);

    expect(result.deltas).toEqual({ s1: -10, s2: 0 });
    expect(result.cardMastery).toBe(70);
  });
});
