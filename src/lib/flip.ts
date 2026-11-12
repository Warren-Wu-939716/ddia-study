import { planFlip, type FlipItem, type Rect } from './flipPlan.ts';

/** Styles copied onto clones so they still look right outside their original containers. */
const COPIED_STYLES = [
  'color',
  'background-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'box-shadow',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration-line',
  'white-space',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'opacity',
] as const;

interface Measured extends FlipItem {
  el: Element;
  /** Copied styles for HTML elements; SVG elements are animated in place instead. */
  style?: string;
  svg?: SVGSVGElement | null;
}

export interface FlipOptions {
  duration: number;
}

const EASE = 'cubic-bezier(0.2, 0.75, 0.25, 1)';
/** Marks temporary SVG ghosts, which live inside the observed content. */
export const GHOST_ATTR = 'data-flip-ghost';
const isSvg = (el: Element): el is SVGGraphicsElement => el instanceof SVGElement;

function relative(r: DOMRect, origin: DOMRect): Rect {
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
}

function copyStyle(el: Element): string {
  const cs = getComputedStyle(el);
  return COPIED_STYLES.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
}

/** Measures every `[data-flip]` element (and `[data-flip-anchor]` container) under `content`, relative to `root`. */
export function measure(root: Element, content: Element): Measured[] {
  const origin = root.getBoundingClientRect();
  return [...content.querySelectorAll('[data-flip], [data-flip-anchor]')].flatMap((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return [];
    const anchor = !el.hasAttribute('data-flip');
    const svg = isSvg(el);
    return [
      {
        id: (anchor ? el.getAttribute('data-flip-anchor') : el.getAttribute('data-flip')) ?? '',
        rect: relative(r, origin),
        text: anchor ? '' : `${(el.textContent ?? '').trim().slice(0, 200)}|${el.getAttribute('data-flip-state') ?? ''}`,
        key: el,
        from: el.getAttribute('data-flip-from') ?? undefined,
        to: el.getAttribute('data-flip-to') ?? undefined,
        anchor,
        el,
        style: svg || anchor ? undefined : copyStyle(el),
        svg: svg ? (el as SVGGraphicsElement).ownerSVGElement : undefined,
      },
    ];
  });
}

function placeClone(layer: HTMLElement, source: Element, rect: Rect, style: string): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute(
    'style',
    `${style};position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;margin:0;box-sizing:border-box;pointer-events:none;transform-origin:0 0;`,
  );
  layer.appendChild(clone);
  return clone;
}

/** Screen pixels per SVG user unit, so pixel offsets can be applied as SVG transforms. */
function svgScale(svg: SVGSVGElement | null | undefined): [number, number] {
  const m = svg?.getScreenCTM();
  return m && m.a && m.d ? [m.a, m.d] : [1, 1];
}

/** Transform that makes a box at `to` look like it sits at `from`. */
const inverse = (from: Rect, to: Rect) =>
  `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${to.w ? from.w / to.w : 1}, ${to.h ? from.h / to.h : 1})`;

/**
 * Animates from the previous measurement to the current DOM and returns the new measurement.
 * Moves and fly-ins use clones in `layer` (HTML) or transforms in place (SVG).
 */
