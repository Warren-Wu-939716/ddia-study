# DDIA Study

A frontend-only study companion for *Designing Data-Intensive Applications* (2nd edition), built around retrieval practice, spaced repetition and interactive simulators. Chapter 4 (Storage and Retrieval) is implemented; the structure is ready for more chapters.

## Setup

Requires Node.js 22+.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit + component tests (Vitest)
npm run build      # static bundle in dist/ (open from any static host)
npm run lint       # oxlint
```

All progress lives in your browser’s IndexedDB. Use **Settings → Export backup** regularly; clearing site data deletes it. The app asks the browser to keep its storage persistent, but Safari may still delete it after about 7 days without a visit.

## Deploy to GitHub Pages

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) lints, tests, builds and publishes `dist/` on every push to `main` (or run it manually from the **Actions** tab).

1. Push this folder to the `main` branch of a GitHub repo (public, unless your account has Pages for private repos).
2. In the repo, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
3. The site is served at `https://<user>.github.io/<repo>/`.

The site is static: each visitor’s progress stays in their own browser and nothing is sent to a server.

## How to study a chapter

1. **Pretest** — guess answers before studying.
2. **Section loop** — work through the section’s lesson (explanations, diagrams, quick checks; the book pages are listed as optional further reading), hide it, write a checkpoint from memory, then tick the key points you actually covered. Saving unlocks that section’s cards.
3. **Daily session** — interleaved FSRS reviews (answer → confidence → reveal → self-grade), one deep task, a short reflection.
4. **Labs** — predict what an LSM-tree, Bloom filter, B-tree or column store will do, then run it.
5. **Synthesis** — trade-off matrices, teach-back explanations, and design scenarios.

## Project layout

```
src/
  content/        chapter content (original notes; page refs only) + registry
    ch04/         sections, concepts, cards, exercises
  lib/            Dexie DB, FSRS scheduler, queue, mastery, backup, progress
  sims/           pure simulator engines (lsm, btree, bloom, columnar) + challenges
    ui/           lab React components
  components/     ReviewCard, RecallExercise, ConceptMap, TradeoffQuiz, …
  pages/          routed screens
```

## Adding a chapter

1. Create `src/content/chNN/` following `ch04/` (sections → lessons → concepts → cards → exercises).
2. Register it in `CHAPTERS` in `src/content/index.ts`.
3. Run `npm test` — `content.test.ts` checks ids, references, acyclic prerequisites and card coverage.

Write content in your own words and cite printed page numbers; don’t paste book text. The PDF is git-ignored.
