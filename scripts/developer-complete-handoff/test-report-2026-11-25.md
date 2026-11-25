# Test report — Wed 25 Nov 2026 (Developer Complete gate)

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
| Duration | ~11s (machine-dependent) |
| Release commit | `e1d0444` (learner); final gate run on current tree |

## Gate checklist

| Check | Status |
| --- | --- |
| `invariants.test.ts` with 24h / 72h delays | Green |
| `launch-scenarios.test.ts` | Green |
| `review-outlook.test.ts` (14d window / expiry-near) | Green |
| Security / player / route-auth launch suites | Green |

## CI / workbook note

When R7/C2 `.xlsx` paths are absent, up to five import-related suites skip via `describe.skipIf` (see [test-report-2026-11-24.md](./test-report-2026-11-24.md)). This **25 Nov** run had workbooks present: **417/417** with no skips.

## Prior runs

| Date | Passed | Failed |
| --- | ---: | ---: |
| 20 Nov | 405 | 7 |
| 23–24 Nov | 417 | 0 |
| **25 Nov** | **417** | **0** |