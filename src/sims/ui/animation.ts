/** Delay between animation steps; zero when the user prefers reduced motion. */
export function stepDelay(ms: number): number {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 0 : ms;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
