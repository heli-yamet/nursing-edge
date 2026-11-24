# Developer Complete handoff package (Tue 24 Nov 2026)

Open this folder for the **Wednesday 25 Nov** Developer Complete gate. It consolidates eligibility, test, Shopify, accessibility, security, restore, sample export, and known limits. No secrets belong here or in git.

**Milestone:** Developer Complete is **25 Nov**, not public launch. Imported **links** and **teaching** remain unapproved until the client acts in admin after this package lands.

## Index

| Artifact | File |
| --- | --- |
| Eligibility and launch gate (2,000 MVP) | [eligibility-report.md](./eligibility-report.md) |
| Unit test report (24 Nov run) | [test-report-2026-11-24.md](./test-report-2026-11-24.md) |
| Shopify webhook proof | [shopify-proof.md](./shopify-proof.md) |
| Accessibility (keyboard, screen reader, mobile) | [accessibility.md](./accessibility.md) |
| Security Gates 26–27 | [security-checklist.md](./security-checklist.md) |
| Backup / restore proof | [restore-proof.md](./restore-proof.md) |
| Sample pseudonymous learner export | [learner-export-sample.example.json](./learner-export-sample.example.json) |
| Known limits at handoff | [known-limits.md](./known-limits.md) |

## Related runbooks (parent `scripts/`)

- [launch-scenarios.md](../launch-scenarios.md) — eight launch threads and 20–23 Nov test history
- [release-walkthrough-2026-11-23.md](../release-walkthrough-2026-11-23.md) — release commit anchor
- [security-checkpoint.md](../security-checkpoint.md) — full Gate 26–27 tables (closed 13 Nov)
- [mongodb-backup.md](../mongodb-backup.md) / [mongodb-restore.md](../mongodb-restore.md) — Admin Blob ops
- [client-update-draft-2026-11-20.md](../client-update-draft-2026-11-20.md) — draft client message (update Wed)

## Client actions after Developer Complete

1. **Publish** staged R7 question versions to reach `mvp_eligible` ≥ 2,000 (see eligibility doc).
2. **Approve** directed links and pre-commit / Review teaching rows in admin when ready.
3. Optional: **staging walkthrough** (document 05) and **390px** spot-check per accessibility notes.
4. Optional: repeat **Shopify** revoke/restore on the live store if ops wants fresh proof beyond the 13 Nov sign-off.