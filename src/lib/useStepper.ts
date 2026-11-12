import { useEffect, useState } from 'react';
import { getStepPrefs, STEP_SPEED_MS, useStepPrefs } from './stepPrefs.ts';
import type { StepFrame } from './steps.ts';

export interface Stepper<F extends StepFrame> {
  frames: readonly F[];
  index: number;
  frame: F | undefined;
  playing: boolean;
  atStart: boolean;
  atEnd: boolean;
  /** Replaces the current sequence and shows its first frame (auto-playing if enabled). */
  start(frames: readonly F[]): void;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  togglePlay(): void;
  clear(): void;
}

/** Playback state for a sequence of frames: manual stepping plus optional auto-play. */
export function useStepper<F extends StepFrame>(): Stepper<F> {
  const { speed } = useStepPrefs();
  const [frames, setFrames] = useState<readonly F[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const atEnd = index >= frames.length - 1;

  useEffect(() => {
    if (!playing || atEnd) return;
    const delay = STEP_SPEED_MS[speed] * (frames[index]?.quick ? 0.3 : 1);
    const timer = window.setTimeout(() => {
      setIndex(index + 1);
      if (index + 1 >= frames.length - 1) setPlaying(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, atEnd, index, frames, speed]);

  return {
    frames,
    index,
    frame: frames[index],
    playing,
    atStart: index === 0,
    atEnd,
    start(next) {
      setFrames(next);
      setIndex(0);
      setPlaying(getStepPrefs().autoplay && next.length > 1);
    },
    next() {
      setPlaying(false);
      setIndex((i) => Math.min(i + 1, frames.length - 1));
    },
    prev() {
      setPlaying(false);
      setIndex((i) => Math.max(i - 1, 0));
    },
    first() {
      setPlaying(false);
      setIndex(0);
    },
    last() {
      setPlaying(false);
      setIndex(Math.max(0, frames.length - 1));
    },
    togglePlay() {
      if (atEnd) {
        setIndex(0);
        setPlaying(frames.length > 1);
      } else {
        setPlaying((p) => !p);
      }
    },
    clear() {
      setFrames([]);
      setIndex(0);
      setPlaying(false);
    },
  };
}
