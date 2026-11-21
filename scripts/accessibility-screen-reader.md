# Screen reader labels and pre-commit safety (18 Nov 2026)

Wednesday accessibility work: page titles, roles and labels, polite announcements after commit, commit and draft errors, and confirmation that pre-commit player payloads omit answer keys and rationales. Keyboard and focus notes live in [accessibility-keyboard-focus.md](./accessibility-keyboard-focus.md). Contrast and mobile layout notes live in [accessibility-contrast-mobile.md](./accessibility-contrast-mobile.md).

## What we verified

| Area | Status |
| --- | --- |
| Document titles | Learner routes use `metadata.title` with `"%s · Nursing Edge"`; admin routes use per-page titles with `"%s · Admin · Nursing Edge"`. |
| In-app headings | Each learner journey and admin screen exposes a visible `h1` aligned with the document title. |
| Learner nav | `aria-label="Learner"`, `aria-current="page"` on the active route. |
| Admin nav | Same pattern with `aria-label="Admin"`. |
| MCQ / SATA (`OpenQuestion`) | Answer choices in a `fieldset` with a screen-reader-only legend; confidence in a second `fieldset` with visible legend and text labels (not color-only). |
| Review support skip | Button label is the frozen copy: "Continue without this physiology question". |
| End session | `EndSessionControl` uses `role="alertdialog"` with labelled title and description. |
| Commit errors | `role="alert"` on submit, draft, and end-session failure messages. |
| Post-commit announcement | A screen-reader-only `aria-live="polite"` region speaks outcome and confidence only (`revealLiveSummary`); the result card does not use `aria-live`, so rationales are not auto-read in bulk. |
| Optional Review interview | Section labelled "Before you answer (optional)"; method feedback uses a polite live region. |
| Admin import tables | Column `FilterMenu` controls expose `aria-label`; row checkboxes and detail buttons are named. |
| Audit and learning evidence filters | Filter sections use `aria-labelledby`; Apply buttons have discernible names. |
| Pre-commit API / DOM | `loadOpenPlayerQuestion` uses `playerQuestionMongoProjection` and `toPreCommitQuestion` only before commit; tests in `player-question.test.ts` and `player-load.test.ts`. |

## Known limits (Developer Complete notes)

1. **Post-commit exploration** — Learners reach rationales and teaching by reading the result card or expanding "See deeper explanation"; only the short outcome line is announced automatically.
2. **Held feedback on reload** — When the server restores an in-progress reveal, the polite region may repeat the outcome summary on mount.
3. **Admin table headers** — Sticky headers keep filter menus in the tab order while scrolling; see keyboard notes for overlap with the page header.
4. **Automated coverage** — Live-region and label checks are partly unit-tested (`accessibility-screen-reader.test.ts`, player payload tests); suites live in `nursing-edge/src/tests/` (local/CI only; path is in `.gitignore`). Full screen-reader walks remain manual or a later E2E pass.