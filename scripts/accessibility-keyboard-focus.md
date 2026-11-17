# Keyboard and visible focus (17 Nov 2026)

Tuesday accessibility work for the learner and admin apps: tab order, visible `:focus-visible` rings, dialog focus return, and sticky-header scroll margin. Screen-reader labels, contrast, and launch scenarios are tracked on other plan days.

## What we verified

| Area | Status |
| --- | --- |
| Positive `tabIndex` on non-interactive wrappers | None found in learner or admin UI |
| Learner nav (`LearnerNav`) | `min-h-[48px]` links, `aria-current`, visible focus ring |
| Admin nav (`AdminNav`) | Same pattern plus sign-out |
| Practice setup, session (`OpenQuestion`) | Fieldsets, option labels with `has-[:focus-visible]:outline`, primary/secondary actions at 48px |
| End session (`EndSessionControl`) | Inline `alertdialog` with focus trap and return to trigger |
| Home dashboard action links | `focus-visible` on primary and quiet cards |
| Admin imports | Tab list with `role="tab"` / `tabpanel`; question detail modal returns focus to opener |
| Database backup / restore | Modal focus trap; job overlay traps focus until Close |
| Skip link | "Skip to main content" on signed-in learner and admin shells |

## Known limits (Developer Complete notes)

1. **No roving tabindex on learner nav** — five equal tabs; order matches visual left-to-right (mobile grid wraps in DOM order).
2. **Admin import tables** — sticky table headers keep filter controls in tab order while scrolling; focused rows may sit under the sticky nav until the user scrolls (`scroll-margin-top` on `:focus-visible` mitigates overlap with the page header).
3. **`window.confirm` on bulk delete** — native confirm for staged delete; focus behavior is browser-controlled (not customized).
4. **Question detail backdrop click** — closes the dialog and returns focus via `useDialogFocus`; backdrop is not a separate focus stop.
5. **Database job overlay while running** — focus is trapped with no dismiss until the job completes; intentional so operators do not miss in-progress backup/restore.
6. **Auth flows outside shell** — sign-in, register, and admin sign-in pages have no skip link (no sticky app nav on those routes).
7. **Automated coverage** — focus trap and return behavior are implemented in `useDialogFocus`; full keyboard walks remain manual or a later E2E pass.