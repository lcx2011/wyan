import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateBadgeData } from '../storage/migrations';
import { SCHEMA_VERSIONS } from '../storage/schema';
import type { Badges } from '../types';
import { todayISO } from '../utils/time';
import { createPersistedRootStorage } from '../utils/storage';

const DEFAULT_BADGES: Badges = {
  earned: [],
  stats: { passedArticles: 0, reviewDays: 0, totalChars: 0, streak: 0 },
};

const ENCOURAGEMENTS = [
  '太棒了，继续加油！',
  '你真厉害，又进一步！',
  '坚持就是胜利！',
  '背得又快又准，好样的！',
  '离大文豪又近了一步！',
];

interface RecordPass {
  (eventId: string, passageId: string, charCount: number): void;
  (passageId: string, charCount: number): void;
}

export interface BadgeStoreState {
  badges: Badges;
  processedEventIds: string[];
  unlock: (id: string) => void;
  recordPass: RecordPass;
  recordReview: (eventId?: string) => void;
  getEncouragement: () => string;
}

function freshBadges(): Badges {
  return { earned: [], stats: { ...DEFAULT_BADGES.stats } };
}

export const useBadgeStore = create<BadgeStoreState>()(
  persist(
    (set, get) => ({
      badges: freshBadges(),
      processedEventIds: [],
      unlock: (id) =>
        set((state) => state.badges.earned.includes(id)
          ? { badges: state.badges }
          : { badges: { ...state.badges, earned: [...state.badges.earned, id] } }),
      recordPass: (first: string, second: string | number, third?: number) => {
        const explicitEvent = typeof second === 'string';
        const eventId = explicitEvent ? first : `pass:${first}`;
        const charCount = explicitEvent ? (third ?? 0) : second;
        if (get().processedEventIds.includes(eventId)) return;
        set((state) => ({
          processedEventIds: [...state.processedEventIds, eventId],
          badges: {
            earned: state.badges.earned.includes('first_pass')
              ? state.badges.earned
              : [...state.badges.earned, 'first_pass'],
            stats: {
              ...state.badges.stats,
              passedArticles: state.badges.stats.passedArticles + 1,
              totalChars: state.badges.stats.totalChars + charCount,
            },
          },
        }));
      },
      recordReview: (eventId = `review:${todayISO()}`) => {
        if (get().processedEventIds.includes(eventId)) return;
        set((state) => {
          const stats = {
            ...state.badges.stats,
            reviewDays: state.badges.stats.reviewDays + 1,
            streak: state.badges.stats.streak + 1,
          };
          return {
            processedEventIds: [...state.processedEventIds, eventId],
            badges: {
              earned: stats.streak >= 7 && !state.badges.earned.includes('seven_day_streak')
                ? [...state.badges.earned, 'seven_day_streak']
                : state.badges.earned,
              stats,
            },
          };
        });
      },
      getEncouragement: () => ENCOURAGEMENTS[get().badges.earned.length % ENCOURAGEMENTS.length],
    }),
    {
      name: 'wenyan:badges',
      version: SCHEMA_VERSIONS.badges,
      storage: createPersistedRootStorage<BadgeStoreState>(
        { version: SCHEMA_VERSIONS.badges, migrate: migrateBadgeData },
        { badges: freshBadges(), processedEventIds: [] }
      ),
      partialize: (state) => ({
        badges: state.badges,
        processedEventIds: state.processedEventIds,
      }) as BadgeStoreState,
    }
  )
);
