# Overnight Run #2 — deployment-first + guided journeys (2026-06-23, ~7h autonomous)

User mandate: propose a whole GUIDED flow (buttons or not) tied to user data-profile + business; review DEPLOYMENT first; test the UI directly as acceptance across many deployment versions; correct display for a data modeler anywhere with full guidance (use the API directory); add agents for OTHER tabs (review+fix UX, testing as a user); test the whole flow with a real deployment + validate outputs + data-role journeys. Be autonomous.

## Constraints / safety
- Drive the deploy flow to **Dry Run** (real outputs, NON-mutating) for validation; **HOLD the actual Deploy DDL execution** (mutates the user's Snowflake — needs them present). Report this.
- Strict file ownership per agent; grep+offset reads (agents overflow); STRAIGHT ASCII quotes only (an agent broke the build with curly quotes earlier).
- Compile-gate (tsc + build) + live-validate after EACH wave; fix agent errors before proceeding.
- Keep existing LIGHT guidelines — NO reskin. Honest "—".

## Wave A — DEPLOYMENT (priority)
Already done this session: stepper fits (no h-scroll), footer Back/Next pinned + viewport-capped (visible at MacBook size), Governance KPI strip (risk/objects/policies/cross-project), Deploy double-fire guard.
Now enhance (audit-driven):
- StepVerify: ONE primary CTA (Done), confirm on destructive "Clean Up Events", fix inverted button hierarchy.
- StepReview: disambiguate the two identical "Download" buttons (Deploy SQL vs Rollback SQL).
- Per-step OUTPUT/STATUS clarity: a consistent status line per step (pass/warn/blocked + what was produced) — the "acceptance" signal for a data modeler.
- GUIDANCE tied to profile + business: a one-line guided hint per step (what this step means for YOUR role + the business ROI), reusing useAuth role + the existing ROI/KPI data.
- Acceptance across versions: ensure version/draft handling is clear (StepConfigure versionType + the draft indicator).

## Wave B — OTHER TABS UX (review + fix, as a user)
Per-module agents: load the module as a user, find real UX breaks (broken/empty/error states, raw error objects, dead buttons, missing feedback, dark-mode), FIX the clearly-correct ones. Modules: BI, data-quality, governance, observability, workflow, intelligent, connect/sources, data-products, administration.

## Wave C — VALIDATION + journeys
- tsc + build + live sweep (all changed surfaces).
- Drive deploy flow Review→Configure→Pre-Checks→Dry Run live; capture each step's output; STOP before real Deploy.
- Data-role journey check (as ACCOUNTADMIN; note: non-admin persona testing needs a 2nd login — flag as gap).

## Morning report
Consolidated: what landed, build status, live-validation, deploy-flow outputs captured, open items (real-deploy execution held; non-admin persona; backend Wave-3 items). Saved here + memory [[project_overnight_ai_coherence_run]].
