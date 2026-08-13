import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  handleInput,
  initTyping,
  pauseTyping,
  resetTyping,
  resumeTyping,
  tickTimeout,
  type TypingState,
} from '../domain/typing/engine';
import { showHint, type HintState } from '../domain/typing/hint';
import type { TypingPosition, TypingTarget } from '../domain/typing/target';

/** Training modes shared by every typed exercise. */
export type TypingMode = 'gap' | 'initial' | 'blind' | 'exam';

/** Transient feedback a controller can render while the attempt continues. */
export interface TypingFeedback {
  kind: 'miss' | 'timeout';
  position: TypingPosition;
  message: string;
  at: number;
}

export interface UseTypingSessionOptions {
  target: TypingTarget;
  mode: TypingMode;
  /** Pre-revealed slots (e.g. 挖空/首字 masks); defaults to all hidden. */
  initialRevealed?: readonly boolean[];
  /** 等待真实输入控件获得焦点后再启动计时。 */
  startPaused?: boolean;
  trackPauses?: boolean;
  onDone?: (state: TypingState) => void;
  onMiss?: (position: TypingPosition, state: TypingState) => void;
  onTimeout?: (position: TypingPosition, state: TypingState) => void;
}

export interface TypingSession {
  state: TypingState;
  feedback: TypingFeedback | null;
  hint: HintState | null;
  inputRef: RefObject<HTMLInputElement>;
  handleChar: (char: string) => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;
  requestHint: () => void;
  clearFeedback: () => void;
}

export const HINT_DURATION_MS = 2_500;
export const TICK_INTERVAL_MS = 500;
const FEEDBACK_DURATION_MS = 2_000;

/**
 * Owns one typing attempt over a flattened target and exposes it to the view.
 * All wall-clock decisions stay inside the pure engine; this hook only wires
 * Date.now() into handleInput/tickTimeout and translates events into feedback.
 */
export function useTypingSession({
  target,
  mode,
  initialRevealed,
  startPaused = false,
  trackPauses = false,
  onDone,
  onMiss,
  onTimeout,
}: UseTypingSessionOptions): TypingSession {
  const [state, setState] = useState<TypingState>(() => {
    const now = Date.now();
    const initial = initTyping(target, { now, initialRevealed });
    return startPaused ? pauseTyping(initial, now) : initial;
  });
  const [feedback, setFeedback] = useState<TypingFeedback | null>(null);
  const [hint, setHint] = useState<HintState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stateRef = useRef(state);
  const targetRef = useRef(target);
  const initialRevealedRef = useRef(initialRevealed);
  const modeRef = useRef(mode);
  const trackPausesRef = useRef(trackPauses);
  const optionsRef = useRef({ onDone, onMiss, onTimeout });
  const feedbackTimerRef = useRef<number | null>(null);

  stateRef.current = state;
  targetRef.current = target;
  initialRevealedRef.current = initialRevealed;
  modeRef.current = mode;
  trackPausesRef.current = trackPauses;
  optionsRef.current = { onDone, onMiss, onTimeout };

  const scheduleFeedbackClear = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackTimerRef.current = null;
      setFeedback(null);
    }, FEEDBACK_DURATION_MS);
  }, []);

  const clearFeedback = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setFeedback(null);
  }, []);

  // Monotonic pause detection: any hidden/blurred page must not accrue timeouts.
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = stateRef.current;
      // Exam pauses are reported to the user; training pauses are retained in
      // the typing state for mastery scoring without blocking completion.
      if ((!trackPausesRef.current && modeRef.current !== 'exam') || current.paused || current.done) {
        return;
      }
      const result = tickTimeout(current, Date.now());
      if (result.state === current) {
        return;
      }
      stateRef.current = result.state;
      setState(result.state);
      if (result.event === 'timeout' && result.position !== undefined && modeRef.current === 'exam') {
        setFeedback({
          kind: 'timeout',
          position: result.position,
          message: `停顿：期待“${result.position.expectedChar}”`,
          at: Date.now(),
        });
        scheduleFeedbackClear();
        optionsRef.current.onTimeout?.(result.position, result.state);
      }
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [scheduleFeedbackClear]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
    },
    []
  );

  const handleChar = useCallback(
    (char: string) => {
      const current = stateRef.current;
      const result = handleInput(current, char, Date.now());
      if (result.state === current) {
        return;
      }
      stateRef.current = result.state;
      setState(result.state);
      if (result.event === 'miss' && result.position !== undefined) {
        setFeedback({
          kind: 'miss',
          position: result.position,
          message: `期待“${result.position.expectedChar}”`,
          at: Date.now(),
        });
        scheduleFeedbackClear();
        optionsRef.current.onMiss?.(result.position, result.state);
      } else if (result.event === 'hit' || result.event === 'done') {
        clearFeedback();
      }
      if (result.event === 'done') {
        setHint(null);
        optionsRef.current.onDone?.(result.state);
      }
    },
    [clearFeedback, scheduleFeedbackClear]
  );

  /**
   * Restarts the attempt from scratch. Feedback is deliberately kept so a
   * blind-unit reset can still show which position was missed while the user
   * retypes; callers that need a clean slate use clearFeedback().
   */
  const reset = useCallback(() => {
    const wasPaused = stateRef.current.paused;
    const now = Date.now();
    const next = resetTyping(targetRef.current, {
      now,
      initialRevealed: initialRevealedRef.current,
    });
    const resetState = wasPaused ? pauseTyping(next, now) : next;
    stateRef.current = resetState;
    setState(resetState);
    setHint(null);
  }, []);

  const pause = useCallback(() => {
    const next = pauseTyping(stateRef.current, Date.now());
    if (next === stateRef.current) {
      return;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const resume = useCallback(() => {
    const next = resumeTyping(stateRef.current, Date.now());
    if (next === stateRef.current) {
      return;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const requestHint = useCallback(() => {
    if (modeRef.current === 'exam') {
      return;
    }
    setHint(showHint(stateRef.current, Date.now(), HINT_DURATION_MS));
  }, []);

  return {
    state,
    feedback,
    hint,
    inputRef,
    handleChar,
    reset,
    pause,
    resume,
    requestHint,
    clearFeedback,
  };
}
