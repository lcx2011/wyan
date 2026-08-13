import { describe, expect, it } from 'vitest';
import { createFormalPassage, type Passage, type ReviewItem } from '../../src/types';
import { buildReviewClauses } from '../../src/domain/review/clause';
import { prepareReviewQueue } from '../../src/domain/review/prepare';

function passage(): Passage {
  return createFormalPassage({
    id: 'p1', sourceId: 'p1', title: '篇名', author: '', dynasty: '',
    segments: [{ index: 0, cards: [[{ text: '甲乙，丙丁。戊己。', meaning: '' }]] }],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
}

function baseItem(p: Passage, clauseIndex: number, status: ReviewItem['status'] = 'pending'): ReviewItem {
  const clause = buildReviewClauses(p)[clauseIndex];
  return {
    id: `review:${p.id}:${clause.id}`,
    dueDate: '2026-08-04', status, attempts: 0,
    completedAt: status === 'completed' ? '2026-08-05T00:00:00.000Z' : null,
    passageId: p.id, sentence: clause.prompt, answer: clause.text,
    sourceSentence: clause.text, hiddenPositions: [], sourceDate: '2026-08-04',
    contentVersion: p.contentVersion, sentenceId: clause.sentenceId,
    targetClauseId: clause.id, targetStartCharIndex: clause.startCharIndex,
    targetEndCharIndex: clause.endCharIndex, targetOrder: clause.order,
    promptType: clause.promptType, reason: 'unreviewed', priority: 30,
    mistakeCount: 0, createdAt: '2026-08-04T00:00:00.000Z',
  };
}

describe('review queue preparation', () => {
  it('backfills learned clauses without reopening an already completed clause', () => {
    const p = passage();
    const existing = baseItem(p, 0, 'completed');
    const prepared = prepareReviewQueue(
      [existing],
      new Map([[p.id, p]]),
      { [p.id]: {
        contentVersion: p.contentVersion, cursor: null, currentSegment: 0, currentCardIndex: 0,
        cardMastery: {},
        sentenceStates: { [p.segments[0].cards[0].sentences[0].id]: { phase: 3, passed: true } },
        cardBlindPassed: {}, linkSnowballPassed: {}, segmentSnowballPassed: {}, snowballPassed: [],
        fullTextCompleted: false, fullTextPassed: false, lastAttemptTime: null,
        bestPassedTime: null, bestTime: 0, updatedAt: '2026-08-04T00:00:00.000Z',
      } },
      '2026-08-10',
    );

    expect(prepared.items.find((item) => item.targetClauseId === existing.targetClauseId)?.status)
      .toBe('completed');
    expect(prepared.items.filter((item) => item.status === 'pending').map((item) => item.answer))
      .toEqual(['丙丁。', '戊己。']);
  });

  it('upgrades a legacy blank item to a complete punctuation-clause task', () => {
    const p = passage();
    const sentence = p.segments[0].cards[0].sentences[0];
    const legacy: ReviewItem = {
      id: 'legacy', dueDate: '2099-01-01', status: 'pending', attempts: 1, completedAt: null,
      passageId: p.id, sentence: '甲乙，____丁。', answer: '丙', sourceSentence: sentence.text,
      hiddenPositions: [2], sourceDate: '2026-08-04', contentVersion: p.contentVersion,
      sentenceId: sentence.id, reason: 'legacy', mistakeCount: 1,
    };
    const prepared = prepareReviewQueue([legacy], new Map([[p.id, p]]), {}, '2026-08-10');

    expect(prepared.removeIds).toEqual(['legacy']);
    expect(prepared.items).toHaveLength(1);
    expect(prepared.items[0]).toMatchObject({
      sentence: '甲乙，', answer: '丙丁。', targetClauseId: `${sentence.id}:clause:1`,
      reason: 'legacy', attempts: 1,
    });
  });

  it('retires tasks from an unavailable or changed passage instead of showing stale prompts', () => {
    const p = passage();
    const item = baseItem(p, 0);
    const prepared = prepareReviewQueue(
      [item],
      new Map([[p.id, { ...p, contentVersion: 'new-version' }]]),
      {},
    );
    expect(prepared.removeIds).toEqual([item.id]);
    expect(prepared.items).toHaveLength(0);
  });
});
