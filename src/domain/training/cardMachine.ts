import type { Card, PassageProgress, Sentence } from '../../types';
import {
  cardMasteryFromSentences,
  initialSentenceMastery,
  persistedCardMastery,
  scoreWholeCardAttempt,
  stageForMastery,
  stageIndex,
  type MasteryStage,
} from './mastery';
import type { TypingState } from '../typing/engine';

export type TrainingUnitKind = 'gap' | 'initial' | 'blind-card';

/** 卡内分句数上限（与 chunkCardsV2 的 maxSentences 保持一致）。 */
export const MAX_CARD_SENTENCES = 6;

/** One self-contained target in the three-stage card challenge. */
export interface TrainingUnit {
  kind: TrainingUnitKind;
  /** Stable target ids for UI routing and progress persistence. */
  sentenceIds: readonly string[];
  sentences: readonly Sentence[];
}

export type CardTrainingEvent = 'pass' | 'miss';

/**
 * Controller state deliberately records only orchestration concerns.  A view
 * owns the corresponding TypingState and uses blindResetVersion to rebuild it
 * after a blind-input miss.
 */
export interface CardTrainingState {
  plan: readonly TrainingUnit[];
  currentIndex: number;
  completedUnitIndexes: readonly number[];
  blindResetVersion: number;
  /** Changes after every scored attempt so a gap retry receives a new mask. */
  attemptVersion: number;
  feedback: 'miss' | null;
  completed: boolean;
  /** Runtime-only per-sentence values for the active whole-card session. */
  sentenceMastery: Readonly<Record<string, number>>;
  cardMastery: number;
}

function buildTrainingPlan(card: Card, maxSentences?: number): TrainingUnit[] {
  if (card.sentences.length < 1 || (maxSentences !== undefined && card.sentences.length > maxSentences)) {
    const limit = maxSentences === undefined ? 'one or more' : `between one and ${maxSentences}`;
    throw new Error(`A training plan requires ${limit} sentences`);
  }

  const wholeCard = (kind: TrainingUnitKind): TrainingUnit => ({
    kind,
    sentenceIds: card.sentences.map((sentence) => sentence.id),
    sentences: [...card.sentences],
  });

  return [wholeCard('gap'), wholeCard('initial'), wholeCard('blind-card')];
}

/**
 * Creates the required whole-card three-stage challenge (方案 A §3.2.5):
 *
 * 每一张卡 —— 无论含多少分句 —— 都作为**一个整体**依次通过 挖空 → 首字 → 整卡盲打。
 * 分句不再单独成训练单元，避免在「三连闯关」里把一张卡又拆回成多块，与卡片理解页
 * 「整卡一个框」的呈现保持一致。
 */
export function createCardPlan(card: Card): TrainingUnit[] {
  return buildTrainingPlan(card, MAX_CARD_SENTENCES);
}

/** Creates a whole-text plan for a link or segment snowball unit. */
export function createSnowballPlan(card: Card): TrainingUnit[] {
  return buildTrainingPlan(card);
}

function createTrainingState(
  card: Card,
  plan: readonly TrainingUnit[],
  progress?: PassageProgress,
): CardTrainingState {
  const cardMastery = persistedCardMastery(progress, card.id, card.sentences.map((sentence) => sentence.id));
  const sentenceMastery = initialSentenceMastery(
    card.sentences.map((sentence) => sentence.id),
    cardMastery,
  );
  const currentIndex = stageIndex(stageForMastery(cardMastery));

  if (progress?.cardBlindPassed[card.id] && cardMastery >= 100) {
    return {
      plan,
      currentIndex: plan.length,
      completedUnitIndexes: plan.map((_, index) => index),
      blindResetVersion: 0,
      attemptVersion: 0,
      feedback: null,
      completed: true,
      sentenceMastery,
      cardMastery,
    };
  }

  return {
    plan,
    currentIndex,
    completedUnitIndexes: plan.slice(0, currentIndex).map((_, index) => index),
    blindResetVersion: 0,
    attemptVersion: 0,
    feedback: null,
    completed: currentIndex >= plan.length,
    sentenceMastery,
    cardMastery,
  };
}

