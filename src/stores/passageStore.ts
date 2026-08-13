import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateLearningData, type LearningData } from '../storage/migrations';
import { SCHEMA_VERSIONS, type MigrationNotice, type StorageWriteResult } from '../storage/schema';
import type { LearningEntry, Passage } from '../types';
import { rechunkPassageIfNeeded } from '../domain/content/rechunkMigration';
import { useProgressStore } from './progressStore';
import { createPersistedRootStorage, writeRoot } from '../utils/storage';
import { nowISO } from '../utils/time';

export interface PassageStoreState extends LearningData {
  add: (id: string) => void;
  remove: (id: string) => void;
  has: (id: string) => boolean;
  getEntry: (id: string) => LearningEntry | undefined;
  addOnlinePassage: (passage: Passage) => StorageWriteResult;
  getOnlinePassage: (id: string) => Passage | undefined;
  dismissMigrationNotice: (noticeId: string) => void;
}

const EMPTY_LEARNING: LearningData = {
  entries: [],
  onlinePassages: {},
  migrationNotices: [],
};

function persistedData(state: PassageStoreState): LearningData {
  return {
    entries: state.entries,
    onlinePassages: state.onlinePassages,
    migrationNotices: state.migrationNotices,
  };
}

export const usePassageStore = create<PassageStoreState>()(
  persist(
    (set, get) => ({
      ...EMPTY_LEARNING,
      add: (id) =>
        set((state) => state.entries.some((entry) => entry.id === id)
          ? { entries: state.entries }
          : { entries: [...state.entries, { id, addedAt: nowISO() }] }),
      remove: (id) =>
        set((state) => {
          const onlinePassages = { ...state.onlinePassages };
          delete onlinePassages[id];
          return { entries: state.entries.filter((entry) => entry.id !== id), onlinePassages };
        }),
      has: (id) => get().entries.some((entry) => entry.id === id),
      getEntry: (id) => get().entries.find((entry) => entry.id === id),
      addOnlinePassage: (passage) => {
        const state = get();
        // 在线篇目重新导入且 contentVersion 变化时，按新切分规则迁移存量进度
        // （builtin 篇目不经过此入口，天然不重分）。
        const previous = state.onlinePassages[passage.id];
        let migratedProgress = useProgressStore.getState().progress[passage.id];
        if (previous && previous.contentVersion !== passage.contentVersion) {
          const oldProgress = useProgressStore.getState().progress[passage.id];
          const migrated = rechunkPassageIfNeeded(previous, passage, oldProgress);
          if (migrated) migratedProgress = migrated;
        }
        const entries = state.entries.some((entry) => entry.id === passage.id)
          ? state.entries
          : [...state.entries, { id: passage.id, addedAt: nowISO() }];
        const data: LearningData = {
          ...persistedData(state),
          entries,
          onlinePassages: { ...state.onlinePassages, [passage.id]: passage },
        };
        const result = writeRoot('learning', { schemaVersion: SCHEMA_VERSIONS.learning, data });
        if (result.ok) {
          set({ entries: data.entries, onlinePassages: data.onlinePassages });
          if (migratedProgress) {
            const bound = { ...migratedProgress, contentVersion: passage.contentVersion };
            useProgressStore.setState((s) => ({
              progress: { ...s.progress, [passage.id]: bound },
            }));
          }
        }
        return result;
      },
      getOnlinePassage: (id) => get().onlinePassages[id],
      dismissMigrationNotice: (noticeId) =>
        set((state) => ({
          migrationNotices: state.migrationNotices.filter((notice: MigrationNotice) => notice.id !== noticeId),
        })),
    }),
    {
      name: 'wenyan:learning',
      version: SCHEMA_VERSIONS.learning,
      storage: createPersistedRootStorage<PassageStoreState>(
        { version: SCHEMA_VERSIONS.learning, migrate: migrateLearningData },
        EMPTY_LEARNING
      ),
      partialize: (state) => persistedData(state) as PassageStoreState,
    }
  )
);
