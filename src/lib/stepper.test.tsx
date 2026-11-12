import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepControls } from '../components/StepControls.tsx';
import { getStepPrefs, setStepPrefs, STEP_SPEED_MS } from './stepPrefs.ts';
import type { StepFrame } from './steps.ts';
import { useStepper, type Stepper } from './useStepper.ts';

const FRAMES: StepFrame[] = [{ caption: 'first' }, { caption: 'second', quick: true }, { caption: 'third' }];

describe('useStepper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setStepPrefs({ autoplay: true, speed: 'normal' });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-plays to the last frame, shortening quick frames, then stops', () => {
    const { result } = renderHook(() => useStepper<StepFrame>());
    act(() => result.current.start(FRAMES));
    expect(result.current).toMatchObject({ index: 0, playing: true, atStart: true });
    act(() => vi.advanceTimersByTime(STEP_SPEED_MS.normal));
    expect(result.current.index).toBe(1);
    act(() => vi.advanceTimersByTime(STEP_SPEED_MS.normal * 0.3));
    expect(result.current).toMatchObject({ index: 2, playing: false, atEnd: true });
  });

  it('waits for the user when auto-play is off, and clamps manual steps', () => {
    setStepPrefs({ autoplay: false });
    const { result } = renderHook(() => useStepper<StepFrame>());
    act(() => result.current.start(FRAMES));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toMatchObject({ index: 0, playing: false });
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.last());
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
    act(() => result.current.togglePlay());
    expect(result.current).toMatchObject({ index: 0, playing: true });
    act(() => result.current.clear());
    expect(result.current.frame).toBeUndefined();
  });

  it('pauses when the user steps manually', () => {
    const { result } = renderHook(() => useStepper<StepFrame>());
    act(() => result.current.start(FRAMES));
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 1, playing: false });
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.index).toBe(1);
  });
});

function Harness({ onReady }: { onReady: (stepper: Stepper<StepFrame>) => void }) {
  const stepper = useStepper<StepFrame>();
  onReady(stepper);
  return <StepControls stepper={stepper} idle="nothing yet" />;
}

describe('StepControls', () => {
  beforeEach(() => setStepPrefs({ autoplay: false, speed: 'normal' }));

  it('shows the idle text, then the step caption and working controls', async () => {
    const user = userEvent.setup();
    let stepper: Stepper<StepFrame> | undefined;
    render(<Harness onReady={(s) => (stepper = s)} />);
    expect(screen.getByRole('status')).toHaveTextContent('nothing yet');
    act(() => stepper!.start(FRAMES));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3first');
    expect(screen.getByRole('button', { name: '◀ back' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'next ▶' }));
    expect(screen.getByRole('status')).toHaveTextContent('second');
    await user.click(screen.getByRole('button', { name: 'Skip to the end' }));
    expect(screen.getByRole('status')).toHaveTextContent('Step 3 of 3third');
    expect(screen.getByRole('button', { name: 'replay' })).toBeEnabled();
  });

  it('remembers the auto-play and speed preferences', async () => {
    const user = userEvent.setup();
    let stepper: Stepper<StepFrame> | undefined;
    render(<Harness onReady={(s) => (stepper = s)} />);
    act(() => stepper!.start(FRAMES));
    await user.click(screen.getByRole('checkbox', { name: 'auto-play' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Playback speed' }), 'fast');
    expect(getStepPrefs()).toEqual({ autoplay: true, speed: 'fast' });
    expect(JSON.parse(localStorage.getItem('ddia-study:step-prefs') ?? '{}')).toEqual({ autoplay: true, speed: 'fast' });
  });
});