/** Restores a card challenge at the first unfinished whole-card stage. */
export function createCardTrainingState(
  card: Card,
  progress?: PassageProgress,
): CardTrainingState {
  const plan = createCardPlan(card);
  return createTrainingState(card, plan, progress);
}

/**
 * Initializes the same three-stage controller for a whole snowball target.
 * Snowball targets may contain several cards, so they intentionally have no
 * single-card sentence-count limit.
 */
export function createSnowballTrainingState(card: Card): CardTrainingState {
  return createTrainingState(card, createSnowballPlan(card));
}

/** Returns the target currently displayed by the controller, if any. */
export function currentCardUnit(state: CardTrainingState): TrainingUnit | null {
  return state.completed ? null : state.plan[state.currentIndex] ?? null;
}

/**
 * Signals a fresh attempt for the active blind target.  It intentionally does
 * not alter the plan index or prior successful units.
 */
export function resetBlindUnit(state: CardTrainingState): CardTrainingState {
  const unit = currentCardUnit(state);
  if (unit?.kind !== 'blind-card') {
    return state;
  }
  return {
    ...state,
    blindResetVersion: state.blindResetVersion + 1,
    attemptVersion: state.attemptVersion + 1,
    feedback: 'miss',
  };
}

function advanceWithMastery(
  state: CardTrainingState,
  event: CardTrainingEvent,
  typingState: TypingState,
): CardTrainingState {
  const unit = currentCardUnit(state);
  if (!unit) return state;

  const scored = scoreWholeCardAttempt(
    unit.kind as MasteryStage,
    state.sentenceMastery,
    unit.sentenceIds,
    typingState,
  );
  const nextMastery = scored;
  const completed = event === 'pass' && unit.kind === 'blind-card';
  const nextIndex = completed
    ? state.plan.length
    : event === 'pass' && unit.kind === 'initial' && nextMastery.cardMastery >= 100
      ? stageIndex('blind-card')
      : stageIndex(stageForMastery(nextMastery.cardMastery));

  return {
    ...state,
    currentIndex: nextIndex,
    completedUnitIndexes: completed
      ? state.plan.map((_, index) => index)
      : state.plan.slice(0, nextIndex).map((_, index) => index),
    blindResetVersion: event === 'miss' && unit.kind === 'blind-card'
      ? state.blindResetVersion + 1
      : state.blindResetVersion,
    attemptVersion: state.attemptVersion + 1,
    feedback: event === 'miss' ? 'miss' : null,
    completed,
    sentenceMastery: nextMastery.sentenceMastery,
    cardMastery: nextMastery.cardMastery,
  };
}

/**
 * Advances on a successful unit.  A gap/initial miss remains in place for
 * ordinary feedback; a blind miss only restarts that active blind attempt.
 */
export function advanceCardPlan(
  state: CardTrainingState,
  event: CardTrainingEvent,
  typingState?: TypingState,
): CardTrainingState {
  if (state.completed) {
    return state;
  }

  if (typingState) {
    return advanceWithMastery(state, event, typingState);
  }

  if (event === 'miss') {
    return resetBlindUnit({ ...state, feedback: 'miss' });
  }

  const nextIndex = state.currentIndex + 1;
  const completed = nextIndex >= state.plan.length;
  return {
    ...state,
    currentIndex: nextIndex,
    completedUnitIndexes: [...state.completedUnitIndexes, state.currentIndex],
    feedback: null,
    completed,
    attemptVersion: state.attemptVersion + 1,
    sentenceMastery: state.sentenceMastery,
    cardMastery: cardMasteryFromSentences(state.sentenceMastery),
  };
}
