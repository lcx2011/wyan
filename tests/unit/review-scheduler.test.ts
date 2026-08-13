import { describe, expect, it } from 'vitest';
import { createFormalPassage, type ExamAttempt, type Passage, type ReviewItem } from '../../src/types';
import { buildReviewClauses, splitReviewClauses } from '../../src/domain/review/clause';
import {
  answerReview,
  buildReviewItems,
  createReviewSession,
  getNeededItems,
  selectReviewGroup,
} from '../../src/domain/review/scheduler';
import { buildReviewItem, mergeReviewItem } from '../../src/domain/review/item';

function reviewPassage(text = '山不在高，有仙则名。水不在深，有龙则灵。'): Passage {
  return createFormalPassage({
    id: 'p1',
    sourceId: 'p1',
    title: '测试篇目',
    author: '佚名',
    dynasty: '未知',
    segments: [{ index: 0, cards: [[{ text, meaning: '' }]] }],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
}

function item(
  id: string,
  options: Partial<ReviewItem> = {},
): ReviewItem {
  return {
    id,
    dueDate: '2099-01-01',
    status: 'pending',
    attempts: 0,
    completedAt: null,
    passageId: options.passageId ?? 'p1',
    sentence: options.sentence ?? `提示${id}`,
    answer: options.answer ?? `目标${id}`,
    sourceSentence: options.answer ?? `目标${id}`,
    hiddenPositions: options.hiddenPositions ?? [],
    sourceDate: options.sourceDate ?? '2026-08-04',
    contentVersion: 'v1',
    sentenceId: options.sentenceId ?? `s:${id}`,
    targetClauseId: options.targetClauseId ?? `s:${id}:clause:0`,
    targetStartCharIndex: 0,
    targetEndCharIndex: 2,
    targetOrder: (options.targetOrder ?? Number(id.replace(/\D/g, ''))) || 0,
    promptType: options.promptType ?? 'previous-clause',
    reason: options.reason ?? 'mistake',
    priority: options.priority ?? 100,
    mistakeCount: options.mistakeCount ?? 1,
    createdAt: options.createdAt ?? '2026-08-04T00:00:00.000Z',
    ...options,
  };
}

describe('punctuation-clause review', () => {
  it('splits at sentence punctuation but not enumeration commas and keeps closing quotes', () => {
    const passage = reviewPassage('礼、乐、射，御。孔子云：“何陋之有？”');
    const sentence = passage.segments[0].cards[0].sentences[0];

    expect(splitReviewClauses(sentence).map((clause) => clause.text)).toEqual([
      '礼、乐、射，',
      '御。',
      '孔子云：',
      '“何陋之有？”',
    ]);

    const clauses = buildReviewClauses(passage);
    expect(clauses[0]).toMatchObject({ prompt: '测试篇目', promptType: 'title' });
    expect(clauses[1]).toMatchObject({ prompt: '礼、乐、射，', promptType: 'previous-clause' });
    expect(clauses[3].prompt).toBe('孔子云：');
  });

  it('maps a wrong character to its complete target clause and preceding cue', () => {
    const passage = reviewPassage();
    const sentenceId = passage.segments[0].cards[0].sentences[0].id;
    const attempt: ExamAttempt = {
      id: 'attempt:1',
      passageId: passage.id,
      contentVersion: passage.contentVersion,
      startedAt: '2026-08-04T00:00:00.000Z',
      completedAt: '2026-08-04T00:00:05.000Z',
      elapsedMs: 5_000,
      elapsedSeconds: 5,
      wrongPositions: [{ sentenceId, charIndex: 5, expectedChar: '仙', count: 2 }],
      timeoutPositions: [{ sentenceId, charIndex: 7, expectedChar: '名' }],
      completed: true,
      passed: false,
      settledAt: null,
    };

    const items = buildReviewItems(attempt, passage, '2026-08-04');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: `review:p1:${sentenceId}:clause:1`,
      sentence: '山不在高，',
      answer: '有仙则名。',
      promptType: 'previous-clause',
      hiddenPositions: [1, 3],
      mistakeCount: 3,
      dueDate: '2026-08-04',
      status: 'pending',
    });
  });

  it('uses the passage title as the cue for a weak opening clause', () => {
    const passage = reviewPassage();
    const sentenceId = passage.segments[0].cards[0].sentences[0].id;
    const attempt: ExamAttempt = {
      id: 'attempt:opening', passageId: passage.id, contentVersion: passage.contentVersion,
      startedAt: '', completedAt: '', elapsedMs: 0, elapsedSeconds: 0,
      wrongPositions: [{ sentenceId, charIndex: 0, expectedChar: '山' }],
      timeoutPositions: [], completed: true, passed: false, settledAt: null,
    };

    expect(buildReviewItems(attempt, passage, '2026-08-04')[0]).toMatchObject({
      sentence: '测试篇目',
      answer: '山不在高，',
      promptType: 'title',
    });
  });

  it('makes every pending item available immediately and ranks stronger weakness first', () => {
    const future = item('future', { dueDate: '2099-12-31', mistakeCount: 1 });
    const repeated = item('repeated', { dueDate: '2099-12-31', mistakeCount: 5 });
    const completed = item('completed', { status: 'completed', mistakeCount: 99 });

    expect(getNeededItems([future, completed, repeated], 10, '2026-08-04').map((value) => value.id))
      .toEqual(['repeated', 'future']);
  });

  it('bounds a group and separates adjacent targets when another item is available', () => {
    const items = [
      item('0', { targetOrder: 0, answer: '甲乙' }),
      item('1', { targetOrder: 1, answer: '丙丁' }),
      item('4', { targetOrder: 4, answer: '戊己' }),
      item('5', { targetOrder: 5, answer: '庚辛' }),
    ];
    const group = selectReviewGroup(items, { maxItems: 3, maxHan: 6 });

    expect(group).toHaveLength(3);
    expect(group.map((value) => value.targetOrder)).toEqual([0, 4, 1]);
  });

  it('requeues a miss after two other items and requires two later clean recalls', () => {
    let session = createReviewSession([item('a'), item('b'), item('c'), item('d')]);

    session = answerReview(session, 'miss');
    expect(session.items.map((value) => value.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(session.items.find((value) => value.id === 'a')?.attempts).toBe(1);

    session = answerReview(session, 'pass'); // b
    session = answerReview(session, 'pass'); // c
    session = answerReview(session, 'pass'); // a, first clean retry
    expect(session.items.map((value) => value.id)).toEqual(['d', 'a']);
    session = answerReview(session, 'pass'); // d
    session = answerReview(session, 'pass'); // a, second clean retry

    expect(session.completed).toBe(true);
    expect(session.completedCount).toBe(4);
  });

  it('completes a clean first recall in one pass', () => {
    const session = answerReview(createReviewSession([item('a')]), 'pass');
    expect(session.completed).toBe(true);
    expect(session.items).toHaveLength(0);
  });

  it('keeps timeout-only legacy tasks answerable during migration', () => {
    const review = buildReviewItem('p1', {
      sentence: '甲乙丙丁。', sentenceKey: 's1', wrongChars: [], wrongPositions: [],
      timeoutPositions: [0, 1, 2, 3], date: '2026-08-04', count: 4,
    });
    expect(review.hiddenPositions).toEqual([0, 1]);
    expect(review.answer).toBe('甲乙');
  });

  it('still rebuilds merged legacy prompts before they are upgraded', () => {
    const first = buildReviewItem('p1', {
      sentence: '甲乙丙丁。', sentenceKey: 's1', wrongChars: ['甲'],
      wrongPositions: [0], timeoutPositions: [], date: '2026-08-04', count: 1,
    });
    const addition = buildReviewItem('p1', {
      sentence: '甲乙丙丁。', sentenceKey: 's1', wrongChars: ['丙'],
      wrongPositions: [2], timeoutPositions: [], date: '2026-08-04', count: 1,
    });

    expect(mergeReviewItem(first, addition)).toMatchObject({
      hiddenPositions: [0, 2], sentence: '____乙____丁。', answer: '甲丙', mistakeCount: 2,
    });
  });
});
