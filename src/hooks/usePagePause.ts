import { useEffect, useRef } from 'react';

export interface UsePagePauseOptions {
  /** Whether the lifecycle watcher is active (e.g. an active typing session). */
  enabled: boolean;
  /** Called when the document is hidden or the window loses focus. */
  onPause: () => void;
  /** Called when the document becomes visible again. */
  onResume: () => void;
  /** Called together with onPause so callers can persist a checkpoint. */
  onCheckpoint?: () => void;
}

/**
 * Pauses an active typing session whenever the page is hidden or blurred and
 * resumes it when the document becomes visible again. Resuming never forces
 * focus back onto the input so the system keyboard stays out of the way.
 */
export function usePagePause({ enabled, onPause, onResume, onCheckpoint }: UsePagePauseOptions): void {
  const handlersRef = useRef({ onPause, onResume, onCheckpoint });
  handlersRef.current = { onPause, onResume, onCheckpoint };

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handlersRef.current.onPause();
        handlersRef.current.onCheckpoint?.();
      } else {
        handlersRef.current.onResume();
      }
    };
    const handleBlur = () => {
      handlersRef.current.onPause();
      handlersRef.current.onCheckpoint?.();
    };
    const handleFocus = () => {
      if (!document.hidden) {
        handlersRef.current.onResume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled]);
}
