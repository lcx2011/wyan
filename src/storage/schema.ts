export interface PersistedRoot<T> {
  schemaVersion: number;
  data: T;
}

export type StorageWriteFailureReason = 'quota' | 'serialize' | 'unavailable';

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; reason: StorageWriteFailureReason; message: string };

export interface RootSchema<T> {
  version: number;
  migrate?: (data: unknown, fromVersion: number, toVersion: number) => T;
}

export interface MigrationNotice {
  id: string;
  kind: 'passage-reset' | 'namespace-reset';
  namespace: string;
  passageId?: string;
  message: string;
  createdAt: string;
}

export const STORAGE_KEYS = {
  learning: 'wenyan:learning',
  progress: 'wenyan:progress',
  mistakes: 'wenyan:mistakes',
  reviewQueue: 'wenyan:reviewQueue',
  badges: 'wenyan:badges',
  attempts: 'wenyan:attempts',
} as const;

export const SCHEMA_VERSIONS = {
  learning: 2,
  progress: 4,
  mistakes: 1,
  reviewQueue: 4,
  badges: 1,
  attempts: 1,
} as const;
