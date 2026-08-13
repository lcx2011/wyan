import { beforeEach, expect, it, vi } from 'vitest';
import { createFormalPassage, type GlobalPosition } from '../../src/types';

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

it('creates accepted-initial slots for Han characters only', () => {
  const passage = createFormalPassage({
    id: 'builtin:punctuation',
    title: '示例',
    author: '佚名',
    dynasty: '未知',
    segments: [{ index: 0, cards: [[{ text: '学而时习之。', meaning: '' }]] }],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });

  expect(passage.segments[0].cards[0].sentences[0].acceptedInitials).toHaveLength(5);
});

it('advances progress with the stable IDs from a formal passage', async () => {
  const passage = createFormalPassage({
    id: 'builtin:cursor',
    title: '示例',
    author: '佚名',
    dynasty: '未知',
    segments: [{ index: 7, cards: [[{ text: '学而时习之。', meaning: '' }]] }],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
  const card = passage.segments[0].cards[0];
  const position: GlobalPosition = {
    passageId: passage.id,
    segmentId: passage.segments[0].id,
    cardId: card.id,
    sentenceId: card.sentences[0].id,
  };
  const { useProgressStore } = await import('../../src/stores/progressStore');

  const advance = useProgressStore.getState().advanceCard;
  advance(position, 7, 1);

  const progress = useProgressStore.getState().progress[passage.id];
  expect(progress.cursor).toEqual(position);
  expect(progress).toMatchObject({ currentSegment: 7, currentCardIndex: 1 });
  expect(progress.currentSegment > 0 || progress.currentCardIndex > 0).toBe(true);
});

it('marks snowball progress in both formal and legacy started-state fields', async () => {
  const { useProgressStore } = await import('../../src/stores/progressStore');
  const markPassed = useProgressStore.getState().setSnowballPassed;

  markPassed('builtin:snowball', 'seg:actual', 3);

  const progress = useProgressStore.getState().progress['builtin:snowball'];
  expect(progress.segmentSnowballPassed['seg:actual']).toBe(true);
  expect(progress.snowballPassed[3]).toBe(true);
  expect(progress.snowballPassed.some(Boolean)).toBe(true);
});

it('hydrates legacy progress with formal defaults and a null unresolved cursor', async () => {
  window.localStorage.setItem(
    'wenyan:progress',
    JSON.stringify({
      state: {
        progress: {
          'builtin:legacy': {
            currentSegment: 2,
            currentCardIndex: 1,
            sentenceStates: {},
            snowballPassed: [true],
            fullTextPassed: false,
            bestTime: 0,
            updatedAt: '2026-08-04T00:00:00.000Z',
          },
        },
      },
      version: 0,
    })
  );
  const { useProgressStore } = await import('../../src/stores/progressStore');
  await useProgressStore.persist.rehydrate();

  expect(useProgressStore.getState().progress['builtin:legacy']).toMatchObject({
    cursor: null,
    cardBlindPassed: {},
    linkSnowballPassed: {},
    segmentSnowballPassed: {},
    fullTextCompleted: false,
    lastAttemptTime: null,
    bestPassedTime: null,
  });
});

it('hydrates legacy review items with all formal fields', async () => {
  window.localStorage.setItem(
    'wenyan:reviewQueue',
    JSON.stringify({
      state: {
        queue: {
          '2026-08-05': [{
            passageId: 'builtin:legacy', sentence: '学而时习之。', answer: '习', hiddenPositions: [2], sourceDate: '2026-08-04',
          }],
        },
      },
      version: 0,
    })
  );
  const { useReviewStore } = await import('../../src/stores/reviewStore');
  await useReviewStore.persist.rehydrate();

  expect(useReviewStore.getState().queue[0]).toMatchObject({
    id: 'builtin:legacy:2026-08-05:0',
    dueDate: '2026-08-05',
    status: 'pending',
    attempts: 0,
    completedAt: null,
  });
});
