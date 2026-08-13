import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HomePage } from '../../src/pages/HomePage';
import { useReviewStore } from '../../src/stores/reviewStore';
import type { ReviewItem } from '../../src/types';

beforeEach(() => {
  window.localStorage.clear();
  useReviewStore.setState({ queue: [] });
});

afterEach(() => cleanup());

function pendingItem(): ReviewItem {
  return {
    id: 'home-review', dueDate: '2026-08-10', status: 'pending', attempts: 0, completedAt: null,
    passageId: 'p1', sentence: '篇名', answer: '后句。', hiddenPositions: [], sourceDate: '2026-08-10',
  };
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/review" element={<div>复习页</div>} />
        <Route path="/learn" element={<div>新学页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

it('shows a review badge only when a pending item exists', () => {
  renderHome();
  expect(screen.getByTestId('review-badge').querySelector('.MuiBadge-badge')).toHaveClass('MuiBadge-invisible');

  act(() => useReviewStore.getState().addItems([pendingItem()]));
  expect(screen.getByTestId('review-badge').querySelector('.MuiBadge-badge')).not.toHaveClass('MuiBadge-invisible');
});

it('navigates from the home review and learning entry buttons', () => {
  renderHome();
  fireEvent.click(screen.getByRole('button', { name: /复习/ }));
  expect(screen.getByText('复习页')).toBeInTheDocument();

  cleanup();
  renderHome();
  fireEvent.click(screen.getByRole('button', { name: /新学/ }));
  expect(screen.getByText('新学页')).toBeInTheDocument();
});
