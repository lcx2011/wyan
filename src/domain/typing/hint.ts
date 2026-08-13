import type { TypingState } from './engine';

export interface HintState {
  text: string;
  shownAt: number;
  expiresAt: number;
}

function sentenceStart(target: TypingState['target'], cursor: number): number {
  const sentenceIndex = target.sentenceBoundaries.findIndex((boundary) => cursor < boundary);
  return sentenceIndex <= 0 ? 0 : target.sentenceBoundaries[sentenceIndex - 1];
}

/** Returns transient display data; it never reveals or advances any input slot. */
export function showHint(state: TypingState, now: number, durationMs: number): HintState {
  const start = state.done ? state.target.chars.length : sentenceStart(state.target, state.cursor);
  const end = state.done ? start : state.target.sentenceBoundaries.find((boundary) => start < boundary) ?? start;
  return {
    text: state.target.chars.slice(start, Math.min(start + 2, end)).join(''),
    shownAt: now,
    expiresAt: now + Math.max(0, durationMs),
  };
}

/** The UI can poll this pure predicate instead of placing a timer in the domain. */
export function isHintVisible(hint: HintState, now: number): boolean {
  return now >= hint.shownAt && now < hint.expiresAt;
}
