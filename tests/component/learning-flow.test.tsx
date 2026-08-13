import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { revealedMaskFor } from '../../src/components/training/TypingUnitRunner';
import { acceptedInitials } from '../../src/domain/typing/pinyin';
import { buildTarget } from '../../src/domain/typing/target';
import { createFormalPassage, type Passage, type Sentence } from '../../src/types';

type UserLike = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
});

function oneCardPassage(): Passage {
  return createFormalPassage({
    id: 'test:one',
    title: '一句话测试',
    author: '测试作者',
    dynasty: '测试朝代',
    segments: [
      {
        index: 0,
        cards: [[{ text: '学而时习之。', meaning: '学习了然后按时温习。' }]],
        sentences: [{ text: '学而时习之。', meaning: '学习了然后按时温习。' }],
      },
    ],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
}

function oneCardTwoSentencePassage(): Passage {
  return createFormalPassage({
    id: 'test:two',
    title: '两句一卡测试',
    author: '测试作者',
    dynasty: '测试朝代',
    segments: [
      {
        index: 0,
        cards: [
          [
            { text: '学而时习之。', meaning: '学习了然后按时温习。' },
            { text: '温故而知新。', meaning: '温习旧知识得到新的体会。' },
          ],
        ],
        sentences: [
          { text: '学而时习之。', meaning: '学习了然后按时温习。' },
          { text: '温故而知新。', meaning: '温习旧知识得到新的体会。' },
        ],
      },
    ],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
}

function twoCardPassage(): Passage {
  return createFormalPassage({
    id: 'test:multi',
    title: '两卡测试',
    author: '测试作者',
    dynasty: '测试朝代',
    segments: [
      {
        index: 0,
        cards: [
          [{ text: '学而时习之。', meaning: '学习了然后按时温习。' }],
          [{ text: '温故而知新。', meaning: '' }],
        ],
        sentences: [
          { text: '学而时习之。', meaning: '学习了然后按时温习。' },
          { text: '温故而知新。', meaning: '' },
        ],
      },
    ],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
}

async function seed(passage: Passage): Promise<void> {
  const { usePassageStore } = await import('../../src/stores/passageStore');
  usePassageStore.getState().addOnlinePassage(passage);
}

async function renderApp(entry: string): Promise<void> {
  const { CardLearnPage } = await import('../../src/pages/CardLearnPage');
  const { TripleChallengePage } = await import('../../src/pages/TripleChallengePage');
  const { SnowballPage } = await import('../../src/pages/SnowballPage');
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/passage/:passageId" element={<CardLearnPage />} />
        <Route path="/passage/:passageId/challenge" element={<TripleChallengePage />} />
        <Route path="/passage/:passageId/snowball" element={<SnowballPage />} />
        <Route path="/passage/:passageId/exam" element={<div>全文验收占位</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function expectStage(label: RegExp): Promise<void> {
  await waitFor(
    () => expect(screen.getByTestId('training-subtitle')).toHaveTextContent(label),
    { timeout: 10_000 }
  );
}

async function expectText(label: RegExp): Promise<void> {
  await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument(), { timeout: 10_000 });
}

async function typeChars(_user: UserLike, chars: string): Promise<void> {
  for (const char of chars) {
    fireEvent.keyDown(window, { key: char });
  }
}

function inputForMask(sentences: readonly Sentence[], kind: 'gap' | 'initial' | 'blind-card', cardMastery = 0, attemptVersion = 0): string {
  const target = buildTarget(sentences);
  const mask = revealedMaskFor(kind, target, cardMastery, attemptVersion);
  return target.acceptedInitials
    .map((initials, index) => mask[index] ? '' : initials[0])
    .join('');
}

async function reachOneSentenceBlind(user: UserLike, sentences: readonly Sentence[]): Promise<void> {
  for (const [attemptVersion, cardMastery] of [0, 15, 30, 45, 60, 75, 90].map((mastery, index) => [index, mastery] as const)) {
    await expectStage(/挖空/);
    await typeChars(user, inputForMask(sentences, 'gap', cardMastery, attemptVersion));
  }
  await expectStage(/首字/);
  await typeChars(user, inputForMask(sentences, 'initial'));
  await expectStage(/盲打/);
}

async function completeOneSentenceMastery(user: UserLike, sentences: readonly Sentence[]): Promise<void> {
  await reachOneSentenceBlind(user, sentences);
  await typeChars(user, inputForMask(sentences, 'blind-card'));
}

it('shows source and meaning, handles missing translations, and browses cards', async () => {
  const passage = twoCardPassage();
  await seed(passage);
  await renderApp(`/passage/${passage.id}`);
  const user = userEvent.setup();

  expect(screen.getByText(/测试作者/)).toBeInTheDocument();
  expect(screen.getByText(/测试朝代/)).toBeInTheDocument();
  expect(screen.getByText('学而时习之。')).toBeInTheDocument();

  await user.click(screen.getByText('学而时习之。'));
  expect(await screen.findByText('学习了然后按时温习。', {}, { timeout: 10_000 })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '下一卡' }));
  expect(screen.getByText('温故而知新。')).toBeInTheDocument();

  await user.click(screen.getByText('温故而知新。'));
  expect(await screen.findByText('暂无译文', {}, { timeout: 10_000 })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '上一卡' }));
  expect(screen.getByText('学而时习之。')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '开始训练' }));
  await expectStage(/挖空/);
}, 20_000);

it('completes the one-sentence card challenge and snowball, then unlocks the exam', async () => {
  const passage = oneCardPassage();
  await seed(passage);
  await renderApp(`/passage/${passage.id}/challenge`);
  const user = userEvent.setup();

  await completeOneSentenceMastery(user, passage.segments[0].cards[0].sentences);

  await expectStage(/整段成篇/);
  await completeOneSentenceMastery(user, passage.segments[0].cards[0].sentences);

  await waitFor(() => expect(screen.getByText(/进入全文验收/)).toBeInTheDocument(), { timeout: 10_000 });

  const { useProgressStore } = await import('../../src/stores/progressStore');
  const progress = useProgressStore.getState().progress[passage.id];
  const card = passage.segments[0].cards[0];
  expect(progress.cardBlindPassed[card.id]).toBe(true);
  expect(progress.segmentSnowballPassed[passage.segments[0].id]).toBe(true);
}, 20_000);

it('trains a two-sentence card as one whole-card unit (gap → initial → 整卡盲打)', async () => {
  const passage = oneCardTwoSentencePassage();
  await seed(passage);
  await renderApp(`/passage/${passage.id}/challenge`);
  const user = userEvent.setup();

  const card = passage.segments[0].cards[0];
  for (const [attemptVersion, cardMastery] of [0, 15, 30, 45, 60, 75, 90].map((mastery, index) => [index, mastery] as const)) {
    await expectStage(/挖空/);
    await typeChars(user, inputForMask(card.sentences, 'gap', cardMastery, attemptVersion));
  }
  await expectStage(/首字/);
  await typeChars(user, inputForMask(card.sentences, 'initial'));
  await expectStage(/整卡盲打/);
  await typeChars(user, inputForMask(card.sentences, 'blind-card'));

  await expectStage(/整段成篇/);

  const { useProgressStore } = await import('../../src/stores/progressStore');
  const progress = useProgressStore.getState().progress[passage.id];
  const [s1, s2] = card.sentences;
  expect(progress.cardBlindPassed[card.id]).toBe(true);
  expect(progress.sentenceStates[s1.id]?.phase).toBe(3);
  expect(progress.sentenceStates[s2.id]?.phase).toBe(3);
}, 20_000);

it('resets only the active blind unit after a miss and still passes zero-error', async () => {
  const passage = oneCardPassage();
  await seed(passage);
  await renderApp(`/passage/${passage.id}/challenge`);
  const user = userEvent.setup();

  await reachOneSentenceBlind(user, passage.segments[0].cards[0].sentences);

  // Two correct characters, then a wrong one at the third slot.
  await typeChars(user, 'xe');
  await typeChars(user, 'q');

  // The miss lowers mastery below 100, so the next whole-card target returns
  // to the gap stage instead of silently staying at blind.
  await expectStage(/挖空/);
  await typeChars(user, inputForMask(passage.segments[0].cards[0].sentences, 'gap', 90, 9));
  await expectStage(/首字/);
  await typeChars(user, inputForMask(passage.segments[0].cards[0].sentences, 'initial'));
  await expectStage(/盲打/);
  await typeChars(user, inputForMask(passage.segments[0].cards[0].sentences, 'blind-card'));

  const { useProgressStore } = await import('../../src/stores/progressStore');
  const progress = useProgressStore.getState().progress[passage.id];
  expect(progress.cardBlindPassed[passage.segments[0].cards[0].id]).toBe(true);
}, 20_000);

it('returns to the learn page after each card, then rolls two cards into the segment', async () => {
  const passage = twoCardPassage();
  await seed(passage);
  const [card0, card1] = passage.segments[0].cards;
  const user = userEvent.setup();

  await renderApp(`/passage/${passage.id}/challenge?card=${card0.id}`);

  // Complete card 0.
  await completeOneSentenceMastery(user, card0.sentences);

  // First card of a two-card segment lands back on the learn page at card 2.
  await expectText(/第 2 卡/);
  await user.click(screen.getByRole('button', { name: '开始训练' }));
  await expectStage(/挖空/);

  // Refresh back at card 0: the passed card must be skipped to the learn page at card 1.
  cleanup();
  await renderApp(`/passage/${passage.id}/challenge?card=${card0.id}`);
  await expectText(/第 2 卡/);
  await user.click(screen.getByRole('button', { name: '开始训练' }));
  await expectStage(/挖空/);

  // Complete card 1.
  await completeOneSentenceMastery(user, card1.sentences);

  // Two-card link roll, then the whole segment.
  await expectStage(/两卡衔接.*挖空/);
  await completeOneSentenceMastery(user, [...card0.sentences, ...card1.sentences]);

  await expectStage(/整段成篇.*挖空/);
  await completeOneSentenceMastery(user, passage.segments[0].cards.flatMap((card) => card.sentences));

  await waitFor(() => expect(screen.getByText(/进入全文验收/)).toBeInTheDocument(), { timeout: 10_000 });

  const { useProgressStore } = await import('../../src/stores/progressStore');
  const progress = useProgressStore.getState().progress[passage.id];
  expect(progress.cardBlindPassed[card0.id]).toBe(true);
  expect(progress.cardBlindPassed[card1.id]).toBe(true);
  expect(progress.linkSnowballPassed[`card:${card0.id}|card:${card1.id}`]).toBe(true);
  expect(progress.segmentSnowballPassed[passage.segments[0].id]).toBe(true);
}, 20_000);

function maskSentence(text: string): Sentence {
  return { id: `mask:${text}`, text, meaning: '', acceptedInitials: acceptedInitials(text) };
}

it('scales the gap mask with card mastery and keeps the first character as an anchor', () => {
  const target = buildTarget([maskSentence('学而时习之不亦说乎哉')]);
  const lowMask = revealedMaskFor('gap', target, 0);
  const highMask = revealedMaskFor('gap', target, 99);

  expect(lowMask.filter((revealed) => !revealed).length).toBe(3);
  expect(highMask.filter((revealed) => !revealed).length).toBe(6);
  // The first character stays revealed as the anchor.
  expect(lowMask[0]).toBe(true);
});

it('keeps the first character below 45 mastery and may hide it from 45 onward', () => {
  const target = buildTarget([maskSentence('学而时习之不亦说乎哉')]);
  const anchored = revealedMaskFor('gap', target, 30, 1);
  const attempts = [1, 2, 3, 4, 5, 6, 7].map((attemptVersion) =>
    revealedMaskFor('gap', target, 45, attemptVersion)
  );

  expect(anchored[0]).toBe(true);
  expect(attempts.some((mask) => mask[0] === false)).toBe(true);
  expect(attempts.some((mask) => mask[0] === true)).toBe(true);
});

it('changes gap positions between attempts while preserving the same ratio', () => {
  const target = buildTarget([maskSentence('学而时习之不亦说乎哉')]);
  const firstAttempt = revealedMaskFor('gap', target, 40, 1);
  const secondAttempt = revealedMaskFor('gap', target, 40, 2);

  expect(firstAttempt.filter((revealed) => !revealed).length)
    .toBe(secondAttempt.filter((revealed) => !revealed).length);
  expect(firstAttempt).not.toEqual(secondAttempt);
  expect(firstAttempt[0]).toBe(true);
  expect(secondAttempt[0]).toBe(true);
});

it('always leaves at least one answerable slot in a short gap sentence', () => {
  const target = buildTarget([maskSentence('学而时习之')]);
  const mask = revealedMaskFor('gap', target, 0);
  const hidden = mask.filter((revealed) => !revealed).length;

  expect(hidden).toBeGreaterThanOrEqual(1);
  expect(hidden).toBeLessThanOrEqual(2);
  expect(mask[0]).toBe(true);
});
