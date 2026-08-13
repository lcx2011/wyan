import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateAttemptData } from '../storage/migrations';
import { SCHEMA_VERSIONS } from '../storage/schema';
import type { ExamAttempt } from '../types';
import { nowISO } from '../utils/time';
import { createPersistedRootStorage } from '../utils/storage';

export interface SettleResult {
  ok: boolean;
  alreadySettled: boolean;
  attempt?: ExamAttempt;
}

export interface AttemptStoreState {
  attempts: Record<string, ExamAttempt>;
  saveAttempt: (attempt: ExamAttempt) => void;
  getAttempt: (attemptId: string) => ExamAttempt | undefined;
  settleAttempt: (attemptId: string, settledAt?: string) => SettleResult;
  removeByPassage: (passageId: string) => void;
}

export const useAttemptStore = create<AttemptStoreState>()(
  persist(
    (set, get) => ({
      attempts: {},
      saveAttempt: (attempt) =>
        set((state) => {
          const previous = state.attempts[attempt.id];
          return {
            attempts: {
              ...state.attempts,
              [attempt.id]: {
                ...attempt,
                settledAt: previous?.settledAt ?? attempt.settledAt,
              },
            },
          };
        }),
      getAttempt: (attemptId) => get().attempts[attemptId],
      settleAttempt: (attemptId, settledAt = nowISO()) => {
        const attempt = get().attempts[attemptId];
        if (!attempt) return { ok: false, alreadySettled: false };
        if (attempt.settledAt) return { ok: true, alreadySettled: true, attempt };
        const settled = { ...attempt, settledAt };
        set((state) => ({ attempts: { ...state.attempts, [attemptId]: settled } }));
        return { ok: true, alreadySettled: false, attempt: settled };
      },
      removeByPassage: (passageId) =>
        set((state) => ({
          attempts: Object.fromEntries(
            Object.entries(state.attempts).filter(([, attempt]) => attempt.passageId !== passageId)
          ),
        })),
    }),
    {
      name: 'wenyan:attempts',
      version: SCHEMA_VERSIONS.attempts,
      storage: createPersistedRootStorage<AttemptStoreState>(
        { version: SCHEMA_VERSIONS.attempts, migrate: migrateAttemptData },
        { attempts: {} }
      ),
      partialize: (state) => ({ attempts: state.attempts }) as AttemptStoreState,
    }
  )
);
