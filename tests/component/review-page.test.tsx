import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loushiming } from '../../src/data/passages/loushiming';
import { taohuayuanji } from '../../src/data/passages/taohuayuanji';
import { buildReviewClauses } from '../../src/domain/review/clause';
import { HomePage } from '../../src/pages/HomePage';
import { ReviewPage } from '../../src/pages/ReviewPage';
import { useBadgeStore } from '../../src/stores/badgeStore';
import { usePassageStore } from '../../src/stores/passageStore';
import { useProgressStore } from '../../src/stores/progressStore';
import { useReviewStore } from '../../src/stores/reviewStore';
import { todayISO } from '../../src/utils/time';
import type { ReviewItem } from '../../src/types';

beforeEach(() => {
  window.localStorage.clear();
  usePassageStore.setState({ entries: [], onlinePassages: {}, migrationNotices: [] });
  useProgressStore.setState({ progress: {} });
  useReviewStore.setState({ queue: [] });
  useBadgeStore.setState({
    badges: { earned: [], stats: { passedArticles: 0, reviewDays: 0, totalChars: 0, streak: 0 } },
    processedEventIds: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function reviewItem(clauseIndex: number): ReviewItem {
  const clause = buildReviewClauses(loushiming)[clauseIndex];
  return {
    id: `test:${clause.id}`,
    dueDate: '2099-01-01',
    status: 'pending',
    attempts: 0,
    completedAt: null,
    passageId: loushiming.id,
    sentence: clause.prompt,
    answer: clause.text,
    sourceSentence: clause.text,
    hiddenPositions: [],
    sourceDate: '2026-08-10',
    contentVersion: loushiming.contentVersion,
    sentenceId: clause.sentenceId,
    targetClauseId: clause.id,
    targetStartCharIndex: clause.startCharIndex,
    targetEndCharIndex: clause.endCharIndex,
    targetOrder: clause.order,
    promptType: clause.promptType,
    reason: 'mistake',
    priority: 100,
    mistakeCount: 1,
    createdAt: '2026-08-10T00:00:00.000Z',
  };
}

function seedQueue(items: ReviewItem[]): void {
  useReviewStore.getState().addItems(items);
}

function renderApp(entry = '/review'): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function startReviewForLoushiming(): void {
  fireEvent.click(screen.getByTestId(`review-passage-${loushiming.id}`));
  fireEvent.click(screen.getByRole('button', { name: '开始复习' }));
}

function typeInitials(value: string): void {
  for (const character of value) fireEvent.keyDown(window, { key: character });
}

it('shows the non-calendar empty state when nothing needs review', () => {
  renderApp();
  expect(screen.getByText('暂时没有需要复习的内容')).toBeInTheDocument();
  expect(screen.getByText(/立即在这里组成复习组/)).toBeInTheDocument();
}, 20_000);

it('shows the preceding clause, conceals target length, reveals a miss, and requires two clean retries', async () => {
  vi.useFakeTimers();
  seedQueue([reviewItem(1), reviewItem(3)]);
  renderApp();
  startReviewForLoushiming();

  expect(screen.getByText('本组完成 0 / 2')).toBeInTheDocument();
  expect(screen.getByTestId('review-prompt')).toHaveTextContent('山不在高，');
  expect(screen.queryByText('有仙则名。')).not.toBeInTheDocument();
  expect(screen.queryByText('＿')).not.toBeInTheDocument();

  typeInitials('q');
  expect(screen.getByRole('alert')).toHaveTextContent('期待“有”');
  expect(screen.getByRole('status')).toHaveTextContent('正确后句有仙则名。');

  act(() => vi.advanceTimersByTime(1_500));
  expect(screen.getByTestId('review-prompt')).toHaveTextContent('水不在深，');

  typeInitials('ylzl');
  expect(screen.getByTestId('review-prompt')).toHaveTextContent('山不在高，');
  expect(screen.getByText('本组完成 1 / 2')).toBeInTheDocument();

  typeInitials('yxzm');
  // The missed clause remains for one more independent clean recall.
  expect(screen.getByTestId('review-prompt')).toHaveTextContent('山不在高，');
  typeInitials('yxzm');

  expect(screen.getByTestId('review-done')).toHaveTextContent('本组复习完成');
  expect(useReviewStore.getState().queue.every((item) => item.status === 'completed')).toBe(true);
}, 20_000);

it('records the review badge only once when a clean group is completed and remounted', async () => {
  seedQueue([reviewItem(1), reviewItem(3)]);
  renderApp();
  startReviewForLoushiming();

  typeInitials('yxzm');
  typeInitials('ylzl');
  expect(screen.getByTestId('review-done')).toHaveTextContent('本组复习完成');

  const reviewEvents = () =>
    useBadgeStore.getState().processedEventIds.filter((id) => id.startsWith('review:'));
  expect(reviewEvents()).toEqual([`review:${todayISO()}`]);

  cleanup();
  renderApp();
  expect(screen.getByText('暂时没有需要复习的内容')).toBeInTheDocument();
  expect(reviewEvents()).toEqual([`review:${todayISO()}`]);
}, 20_000);

it('selects one passage before starting and excludes other passages from the session', () => {
  const other = taohuayuanji;
  usePassageStore.setState({ onlinePassages: { [other.id]: other } });
  seedQueue([
    reviewItem(1),
    {
      id: 'other-item',
      dueDate: '2099-01-01',
      status: 'pending',
      attempts: 0,
      completedAt: null,
      passageId: other.id,
      sentence: '提示，',
      answer: '另一句。',
      hiddenPositions: [],
      sourceDate: '2026-08-10',
      contentVersion: other.contentVersion,
      targetClauseId: 'other-clause',
    },
  ]);
  renderApp();

  expect(screen.getByTestId(`review-passage-${loushiming.id}`)).toBeInTheDocument();
  expect(screen.getByTestId(`review-passage-${other.id}`)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId(`review-passage-${loushiming.id}`));
  fireEvent.click(screen.getByRole('button', { name: '开始复习' }));

  expect(screen.getByText('本组完成 0 / 1')).toBeInTheDocument();
  expect(screen.queryByText('另一句。')).not.toBeInTheDocument();
});
