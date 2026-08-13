import { useMemo } from 'react';
import type { TypingState } from '../../domain/typing/engine';
import { buildTarget, type TypingTarget } from '../../domain/typing/target';
import { usePagePause } from '../../hooks/usePagePause';
import { useTypingSession, type TypingMode } from '../../hooks/useTypingSession';
import type { Sentence } from '../../types';
import { HintButton } from './HintButton';
import { TypingSurface } from './TypingSurface';
import { GAP_ANCHOR_THRESHOLD, gapHiddenRatio } from '../../domain/training/mastery';

/** Every typed target kind across card training and snowball. */
export type TrainingTargetKind =
  | 'gap'
  | 'initial'
  | 'blind-card'
  | 'link'
  | 'segment';

export interface TypingUnitRunnerProps {
  sentences: readonly Sentence[];
  kind: TrainingTargetKind;
  onDone: (state: TypingState) => void;
  /** Called once on a blind-unit miss, after the session itself was reset. */
  onBlindMiss?: (state: TypingState) => void;
  /** Called when the page is hidden/blurred so callers can persist. */
  onCheckpoint?: () => void;
  /** Whole-card mastery used to scale the gap mask below the initial stage. */
  cardMastery?: number;
  /** Stable per-attempt seed; changes the gap positions without render jitter. */
  attemptVersion?: number;
  disabled?: boolean;
}

function sentenceStartIndex(target: TypingTarget, index: number): number {
  const sentenceIndex = target.sentenceBoundaries.findIndex((boundary) => index < boundary);
  return sentenceIndex <= 0 ? 0 : target.sentenceBoundaries[sentenceIndex - 1];
}

/**
 * Gap difficulty is driven by whole-card mastery: it hides about 25% at 0
 * mastery and about 60% at 100. Below 45 the first character remains the
 * anchor; from 45 onward it joins the shuffled candidates, so it may or may
 * not be hidden on a particular attempt. Punctuation is not part of the mask.
 * 单字句没有可保留锚点的第二字，退化为挖掉首字，保证单元可输入。
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function gapRevealedForSentence(length: number, cardMastery: number, attemptVersion: number, sentenceIndex: number): boolean[] {
  if (length <= 1) {
    return [false];
  }
  const hiddenCount = Math.max(
    1,
    Math.min(length - 1, Math.round(length * gapHiddenRatio(cardMastery))),
  );
  const mask = Array.from({ length }, () => true);
  const mastery = Math.max(0, Math.min(100, Math.round(cardMastery)));
  const candidates = Array.from(
    { length: mastery < GAP_ANCHOR_THRESHOLD ? length - 1 : length },
    (_, index) => index + (mastery < GAP_ANCHOR_THRESHOLD ? 1 : 0),
  );
  const seed = (
    Math.imul((attemptVersion + 1) >>> 0, 0x9e3779b1)
    ^ Math.imul(length + 1, 0x85ebca6b)
    ^ Math.imul(sentenceIndex + 1, 0xc2b2ae35)
  ) >>> 0;
  const random = seededRandom(seed);
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }
  for (const candidate of candidates.slice(0, hiddenCount)) {
    mask[candidate] = false;
  }
  return mask;
}

/**
 * Reveal masks per stage (architecture D4):
 * - 挖空: mastery-scaled blanks; below 45 the first character is the anchor,
 *   and at/above 45 it is shuffled like the other characters;
 * - 首字: the first character of each sentence is pre-revealed;
 * - all blind targets: everything hidden.
 */
export function revealedMaskFor(
  kind: TrainingTargetKind,
  target: TypingTarget,
  cardMastery = 0,
  attemptVersion = 0,
): boolean[] {
  if (kind === 'gap') {
    const mask: boolean[] = [];
    target.sentenceBoundaries.forEach((boundary, sentenceIndex) => {
      const start = sentenceIndex === 0 ? 0 : target.sentenceBoundaries[sentenceIndex - 1];
      mask.push(...gapRevealedForSentence(boundary - start, cardMastery, attemptVersion, sentenceIndex));
    });
    return mask;
  }
  if (kind === 'initial') {
    return target.chars.map((_, index) => index === sentenceStartIndex(target, index));
  }
  return target.chars.map(() => false);
}

export function typingModeFor(kind: TrainingTargetKind): TypingMode {
  if (kind === 'gap') return 'gap';
  if (kind === 'initial') return 'initial';
  return 'blind';
}

/** Blind targets are zero-error units: a miss resets only that unit. */
export function isBlindKind(kind: TrainingTargetKind): boolean {
  return kind === 'blind-card' || kind === 'link' || kind === 'segment';
}

/**
 * Owns one typing attempt over a target. The parent keys this component by the
 * unit's stable key so every new unit starts a fresh session, while a blind
 * miss resets the active session in place (feedback is kept for ~2s).
 */
export function TypingUnitRunner({
  sentences,
  kind,
  onDone,
  onBlindMiss,
  onCheckpoint,
  cardMastery = 0,
  attemptVersion = 0,
  disabled = false,
}: TypingUnitRunnerProps) {
  const target = useMemo(() => buildTarget(sentences), [sentences]);
  const initialRevealed = useMemo(
    () => revealedMaskFor(kind, target, cardMastery, attemptVersion),
    [kind, target, cardMastery, attemptVersion],
  );
  const mode = typingModeFor(kind);
  const isBlind = isBlindKind(kind);

  const session = useTypingSession({
    target,
    mode,
    initialRevealed,
    startPaused: true,
    trackPauses: true,
    onDone,
    onMiss: (_position, missedState) => {
      if (isBlind) {
        session.reset();
        onBlindMiss?.(missedState);
      }
    },
  });

  usePagePause({
    enabled: !session.state.done && !disabled,
    onPause: session.pause,
    onResume: session.resume,
    onCheckpoint,
  });

  return (
    <>
      <TypingSurface
        sentences={[...sentences]}
        state={session.state}
        feedback={session.feedback}
        onChar={session.handleChar}
        inputRef={session.inputRef}
        onInputFocus={session.resume}
        onInputBlur={session.pause}
        disabled={disabled}
      />
      {isBlind ? <HintButton enabled hint={session.hint} onRequestHint={session.requestHint} /> : null}
    </>
  );
}
