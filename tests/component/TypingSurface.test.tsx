import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HintButton } from '../../src/components/training/HintButton';
import { TrainingHeader } from '../../src/components/training/TrainingHeader';
import { TypingSurface } from '../../src/components/training/TypingSurface';
import { acceptedInitials } from '../../src/domain/typing/pinyin';
import { buildTarget } from '../../src/domain/typing/target';
import { useTypingSession, type TypingMode } from '../../src/hooks/useTypingSession';
import type { Sentence } from '../../src/types';

function sentence(text: string, id = 'sentence:one'): Sentence {
  return { id, text, meaning: '', acceptedInitials: acceptedInitials(text) };
}

function TypingHarness({
  text,
  mode = 'initial',
  hintEnabled = false,
}: {
  text: string;
  mode?: TypingMode;
  hintEnabled?: boolean;
}) {
  const sentences = useMemo(() => [sentence(text)], [text]);
  const target = useMemo(() => buildTarget(sentences), [sentences]);
  const session = useTypingSession({ target, mode });
  return (
    <div>
      <TrainingHeader title="测试篇目" subtitle="第 1 段 · 第 1 卡" />
      <TypingSurface
        sentences={sentences}
        state={session.state}
        feedback={session.feedback}
        onChar={session.handleChar}
      />
      {hintEnabled ? <HintButton enabled hint={session.hint} onRequestHint={session.requestHint} /> : null}
    </div>
  );
}

describe('TypingSurface', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('advances characters from first-letter key presses captured on the window', () => {
    render(<TypingHarness text="学而时习之。" />);

    // 学 = xue → first letter 'x'
    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByText('学')).toBeVisible();

    // 而 = er → wrong first letter 'z' should miss and show feedback
    fireEvent.keyDown(window, { key: 'z' });
    expect(screen.getByRole('alert')).toHaveTextContent('期待“而”');
  });

  it('reveals the next character on a correct key press without requiring any focused input', () => {
    render(<TypingHarness text="学而时习之。" />);

    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByText('学')).toBeVisible();
    expect(screen.queryByText('而')).not.toBeInTheDocument();
  });

  it('accepts mobile input events through the real keyboard input', () => {
    render(<TypingHarness text="学而" />);

    fireEvent.input(screen.getByRole('textbox', { name: '首字母输入' }), { target: { value: 'x' } });
    expect(screen.getByText('学')).toBeVisible();
  });

  it('does not judge intermediate IME composition text', () => {
    render(<TypingHarness text="学而" />);
    const input = screen.getByRole('textbox', { name: '首字母输入' });

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: 'x' } });
    expect(screen.queryByText('学')).not.toBeInTheDocument();
    fireEvent.compositionEnd(input);
    fireEvent.input(input, { target: { value: 'x' } });
    expect(screen.getByText('学')).toBeVisible();
  });

  it('hides the hint after 2500ms without advancing the typing cursor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    render(<TypingHarness text="学而时习之。" hintEnabled />);

    const hintButton = screen.getByRole('button', { name: '提示' });
    act(() => {
      fireEvent.click(hintButton);
    });

    expect(screen.getByText('学而')).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByText('学而')).not.toBeInTheDocument();
    // The hint must never reveal or advance input slots.
    expect(screen.queryByText('学')).not.toBeInTheDocument();
  });

  it('does not render the hint button in Boss mode', () => {
    render(<HintButton enabled={false} hint={null} onRequestHint={() => undefined} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
