import type { ReviewAnswer, ReviewSession } from '../domain/review/session';
import { markCloudAvailable, markCloudUnavailable } from './cloudStatus';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
let apiEnabled = import.meta.env.MODE !== 'test';

export interface RemoteReviewSession {
  id: string;
  status: 'active' | 'completed';
  state: ReviewSession;
  passageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionResponse {
  session: RemoteReviewSession;
  source: 'created' | 'resumed' | 'updated' | 'already-applied';
}

/** Test and embedding hook; the app enables this by default outside Vitest. */
export function setReviewApiEnabled(value: boolean): void {
  apiEnabled = value;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (error) {
    markCloudUnavailable('云端复习服务暂时不可用，本次操作未完成。');
    throw error;
  }
  if (!response.ok) {
    markCloudUnavailable(`云端复习操作失败（HTTP ${response.status}），请重新连接后重试。`);
    throw new Error(`review request failed: ${response.status} (reqId=${response.headers.get('x-request-id') ?? 'n/a'})`);
  }
  markCloudAvailable();
  return response.json() as Promise<T>;
}

export async function createOrResumeRemoteReviewSession(passageId?: string): Promise<RemoteReviewSession | null> {
  if (!apiEnabled) return null;
  try {
    return (await request<SessionResponse>('/review/sessions', {
      method: 'POST',
      body: JSON.stringify(passageId ? { passageId } : {}),
    })).session;
  } catch {
    return null;
  }
}

/** Removes server-side review/session data for one passage when the app is online. */
export async function resetRemotePassageData(passageId: string): Promise<boolean> {
  if (!apiEnabled) return false;
  try {
    await request<{ ok: boolean }>('/review/reset', {
      method: 'POST',
      body: JSON.stringify({ passageId }),
    });
    return true;
  } catch {
    return false;
  }
}

function operationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `review-op:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export async function submitRemoteReviewAttempt(
  sessionId: string,
  itemId: string,
  result: ReviewAnswer,
): Promise<RemoteReviewSession | null> {
  if (!apiEnabled) return null;
  try {
    const response = await request<SessionResponse>(`/review/sessions/${encodeURIComponent(sessionId)}/attempts`, {
      method: 'POST',
      body: JSON.stringify({ operationId: operationId(), itemId, result, occurredAt: new Date().toISOString() }),
    });
    return response.session;
  } catch {
    return null;
  }
}
