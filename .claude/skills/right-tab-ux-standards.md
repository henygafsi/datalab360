---
name: right-tab-ux-standards
description: >
  2026 UX standard for Data360 right-side smart panels (WorkflowSmartPanel,
  ObjectSmartPanel, ContextRightBar, ProjectContextPanel). Click-to-focus
  full-height accordion, persisted/preselected section (versioned localStorage
  "draft of menu"), collapsible always-on action strips so a section runs
  full-height, action-CTAs (not bare buttons/text) especially for AI which must
  DISCUSS the KPI results, and elimination of buttons that duplicate a rail
  section. Lists the agents to run for audit + implementation + UI re-test.
  Grounded on real code + tsc-verified — 2026-06-10.
---

# Right-Tab UX Standards — Skill (2026)

> The right rail is the control surface. It must be intelligent, persistent, and
> action-first — never a wall of redundant buttons or an embedded page.

## 1. The 7 standards (apply to every right panel)

1. **Click-to-focus, full height.** Clicking a rail/menu item makes that section
   own the panel body (`flex-1 overflow-y-auto`); the active label shows in the
   header. `[trace: workflow/components/WorkflowSmartPanel.tsx — main render]`
2. **Reduce the rest.** Always-on action strips that duplicate rail sections are
   **collapsible** so the active section runs full-height. Toggle in the header,
   persisted. ✅ done for Workflow (`actionsCollapsed`).
3. **Draft + preselect.** The active section is persisted to **versioned, minimal
   localStorage** and restored once on mount (`client-localstorage-schema`).
   Keys: `data360.wf.panel.section.v1`, `data360.wf.panel.actionsCollapsed.v1`.
   ✅ done for Workflow.
4. **Action-CTAs, not bare buttons.** Every option is a CTA with label + rationale
   + (cost/risk where it mutates), via the shared `AIActionFlow` pattern
   `[trace: app/shared/insights/AIActionFlow.tsx]`. No naked "Validate" buttons
   floating in a strip.
5. **AI discusses the KPI results.** The AI surface must read the entity's KPIs
   (success rate, credits/week, last failed run, steps) and propose governed
   call-to-actions — NOT open an embedded wizard page. 🔴 OPEN: Workflow
   CREATE-row "✨ AI" still calls `onAiCreate` → embedded `GuidedAiWorkflowWizard`.
   Fix: route it to a KPI-aware `AiSection` CTA flow.
6. **No duplicate validators.** Remove buttons that duplicate a rail section
   (e.g. a top-strip "Validate"/"Dry-run" when the `submit`/`ai` sections already
   offer them). 🔴 OPEN: audit `ActionsCluster` + `SubmitSection` for overlap.
7. **State distinguishes loading / empty / error / never-run** — never render a
   stale or fake value (e.g. seeded runs stuck `running 7h` → fixed at source).

## 2. Status (2026-06-10)
- ✅ Workflow panel: draft-persist + preselect, collapsible actions (full-height),
  header toggle — **tsc clean**.
- ✅ Run-data: seeded runs now terminal + realistic duration (was fake "running 7h").
- ✅ ObjectSmartPanel: Trust-Scores + Recommendations (apply) + History + retry.
- 🔴 AI-CTA: Workflow "✨ AI" embeds a wizard — convert to KPI-discussing CTA.
- 🔴 Redundant-button sweep + full UI re-test of every rail click.

## 3. Agents to run (the "needed agents")
- **`Explore` (audit)** — map each panel's rail sections, the data each reads, and
  which buttons duplicate a section. One per panel cluster (workflow ·
  explore-design · sources/catalog · project-context).
- **`general-purpose` (implement)** — apply standards 1–7 to one panel, **disjoint
  files**, ending with `npx tsc --noEmit -p apps/data360/tsconfig.json` clean.
- **UI re-test** — Playwright over `localhost:3000` (boot `pnpm iso:dev`, mint the
  NextAuth cookie storageState with HAHA creds — see `right-tab-ux` notes), click
  every rail item + action, assert no fake/empty/stuck data and that the section
  is full-height + persists across reload. Pattern from `e2e/ux-audit/`.
- **`code-review`** — adversarial pass on the diff (re-render hygiene per
  `vercel:react-best-practices`: no inline components, versioned localStorage,
  ternary conditionals, stable callbacks).

## 3b. Product goals (full roadmap)
The right-tab UX standards are part of a wider vision captured in
`vault/data360_full_doc/Product-Roadmap-Goals.md` (G1–G10): BI builder left-bar
restore, full-width E&D source selection, guided input→transform/ML→reporting
flow, charts-as-JSON + role-gated creation, feature governance in Admin, **score
cards (DQ·COST·PERF·PREVISION) on every page + project**, schedules+deploy with
cost estimate for payment, granular FinOps by product/project/source/storage/GOV,
"preselection view always" everywhere, and a full button-level UI re-test.
Sequencing: G1 → G6 → G9 → G2 → G3/G7/G8 → G10. Run scoped agent batches with
checkpoints — NOT a blind 6h unsupervised loop on destructive/governance items.

## 4. References
- 2026 perf rules: `vercel:react-best-practices` (esp. `client-localstorage-schema`,
  `rerender-no-inline-components`, `rendering-conditional-render`, `rerender-lazy-state-init`).
- Real action-test report: `vault/data360_full_doc/audits/Real-API-Action-Test-Report.md`.
- Panel files: `workflow/components/WorkflowSmartPanel.tsx`,
  `sources/components/ObjectSmartPanel.tsx`,
  `explore-design/components/ContextRightBar.tsx`,
  `shared/project-context/ProjectContextPanel.tsx`.
