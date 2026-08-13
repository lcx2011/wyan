import type { ReviewItem } from '../src/types.js';
import type { ReviewSession } from '../src/domain/review/session.js';

export interface AuthUser {
  id: number;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

export const ARCHIVE_NAMESPACES = [
  'learning',
  'progress',
  'mistakes',
  'reviewQueue',
  'badges',
  'attempts',
] as const;

export type ArchiveNamespace = (typeof ARCHIVE_NAMESPACES)[number];

export interface StoredRoot {
  schemaVersion: number;
  data: unknown;
}

export type NamespaceRoots = Partial<Record<ArchiveNamespace, StoredRoot>>;

export interface ArchiveSnapshot {
  initialized: boolean;
  revision: number;
  namespaces: NamespaceRoots;
  activeReviewSession: ReviewSessionRecord | null;
}

export interface ReviewSessionRecord {
  id: string;
  status: 'active' | 'completed';
  state: ReviewSession;
  passageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSessionAttemptResult {
  operationId: string;
  itemId: string;
  result: 'pass' | 'miss';
  occurredAt?: string;
}

export interface ReviewSessionResponse {
  session: ReviewSessionRecord;
  source: 'created' | 'resumed' | 'updated' | 'already-applied';
}

export function isArchiveNamespace(value: string): value is ArchiveNamespace {
  return (ARCHIVE_NAMESPACES as readonly string[]).includes(value);
}

export function queueFromRoot(root: StoredRoot | undefined): ReviewItem[] {
  if (!root || typeof root.data !== 'object' || root.data === null) return [];
  const value = root.data as { queue?: unknown };
  return Array.isArray(value.queue) ? value.queue as ReviewItem[] : [];
}

export function rootWithQueue(root: StoredRoot | undefined, queue: ReviewItem[]): StoredRoot {
  return {
    schemaVersion: root?.schemaVersion ?? 4,
    data: { queue },
  };
}