export function runFlip(
  root: HTMLElement,
  content: HTMLElement,
  layer: HTMLElement,
  prev: readonly Measured[],
  options: FlipOptions,
): { next: Measured[]; animations: Animation[] } {
  const next = measure(root, content);
  const plan = planFlip(prev, next);
  const animations: Animation[] = [];
  const timing = (order: number): KeyframeAnimationOptions => ({
    duration: options.duration,
    delay: Math.min(order * 25, options.duration * 0.4),
    easing: EASE,
    fill: 'backwards',
  });
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3b4cca';
  let order = 0;

  const fly = (item: Measured, from: Rect, fade: boolean) => {
    const t = timing(order++);
    if (isSvg(item.el)) {
      const [sx, sy] = svgScale(item.svg);
      const dx = (from.x + from.w / 2 - (item.rect.x + item.rect.w / 2)) / sx;
      const dy = (from.y + from.h / 2 - (item.rect.y + item.rect.h / 2)) / sy;
      // `translate` composes with an element's own transform attribute instead of replacing it.
      animations.push(item.el.animate([{ translate: `${dx}px ${dy}px`, opacity: fade ? 0.3 : 1 }, { translate: '0px 0px', opacity: 1 }], t));
      return;
    }
    const clone = placeClone(layer, item.el, item.rect, item.style ?? '');
    const flight = clone.animate([{ transform: inverse(from, item.rect), opacity: fade ? 0.5 : 1 }, { transform: 'none', opacity: 1 }], t);
    // The real element waits, invisible, until its clone lands on it.
    animations.push(flight, item.el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: t.duration, delay: t.delay, fill: 'backwards' }));
    flight.finished.then(
      () => clone.remove(),
      () => clone.remove(),
    );
  };

  for (const action of plan) {
    if (action.type === 'move') {
      fly(next[action.next], action.from, false);
    } else if (action.type === 'enter') {
      const item = next[action.next];
      if (action.from) {
        fly(item, action.from, true);
      } else {
        const keyframes = isSvg(item.el)
          ? [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1' }]
          : [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }];
        animations.push(item.el.animate(keyframes, timing(order++)));
      }
    } else if (action.type === 'pulse') {
      const item = next[action.next];
      const keyframes = isSvg(item.el)
        ? [{ scale: '1.25' }, { scale: '1' }]
        : [{ outline: `3px solid ${accent}`, outlineOffset: '1px' }, { outline: '3px solid transparent', outlineOffset: '1px' }];
      animations.push(item.el.animate(keyframes, { duration: options.duration * 1.6, easing: 'ease-out' }));
    } else {
      const item = prev[action.prev];
      const exitFrames = (to: Rect | undefined) =>
        to ? [{ transform: 'none', opacity: 1 }, { transform: inverse(to, item.rect), opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.8)' }];
      if (isSvg(item.el)) {
        if (!item.svg?.isConnected) continue;
        const ghost = item.el.cloneNode(true) as SVGGraphicsElement;
        ghost.removeAttribute('data-flip');
        ghost.querySelectorAll('[data-flip]').forEach((n) => n.removeAttribute('data-flip'));
        // Wrap it so it can be shifted back to where it was, whatever transforms its old parents had.
        const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrapper.setAttribute('aria-hidden', 'true');
        wrapper.setAttribute(GHOST_ATTR, '');
        wrapper.style.pointerEvents = 'none';
        wrapper.appendChild(ghost);
        item.svg.appendChild(wrapper);
        const now = relative(ghost.getBoundingClientRect(), root.getBoundingClientRect());
        const [sx, sy] = svgScale(item.svg);
        wrapper.setAttribute('transform', `translate(${(item.rect.x - now.x) / sx} ${(item.rect.y - now.y) / sy})`);
        const fade = wrapper.animate([{ opacity: 1 }, { opacity: 0 }], { duration: options.duration, easing: EASE, fill: 'forwards' });
        animations.push(fade);
        fade.finished.then(
          () => wrapper.remove(),
          () => wrapper.remove(),
        );
        continue;
      }
      const ghost = placeClone(layer, item.el, item.rect, item.style ?? '');
      const fade = ghost.animate(exitFrames(action.to), { duration: options.duration, easing: EASE, fill: 'forwards' });
      animations.push(fade);
      fade.finished.then(
        () => ghost.remove(),
        () => ghost.remove(),
      );
    }
  }
  return { next, animations };
}

/** True when the browser can animate and the user hasn't asked for reduced motion. */
export function motionAllowed(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Element !== 'undefined' &&
    typeof Element.prototype.animate === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}
