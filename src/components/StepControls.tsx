import type { ReactNode } from 'react';
import { setStepPrefs, useStepPrefs, type StepSpeed } from '../lib/stepPrefs.ts';
import type { StepFrame } from '../lib/steps.ts';
import type { Stepper } from '../lib/useStepper.ts';
import { RichText } from './RichText.tsx';

interface StepControlsProps<F extends StepFrame> {
  stepper: Stepper<F>;
  /** Shown (as the status line) when no sequence is loaded. */
  idle: ReactNode;
  /** Colours the caption, e.g. for the final outcome of a sequence. */
  tone?: 'ok' | 'warn' | 'error';
}

/** Caption for the current step plus back / next / play controls. */
export function StepControls<F extends StepFrame>({ stepper, idle, tone }: StepControlsProps<F>) {
  const prefs = useStepPrefs();
  const { frames, frame, index, playing } = stepper;

  if (!frame) {
    return (
      <p className="widget-status" role="status">
        {idle}
      </p>
    );
  }

  return (
    <div className={`step-player ${tone ?? ''}`}>
      <div className="step-caption" role="status">
        <span className="step-count">
          Step {index + 1} of {frames.length}
        </span>
        <RichText text={frame.caption} inline />
      </div>
      <div className="step-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / frames.length) * 100}%` }} />
      </div>
      <div className="step-buttons">
        <button onClick={stepper.first} disabled={stepper.atStart} aria-label="First step" title="First step">
          ⏮
        </button>
        <button onClick={stepper.prev} disabled={stepper.atStart}>
          ◀ back
        </button>
        <button className="primary" onClick={stepper.next} disabled={stepper.atEnd}>
          next ▶
        </button>
        <button onClick={stepper.togglePlay} disabled={frames.length < 2}>
          {playing ? 'pause' : stepper.atEnd ? 'replay' : 'play'}
        </button>
        <button onClick={stepper.last} disabled={stepper.atEnd} aria-label="Skip to the end" title="Skip to the end">
          ⏭
        </button>
        <span className="step-prefs">
          <label className="check">
            <input type="checkbox" checked={prefs.autoplay} onChange={(e) => setStepPrefs({ autoplay: e.target.checked })} />
            auto-play
          </label>
          <select aria-label="Playback speed" value={prefs.speed} onChange={(e) => setStepPrefs({ speed: e.target.value as StepSpeed })}>
            <option value="slow">slow</option>
            <option value="normal">normal</option>
            <option value="fast">fast</option>
          </select>
        </span>
      </div>
    </div>
  );
}
