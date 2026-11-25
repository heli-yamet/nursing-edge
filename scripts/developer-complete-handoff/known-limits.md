# Known limits at Developer Complete handoff

**Date:** **Wed 25 Nov 2026** (Developer Complete gate closed).

## Content and Review routing

1. **Directed links** — Workbooks ship 599 `TRANSFER_LINKS` with `approval` null and `LINK_ELIGIBILITY.runtime_eligible` 0 / `PENDING_EXACT_DEPENDENCY_APPROVAL`. Until the client **Approves** links in admin, Confirmation serves the **original** question at the same due time (no fresh alternate).
2. **Review teaching** — Imported teaching rows are staged; **Approve** in admin is required before approved pre-commit teaching and Interview content participate in routing. **Interview** does not surface for unapproved teaching revisions (`selectReviewInterview` / teaching decision state).
3. **Physiology support** — Support links are mostly candidate-not-approved in workbooks; AP items do not own Review cycles. Supports appear only when links are approved and gates pass.
4. **Publish vs import** — R7 is staged in the bank; **`mvp_eligible`** counts only **published** MCQ/SATA clinical-core versions. Launch needs **≥ 2,000** (see [eligibility-report.md](./eligibility-report.md)).

## Timing and policy

5. **Repair / Confirmation delays** — Production values are **24 hours** and **72 hours** (`review-rules.ts`) since **Mon 23 Nov**. Second-scale test delays are **not** in effect.
6. **Review active window** — 14 days with 24h expiry-near band (`clock.ts`).

## Staging and human QA

7. **Document 05 end-to-end** — Not manually run on deployed staging; automated scenario table in [launch-scenarios.md](../launch-scenarios.md) plus 23–24 Nov unit evidence.
8. **390px spot-check** — Not performed (Practice submit, Review commit, admin import). See [accessibility.md](./accessibility.md).
9. **Accessibility** — No full keyboard or screen-reader walk on staging; partial unit coverage only.

## Integrations and ops

10. **Shopify live proof** — Client confirmed production webhooks **13 Nov**; no new revoke/restore transcript in this package ([shopify-proof.md](./shopify-proof.md)).
11. **Restore** — Last automated **passed** drill **12 Nov**; production restores are operator-driven via Blob ([restore-proof.md](./restore-proof.md)).
12. **Status changelog** — **0.0.35** (25 Nov Developer Complete) in `nursing-edge-status/src/lib/changelog.ts`; deploy status with learner release as needed.

## CI / developer machines

13. **Workbook tests** — Five import-related suites skip when R7/C2 `.xlsx` files are absent locally; CI must mount workbooks or accept skips. This machine ran **417/417** with workbooks present (24 Nov).

## Explicitly not in scope for Developer Complete

- Public launch
- Client approval of links/teaching (client action after 25 Nov)
- Turning on `runtime_eligible` links without client approval