import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFormalPassage } from '../../src/types';

const api = vi.hoisted(() => ({
  searchGushi: vi.fn(),
  fetchGushiPoem: vi.fn(),
  toLocalPassage: vi.fn(),
}));

vi.mock('../../src/api/gushiwen', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/api/gushiwen')>();
  return { ...original, ...api };
});

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
  api.searchGushi.mockReset();
  api.fetchGushiPoem.mockReset();
  api.toLocalPassage.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderSearch(): Promise<void> {
  const { SearchPage } = await import('../../src/pages/SearchPage');
  render(
    <MemoryRouter initialEntries={['/search']}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
        <Route path="/learn" element={<div>学习页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

it('shows the quota message and stays on search when online persistence fails', async () => {
  const passage = createFormalPassage({
    id: 'online:quota',
    sourceId: 'online:quota',
    title: '测试篇目',
    author: '作者',
    dynasty: '朝代',
    segments: [{ index: 0, sentences: [{ text: '学而时习之。', meaning: '' }] }],
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
  api.searchGushi.mockResolvedValue([{ id: 1, uuid: 'quota', name: '测试篇目', author: '作者' }]);
  api.fetchGushiPoem.mockResolvedValue({});
  api.toLocalPassage.mockResolvedValue(passage);
  await renderSearch();
  fireEvent.change(screen.getByPlaceholderText(/输入篇目名/), { target: { value: '测试' } });
  expect(await screen.findByText('在线篇目（1）', {}, { timeout: 10_000 })).toBeInTheDocument();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });

  await act(async () => {
    fireEvent.click(screen.getByText('添加'));
  });
  await waitFor(() => expect(api.toLocalPassage).toHaveBeenCalledOnce(), { timeout: 10_000 });

  expect(screen.getByText('本地存储空间不足，请清理部分篇目后重试。')).toBeInTheDocument();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
  expect(screen.queryByText('学习页')).not.toBeInTheDocument();
}, 30_000);

it('renders a successful online search, adds the passage, and navigates to learning', async () => {
  const passage = createFormalPassage({
    id: 'online:success', sourceId: 'online:success', title: '唯一在线测试篇', author: '作者', dynasty: '朝代',
    segments: [{ index: 0, sentences: [{ text: '学而时习之。', meaning: '' }] }],
    updatedAt: '2026-08-10T00:00:00.000Z',
  });
  api.searchGushi.mockResolvedValue([{ id: 2, uuid: 'success', name: '唯一在线测试篇', author: '作者' }]);
  api.fetchGushiPoem.mockResolvedValue({});
  api.toLocalPassage.mockResolvedValue(passage);
  await renderSearch();

  fireEvent.change(screen.getByPlaceholderText(/输入篇目名/), { target: { value: '唯一在线测试篇' } });
  expect(await screen.findByText('在线篇目（1）', {}, { timeout: 10_000 })).toBeInTheDocument();
  fireEvent.click(screen.getByText('添加'));
  expect(await screen.findByText('已加入学习列表：唯一在线测试篇')).toBeInTheDocument();
  expect(await screen.findByText('学习页', {}, { timeout: 3_000 })).toBeInTheDocument();
}, 20_000);

it('shows the online fallback and a true empty state', async () => {
  api.searchGushi.mockRejectedValueOnce(new Error('offline'));
  await renderSearch();
  fireEvent.change(screen.getByPlaceholderText(/输入篇目名/), { target: { value: '绝无此篇甲' } });
  expect(await screen.findByText('在线搜索不可用，已显示内置篇目')).toBeInTheDocument();
  expect(screen.getByText(/没有找到「绝无此篇甲」/)).toBeInTheDocument();
});
