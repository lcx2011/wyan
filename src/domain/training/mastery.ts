import type { PassageProgress } from '../../types';
import type { TypingState } from '../typing/engine';

export type MasteryStage = 'gap' | 'initial' | 'blind-card';

export const MASTERY_MAX = 100;
/** 掌握度达到 100 后，先做一次“只保留首字”，再进入整篇盲打。 */
export const INITIAL_STAGE_THRESHOLD = 100;
export const GAP_ANCHOR_THRESHOLD = 45;

const STAGE_GAIN: Record<MasteryStage, number> = {
  gap: 15,
  initial: 15,
  'blind-card': 15,
};

const STAGE_FIRST_MISS_LOSS: Record<MasteryStage, number> = {
  gap: 10,
  initial: 10,
  'blind-card': 10,
};

const EXTRA_MISS_LOSS = 3;
const MAX_MISS_LOSS = 20;
const PAUSE_LOSS = 2;
const MAX_PAUSE_LOSS_PER_ATTEMPT = 4;

export interface MasteryAttemptResult {
  sentenceMastery: Record<string, number>;
  cardMastery: number;
  deltas: Record<string, number>;
}

export function clampMastery(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MASTERY_MAX, Math.round(value)));
}

export function stageForMastery(mastery: number): MasteryStage {
  const value = clampMastery(mastery);
  if (value < INITIAL_STAGE_THRESHOLD) return 'gap';
  // 100 is deliberately the initial-letter stage. The controller advances
  // from this stage to blind-card only after that extra clean attempt.
  return 'initial';
}

export function stageIndex(stage: MasteryStage): number {
  return stage === 'gap' ? 0 : stage === 'initial' ? 1 : 2;
}

/**
 * The card is only as strong as its weakest sentence. The runtime sentence
 * values are intentionally not persisted independently; this keeps the card
 * as the durable unit while preventing a strong sentence from hiding a weak
 * one during the current whole-card attempt.
 */
export function cardMasteryFromSentences(sentenceMastery: Readonly<Record<string, number>>): number {
  const values = Object.values(sentenceMastery);
  return values.length === 0 ? 0 : Math.min(...values.map(clampMastery));
}

export function initialSentenceMastery(
  sentenceIds: readonly string[],
  cardMastery: number,
): Record<string, number> {
  return Object.fromEntries(sentenceIds.map((sentenceId) => [sentenceId, clampMastery(cardMastery)]));
}

/**
 * Gap difficulty grows with card mastery. At 0 the card hides about 25% of
 * characters; at 100 it would hide about 60%. The 100 boundary is consumed
 * by the initial-letter stage before blind dictation starts.
 */
export function gapHiddenRatio(cardMastery: number): number {
  const value = Math.min(INITIAL_STAGE_THRESHOLD, clampMastery(cardMastery));
  return 0.25 + (value / INITIAL_STAGE_THRESHOLD) * 0.35;
}

function wrongCountForSentence(state: TypingState, sentenceId: string): number {
  return Object.entries(state.wrongCountByPosition)
    .filter(([key]) => key.startsWith(`${sentenceId}:`))
    .reduce((total, [, count]) => total + count, 0);
}

function pauseCountForSentence(state: TypingState, sentenceId: string): number {
  return state.timeoutPositions.filter((position) => position.sentenceId === sentenceId).length;
}

function deltaForSentence(
  stage: MasteryStage,
  wrongCount: number,
  pauseCount: number,
): number {
  const answerDelta = wrongCount === 0
    ? STAGE_GAIN[stage]
    : -Math.min(MAX_MISS_LOSS, STAGE_FIRST_MISS_LOSS[stage] + (wrongCount - 1) * EXTRA_MISS_LOSS);
  const pauseDelta = Math.min(MAX_PAUSE_LOSS_PER_ATTEMPT, pauseCount * PAUSE_LOSS);
  return answerDelta - pauseDelta;
}

/**
 * Scores one whole-card attempt. A completed target gives untouched sentences
 * a positive result; an interrupted blind target only applies penalties to
 * sentences that already produced a miss or a pause.
 */
export function scoreWholeCardAttempt(
  stage: MasteryStage,
  currentSentenceMastery: Readonly<Record<string, number>>,
  sentenceIds: readonly string[],
  state: TypingState,
): MasteryAttemptResult {
  const deltas: Record<string, number> = {};
  const sentenceMastery: Record<string, number> = { ...currentSentenceMastery };

  for (const sentenceId of sentenceIds) {
    const wrongCount = wrongCountForSentence(state, sentenceId);
    const pauseCount = pauseCountForSentence(state, sentenceId);
    if (!state.done && wrongCount === 0 && pauseCount === 0) {
      deltas[sentenceId] = 0;
      continue;
    }
    const delta = deltaForSentence(stage, wrongCount, pauseCount);
    deltas[sentenceId] = delta;
    sentenceMastery[sentenceId] = clampMastery((currentSentenceMastery[sentenceId] ?? 0) + delta);
  }

  if (state.done) {
    for (const sentenceId of sentenceIds) {
      if (deltas[sentenceId] !== undefined) continue;
      const delta = deltaForSentence(stage, 0, 0);
      deltas[sentenceId] = delta;
      sentenceMastery[sentenceId] = clampMastery((currentSentenceMastery[sentenceId] ?? 0) + delta);
    }
  }

  return {
    sentenceMastery,
    cardMastery: cardMasteryFromSentences(sentenceMastery),
    deltas,
  };
}

/** Reads new mastery and safely falls back to the old monotonic progress. */
export function persistedCardMastery(progress: PassageProgress | undefined, cardId: string, sentenceIds: readonly string[] = []): number {
  const stored = progress?.cardMastery?.[cardId];
  if (typeof stored === 'number' && Number.isFinite(stored)) return clampMastery(stored);
  if (progress?.cardBlindPassed[cardId]) return MASTERY_MAX;
  if (sentenceIds.length > 0 && sentenceIds.every((sentenceId) => (progress?.sentenceStates[sentenceId]?.phase ?? 0) >= 2)) {
    return INITIAL_STAGE_THRESHOLD;
  }
  if (sentenceIds.length > 0 && sentenceIds.every((sentenceId) => (progress?.sentenceStates[sentenceId]?.phase ?? 0) >= 1)) {
    return 40;
  }
  return 0;
}
