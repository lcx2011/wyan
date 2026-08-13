import { clonePosition, cloneTarget, type TypingPosition, type TypingTarget } from './target';

export const TIMEOUT_MS = 3_000;

export type TypingEvent = 'hit' | 'miss' | 'done' | 'ignored' | 'timeout';

export interface InitTypingOptions {
  now: number;
  initialRevealed?: readonly boolean[];
}

export interface TypingState {
  target: TypingTarget;
  revealed: boolean[];
  cursor: number;
  wrongPositions: TypingPosition[];
  wrongCountByPosition: Record<string, number>;
  timeoutPositions: TypingPosition[];
  lastActiveAt: number;
  /** The last wall-clock time folded into elapsedMs while the attempt was active. */
  lastElapsedAt: number;
  startedAt: number;
  elapsedMs: number;
  paused: boolean;
  done: boolean;
}

export interface TypingResult {
  event: TypingEvent;
  state: TypingState;
  position?: TypingPosition;
}

function firstHidden(revealed: readonly boolean[]): number {
  return revealed.findIndex((isRevealed) => !isRevealed);
}

function positionKey(position: TypingPosition): string {
  return `${position.sentenceId}:${position.charIndex}`;
}

function includesPosition(positions: readonly TypingPosition[], position: TypingPosition): boolean {
  const key = positionKey(position);
  return positions.some((candidate) => positionKey(candidate) === key);
}

function copyState(state: TypingState): TypingState {
  return {
    ...state,
    target: cloneTarget(state.target),
    revealed: [...state.revealed],
    wrongPositions: state.wrongPositions.map(clonePosition),
    wrongCountByPosition: { ...state.wrongCountByPosition },
    timeoutPositions: state.timeoutPositions.map(clonePosition),
  };
}

function logicalNow(state: TypingState, now: number): number {
  return Math.max(state.lastActiveAt, state.lastElapsedAt, now);
}

function addElapsed(state: TypingState, now: number): TypingState {
  const transitionNow = logicalNow(state, now);
  const copied = copyState(state);
  return {
    ...copied,
    elapsedMs: copied.elapsedMs + transitionNow - copied.lastElapsedAt,
    lastElapsedAt: transitionNow,
  };
}

function currentPosition(state: TypingState): TypingPosition | undefined {
  return state.target.positions[state.cursor];
}

function ignored(state: TypingState): TypingResult {
  return { event: 'ignored', state };
}

/** Creates a fresh immutable-state attempt for a supplied flattened target. */
export function initTyping(target: TypingTarget, options: InitTypingOptions): TypingState {
  const attemptTarget = cloneTarget(target);
  const revealed = attemptTarget.chars.map((_, index) => options.initialRevealed?.[index] === true);
  const cursor = firstHidden(revealed);
  return {
    target: attemptTarget,
    revealed,
    cursor: cursor === -1 ? attemptTarget.chars.length : cursor,
    wrongPositions: [],
    wrongCountByPosition: {},
    timeoutPositions: [],
    lastActiveAt: options.now,
    lastElapsedAt: options.now,
    startedAt: options.now,
    elapsedMs: 0,
    paused: false,
    done: cursor === -1,
  };
}

/** Alias used by controllers when a blind-input unit has to start over. */
export function resetTyping(target: TypingTarget, options: InitTypingOptions): TypingState {
  return initTyping(target, options);
}

/**
 * Processes exactly one physical input character. Invalid input is deliberately
 * not activity, while a valid miss resets the pause timer and preserves cursor.
 */
export function handleInput(state: TypingState, key: string, now: number): TypingResult {
  if (state.paused || state.done || !/^[A-Za-z]$/.test(key)) {
    return ignored(state);
  }

  const activeState = addElapsed(state, now);
  const position = currentPosition(activeState)!;
  const durablePosition = clonePosition(position);
  const transitionNow = activeState.lastElapsedAt;

  const normalizedKey = key.toLowerCase();
  const accepted = activeState.target.acceptedInitials[activeState.cursor];
  if (!accepted.includes(normalizedKey)) {
    const keyAtPosition = positionKey(durablePosition);
    return {
      event: 'miss',
      position: clonePosition(durablePosition),
      state: {
        ...activeState,
        wrongPositions: includesPosition(activeState.wrongPositions, durablePosition)
          ? activeState.wrongPositions
          : [...activeState.wrongPositions, durablePosition],
        wrongCountByPosition: {
          ...activeState.wrongCountByPosition,
          [keyAtPosition]: (activeState.wrongCountByPosition[keyAtPosition] ?? 0) + 1,
        },
        lastActiveAt: transitionNow,
      },
    };
  }

  const revealed = activeState.revealed.map((isRevealed, index) =>
    index === activeState.cursor ? true : isRevealed
  );
  const nextCursor = firstHidden(revealed);
  const done = nextCursor === -1;
  const nextState: TypingState = {
    ...activeState,
    revealed,
    cursor: done ? activeState.target.chars.length : nextCursor,
    lastActiveAt: transitionNow,
    done,
  };
  return { event: done ? 'done' : 'hit', state: nextState, position: clonePosition(durablePosition) };
}

/** Records the three-second pause once for the current durable target position. */
export function tickTimeout(state: TypingState, now: number): TypingResult {
  if (state.paused || state.done) {
    return ignored(state);
  }

  const activeState = addElapsed(state, now);
  const position = currentPosition(activeState)!;
  const transitionNow = activeState.lastElapsedAt;
  if (transitionNow - activeState.lastActiveAt < TIMEOUT_MS || includesPosition(activeState.timeoutPositions, position)) {
    return ignored(activeState);
  }
  return {
    event: 'timeout',
    position: clonePosition(position),
    state: {
      ...activeState,
      timeoutPositions: [...activeState.timeoutPositions, clonePosition(position)],
      lastActiveAt: transitionNow,
    },
  };
}

/** Stops wall-clock accounting after including all active time preceding the pause. */
export function pauseTyping(state: TypingState, now: number): TypingState {
  if (state.paused || state.done) {
    return state;
  }
  return { ...addElapsed(state, now), paused: true };
}

/** Restarts both active-time and timeout windows, excluding the paused interval. */
export function resumeTyping(state: TypingState, now: number): TypingState {
  if (!state.paused || state.done) {
    return state;
  }
  const transitionNow = logicalNow(state, now);
  return { ...copyState(state), paused: false, lastActiveAt: transitionNow, lastElapsedAt: transitionNow };
}
