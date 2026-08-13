import { beforeEach, expect, it, vi } from 'vitest';
import type { ExamAttempt, MistakeRecord, ReviewItem } from '../../src/types';

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

it('resets all learner data for one passage while preserving other passages', async () => {
  const { useProgressStore } = await import('../../src/stores/progressStore');
  const { useMistakeStore } = await import('../../src/stores/mistakeStore');
  const { useReviewStore } = await import('../../src/stores/reviewStore');
  const { useAttemptStore } = await import('../../src/stores/attemptStore');
  const { resetPassageData } = await import('../../src/domain/content/reset');

  const progress = useProgressStore.getState().ensureProgress('p1');
  useProgressStore.setState({ progress: {
    p1: { ...progress, fullTextPassed: true },
    p2: { ...progress, fullTextPassed: true },
  } });
  const mistake = (passageId: string): MistakeRecord => ({
    sentence: '句子', sentenceKey: `${passageId}:s1`, wrongChars: ['句'], wrongPositions: [0],
    timeoutPositions: [], date: '2026-08-13',
  });
  useMistakeStore.getState().addMistakes('p1', [mistake('p1')]);
  useMistakeStore.getState().addMistakes('p2', [mistake('p2')]);
  const item = (passageId: string): ReviewItem => ({
    id: `${passageId}:review`, dueDate: '2026-08-13', status: 'pending', attempts: 1, completedAt: null,
    passageId, sentence: '提示', answer: '答案', hiddenPositions: [], sourceDate: '2026-08-13',
  });
  useReviewStore.getState().addItems([item('p1'), item('p2')]);
  const attempt = (passageId: string): ExamAttempt => ({
    id: `${passageId}:attempt`, passageId, contentVersion: 'v1', startedAt: '2026-08-13T00:00:00.000Z',
    completedAt: '2026-08-13T00:00:01.000Z', elapsedMs: 1000, elapsedSeconds: 1, wrongPositions: [],
    timeoutPositions: [], completed: true, passed: true, settledAt: null,
  });
  useAttemptStore.getState().saveAttempt(attempt('p1'));
  useAttemptStore.getState().saveAttempt(attempt('p2'));

  resetPassageData('p1');

  expect(useProgressStore.getState().progress.p1).toBeUndefined();
  expect(useProgressStore.getState().progress.p2).toBeDefined();
  expect(useMistakeStore.getState().getByPassage('p1')).toEqual([]);
  expect(useMistakeStore.getState().getByPassage('p2')).toHaveLength(1);
  expect(useReviewStore.getState().queue.map((entry) => entry.passageId)).toEqual(['p2']);
  expect(Object.keys(useAttemptStore.getState().attempts)).toEqual(['p2:attempt']);
});
