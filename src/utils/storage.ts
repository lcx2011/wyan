import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { PersistedRoot, RootSchema, StorageWriteResult } from '../storage/schema';
import { bootstrapStorageMigrations } from '../storage/migrations';
import { decodeHistoricalValue, decodeStorageValue, withStoragePrefix } from '../storage/raw';
import { queueArchiveWrite } from '../api/syncQueue';

const lastWriteResults = new Map<string, StorageWriteResult>();

export function withPrefix(key: string): string {
  return withStoragePrefix(key);
}

function schemaDetails<T>(schema: number | RootSchema<T>): RootSchema<T> {
  return typeof schema === 'number' ? { version: schema } : schema;
}

export function readRoot<T>(
  key: string,
  schema: number | RootSchema<T>,
  fallback: T
): PersistedRoot<T> {
  const fullKey = withPrefix(key);
  const details = schemaDetails(schema);
  let decoded: ReturnType<typeof decodeStorageValue>;
  try {
    const raw = window.localStorage.getItem(fullKey);
    if (raw === null) return { schemaVersion: details.version, data: fallback };
    decoded = decodeStorageValue(raw);
  } catch (error) {
    console.warn(`[storage] 数据损坏，已重置 ${fullKey}`, error);
    try {
      window.localStorage.removeItem(fullKey);
    } catch {
      // Access itself may be unavailable; returning fallback still keeps the app alive.
    }
    return { schemaVersion: details.version, data: fallback };
  }

  const fromVersion = decoded.version;
  let data = decoded.data;
  const canonical = decoded.canonical;

  try {
    if (fromVersion !== details.version) {
      if (!details.migrate || fromVersion > details.version) throw new Error('unsupported schema version');
      data = details.migrate(data, fromVersion, details.version);
    } else if (!canonical && details.migrate) {
      data = details.migrate(data, fromVersion, details.version);
    }
    const root = { schemaVersion: details.version, data: data as T };
    if (!canonical || fromVersion !== details.version) writeRoot(fullKey, root);
    return root;
  } catch (error) {
    console.warn(`[storage] 迁移失败，已重置 ${fullKey}`, error);
    try {
      window.localStorage.removeItem(fullKey);
    } catch {
      // Keep fallback in memory if storage is unavailable.
    }
    return { schemaVersion: details.version, data: fallback };
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'QuotaExceededError'
      || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || error.code === 22
      || error.code === 1014);
}

export function writeRoot<T>(key: string, root: PersistedRoot<T>): StorageWriteResult {
  const fullKey = withPrefix(key);
  let serialized: string;
  try {
    serialized = JSON.stringify(root);
  } catch (error) {
    const result: StorageWriteResult = {
      ok: false,
      reason: 'serialize',
      message: `无法序列化 ${fullKey} 的本地数据。`,
    };
    lastWriteResults.set(fullKey, result);
    console.warn(`[storage] 序列化失败 ${fullKey}`, error);
    return result;
  }
  try {
    window.localStorage.setItem(fullKey, serialized);
    const namespace = fullKey.replace(/^wenyan:/, '');
    if (namespace !== 'serverOutbox') queueArchiveWrite(namespace, root);
    const result: StorageWriteResult = { ok: true };
    lastWriteResults.set(fullKey, result);
    return result;
  } catch (error) {
    const quota = isQuotaError(error);
    const result: StorageWriteResult = {
      ok: false,
      reason: quota ? 'quota' : 'unavailable',
      message: quota ? '本地存储空间不足，请清理部分篇目后重试。' : '本地存储暂不可用，请稍后重试。',
    };
    lastWriteResults.set(fullKey, result);
    console.warn(`[storage] 写入失败 ${fullKey}`, error);
    return result;
  }
}

export function getLastStorageWriteResult(key: string): StorageWriteResult | undefined {
  return lastWriteResults.get(withPrefix(key));
}

export function createPersistedRootStorage<T>(
  schema: RootSchema<unknown>,
  fallback: unknown
): PersistStorage<T> {
  return {
    getItem: (name): StorageValue<T> => {
      bootstrapStorageMigrations();
      const root = readRoot(name, schema, fallback);
      return { state: root.data as T, version: root.schemaVersion };
    },
    setItem: (name, value): void => {
      writeRoot(name, { schemaVersion: schema.version, data: value.state });
    },
    removeItem: (name): void => {
      storageRemove(name);
    },
  };
}

export function storageGet<T>(key: string, fallback: T): T {
  const fullKey = withPrefix(key);
  try {
    const raw = window.localStorage.getItem(fullKey);
    return raw === null ? fallback : decodeHistoricalValue(raw) as T;
  } catch (error) {
    console.warn(`[storage] 解析失败，已重置 ${fullKey}`, error);
    window.localStorage.removeItem(fullKey);
    return fallback;
  }
}

export function storageSet<T>(key: string, value: T): StorageWriteResult {
  const fullKey = withPrefix(key);
  try {
    window.localStorage.setItem(fullKey, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    const quota = isQuotaError(error);
    return {
      ok: false,
      reason: quota ? 'quota' : 'unavailable',
      message: quota ? '本地存储空间不足，请清理部分篇目后重试。' : '本地存储暂不可用，请稍后重试。',
    };
  }
}

export function storageRemove(key: string): void {
  window.localStorage.removeItem(withPrefix(key));
}

/** Legacy StateStorage compatibility for code outside the formal stores. */
export const wenyanStorage = {
  getItem: (name: string): string | null => window.localStorage.getItem(withPrefix(name)),
  setItem: (name: string, value: string): void => {
    window.localStorage.setItem(withPrefix(name), value);
  },
  removeItem: storageRemove,
};
