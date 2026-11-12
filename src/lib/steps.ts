/** One step of a visualization: a snapshot to render plus a caption explaining what just happened. */
export interface StepFrame {
  caption: string;
  /** Routine steps (e.g. scanning past a non-match) play faster. */
  quick?: boolean;
}
