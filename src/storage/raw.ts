import { userStorageKey } from '../auth/session';

const PREFIX = 'wenyan:';
const memoryStorage = new Map<string, string>();

function useTestStorage(): boolean {
  return import.meta.env.MODE === 'test';
}

export function transientStorageGet(key: string): string | null {
  return useTestStorage() ? window.localStorage.getItem(key) : memoryStorage.get(key) ?? null;
}

export function transientStorageSet(key: string, value: string): void {
  if (useTestStorage()) window.localStorage.setItem(key, value);
  else memoryStorage.set(key, value);
}

export function transientStorageRemove(key: string): void {
  if (useTestStorage()) window.localStorage.removeItem(key);
  else memoryStorage.delete(key);
}

export interface DecodedStorageValue {
  data: unknown;
  version: number;
  canonical: boolean;
}

export function withStoragePrefix(key: string): string {
  if (key.startsWith('wenyan:user:')) return key;
  return userStorageKey(key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key);
}

export function decodeHistoricalValue(raw: string): unknown {
  const first = JSON.parse(raw) as unknown;
  return typeof first === 'string' ? JSON.parse(first) as unknown : first;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function decodeStorageValue(raw: string): DecodedStorageValue {
  const parsed = decodeHistoricalValue(raw);
  if (isRecord(parsed) && typeof parsed.schemaVersion === 'number' && 'data' in parsed) {
    return { data: parsed.data, version: parsed.schemaVersion, canonical: true };
  }
  if (isRecord(parsed) && 'state' in parsed) {
    return {
      data: parsed.state,
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      canonical: false,
    };
  }
  return { data: parsed, version: 0, canonical: false };
}
