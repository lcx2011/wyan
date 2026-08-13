import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ExamPage } from '../../src/pages/ExamPage';
import { ReportPage } from '../../src/pages/ReportPage';
import { useAttemptStore } from '../../src/stores/attemptStore';
import { useBadgeStore } from '../../src/stores/badgeStore';
import { useMistakeStore } from '../../src/stores/mistakeStore';
import { usePassageStore } from '../../src/stores/passageStore';
import { useProgressStore } from '../../src/stores/progressStore';
import { useReviewStore } from '../../src/stores/reviewStore';
import { createFormalPassage, type ExamAttempt, type Passage } from '../../src/types';

type UserLike = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  window.localStorage.clear();
  usePassageStore.setState({ entries: [], onlinePassages: {}, migrationNotices: [] });
  useProgressStore.setState({ progress: {} });
  useAttemptStore.setState({ attempts: {} });
  useMistakeStore.setState({ mistakes: {} });
  useReviewStore.setState({ queue: [] });
  useBadgeStore.setState({
    badges: { earned: [], stats: { passedArticles: 0, reviewDays: 0, totalChars: 0, streak: 0 } },
    processedEventIds: [],
  });
});

afterEach(() => {
  cleanup();
});

function makePassage(): Passage {
  return createFormalPassage({
    id: 'test:exam',
    title: 'Boss 测试',
    author: '测试作者',
    dynasty: '测试朝代',
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

function seedPassage(passage: Passage): void {
  usePassageStore.getState().addOnlinePassage(passage);
  for (const segment of passage.segments) {
    useProgressStore.getState().passSegmentSnowball(passage.id, segment.id);
  }
}

function saveAttempt(attempt: ExamAttempt): void {
  useAttemptStore.getState().saveAttempt(attempt);
}

function renderApp(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/passage/:passageId/exam" element={<ExamPage />} />
        <Route path="/report/:attemptId" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function typeChars(_user: UserLike, chars: string): Promise<void> {
  for (const char of chars) {
    fireEvent.keyDown(window, { key: char });
  }
}

function failedAttempt(passage: Passage): ExamAttempt {
  const sentenceId = passage.segments[0].cards[0].sentences[0].id;
  return {
    id: 'attempt:failed',
    passageId: passage.id,
    contentVersion: passage.contentVersion,
    startedAt: '2026-08-04T00:00:00.000Z',
    completedAt: '2026-08-04T00:00:05.000Z',
    elapsedMs: 5_000,
    elapsedSeconds: 5,
    wrongPositions: [{ sentenceId, charIndex: 2, expectedChar: '时' }],
    timeoutPositions: [{ sentenceId, charIndex: 4, expectedChar: '之' }],
    completed: true,
    passed: false,
    settledAt: null,
  };
}

function passedAttempt(passage: Passage): ExamAttempt {
  return {
    id: 'attempt:passed',
    passageId: passage.id,
    contentVersion: passage.contentVersion,
    startedAt: '2026-08-04T00:00:00.000Z',
    completedAt: '2026-08-04T00:00:08.000Z',
    elapsedMs: 8_000,
    elapsedSeconds: 8,
    wrongPositions: [],
    timeoutPositions: [],
    completed: true,
    passed: true,
    settledAt: null,
  };
}

it('runs a clean Boss run and lands on a passed report', async () => {
  const passage = makePassage();
  seedPassage(passage);
  renderApp(`/passage/${passage.id}/exam`);
  const user = userEvent.setup();

  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '开始挑战' }));

  await typeChars(user, 'xesxz');

  expect(await screen.findByText(/成绩报告/, {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(screen.getByText(/已通关/)).toBeInTheDocument();
  expect(screen.getByTestId('encouragement')).toBeInTheDocument();
  expect(await screen.findByText(/最佳用时/, {}, { timeout: 10_000 })).toBeInTheDocument();

  const attempts = Object.values(useAttemptStore.getState().attempts);
  expect(attempts).toHaveLength(1);
  expect(attempts[0].passed).toBe(true);
}, 20_000);

it('does not reset on a Boss mistake and reports a failed attempt with a retry', async () => {
  const passage = makePassage();
  seedPassage(passage);
  renderApp(`/passage/${passage.id}/exam`);
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', { name: '开始挑战' }));

  await typeChars(user, 'x');
  await typeChars(user, 'q');
  await typeChars(user, 'esxz');

  expect(await screen.findByText(/成绩报告/, {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(screen.getByText(/未通关/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '再次挑战' })).toBeInTheDocument();

  const attempts = Object.values(useAttemptStore.getState().attempts);
  expect(attempts).toHaveLength(1);
  expect(attempts[0].passed).toBe(false);
  expect(attempts[0].wrongPositions).toHaveLength(1);
}, 20_000);

it('settles a failed attempt exactly once across two report renders', async () => {
  const passage = makePassage();
  seedPassage(passage);
  const attempt = failedAttempt(passage);
  saveAttempt(attempt);

  renderApp(`/report/${attempt.id}`);
  expect(await screen.findByText(/再次挑战/, {}, { timeout: 10_000 })).toBeInTheDocument();

  expect(useMistakeStore.getState().getByPassage(passage.id)).toHaveLength(1);
  expect(useReviewStore.getState().queue).toHaveLength(1);

  cleanup();
  renderApp(`/report/${attempt.id}`);
  expect(useMistakeStore.getState().getByPassage(passage.id)).toHaveLength(1);
  expect(useReviewStore.getState().queue).toHaveLength(1);
}, 20_000);

it('shows encouragement and best time for a passed attempt and records the badge once', async () => {
  const passage = makePassage();
  seedPassage(passage);
  const attempt = passedAttempt(passage);
  saveAttempt(attempt);

  renderApp(`/report/${attempt.id}`);
  expect(await screen.findByText(/已通关/, {}, { timeout: 10_000 })).toBeInTheDocument();
  expect(screen.getByTestId('encouragement')).toBeInTheDocument();
  expect(await screen.findByText(/最佳用时/, {}, { timeout: 10_000 })).toBeInTheDocument();

  const passEvents = () => useBadgeStore.getState().processedEventIds.filter((id) => id.startsWith('pass:'));
  expect(passEvents()).toHaveLength(1);

  cleanup();
  renderApp(`/report/${attempt.id}`);
  expect(passEvents()).toHaveLength(1);

  expect(useProgressStore.getState().progress[passage.id].bestPassedTime).toBe(8_000);
}, 20_000);
