import { lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { ChaptersPage } from './pages/ChaptersPage.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { PretestPage } from './pages/PretestPage.tsx';
import { ScenariosPage } from './pages/ScenariosPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SynthesisPage } from './pages/SynthesisPage.tsx';

// Widgets, simulators and challenge text are the bulk of the bundle, so the pages using them load on demand.
const ChapterPage = lazy(() => import('./pages/ChapterPage.tsx').then((m) => ({ default: m.ChapterPage })));
const SessionPage = lazy(() => import('./pages/SessionPage.tsx').then((m) => ({ default: m.SessionPage })));
const SectionPage = lazy(() => import('./pages/SectionPage.tsx').then((m) => ({ default: m.SectionPage })));
const LabsPage = lazy(() => import('./pages/LabsPage.tsx').then((m) => ({ default: m.LabsPage })));
const LabPage = lazy(() => import('./pages/LabsPage.tsx').then((m) => ({ default: m.LabPage })));

/** Hash routing keeps the app a pure static bundle that works from any host or file server. */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="session" element={<SessionPage />} />
          <Route path="chapters" element={<ChaptersPage />} />
          <Route path="chapters/:chapterId" element={<ChapterPage />} />
          <Route path="chapters/:chapterId/pretest" element={<PretestPage />} />
          <Route path="chapters/:chapterId/sections/:sectionId" element={<SectionPage />} />
          <Route path="chapters/:chapterId/synthesis" element={<SynthesisPage />} />
          <Route path="chapters/:chapterId/scenarios" element={<ScenariosPage />} />
          <Route path="labs" element={<LabsPage />} />
          <Route path="labs/:labId" element={<LabPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
