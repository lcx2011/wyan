import { beforeEach, expect, it, vi } from 'vitest';
import { createFormalPassage, type ExamAttempt, type MistakeRecord, type ReviewItem } from '../../src/types';

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

it('keeps progress achievements monotonic and the shortest non-zero pass time', async () => {
  const { useProgressStore } = await import('../../src/stores/progressStore');
  const store = useProgressStore.getState();

  store.passSentencePhase('p1', 's1', 3);
  store.passSentencePhase('p1', 's1', 1);
  store.setCardMastery('p1', 'c1', 120);
  expect(useProgressStore.getState().progress.p1.cardMastery.c1).toBe(100);
  store.passCardBlind('p1', 'c1');
  store.passLinkSnowball('p1', 'c1+c2');
  store.passSegmentSnowball('p1', 'seg1');
  store.recordExamCompletion('p1', { passed: true, elapsedMs: 5_000, completedAt: '2026-08-04T01:00:00.000Z' });
  store.recordExamCompletion('p1', { passed: false, elapsedMs: 1_000, completedAt: '2026-08-04T02:00:00.000Z' });
  store.recordExamCompletion('p1', { passed: true, elapsedMs: 3_000, completedAt: '2026-08-04T03:00:00.000Z' });

  const progress = useProgressStore.getState().progress.p1;
  expect(progress.sentenceStates.s1).toEqual({ phase: 3, passed: true });
  expect(progress.cardBlindPassed.c1).toBe(true);
  expect(progress.cardMastery.c1).toBe(100);
  expect(progress.linkSnowballPassed['c1+c2']).toBe(true);
  expect(progress.segmentSnowballPassed.seg1).toBe(true);
  expect(progress.fullTextCompleted).toBe(true);
  expect(progress.fullTextPassed).toBe(true);
  expect(progress.bestPassedTime).toBe(3_000);
});

it('converts the seconds compatibility action to milliseconds', async () => {
  const { useProgressStore } = await import('../../src/stores/progressStore');

  useProgressStore.getState().setFullTextPassed('p1', 5);

  expect(useProgressStore.getState().progress.p1.bestPassedTime).toBe(5_000);
});

it('migrates same-version legacy progress seconds into the millisecond schema', async () => {
  window.localStorage.setItem('wenyan:progress', JSON.stringify(JSON.stringify({
    state: {
      progress: {
        p1: {
          fullTextPassed: true,
          bestPassedTime: 7,
          bestTime: 7,
          updatedAt: '2026-08-04T00:00:00.000Z',
        },
      },
    },
    version: 2,
  })));

  const { useProgressStore } = await import('../../src/stores/progressStore');

  expect(useProgressStore.getState().progress.p1.bestPassedTime).toBe(7_000);
  expect(useProgressStore.getState().progress.p1.bestTime).toBe(7_000);
  expect(JSON.parse(window.localStorage.getItem('wenyan:progress') ?? '{}').schemaVersion).toBe(4);
});

it('does not rescale version-3 millisecond progress during the mastery migration', async () => {
  window.localStorage.setItem('wenyan:progress', JSON.stringify(JSON.stringify({
    state: {
      progress: {
        p1: {
          bestPassedTime: 7_000,
          bestTime: 7_000,
          updatedAt: '2026-08-04T00:00:00.000Z',
        },
      },
    },
    version: 3,
  })));

  const { useProgressStore } = await import('../../src/stores/progressStore');

  expect(useProgressStore.getState().progress.p1.bestPassedTime).toBe(7_000);
  expect(useProgressStore.getState().progress.p1.bestTime).toBe(7_000);
  expect(useProgressStore.getState().progress.p1.cardMastery).toEqual({});
});

it('settles each attempt id only once', async () => {
  const { useAttemptStore } = await import('../../src/stores/attemptStore');
  const attempt: ExamAttempt = {
    id: 'attempt-1',
    passageId: 'p1',
    contentVersion: 'v1',
    startedAt: '2026-08-04T00:00:00.000Z',
    completedAt: '2026-08-04T00:00:03.000Z',
    elapsedMs: 3_000,
    elapsedSeconds: 3,
    wrongPositions: [],
    timeoutPositions: [],
    completed: true,
    passed: true,
    settledAt: null,
  };
  useAttemptStore.getState().saveAttempt(attempt);

  expect(useAttemptStore.getState().settleAttempt('attempt-1', '2026-08-04T00:01:00.000Z')).toMatchObject({
    ok: true,
    alreadySettled: false,
  });
  useAttemptStore.getState().saveAttempt(attempt);
  expect(useAttemptStore.getState().settleAttempt('attempt-1', '2026-08-04T00:02:00.000Z')).toMatchObject({
    ok: true,
    alreadySettled: true,
  });
  expect(useAttemptStore.getState().attempts['attempt-1'].settledAt).toBe('2026-08-04T00:01:00.000Z');
});

it('merges same-day sentence mistakes, positions, and occurrence counts', async () => {
  const { useMistakeStore } = await import('../../src/stores/mistakeStore');
  const first: MistakeRecord = {
    sentence: '学而时习之。',
    sentenceKey: 's1',
    wrongChars: ['学'],
    wrongPositions: [0],
    timeoutPositions: [2],
    date: '2026-08-04',
    count: 2,
  };
  useMistakeStore.getState().addMistakes('p1', [first]);
  useMistakeStore.getState().addMistakes('p1', [{
    ...first,
    wrongChars: ['时'],
    wrongPositions: [2],
    timeoutPositions: [4],
    count: 1,
  }]);

  expect(useMistakeStore.getState().getByPassage('p1')).toEqual([{
    ...first,
    wrongChars: ['学', '时'],
    wrongPositions: [0, 2],
    timeoutPositions: [2, 4],
    count: 3,
  }]);
});

