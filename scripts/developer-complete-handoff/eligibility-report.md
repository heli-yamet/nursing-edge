# Eligibility report

## Launch rule

Practice MVP requires **`mvp_eligible` ≥ 2,000** published versions. Below that threshold, launch stops even if content is imported.

Constant: `LAUNCH_ELIGIBLE_MINIMUM` = **2000** in `src/lib/eligibility-report.ts`.

## Where operators see live counts

**Admin → Content Imports** loads `GET /api/admin/content-imports`. The JSON field **`eligibility`** is `buildEligibilityReport(versions, reservedIds, practiceBarredIds)`.

| Field | Meaning |
| --- | --- |
| `imported` | All stored question versions |
| `published` | Versions with `publication_status === "PUBLISHED"` |
| `mvp_eligible` | Published, active, valid, complete **MCQ or SATA**, not calibration-reserved, not practice-barred |
| `calibration_reserved` | Versions on the active calibration blueprint or calibration membership |
| `unavailable_invalid` | Imported minus MVP-eligible minus calibration-reserved (staged, incomplete, barred roles, etc.) |
| `unsupported_interaction` | Non-MCQ/SATA formats |
| `launch_eligible_minimum` | Always 2000 |
| `launch_gate_met` | `mvp_eligible >= 2000` |

Practice pool selection uses the same rules via `listEligibleVersions` and `practiceBarredVersionIds()` (sibling + AP roles).

## Content release shape (NE-CONTENT-R7-TU33)

After a full R7 bank upload and role staging, expect roughly:

| Runtime role | Versions | Practice |
| --- | ---: | --- |
| `CLINICAL_CORE` | 2,004 | Eligible when published and complete |
| `CLINICAL_SIBLING_RESERVED` | 500 | Barred from Practice |
| `AP_REINFORCEMENT` | 450 | Barred from Practice |
| Calibration workbook | 35 | Barred; separate v5.1 Calibration flow |

**Handoff database note:** Counts on staging/production reflect what is imported, published, and reserved on that MongoDB. This package does not snapshot a live `mvp_eligible` number (no DB credentials in git). Operators read the admin summary after publish batches.

## Automated checks

`src/tests/eligibility-report.test.ts` (13 cases) covers empty bank, staged vs published, unsupported formats, calibration reservation, and practice-barred roles.

## Gate for Wed 25 Nov

Document **`launch_gate_met`** from admin after the client's intended publish set, or state explicitly that publish is still pending. Developer Complete code path is ready; **launch** still needs ≥ 2,000 MVP-eligible published questions.