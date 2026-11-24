# Mobile and accessibility notes

Developer Complete references three runbooks written during the week of 16 Nov. Automated partial coverage lives in `accessibility-screen-reader.test.ts` and player pre-commit tests.

## Documents

| Topic | File |
| --- | --- |
| Keyboard, focus, dialogs, 48px targets | [accessibility-keyboard-focus.md](../accessibility-keyboard-focus.md) |
| Labels, live regions, pre-commit safety | [accessibility-screen-reader.md](../accessibility-screen-reader.md) |
| Contrast, narrow layout, 48px on admin filters | [accessibility-contrast-mobile.md](../accessibility-contrast-mobile.md) |

## Status changelog (status site)

Accessibility shipped across **0.0.30–0.0.32** (`nursing-edge-status`); launch scenario gate **0.0.33** (20 Nov). Monday delay reset **0.0.34** when committed.

## Handoff verification level

| Level | Status |
| --- | --- |
| Code + unit tests | Done |
| Full keyboard / SR walk on staging | Optional client request |
| 390px spot-check (Practice submit, Review commit, import upload) | **Not run** — listed in contrast-mobile handoff checklist |

## Cross-links

Each runbook ends with **Known limits (Developer Complete notes)**; consolidated product limits also appear in [known-limits.md](./known-limits.md).