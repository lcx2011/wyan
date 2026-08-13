import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GlobalPosition, PassageProgress, Phase, SentenceState } from '../types';
import { migrateProgressData, normalizeProgressRecord } from '../storage/migrations';
import { SCHEMA_VERSIONS } from '../storage/schema';
import { nowISO } from '../utils/time';
import { createPersistedRootStorage } from '../utils/storage';
import { clampMastery } from '../domain/training/mastery';

function defaultProgress(): PassageProgress {
  return normalizeProgressRecord('', { updatedAt: nowISO() });
}

export function normalizePassageProgress(passageId: string, raw: unknown): PassageProgress {
  return normalizeProgressRecord(passageId, raw);
}

export function migrateProgressState(state: unknown): { progress: Record<string, PassageProgress> } {
  return migrateProgressData(state);
}

export interface ExamCompletion {
  passed: boolean;
  elapsedMs: number;
  completedAt?: string;
}

export interface ProgressCheckpoint {
  cursor?: GlobalPosition | null;
  currentSegment?: number;
  currentCardIndex?: number;
}

export interface ProgressStoreState {
  progress: Record<string, PassageProgress>;
  getProgress: (id: string) => PassageProgress | undefined;
  ensureProgress: (id: string) => PassageProgress;
  syncContentVersion: (id: string, contentVersion: string) => void;
  updateSentenceState: (id: string, sentenceId: string, state: SentenceState) => void;
  advanceCard: (cursor: GlobalPosition, segmentIndex: number, cardIndex: number) => void;
  setSnowballPassed: (id: string, segmentId: string, segmentIndex: number) => void;
  setFullTextPassed: (id: string, timeSeconds: number) => void;
  removeProgress: (id: string) => void;
  passSentencePhase: (passageId: string, sentenceId: string, phase: Phase) => void;
  setCardMastery: (passageId: string, cardId: string, mastery: number) => void;
  passCardBlind: (passageId: string, cardId: string) => void;
  passLinkSnowball: (passageId: string, linkId: string) => void;
  passSegmentSnowball: (passageId: string, segmentId: string) => void;
  recordExamCompletion: (passageId: string, completion: ExamCompletion) => void;
  checkpoint: (
    passageId: string,
    value: ProgressCheckpoint | GlobalPosition,
    segmentIndex?: number,
    cardIndex?: number
  ) => void;
}

function updateProgress(
  set: (updater: (state: ProgressStoreState) => Partial<ProgressStoreState>) => void,
  passageId: string,
  update: (progress: PassageProgress) => PassageProgress
): void {
  set((state) => {
    const current = state.progress[passageId] ?? normalizePassageProgress(passageId, undefined);
    const next = update(current);
    if (next === current) {
      return state;
    }
    return { progress: { ...state.progress, [passageId]: next } };
  });
}

function sameCursor(left: GlobalPosition | null, right: GlobalPosition | null): boolean {
  return left === right || (
    left !== null
    && right !== null
    && left.passageId === right.passageId
    && left.segmentId === right.segmentId
    && left.cardId === right.cardId
    && left.sentenceId === right.sentenceId
  );
}

