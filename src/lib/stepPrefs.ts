import { useSyncExternalStore } from 'react';

export type StepSpeed = 'slow' | 'normal' | 'fast';

export interface StepPrefs {
  autoplay: boolean;
  speed: StepSpeed;
}

export const STEP_SPEED_MS: Record<StepSpeed, number> = { slow: 2600, normal: 1500, fast: 750 };

const STORAGE_KEY = 'ddia-study:step-prefs';
const DEFAULTS: StepPrefs = { autoplay: true, speed: 'normal' };
const SPEEDS: readonly StepSpeed[] = ['slow', 'normal', 'fast'];

function load(): StepPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<StepPrefs>;
    return {
      autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : DEFAULTS.autoplay,
      speed: parsed.speed && SPEEDS.includes(parsed.speed) ? parsed.speed : DEFAULTS.speed,
    };
  } catch {
    return DEFAULTS;
  }
}

let current: StepPrefs = load();
const listeners = new Set<() => void>();

export function getStepPrefs(): StepPrefs {
  return current;
}

/** Shared by every step player in the app and remembered between visits. */
export function setStepPrefs(patch: Partial<StepPrefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage can be unavailable (private mode); the preference still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStepPrefs(): StepPrefs {
  return useSyncExternalStore(subscribe, getStepPrefs, getStepPrefs);
}
