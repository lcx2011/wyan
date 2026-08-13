import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sentence } from '../../src/types';
import {
  handleInput,
  initTyping,
  pauseTyping,
  resetTyping,
  resumeTyping,
  tickTimeout,
} from '../../src/domain/typing/engine';
import { isHintVisible, showHint } from '../../src/domain/typing/hint';
import { buildTarget } from '../../src/domain/typing/target';

function sentence(text: string, initials: string[], id = 'sentence:one'): Sentence {
  return { id, text, meaning: '', acceptedInitials: initials.map((initial) => [initial]) };
}

describe('typing engine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals a Han character and its trailing punctuation', () => {
    const target = buildTarget([sentence('学，而', ['x', 'e'])]);

    const result = handleInput(initTyping(target, { now: 0 }), 'X', 10);

    expect(result.event).toBe('hit');
    expect(result.state.cursor).toBe(1);
    expect(result.state.revealed).toEqual([true, false]);
    expect(target.puncts).toEqual(['，', '']);
  });

  it('records the expected stable position on a miss without advancing', () => {
    const target = buildTarget([sentence('学而', ['x', 'e'], 'sentence:stable')]);
    const state = initTyping(target, { now: 0 });

    const result = handleInput(state, 'z', 100);

    expect(result.event).toBe('miss');
    expect(result.state.cursor).toBe(0);
    expect(result.position).toEqual({
      sentenceId: 'sentence:stable',
      charIndex: 0,
      expectedChar: '学',
    });
    expect(result.state.wrongPositions).toEqual([result.position]);
    expect(result.state.wrongCountByPosition).toEqual({ 'sentence:stable:0': 1 });
  });

  it('counts repeated misses at the same stable position once while retaining their count', () => {
    const state = initTyping(buildTarget([sentence('学', ['x'])]), { now: 0 });

    const once = handleInput(state, 'z', 100).state;
    const twice = handleInput(once, 'q', 200).state;

    expect(twice.wrongPositions).toHaveLength(1);
    expect(twice.wrongCountByPosition).toEqual({ 'sentence:one:0': 2 });
    expect(twice.lastActiveAt).toBe(200);
  });

  it('ignores anything other than one ASCII letter without counting activity', () => {
    const state = initTyping(buildTarget([sentence('学', ['x'])]), { now: 0 });

    const result = handleInput(state, 'ab', 200);

    expect(result.event).toBe('ignored');
    expect(result.state).toBe(state);
  });

  it('rejects Unicode case-folding lookalikes from target initials and input', () => {
    expect(() => buildTarget([sentence('学', ['K'])])).toThrow(/acceptedInitials/i);
    expect(() => buildTarget([sentence('学', ['ſ'])])).toThrow(/acceptedInitials/i);

    const state = initTyping(buildTarget([sentence('学', ['k'])]), { now: 1000 });

    expect(handleInput(state, 'K', 1100)).toMatchObject({ event: 'ignored', state });
    expect(handleInput(state, 'ſ', 1100)).toMatchObject({ event: 'ignored', state });

    const malformedTarget = buildTarget([sentence('学', ['k'])]);
    malformedTarget.acceptedInitials[0] = ['K'];
    expect(() => initTyping(malformedTarget, { now: 1000 })).toThrow(/acceptedInitials/i);
  });

  it('returns done only after the final Han character is revealed', () => {
    const state = initTyping(buildTarget([sentence('学', ['x'])]), { now: 0 });

    const result = handleInput(state, 'x', 20);

    expect(result.event).toBe('done');
    expect(result.state).toMatchObject({ cursor: 1, revealed: [true], done: true });
  });

  it('respects pre-revealed slots and resets to the supplied initial state', () => {
    const target = buildTarget([sentence('学而', ['x', 'e'])]);
    const state = initTyping(target, { now: 0, initialRevealed: [true, false] });

    const afterHit = handleInput(state, 'e', 100).state;
    const reset = resetTyping(target, { now: 200, initialRevealed: [true, false] });

    expect(afterHit.done).toBe(true);
    expect(reset).toMatchObject({ cursor: 1, revealed: [true, false], done: false, lastActiveAt: 200 });
  });

  it('records a timeout at exactly three seconds only once per cursor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const state = initTyping(buildTarget([sentence('学而', ['x', 'e'])]), { now: Date.now() });

    vi.advanceTimersByTime(2999);
    const beforeBoundary = tickTimeout(state, Date.now());
    vi.advanceTimersByTime(1);
    const atBoundary = tickTimeout(beforeBoundary.state, Date.now());
    vi.advanceTimersByTime(6000);
    const repeated = tickTimeout(atBoundary.state, Date.now());

    expect(beforeBoundary.event).toBe('ignored');
    expect(atBoundary.event).toBe('timeout');
    expect(atBoundary.position).toEqual({ sentenceId: 'sentence:one', charIndex: 0, expectedChar: '学' });
    expect(atBoundary.state.timeoutPositions).toEqual([atBoundary.position]);
    expect(repeated.event).toBe('ignored');
    expect(repeated.state.timeoutPositions).toHaveLength(1);
  });

  it('starts a fresh timeout window when input advances to the next cursor', () => {
    const state = initTyping(buildTarget([sentence('学而', ['x', 'e'])]), { now: 0 });
    const afterHit = handleInput(state, 'x', 100).state;

    const result = tickTimeout(afterHit, 3100);

    expect(result.event).toBe('timeout');
    expect(result.position).toEqual({ sentenceId: 'sentence:one', charIndex: 1, expectedChar: '而' });
  });

  it('does not include paused time in elapsed time or timeout decisions', () => {
    const state = initTyping(buildTarget([sentence('学', ['x'])]), { now: 0 });
    const paused = pauseTyping(state, 1000);
    const duringPause = tickTimeout(paused, 31000);
    const resumed = resumeTyping(duringPause.state, 31000);
    const beforeBoundary = tickTimeout(resumed, 33999);
    const atBoundary = tickTimeout(beforeBoundary.state, 34000);

    expect(paused.elapsedMs).toBe(1000);
    expect(duringPause.state.elapsedMs).toBe(1000);
    expect(resumed.lastActiveAt).toBe(31000);
    expect(beforeBoundary.event).toBe('ignored');
    expect(atBoundary.event).toBe('timeout');
  });

  it('uses a monotonic logical clock for stale hit, miss, and timeout callbacks', () => {
    const target = buildTarget([sentence('学而', ['x', 'e'])]);
    const afterStaleHit = handleInput(initTyping(target, { now: 1000 }), 'x', 500).state;
    const beforeHitTimeout = tickTimeout(afterStaleHit, 3999);
    const atHitTimeout = tickTimeout(beforeHitTimeout.state, 4000);

    const afterStaleMiss = handleInput(initTyping(target, { now: 1000 }), 'z', 500).state;
    const beforeMissTimeout = tickTimeout(afterStaleMiss, 3999);
    const atMissTimeout = tickTimeout(beforeMissTimeout.state, 4000);

    const afterTick = tickTimeout(initTyping(target, { now: 1000 }), 2000).state;
    const staleTick = tickTimeout(afterTick, 500);

    expect(afterStaleHit).toMatchObject({ lastActiveAt: 1000, lastElapsedAt: 1000, elapsedMs: 0 });
    expect(beforeHitTimeout.event).toBe('ignored');
    expect(atHitTimeout.event).toBe('timeout');
    expect(afterStaleMiss).toMatchObject({ lastActiveAt: 1000, lastElapsedAt: 1000, elapsedMs: 0 });
    expect(beforeMissTimeout.event).toBe('ignored');
    expect(atMissTimeout.event).toBe('timeout');
    expect(staleTick).toMatchObject({ event: 'ignored' });
    expect(staleTick.state).toMatchObject({ lastActiveAt: 1000, lastElapsedAt: 2000, elapsedMs: 1000 });
  });

  it('uses a monotonic logical clock for stale pause and resume callbacks', () => {
    const state = initTyping(buildTarget([sentence('学', ['x'])]), { now: 1000 });
    const afterTick = tickTimeout(state, 2000).state;
    const paused = pauseTyping(afterTick, 500);
    const resumed = resumeTyping(paused, 1500);
    const beforeTimeout = tickTimeout(resumed, 4999);
    const atTimeout = tickTimeout(beforeTimeout.state, 5000);

    expect(paused).toMatchObject({ paused: true, elapsedMs: 1000, lastElapsedAt: 2000 });
    expect(resumed).toMatchObject({ paused: false, lastActiveAt: 2000, lastElapsedAt: 2000 });
    expect(beforeTimeout.event).toBe('ignored');
    expect(atTimeout.event).toBe('timeout');
  });

  it('isolates state from caller target and returned position mutation', () => {
    const target = buildTarget([sentence('学', ['x'], 'sentence:stable')]);
    const initial = initTyping(target, { now: 0 });
    target.chars[0] = '改';
    target.positions[0].expectedChar = '改';
    const miss = handleInput(initial, 'z', 10);
    miss.position!.expectedChar = '篡';
    const nextMiss = handleInput(miss.state, 'q', 20);

    expect(initial.target).toMatchObject({ chars: ['学'] });
    expect(initial.target.positions[0]).toEqual({ sentenceId: 'sentence:stable', charIndex: 0, expectedChar: '学' });
    expect(miss.state.wrongPositions[0]).toEqual({ sentenceId: 'sentence:stable', charIndex: 0, expectedChar: '学' });
    expect(nextMiss.state.wrongPositions[0]).toEqual({ sentenceId: 'sentence:stable', charIndex: 0, expectedChar: '学' });
  });

  it('does not let input alter a paused or completed state', () => {
    const target = buildTarget([sentence('学', ['x'])]);
    const paused = pauseTyping(initTyping(target, { now: 0 }), 0);
    const done = handleInput(initTyping(target, { now: 0 }), 'x', 1).state;

    expect(handleInput(paused, 'x', 100).event).toBe('ignored');
    expect(handleInput(done, 'x', 100).event).toBe('ignored');
  });

  it('keeps pause and resume idempotent without losing elapsed active time', () => {
    const state = initTyping(buildTarget([sentence('学', ['x'])]), { now: 0 });
    const paused = pauseTyping(state, 100);

    expect(pauseTyping(paused, 1000)).toBe(paused);
    expect(resumeTyping(state, 1000)).toBe(state);
    expect(pauseTyping(handleInput(state, 'x', 10).state, 1000).elapsedMs).toBe(10);
  });

  it('shows the current sentence opening briefly without changing typing state', () => {
    const target = buildTarget([
      sentence('学而', ['x', 'e'], 'sentence:first'),
      sentence('温故', ['w', 'g'], 'sentence:second'),
    ]);
    const state = handleInput(initTyping(target, { now: 0 }), 'x', 10).state;

    const hint = showHint(state, 100, 2500);

    expect(hint).toMatchObject({ text: '学而', shownAt: 100, expiresAt: 2600 });
    expect(isHintVisible(hint, 2599)).toBe(true);
    expect(isHintVisible(hint, 2600)).toBe(false);
    expect(state).toMatchObject({ cursor: 1, revealed: [true, false, false, false] });
  });

  it('uses the opening characters of the current sentence and hides a terminal hint', () => {
    const target = buildTarget([
      sentence('学而', ['x', 'e'], 'sentence:first'),
      sentence('温故', ['w', 'g'], 'sentence:second'),
    ]);
    const secondSentence = handleInput(
      handleInput(initTyping(target, { now: 0 }), 'x', 1).state,
      'e',
      2
    ).state;
    const done = handleInput(
      handleInput(secondSentence, 'w', 3).state,
      'g',
      4
    ).state;

    expect(showHint(secondSentence, 10, 2500).text).toBe('温故');
    expect(showHint(done, 10, 2500).text).toBe('');
  });

  it('rejects sentence initials that do not align one-to-one with Han slots', () => {
    expect(() => buildTarget([sentence('学，而', ['x'])])).toThrow(/acceptedInitials/i);
  });

  it('rejects an empty accepted-initial slot and does not attach a new sentence prefix to the previous character', () => {
    expect(() => buildTarget([sentence('学', [''])])).toThrow(/acceptedInitials/i);

    const target = buildTarget([sentence('学。', ['x']), sentence('「而」', ['e'], 'sentence:two')]);

    expect(target.puncts).toEqual(['。', '」']);
  });
});