it('keeps one full review queue and exposes every pending item immediately', async () => {
  const { useReviewStore } = await import('../../src/stores/reviewStore');
  const items: ReviewItem[] = [
    {
      id: 'overdue', dueDate: '2026-08-03', status: 'pending', attempts: 2, completedAt: null,
      passageId: 'p1', sentence: '甲', answer: '甲', hiddenPositions: [0], sourceDate: '2026-08-02',
    },
    {
      id: 'completed', dueDate: '2026-08-03', status: 'completed', attempts: 0,
      completedAt: '2026-08-03T01:00:00.000Z', passageId: 'p1', sentence: '乙', answer: '乙',
      hiddenPositions: [0], sourceDate: '2026-08-02',
    },
    {
      id: 'future', dueDate: '2026-08-05', status: 'pending', attempts: 0, completedAt: null,
      passageId: 'p2', sentence: '丙', answer: '丙', hiddenPositions: [0], sourceDate: '2026-08-04',
    },
  ];
  useReviewStore.getState().addItems(items);

  expect(Array.isArray(useReviewStore.getState().queue)).toBe(true);
  expect(useReviewStore.getState().queue).toHaveLength(3);
  expect(useReviewStore.getState().getNeededItems(10, '2026-08-04')).toEqual([items[0], items[2]]);
  expect(useReviewStore.getState().hasReview()).toBe(true);
  expect(useReviewStore.getState().hasTodayReview('2026-08-02')).toBe(true);
});

it('deduplicates badge statistics by stable event id', async () => {
  const { useBadgeStore } = await import('../../src/stores/badgeStore');

  useBadgeStore.getState().recordPass('pass:attempt-1', 'p1', 12);
  useBadgeStore.getState().recordPass('pass:attempt-1', 'p1', 12);
  useBadgeStore.getState().recordReview('review:2026-08-04');
  useBadgeStore.getState().recordReview('review:2026-08-04');

  expect(useBadgeStore.getState().badges.stats).toMatchObject({
    passedArticles: 1,
    totalChars: 12,
    reviewDays: 1,
    streak: 1,
  });
  expect(useBadgeStore.getState().processedEventIds).toEqual([
    'pass:attempt-1',
    'review:2026-08-04',
  ]);
});

function onlinePassage(id: string, version: string, text = '学而时习之。') {
  const passage = createFormalPassage({
    id,
    sourceId: id,
    title: '在线测试篇目',
    author: '作者',
    dynasty: '朝代',
    segments: [{ index: 0, sentences: [{ text, meaning: '释义' }] }],
    updatedAt: '2026-08-10T00:00:00.000Z',
  });
  return { ...passage, contentVersion: version };
}

it('removes online passages and dismisses migration notices', async () => {
  const { usePassageStore } = await import('../../src/stores/passageStore');
  const passage = onlinePassage('online:remove', 'v1');
  usePassageStore.getState().addOnlinePassage(passage);

  expect(usePassageStore.getState().has(passage.id)).toBe(true);
  expect(usePassageStore.getState().getEntry(passage.id)).toBeDefined();
  usePassageStore.getState().remove(passage.id);
  expect(usePassageStore.getState().has(passage.id)).toBe(false);
  expect(usePassageStore.getState().getOnlinePassage(passage.id)).toBeUndefined();

  usePassageStore.setState(() => ({
    migrationNotices: [{ id: 'notice-1', kind: 'namespace-reset', namespace: 'learning', message: '提醒', createdAt: '2026-08-10T00:00:00.000Z' }],
  }));
  usePassageStore.getState().dismissMigrationNotice('notice-1');
  expect(usePassageStore.getState().migrationNotices).toEqual([]);
});

it('migrates progress when an online passage content version changes', async () => {
  const { usePassageStore } = await import('../../src/stores/passageStore');
  const { useProgressStore } = await import('../../src/stores/progressStore');
  const oldPassage = onlinePassage('online:migrate', 'v1');
  const newPassage = onlinePassage('online:migrate', 'v2', '学而时习之。');
  usePassageStore.getState().addOnlinePassage(oldPassage);
  const sentenceId = oldPassage.segments[0].cards[0].sentences[0].id;
  useProgressStore.setState({ progress: {
    [oldPassage.id]: {
      contentVersion: oldPassage.contentVersion,
      cursor: null,
      currentSegment: 0,
      currentCardIndex: 0,
      cardMastery: {},
      sentenceStates: { [sentenceId]: { phase: 3, passed: true } },
      cardBlindPassed: {}, linkSnowballPassed: {}, segmentSnowballPassed: {}, snowballPassed: [],
      fullTextCompleted: false, fullTextPassed: false, lastAttemptTime: null,
      bestPassedTime: null, bestTime: 0, updatedAt: '2026-08-10T00:00:00.000Z',
    },
  } });

  expect(usePassageStore.getState().addOnlinePassage(newPassage)).toEqual({ ok: true });
  expect(usePassageStore.getState().getOnlinePassage(oldPassage.id)?.contentVersion).toBe('v2');
  expect(useProgressStore.getState().progress[oldPassage.id].contentVersion).toBe('v2');
  expect(useProgressStore.getState().progress[oldPassage.id].sentenceStates[sentenceId]).toEqual({ phase: 3, passed: true });
});

it('does not update passage state when the atomic local write fails', async () => {
  const { usePassageStore } = await import('../../src/stores/passageStore');
  const passage = onlinePassage('online:quota-store', 'v1');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });

  expect(usePassageStore.getState().addOnlinePassage(passage)).toMatchObject({ ok: false, reason: 'quota' });
  expect(usePassageStore.getState().getOnlinePassage(passage.id)).toBeUndefined();
  expect(usePassageStore.getState().has(passage.id)).toBe(false);
});
