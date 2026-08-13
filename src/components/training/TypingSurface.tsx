import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Box, Typography } from '@mui/material';
import type { TypingState } from '../../domain/typing/engine';
import type { TypingFeedback } from '../../hooks/useTypingSession';
import type { Sentence } from '../../types';

export interface TypingSurfaceProps {
  sentences: Sentence[];
  state: TypingState;
  feedback: TypingFeedback | null;
  onChar: (char: string) => void;
  inputRef?: RefObject<HTMLInputElement>;
  onInputFocus?: () => void;
  onInputBlur?: () => void;
  disabled?: boolean;
  /** Review retrieval mode: do not disclose the target's character count. */
  concealUnrevealed?: boolean;
}

const HIDDEN_PLACEHOLDER = '＿';

/**
 * 共享打字面板：保留真实可聚焦 input 以唤起 iOS 系统键盘；桌面键盘走
 * keydown 快速路径，移动端走 input。组合输入期间不判题。
 */
export function TypingSurface({
  sentences,
  state,
  feedback,
  onChar,
  inputRef,
  onInputFocus,
  onInputBlur,
  disabled = false,
  concealUnrevealed = false,
}: TypingSurfaceProps) {
  const sentenceById = useMemo(() => new Map(sentences.map((s) => [s.id, s])), [sentences]);
  const localInputRef = useRef<HTMLInputElement>(null);
  const effectiveInputRef = inputRef ?? localInputRef;
  const composingRef = useRef(false);

  useEffect(() => {
    if (feedback?.kind !== 'miss') {
      return;
    }
    try {
      navigator.vibrate?.(80);
    } catch {
      // Vibration is only an enhancement; the visual alert is primary.
    }
  }, [feedback]);

  // 桌面快速路径；preventDefault 后不会再触发 input，避免同一按键被提交两次。
  useEffect(() => {
    if (disabled) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (composingRef.current || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        return;
      }
      if (event.key.length === 1 && /[a-zA-Z]/.test(event.key)) {
        event.preventDefault();
        onChar(event.key.toLowerCase());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, onChar]);

  useEffect(() => {
    if (!disabled) {
      effectiveInputRef.current?.focus({ preventScroll: true });
    }
  }, [disabled, effectiveInputRef]);

  const handleMobileInput = (value: string) => {
    if (disabled || composingRef.current) return;
    for (const character of Array.from(value)) {
      if (/^[a-zA-Z]$/.test(character)) onChar(character.toLowerCase());
    }
  };

  return (
    <Box component="section" aria-label="盲打输入区" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        role="presentation"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'baseline',
          gap: 0.25,
          fontSize: '1.6rem',
          lineHeight: 1.8,
          letterSpacing: '0.08em',
          minHeight: '2.9rem',
        }}
      >
        {state.target.chars.map((char, index) => {
          const position = state.target.positions[index];
          const revealed = state.revealed[index];
          const hint = sentenceById.get(position.sentenceId)?.pinyin;
          if (concealUnrevealed && !revealed) return null;
          return (
            <Box key={`${position.sentenceId}:${position.charIndex}`} component="span" sx={{ display: 'inline-flex' }}>
              <Box
                component="span"
                title={revealed ? undefined : hint}
                sx={{
                  minWidth: '1em',
                  textAlign: 'center',
                  fontWeight: revealed ? 700 : 400,
                  color: revealed ? 'text.primary' : 'text.disabled',
                }}
              >
                {revealed ? char : HIDDEN_PLACEHOLDER}
              </Box>
              {state.target.puncts[index] !== '' ? (
                <Box component="span" sx={{ color: revealed ? 'text.primary' : 'text.disabled' }}>
                  {revealed ? state.target.puncts[index] : ''}
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        使用英文键盘输入拼音首字母
      </Typography>

      <Box
        component="input"
        ref={effectiveInputRef}
        aria-label="首字母输入"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder="点这里唤起键盘"
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        onCompositionStart={() => {
          composingRef.current = true;
          onInputBlur?.();
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          event.currentTarget.value = '';
          onInputFocus?.();
        }}
        onInput={(event) => {
          const value = event.currentTarget.value;
          event.currentTarget.value = '';
          handleMobileInput(value);
        }}
        sx={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          color: 'text.primary',
          fontSize: '16px',
          lineHeight: 1.5,
          px: 2,
          py: 1.25,
          textAlign: 'center',
          outline: 'none',
          '&:focus': { borderColor: 'primary.main', boxShadow: '0 0 0 2px rgba(255,112,67,0.15)' },
        }}
      />

      {feedback !== null ? (
        <Box
          role="alert"
          sx={{
            textAlign: 'center',
            color: feedback.kind === 'miss' ? 'error.main' : 'warning.main',
            minHeight: '1.5em',
          }}
        >
          <Typography variant="body2" component="span">
            {feedback.message}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}
