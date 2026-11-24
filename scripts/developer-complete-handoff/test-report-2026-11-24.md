# Test report — Tue 24 Nov 2026

Command (local):

```bash
cd nursing-edge
npm test
```

| Metric | Result |
| --- | --- |
| Runner | Vitest 3.2.4 |
| Test files | **53 passed** |
| Tests | **417 passed**, **0 failed** |
| Duration | ~12s (machine-dependent) |

## History vs this run

| Date | Passed | Failed | Notes |
| --- | ---: | ---: | --- |
| 20 Nov | 405 | 7 | 2 × `invariants.test.ts` short delays; 5 × workbook skips when xlsx absent |
| 23 Nov | 417 | 0 | Repair **24h**, Confirmation **72h** in `review-rules.ts` |
| **24 Nov** | **417** | **0** | Full green on this machine with R7 workbooks under `Workbooks_10_24` |

## Environment skips (CI or laptops without workbooks)

These suites use `describe.skipIf` / `it.skipIf` when workbook paths from `src/lib/fixtures/workbook-paths.ts` are missing:

- `relationship-import.test.ts`
- `relationship-import-volume.test.ts`
- `c2-parse.test.ts`
- `workbooks-10-24.test.ts`
- (and related import volume cases)

On **this** 24 Nov run, workbook integration tests **ran and passed** (including large import volume and C2 parse smoke).

## Launch-critical suites (all green 24 Nov)

Includes: `learner-account.test.ts`, `shopify-webhook.test.ts`, `security-checkpoint.test.ts`, `player-question.test.ts`, `player-load.test.ts`, `route-auth.test.ts`, `commit-answer.test.ts`, `review-session.test.ts`, `invariants.test.ts`, `launch-scenarios.test.ts`, `database-backup.test.ts`, `admin-audit.test.ts`, `accessibility-screen-reader.test.ts`.

## Optional typecheck

```bash
npx tsc --noEmit
```

Not re-run for this handoff note; security checkpoint (13 Nov) recorded it as part of the gate habit.