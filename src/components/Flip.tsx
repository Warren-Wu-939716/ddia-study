import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { GHOST_ATTR, measure, motionAllowed, runFlip } from '../lib/flip.ts';
import { getStepPrefs, STEP_SPEED_MS } from '../lib/stepPrefs.ts';

const isGhost = (node: Node) => node instanceof Element && node.hasAttribute(GHOST_ATTR);

/** Transition length scales with the chosen playback speed so a step finishes before the next one. */
const duration = () => Math.min(700, Math.max(220, STEP_SPEED_MS[getStepPrefs().speed] * 0.3));

/**
 * Animates every change to the `[data-flip]` elements inside it: elements with the same
 * `data-flip` id glide to their new place (even into another box), new copies fly out of
 * existing ones, removed ones fade or shrink into their destination, and changed values pulse.
 * It watches the DOM, so it works around any visualizer without changes to its state handling.
 */
export function Flip({ children, className }: { children: ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const layer = layerRef.current;
    if (!root || !content || !layer || !motionAllowed()) return;

    const live = { prev: measure(root, content), running: [] as Animation[] };
    const settle = () => {
      live.running.forEach((a) => a.cancel());
      live.running = [];
    };

    const observer = new MutationObserver((records) => {
      const relevant = records.some((r) =>
        r.type === 'childList' ? [...r.addedNodes, ...r.removedNodes].some((n) => !isGhost(n)) : !isGhost(r.target),
      );
      if (!relevant) return;
      settle();
      const result = runFlip(root, content, layer, live.prev, { duration: duration() });
      live.prev = result.next;
      live.running = result.animations;
    });
    observer.observe(content, { subtree: true, childList: true, characterData: true, attributes: true });

    // Layout can shift without any DOM change (resizing, fonts loading); re-measure so the next move starts from the right place.
    const resize = new ResizeObserver(() => {
      if (live.running.every((a) => a.playState === 'finished')) live.prev = measure(root, content);
    });
    resize.observe(content);

    return () => {
      observer.disconnect();
      resize.disconnect();
      settle();
    };
  }, []);

  return (
    <div ref={rootRef} className={`flip-root ${className ?? ''}`}>
      <div ref={contentRef} className="flip-content">
        {children}
      </div>
      <div ref={layerRef} className="flip-layer" aria-hidden="true" />
    </div>
  );
}
