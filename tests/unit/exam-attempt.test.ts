import { describe, expect, it } from 'vitest';
import { handleInput, initTyping, tickTimeout } from '../../src/domain/typing/engine';
import { buildTarget } from '../../src/domain/typing/target';
import { createAttempt, finishAttempt, toMistakeRecords } from '../../src/domain/exam/attempt';
import { createFormalPassage, type ExamAttempt, type Passage, type Sentence } from '../../src/types';

function sentence(text: string, initials: string[], id: string): Sentence {
  return { id, text, meaning: '', acceptedInitials: initials.map((initial) => [initial]) };
}

function passage(): Passage {
  return createFormalPassage({
    id: 'p1',
    sourceId: 'p1',
    title: '测试篇目',
    author: '佚名',
    dynasty: '未知',
    segments: [
      {
        index: 0,
        cards: [[{ text: '学而时习之。', meaning: '' }]],
        sentences: [{ text: '学而时习之。', meaning: '' }],
      },
    ],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
}

describe('exam attempt domain', () => {
  it('creates an incomplete, unsettled attempt', () => {
    const attempt = createAttempt('p1', 'v1', '2026-08-04T00:00:00.000Z');

    expect(attempt).toEqual({
      id: 'attempt:p1:2026-08-04T00:00:00.000Z',
      passageId: 'p1',
      contentVersion: 'v1',
      startedAt: '2026-08-04T00:00:00.000Z',
      completedAt: null,
      elapsedMs: 0,
      passed: false,
      elapsedSeconds: null,
      wrongPositions: [],
      timeoutPositions: [],
      completed: false,
      settledAt: null,
    });
  });

  it('finishes with completed=true and passed=false when input had mistakes', () => {
    const target = buildTarget([sentence('学而', ['x', 'e'], 's:1')]);
    const missed = handleInput(initTyping(target, { now: 0 }), 'z', 100).state;
    const done = handleInput(handleInput(missed, 'x', 200).state, 'e', 300).state;
    const attempt = createAttempt('p1', 'v1', '2026-08-04T00:00:00.000Z');

    const finished = finishAttempt(attempt, done, '2026-08-04T00:00:05.000Z');

    expect(finished.completed).toBe(true);
    expect(finished.passed).toBe(false);
    expect(finished.completedAt).toBe('2026-08-04T00:00:05.000Z');
    expect(finished.wrongPositions).toEqual([{ sentenceId: 's:1', charIndex: 0, expectedChar: '学', count: 1 }]);
    expect(finished.elapsedMs).toBe(done.elapsedMs);
    expect(finished.elapsedSeconds).toBe(Math.round(done.elapsedMs / 1000));
  });

  it('finishes as passed when input was flawless', () => {
    const target = buildTarget([sentence('学而', ['x', 'e'], 's:1')]);
    const done = handleInput(handleInput(initTyping(target, { now: 0 }), 'x', 100).state, 'e', 200).state;

    const finished = finishAttempt(createAttempt('p1', 'v1', '2026-08-04T00:00:00.000Z'), done, '2026-08-04T00:00:03.000Z');

    expect(finished.completed).toBe(true);
    expect(finished.passed).toBe(true);
    expect(finished.wrongPositions).toEqual([]);
  });

  it('keeps passed=true when the only issue was a pause', () => {
    const target = buildTarget([sentence('学', ['x'], 's:1')]);
    const timed = tickTimeout(initTyping(target, { now: 0 }), 3000).state;
    const done = handleInput(timed, 'x', 4000).state;

    const finished = finishAttempt(createAttempt('p1', 'v1', '2026-08-04T00:00:00.000Z'), done, '2026-08-04T00:00:06.000Z');

    expect(finished.timeoutPositions).toHaveLength(1);
    expect(finished.wrongPositions).toHaveLength(0);
    expect(finished.passed).toBe(true);
  });

  it('maps wrong and pause positions into one sorted per-sentence mistake record', () => {
    const p = passage();
    const sentenceId = p.segments[0].cards[0].sentences[0].id;
    const attempt: ExamAttempt = {
      id: 'attempt:1',
      passageId: p.id,
      contentVersion: p.contentVersion,
      startedAt: '2026-08-04T00:00:00.000Z',
      completedAt: '2026-08-04T00:00:05.000Z',
      elapsedMs: 5_000,
      elapsedSeconds: 5,
      wrongPositions: [
        { sentenceId, charIndex: 2, expectedChar: '时' },
        { sentenceId, charIndex: 0, expectedChar: '学' },
        { sentenceId, charIndex: 2, expectedChar: '时' },
      ],
      timeoutPositions: [{ sentenceId, charIndex: 4, expectedChar: '之' }],
      completed: true,
      passed: false,
      settledAt: null,
    };

    const records = toMistakeRecords(attempt, p, '2026-08-04');

    expect(records).toEqual([
      {
        sentence: '学而时习之。',
        sentenceKey: sentenceId,
        wrongChars: ['学', '时'],
        wrongPositions: [0, 2],
        timeoutPositions: [4],
        date: '2026-08-04',
        count: 4,
        wrongCountByPosition: { '0': 1, '2': 2 },
        contentVersion: p.contentVersion,
        sentenceId,
      },
    ]);
  });
});
