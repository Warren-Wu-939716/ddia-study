import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';

const LINKS = [
  { to: '/', label: 'Today', end: true },
  { to: '/session', label: 'Review' },
  { to: '/chapters', label: 'Chapters' },
  { to: '/labs', label: 'Labs' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container row between">
          <NavLink to="/" className="brand" end>
            DDIA<span>Study</span>
          </NavLink>
          <nav aria-label="Main">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="container">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="container muted small site-footer">
        Lessons and study notes are original explanations; page numbers refer to <em>Designing Data-Intensive Applications</em>, 2nd ed. Progress
        is stored only in this browser.
      </footer>
    </>
  );
}
