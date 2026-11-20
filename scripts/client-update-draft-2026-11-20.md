# Client update draft — Fri 20 Nov 2026

**Subject:** Nursing Edge — Week of 16 Nov complete (accessibility + launch scenario gate)

---

Hi —

Here is the Friday checkpoint for the week of **16 November** (Monday was a holiday in Colombia; build work ran **Tuesday through Friday**).

### What shipped this week

1. **Accessibility (Tue–Thu)** — Keyboard/focus, screen-reader labels and polite post-commit announcements, contrast and 48px targets on narrow layouts. Notes for the Developer Complete package live under `nursing-edge/scripts/accessibility-keyboard-focus.md`, `accessibility-screen-reader.md`, and `accessibility-contrast-mobile.md`. Status changelog **0.0.30–0.0.32**.

2. **Friday launch scenario pass** — We traced the required threads in code and unit tests (apps were not started locally):
   - Paid or manually granted access → registration and Home/Practice/Review/Progress.
   - Revoked access → learner sent to Account; Practice/Review APIs refuse with `not_authorized`.
   - Practice commit, Review from due cycles, pre-commit safety (no answer key before commit).
   - Admin Overview and Learning Evidence remain read-only GET views.
   - **Restore resume:** the 12 Nov dev clone drill still shows verification **passed** with the same ACTIVE session and attempt totals after restore; production operators use **Super Admin → Database** (Blob backup/restore).

3. **Status site** — Changelog **0.0.33** (20 Nov) summarizes the Friday gate.

### Test status

- **405 / 412** unit tests passing in `nursing-edge`.
- **Expected until 23 Nov:** two `invariants.test.ts` cases still use short test delays instead of 24h/72h (per plan).
- **Local only:** five import tests need R7/C2 workbooks on the machine; CI or a machine with workbooks present runs them green.

### Not Developer Complete yet

Target **Wednesday 25 November** for the full package: delay reset, document 05 end-to-end walkthrough on staging, eligibility and test reports, Shopify proof, accessibility notes, security checklist, restore proof, sample export, and known limits.

### Optional next step from your side

If you want a human pass before the 25 Nov gate, we can schedule a short staging walkthrough (Practice commit, Review due, revoked test account, 390px layout spot-check). No action required if you prefer to wait for the packaged handoff.

Thanks,  
Charles