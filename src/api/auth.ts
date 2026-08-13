import { clearActiveUser } from '../auth/session';
import { markCloudAvailable, markCloudUnavailable } from './cloudStatus';
import type { AuthUser } from '../auth/session';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

interface AuthResponse {
  user: AuthUser | null;
}

class AuthRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5_000);
  try {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/auth${path}`, {
        ...init,
        signal: controller.signal,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
    } catch (error) {
      markCloudUnavailable('无法连接云端服务，请检查服务器或网络后重试。');
      throw error;
    }
    if (response.status >= 500) markCloudUnavailable(`云端认证服务异常（HTTP ${response.status}）。`);
    else markCloudAvailable();
    const body = await response.json() as unknown;
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `请求失败：${response.status}`;
      throw new AuthRequestError(response.status, message);
    }
    return body as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    return (await request<AuthResponse>('/me')).user;
  } catch (error) {
    if (error instanceof AuthRequestError && error.status === 401) {
      clearActiveUser();
      return null;
    }
    throw error;
  }
}

export async function login(username: string, password: string): Promise<AuthUser> {
  return (await request<{ user: AuthUser }>('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })).user;
}

export async function register(username: string, password: string): Promise<AuthUser> {
  return (await request<{ user: AuthUser }>('/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })).user;
}

export async function logout(): Promise<void> {
  try {
    await request<{ ok: boolean }>('/logout', { method: 'POST', body: '{}' });
  } finally {
    clearActiveUser();
  }
}
