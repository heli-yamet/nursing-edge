# Client message — Developer Complete (Wed 25 Nov 2026)

**Subject:** Nursing Edge — Developer Complete (25 November 2026)

---

Hi —

**Wednesday 25 November** is the **Developer Complete** milestone. This is not public launch and not a repeat of the security checkpoint. The build you have (or will deploy from the release commits below) is the handoff baseline for your publish, approve, and launch decisions.

## What is in the build

| Area | Delivered capability |
| --- | --- |
| **Learner** | Register and sign-in, Shopify or manual access, Terms and orientation, Home with Review outlook |
| **Practice** | Assignment, commit, six-state confidence, session Results, Progress accuracy and topic evidence |
| **Review** | Due Repair and Confirmation at **24h** and **72h**, session cap and ordering per v5.3 R3, physiology support skip, pre-commit player (no answer key before commit), post-commit rationales and teaching |
| **Results / Progress** | Session and clinical-only counts; eight-topic evidence; change evidence rules |
| **Admin** | Content Imports (upload, publish, pause, delete staged), **Links** Approve/Ban, **Teaching** Approve/Ban, eligibility summary, question detail and usage, Overview, Learners and Review Trace, Learning Evidence, Audit, pseudonymous learner export, Super Admin Database backup/restore |
| **Integrations** | Shopify payment webhook (unit-tested); production env confirmed by you 9 Nov |
| **Ops** | MongoDB naming and backup/restore runbooks; Gates 26–27 closed 13 Nov |

**Release anchors (Mon 23 Nov track):**

| App | Commit |
| --- | --- |
| Learner (`nursing-edge`) | `e1d0444` — 24h Repair, 72h Confirmation, 14-day Review window |
| Admin (`nursing-edge-admin`) | `6e5eac7` (baseline; no Monday code change) |
| Status (`nursing-edge-status`) | Changelog **0.0.35** with this milestone |

## Final test run (Wed 25 Nov)

```text
cd nursing-edge
npm test
→ 53 files, 417 passed, 0 failed (Vitest 3.2.4, ~11s)
```

Repair/Confirmation delay invariants and launch scenario suites are green on **24h / 72h**. Workbook integration tests ran on this machine with R7 workbooks present; CI or laptops without workbooks may skip five import-related suites (documented in the handoff test report).

## Handoff package (open in repo)

Folder: [`nursing-edge/scripts/developer-complete-handoff/`](./developer-complete-handoff/README.md)

Includes eligibility (2,000 MVP gate), test report, Shopify proof, accessibility notes, security checklist, restore proof, redacted export sample, and known limits.

## What you approve **after** Developer Complete (your action in admin)

1. **Publish** staged R7 clinical-core versions until **Content Imports** shows `mvp_eligible` ≥ **2,000** (`launch_gate_met` true). Import and staging are done; launch stops below 2,000 eligible published MCQ/SATA questions.
2. **Approve** directed **Links** when you want Confirmation to consider fresh alternates (until then, Review serves the **original** question at the same due time).
3. **Approve** **Teaching** revisions when you want approved pre-commit teaching and **Interview** content in Review (unapproved teaching stays invisible to Interview).
4. Optional: **staging walkthrough** (document 05 scenarios) and **390px** layout spot-check per accessibility notes.
5. Optional: repeat **Shopify** revoke/restore on the live store if you want a fresh transcript beyond the 13 Nov sign-off.

We do **not** approve imported links or teaching in production on your behalf.

## Known limits at handoff (summary)

- Links and teaching from workbooks remain **null approval**; alternates and Interview follow admin decisions.
- Document 05 end-to-end on deployed staging was **not** manually exercised; evidence is unit tests plus [`launch-scenarios.md`](./launch-scenarios.md).
- Live Shopify revoke/restore transcript not included in this package (13 Nov confirmation stands).
- Last automated restore drill **passed** 12 Nov; production restores use **Super Admin → Database** (Blob).

## What remains before public launch

Developer Complete ≠ launch. After publish and your link/teaching approvals, your team still owns go-live timing, marketing, and any final staging QA you want.

Status site changelog **0.0.35** records this milestone.

Thanks,  
Charles