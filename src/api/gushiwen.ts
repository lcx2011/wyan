/** API client for gushiwenku search and poem-detail endpoints. */
import { importPassage } from '../domain/content/importer';
import type { Passage } from '../types';

export interface GushiSearchResult {
  id: number;
  uuid: string;
  name: string;
  author: string;
  author_id?: number;
  dynasty_id?: number;
  dynasty?: string;
  phrases?: string;
  content?: string;
  good?: number;
  table_id?: number;
}

export interface GushiContentItem {
  yuanwen?: string;
  yiwen?: string;
  pinyin?: string;
  zhushi?: Array<{ name?: string; notes?: string }>;
}

export interface GushiPoemData {
  content?: GushiContentItem[];
}

export interface GushiPoemDetail {
  /** Some API adapters expose the full source directly instead of poem_data.content. */
  content?: string;
  title?: {
    name?: string;
    pinyin?: string;
    author?: string;
    chaodai?: string;
    [key: string]: unknown;
  };
  metadata?: {
    id?: number;
    good_count?: number;
    [key: string]: unknown;
  };
  poem_data?: GushiPoemData;
  shangxi?: unknown;
}

export type ApiPassageDetail = GushiPoemDetail;

export function stripHtml(value: string): string {
  return String(value ?? '').replace(/<[^>]+>/g, '');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} (reqId=${response.headers.get('x-request-id') ?? 'n/a'})`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchGushi(key: string, page = 1): Promise<GushiSearchResult[]> {
  const response = await fetchWithTimeout(
    '/gushiwen/ajax/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, type: '1', page }),
    },
    8000,
  );
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('在线搜索返回格式异常');
  }
  return data as GushiSearchResult[];
}

export async function fetchGushiPoem(uuid: string): Promise<GushiPoemDetail> {
  const response = await fetchWithTimeout(
    `/gushiwen/ajax/getPoem/${encodeURIComponent(uuid)}`,
    { method: 'GET' },
    10000,
  );
  return (await response.json()) as GushiPoemDetail;
}

/** Converts online detail through the deterministic content importer. */
export async function toLocalPassage(detail: GushiPoemDetail, sourceId: string): Promise<Passage> {
  return importPassage(detail, sourceId);
}
