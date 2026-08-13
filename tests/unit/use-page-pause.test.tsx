import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePagePause, type UsePagePauseOptions } from '../../src/hooks/usePagePause';

function Probe(props: UsePagePauseOptions) {
  usePagePause(props);
  return null;
}

function setDocumentHidden(value: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, value });
}

afterEach(() => {
  setDocumentHidden(false);
});

it('does not register lifecycle behavior while disabled', () => {
  const onPause = vi.fn();
  const onResume = vi.fn();
  const onCheckpoint = vi.fn();
  render(<Probe enabled={false} {...{ onPause, onResume, onCheckpoint }} />);

  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));

  expect(onPause).not.toHaveBeenCalled();
  expect(onResume).not.toHaveBeenCalled();
  expect(onCheckpoint).not.toHaveBeenCalled();
});

it('pauses, checkpoints, resumes, uses current callbacks, and cleans up listeners', () => {
  const initialPause = vi.fn();
  const initialResume = vi.fn();
  const initialCheckpoint = vi.fn();
  const view = render(
    <Probe enabled onPause={initialPause} onResume={initialResume} onCheckpoint={initialCheckpoint} />,
  );

  setDocumentHidden(true);
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  expect(initialPause).toHaveBeenCalledOnce();
  expect(initialCheckpoint).toHaveBeenCalledOnce();
  expect(initialResume).not.toHaveBeenCalled();

  setDocumentHidden(false);
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
  expect(initialPause).toHaveBeenCalledTimes(2);
  expect(initialCheckpoint).toHaveBeenCalledTimes(2);
  expect(initialResume).toHaveBeenCalledTimes(2);

  const nextPause = vi.fn();
  const nextResume = vi.fn();
  view.rerender(<Probe enabled onPause={nextPause} onResume={nextResume} />);
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
  expect(nextPause).toHaveBeenCalledOnce();
  expect(nextResume).toHaveBeenCalledOnce();

  view.unmount();
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
  expect(nextPause).toHaveBeenCalledOnce();
  expect(nextResume).toHaveBeenCalledOnce();
});
