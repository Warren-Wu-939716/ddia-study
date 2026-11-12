import { useLiveQuery } from 'dexie-react-hooks';
import type { ComponentType } from 'react';
import { Link, useParams } from 'react-router';
import { Flip } from '../components/Flip.tsx';
import { getChapter, getLab, LABS } from '../content/index.ts';
import type { LabId } from '../content/types.ts';
import { db } from '../lib/db.ts';
import { CHALLENGES_BY_LAB } from '../sims/challenges.ts';
import { BloomLab } from '../sims/ui/BloomLab.tsx';
import { BrokerLab } from '../sims/ui/BrokerLab.tsx';
import { BTreeLab } from '../sims/ui/BTreeLab.tsx';
import { ColumnarLab } from '../sims/ui/ColumnarLab.tsx';
import { LsmLab } from '../sims/ui/LsmLab.tsx';
import { NotFound } from './NotFound.tsx';

const LAB_COMPONENTS: Record<LabId, ComponentType> = {
  lsm: LsmLab,
  bloom: BloomLab,
  btree: BTreeLab,
  columnar: ColumnarLab,
  broker: BrokerLab,
};

export function LabsPage() {
  const records = useLiveQuery(() => db.challenges.toArray(), []);
  const done = new Set((records ?? []).map((r) => r.challengeId));
  return (
    <div className="stack">
      <h1>Labs</h1>
      <p className="lead">Each lab is a small, faithful model of a mechanism from the book. Commit to a prediction, run it, then explain the result.</p>
      <div className="grid two">
        {LABS.map((lab) => {
          const challenges = CHALLENGES_BY_LAB[lab.id];
          const chapter = getChapter(lab.chapterId);
          const section = chapter?.sections.find((s) => s.id === lab.sectionId);
          return (
            <article key={lab.id} className="card">
              <h3>
                <Link to={`/labs/${lab.id}`}>{lab.title}</Link>
              </h3>
              <p>{lab.blurb}</p>
              <p className="muted small">
                Ch. {chapter?.number} · {section?.title} · {challenges.filter((c) => done.has(c.id)).length}/{challenges.length} challenges
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function LabPage() {
  const { labId } = useParams();
  const lab = getLab(labId);
  if (!lab) return <NotFound />;
  const chapter = getChapter(lab.chapterId);
  const section = chapter?.sections.find((s) => s.id === lab.sectionId);
  const Lab = LAB_COMPONENTS[lab.id];
  return (
    <div className="stack wide">
      <p className="eyebrow">
        <Link to="/labs">Labs</Link> · Ch. {chapter?.number} ·{' '}
        <Link to={`/chapters/${lab.chapterId}/sections/${lab.sectionId}`}>{section?.title}</Link> (pp. {section?.pages})
      </p>
      <h1>{lab.title}</h1>
      <p className="lead">{lab.blurb}</p>
      <Flip key={lab.id}>
        <Lab />
      </Flip>
    </div>
  );
}
