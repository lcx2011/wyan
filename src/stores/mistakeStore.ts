import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateMistakeData } from '../storage/migrations';
import { SCHEMA_VERSIONS } from '../storage/schema';
import type { MistakeRecord } from '../types';
import { createPersistedRootStorage } from '../utils/storage';

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function mergePositionCounts(
  previous: Readonly<Record<string, number>> = {},
  addition: Readonly<Record<string, number>> = {},
): Record<string, number> | undefined {
  const merged = { ...previous };
  for (const [position, count] of Object.entries(addition)) {
    merged[position] = (merged[position] ?? 0) + count;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export interface MistakeStoreState {
  mistakes: Record<string, MistakeRecord[]>;
  addMistakes: (passageId: string, records: MistakeRecord[]) => void;
  getByPassage: (passageId: string) => MistakeRecord[];
  hasMistakes: () => boolean;
  totalCount: () => number;
  removeByPassage: (passageId: string) => void;
}

export const useMistakeStore = create<MistakeStoreState>()(
  persist(
    (set, get) => ({
      mistakes: {},
      addMistakes: (passageId, records) =>
        set((state) => {
          const next = [...(state.mistakes[passageId] ?? [])];
          for (const record of records) {
            const index = next.findIndex((existing) =>
              existing.sentenceKey === record.sentenceKey && existing.date === record.date
            );
            if (index < 0) {
              next.push({ ...record, count: record.count ?? 1 });
              continue;
            }
            const previous = next[index];
            const wrongCountByPosition = mergePositionCounts(
              previous.wrongCountByPosition,
              record.wrongCountByPosition,
            );
            next[index] = {
              ...previous,
              wrongChars: dedupe([...previous.wrongChars, ...record.wrongChars]),
              wrongPositions: dedupe([...previous.wrongPositions, ...record.wrongPositions]).sort((a, b) => a - b),
              timeoutPositions: dedupe([...previous.timeoutPositions, ...record.timeoutPositions]).sort((a, b) => a - b),
              ...(wrongCountByPosition ? { wrongCountByPosition } : {}),
              count: (previous.count ?? 1) + (record.count ?? 1),
            };
          }
          return { mistakes: { ...state.mistakes, [passageId]: next } };
        }),
      getByPassage: (passageId) => get().mistakes[passageId] ?? [],
      hasMistakes: () => Object.values(get().mistakes).some((records) => records.length > 0),
      totalCount: () => Object.values(get().mistakes).reduce((sum, records) => sum + records.length, 0),
      removeByPassage: (passageId) =>
        set((state) => {
          const mistakes = { ...state.mistakes };
          delete mistakes[passageId];
          return { mistakes };
        }),
    }),
    {
      name: 'wenyan:mistakes',
      version: SCHEMA_VERSIONS.mistakes,
      storage: createPersistedRootStorage<MistakeStoreState>(
        { version: SCHEMA_VERSIONS.mistakes, migrate: migrateMistakeData },
        { mistakes: {} }
      ),
      partialize: (state) => ({ mistakes: state.mistakes }) as MistakeStoreState,
    }
  )
);