export const useProgressStore = create<ProgressStoreState>()(
  persist(
    (set, get) => ({
      progress: {},
      getProgress: (id) => get().progress[id],
      ensureProgress: (id) => {
        const existing = get().progress[id];
        if (existing) return normalizePassageProgress(id, existing);
        const created = defaultProgress();
        set((state) => ({ progress: { ...state.progress, [id]: created } }));
        return created;
      },
      syncContentVersion: (passageId, contentVersion) =>
        updateProgress(set, passageId, (progress) => {
          if (progress.contentVersion === contentVersion) return progress;
          if (!progress.contentVersion) {
            return { ...progress, contentVersion };
          }
          const reset = normalizePassageProgress(passageId, {
            contentVersion,
            fullTextCompleted: progress.fullTextCompleted,
            fullTextPassed: progress.fullTextPassed,
            lastAttemptTime: progress.lastAttemptTime,
            bestPassedTime: progress.bestPassedTime,
            bestTime: progress.bestTime,
            updatedAt: nowISO(),
          });
          return reset;
        }),
      passSentencePhase: (passageId, sentenceId, phase) =>
        updateProgress(set, passageId, (progress) => {
          const previous = progress.sentenceStates[sentenceId];
          const nextPhase = previous ? Math.max(previous.phase, phase) as Phase : phase;
          if (previous?.passed === true && previous.phase === nextPhase) return progress;
          return {
            ...progress,
            sentenceStates: {
              ...progress.sentenceStates,
              [sentenceId]: { phase: nextPhase, passed: true },
            },
            updatedAt: nowISO(),
          };
        }),
      setCardMastery: (passageId, cardId, mastery) =>
        updateProgress(set, passageId, (progress) => {
          const nextMastery = clampMastery(mastery);
          if (progress.cardMastery[cardId] === nextMastery) return progress;
          return {
            ...progress,
            cardMastery: { ...progress.cardMastery, [cardId]: nextMastery },
            updatedAt: nowISO(),
          };
        }),
      updateSentenceState: (passageId, sentenceId, sentenceState) =>
        updateProgress(set, passageId, (progress) => {
          const previous = progress.sentenceStates[sentenceId];
          return {
            ...progress,
            sentenceStates: {
              ...progress.sentenceStates,
              [sentenceId]: {
                phase: previous ? Math.max(previous.phase, sentenceState.phase) as Phase : sentenceState.phase,
                passed: previous?.passed === true || sentenceState.passed,
              },
            },
            updatedAt: nowISO(),
          };
        }),
      passCardBlind: (passageId, cardId) =>
        updateProgress(set, passageId, (progress) => progress.cardBlindPassed[cardId] && progress.cardMastery[cardId] >= 100
          ? progress
          : ({
              ...progress,
              cardMastery: { ...progress.cardMastery, [cardId]: 100 },
              cardBlindPassed: { ...progress.cardBlindPassed, [cardId]: true },
              updatedAt: nowISO(),
            })),
      passLinkSnowball: (passageId, linkId) =>
        updateProgress(set, passageId, (progress) => progress.linkSnowballPassed[linkId]
          ? progress
          : ({
              ...progress,
              linkSnowballPassed: { ...progress.linkSnowballPassed, [linkId]: true },
              updatedAt: nowISO(),
            })),
      passSegmentSnowball: (passageId, segmentId) =>
        updateProgress(set, passageId, (progress) => progress.segmentSnowballPassed[segmentId]
          ? progress
          : ({
              ...progress,
              segmentSnowballPassed: { ...progress.segmentSnowballPassed, [segmentId]: true },
              updatedAt: nowISO(),
            })),
      recordExamCompletion: (passageId, completion) =>
        updateProgress(set, passageId, (progress) => {
          const validPassedTime = completion.passed && completion.elapsedMs > 0 ? completion.elapsedMs : null;
          const bestPassedTime = validPassedTime === null
            ? progress.bestPassedTime
            : progress.bestPassedTime === null || progress.bestPassedTime <= 0
              ? validPassedTime
              : Math.min(progress.bestPassedTime, validPassedTime);
          return {
            ...progress,
            fullTextCompleted: true,
            fullTextPassed: progress.fullTextPassed || completion.passed,
            lastAttemptTime: completion.completedAt ?? nowISO(),
            bestPassedTime,
            bestTime: bestPassedTime ?? progress.bestTime,
            updatedAt: completion.completedAt ?? nowISO(),
          };
        }),
      checkpoint: (passageId, value, segmentIndex, cardIndex) =>
        updateProgress(set, passageId, (progress) => {
          const isPosition = 'passageId' in value;
          const cursor = isPosition ? value : value.cursor === undefined ? progress.cursor : value.cursor;
          const nextSegment = isPosition ? (segmentIndex ?? progress.currentSegment) : (value.currentSegment ?? progress.currentSegment);
          const nextCardIndex = isPosition ? (cardIndex ?? progress.currentCardIndex) : (value.currentCardIndex ?? progress.currentCardIndex);
          if (
            sameCursor(progress.cursor, cursor)
            && progress.currentSegment === nextSegment
            && progress.currentCardIndex === nextCardIndex
          ) {
            return progress;
          }
          return {
            ...progress,
            cursor,
            currentSegment: nextSegment,
            currentCardIndex: nextCardIndex,
            updatedAt: nowISO(),
          };
        }),
      advanceCard: (cursor, segmentIndex, cardIndex) =>
        get().checkpoint(cursor.passageId, cursor, segmentIndex, cardIndex),
      setSnowballPassed: (passageId, segmentId, segmentIndex) =>
        updateProgress(set, passageId, (progress) => {
          const snowballPassed = [...progress.snowballPassed];
          while (snowballPassed.length <= segmentIndex) snowballPassed.push(false);
          snowballPassed[segmentIndex] = true;
          return {
            ...progress,
            snowballPassed,
            segmentSnowballPassed: { ...progress.segmentSnowballPassed, [segmentId]: true },
            updatedAt: nowISO(),
          };
        }),
      setFullTextPassed: (passageId, timeSeconds) =>
        get().recordExamCompletion(passageId, { passed: true, elapsedMs: timeSeconds * 1_000 }),
      removeProgress: (passageId) =>
        set((state) => {
          const progress = { ...state.progress };
          delete progress[passageId];
          return { progress };
        }),
    }),
    {
      name: 'wenyan:progress',
      version: SCHEMA_VERSIONS.progress,
      storage: createPersistedRootStorage<ProgressStoreState>(
        { version: SCHEMA_VERSIONS.progress, migrate: migrateProgressData },
        { progress: {} }
      ),
      partialize: (state) => ({ progress: state.progress }) as ProgressStoreState,
    }
  )
);
