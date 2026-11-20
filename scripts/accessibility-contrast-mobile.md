# Contrast, touch targets, and narrow viewports (19 Nov 2026)

Thursday accessibility work: WCAG contrast on the teal and navy palette, confidence and six-state cues that do not rely on color alone, `min-h-[48px]` on primary learner and critical admin actions, and a ~390px layout review without running dev servers. Keyboard notes: [accessibility-keyboard-focus.md](./accessibility-keyboard-focus.md). Screen reader notes: [accessibility-screen-reader.md](./accessibility-screen-reader.md).

## Palette contrast (computed on white `#FFFFFF`)

| Foreground | Ratio | Notes |
| --- | ---: | --- |
| `#163A59` (navy headings, body emphasis) | 11.77 | Primary text |
| `#24313A` (body) | 13.33 | Body and alerts that use navy ink |
| `#08666C` (dark teal links on white) | 6.71 | Preferred for text links on white |
| `#0B7F86` (brand teal on white) | 4.78 | Passes normal text; use for buttons and large UI |
| `#0B7F86` on `#E8F5F5` (selected mint) | 4.28 | Below 4.5:1 — active nav uses `#08666C` text on mint (6.01:1) |
| `#9B2C2C` (errors) | 7.53 | Learner and admin `role="alert"` messages |
| `#8C3A3A` (admin destructive labels) | 7.2+ | Approve / ban affordances |
| `#5C6B74` (secondary labels) | 5.51 | Section eyebrows and meta on white |
| `#66727A` (muted uppercase) | 4.94 | Borderline at `text-xs`; prefer `#5C6B74` for small caps |

Primary buttons (`#0B7F86` background, white label) are ~4.78:1 on the fill — acceptable for large controls per v5.1.

## Non-color-only confidence and six-state

| Area | Requirement | Status |
| --- | --- | --- |
| Pre-commit confidence (`OpenQuestion`) | Visible legend, radio labels **Unsure / Sure / Confident**, plus meaning line per choice | Text + border/weight on selection (not color alone) |
| Post-commit result header | **Correct** or **Incorrect** heading; icon decorative (`aria-hidden`) | Text carries outcome |
| Confidence on result card | **Confidence:** prefix with word label | Not color-only |
| Six-state interpretation | Frozen sentences from `six-state-copy.ts` (`InterpretationLines`) | Text-only copy |
| Progress bar | `role="progressbar"` with `aria-valuetext` | Not sighted-only |

**Implementation (code):** `OpenQuestion.tsx` — `choiceClass` uses checked weight and `#08666C` border; `confidenceClass` uses inset border on selection; selected confidence title is semibold; errors use `#9B2C2C`; narrow layout uses `min-w-0`, `break-words`, full-width actions.

## 48px touch targets

| Area | Status |
| --- | --- |
| Learner: submit, next, save/exit, end session, nav, practice setup, baseline choice, review start | `min-h-[48px]` on primary/secondary actions |
| `OpenQuestion` answer rows and confidence tiles | 48px+ (confidence tiles `min-h-[72px]`) |
| Admin: import upload actions, approve/ban, audit/apply, database backup/restore | 48px |
| `ContentImportForm` file input | `file:min-h-[48px]` on the choose-file control |
| `FilterMenu` (import table filters) | Raise trigger and menu options to **48px** (was 32px / `py-2`) |
| `QuestionJump` in teaching/link tables | Raise to **48px** min height for touch |

## Narrow viewport (~390px) markup review

Reviewed at component level (no browser automation; apps stay stopped).

| Screen | Checks |
| --- | --- |
| Practice setup (`PracticeSetupForm`) | Full-width primary button; option stack; `min-h-[48px]` radios |
| Practice / Review question (`OpenQuestion`) | `flex-col-reverse` action stack — primary submit on top on mobile; `w-full` buttons; add `min-w-0 max-w-full` on article and `break-words` on stem and option text |
| Review commit | Same `OpenQuestion` layout |
| Baseline (`BaselineChoice`) | Stacked full-width buttons |
| Admin content import (`ContentImportForm`) | `flex-wrap` on upload buttons; file control full width |
| Commit failure copy | `role="alert"`; align learner errors with `#9B2C2C` where still `#24313A` (`OpenQuestion`, `ReviewInterview`) |

## Code touched (19 Nov)

| File | Change |
| --- | --- |
| `nursing-edge/src/components/OpenQuestion.tsx` | Contrast, selection cues, mobile wrapping, alert styling |
| `nursing-edge/src/components/ReviewInterview.tsx` | Alert color |
| `nursing-edge-admin/src/components/FilterMenu.tsx` | 48px trigger and options |
| `nursing-edge-admin/src/components/TeachingApprovalTable.tsx`, `LinkApprovalTable.tsx` | 48px `QuestionJump` |
| `nursing-edge-admin/src/components/ContentImportForm.tsx` | Secondary button `#08666C` |
| `nursing-edge/src/components/BaselineChoice.tsx` | Secondary button `#08666C` |

## Known limits (Developer Complete notes)

1. **Decorative outcome tint** — Correct/incorrect result bands use green/red backgrounds; outcome is duplicated in the `h2` text.
2. **Progress fill** — Teal bar is supplementary to the “Question X of Y” text and `aria-valuetext`.
3. **Disabled primary buttons** — `disabled:opacity-60` lowers contrast while inactive; expected.
4. **Admin monospace question IDs** — Jump links may wrap on very narrow widths; acceptable for operator tables.
5. **No visual regression or browser contrast audit in CI** — ratios above were computed offline; spot-check in staging if the client requests a packaged audit.

## Handoff checklist (Thu)

- [x] Code changes above in repo
- [x] Status changelog 0.0.32 (2026-11-19) in nursing-edge-status
- [x] `npm test` in `nursing-edge` — workbook import suites skipped locally when xlsx absent; unrelated failures only
- [ ] Manual spot-check at 390px width on staging when available (Practice submit, Review commit, import upload)
- [x] Fri launch scenarios and changelog 0.0.33 (2026-11-20) — see nursing-edge/scripts/launch-scenarios.md