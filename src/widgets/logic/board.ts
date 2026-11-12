import type { StepFrame } from '../../lib/steps.ts';

export type Tone = 'focus' | 'ok' | 'bad' | 'warn' | 'muted';

/** A small labelled item inside a box: an event, message, row or key. */
export interface Chip {
  text: string;
  tone?: Tone;
  /** Small label shown before the text, such as an offset or a time. */
  tag?: string;
}

export interface Box {
  id: string;
  title: string;
  tone?: Tone;
  chips?: Chip[];
  /** Short facts below the chips; supports **bold** and `code`. */
  lines?: string[];
  /** Shown when there are no chips. */
  empty?: string;
}

export interface Link {
  label?: string;
  tone?: Tone;
}

/** Columns of boxes, left to right, with an arrow between neighbouring columns. */
export interface Board {
  columns: Box[][];
  links?: (Link | undefined)[];
}

export interface BoardFrame extends StepFrame {
  board: Board;
  tone?: 'ok' | 'warn' | 'error';
}

export interface Scenario {
  id: string;
  label: string;
  frames: () => BoardFrame[];
}

/** Collects frames by snapshotting `view()` after each change to a scenario's state. */
export function recorder(view: () => Board) {
  const frames: BoardFrame[] = [];
  return {
    frames,
    step(caption: string, extra: { tone?: BoardFrame['tone']; quick?: boolean } = {}) {
      // Scenarios mutate their state between steps, so each frame needs its own copy.
      frames.push({ caption, board: JSON.parse(JSON.stringify(view())) as Board, ...extra });
    },
  };
}

export const chips = (texts: readonly string[], tone?: Tone): Chip[] => texts.map((text) => ({ text, tone }));

export function findBox(board: Board, id: string): Box {
  const box = board.columns.flat().find((b) => b.id === id);
  if (!box) throw new Error(`No box ${id}`);
  return box;
}
