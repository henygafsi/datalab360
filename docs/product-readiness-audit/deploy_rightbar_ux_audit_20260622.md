# Explore & Design — Deploy right-bar: buttons + hooks audit & redesign spec (2026-06-22)

Research to ground a better right-bar Deploy tab. Read-only audit of DeploymentValidation, the 8 Step* components, DeploymentContext, event-store, ContextRightBar.

## State machine (what's real)
8 steps: `review → config → pre_checks → dry_run → sql_diff → impact → deploy → verify`. Only **pre_checks hard-blocks** Next (must pass). dry_run / sql_diff / impact have **no completion gate** (`canGoNext` is positional, not semantic). `deploymentOutcome ∈ deployed | failed | pending_approval | null`.

## P0 DEFECTS (fix regardless of redesign)
1. **Deploy double-fire** — `StepDeploy.tsx:321` "Deploy Now" has no `disabled={isDeploying}`; a double-click runs a **second live DDL** against the warehouse. Data-integrity risk.
2. **Deploy button not RBAC-gated** — the `PermissionGate(deploy)` only wraps the *legacy* DeployPanel (ContextRightBar:1798). In the main wizard, anyone who can open it reaches Deploy unblocked. Gate the actual "Deploy Now" with `useCanPerform('explore_design','deploy',projectId)`.
3. **Two parallel deploy UIs** — legacy `DeployPanel` (6 steps, in ContextRightBar) AND `DeploymentValidation` (8-step wizard) both reach prod. Kill the legacy one; one canonical flow.

## Button-UX problems
4. **Redundant quick-actions** — `ContextRightBar:228` "Review & approve" and `:236` "Deploy" both call `onTabChange('deploy')` → two differently-labeled CTAs that do the identical thing.
5. **StepVerify: 5 flat-weight buttons, inverted primary** — "Done/Close" is `variant="outline"` (should be primary); "View in Versions" reads as primary; destructive **"Clean Up Events"** sits at equal weight with no confirm.
6. **Two identical "Download" buttons** — `StepReview:279/282` deploy-SQL vs rollback-SQL, same icon/size/variant side by side → mis-click on irreversible rollback.
7. **Destructive actions un-guarded** — "Revert to Generated" (StepReview:250), "Start over" (DeploymentValidation:624), "Clean Up Events" — no confirm dialog.

## Hooks / state problems
8. **activeRightTab split-brain** — `page.tsx` owns `useState('actions')` + imperative `setActiveRightTab` in ~10 places, while `RightTabPanel` restores from `storageKey` on mount → they race/diverge on remount.
9. **rightBarOpen not persisted** — `useState(false)` in page.tsx; resets to collapsed every visit. Should be `atomWithStorage`.
10. **Events prop-drilled** into DeploymentProvider instead of read from the Jotai event-store directly (redundant indirection).
11. **Deploy tab width** = hardcoded ternary in ContextRightBar (no width API / not user-resizable).

## Recommended right-bar Deploy view (design spec)
Principle: **one task, one primary action, progressive disclosure.** Collapse the 7 zones into 3.

```
┌─ DEPLOY ─────────────────────────── [Owner ▾] [↗ expand] [×] ┐
│ FACT_TRANSACTIONS · DRAFT_SOURCE.AZRZARAZRE        ① compact   │  ← 1 line: title + role pill + overflow(⋯ = metrics/contributors)
├──────────────────────────────────────────────────────────────┤
│ ◉ Review  ─ Configure ─ Checks ─ Dry Run ─ Diff ─ Impact ─ ▸  │  ② horizontal step tabs
│   (done=✓check  current=filled  blocked=! red  optional=dim)   │     overflow ▸ for steps off-screen
├──────────────────────────────────────────────────────────────┤
│  [ step content — gets ALL remaining height, scrolls ]        │  ③ content
│                                                                │
├──────────────────────────────────────────────────────────────┤
│  ⓘ Deploy plan saved      [ Back ]   [ ▶ Deploy Now ]  ⋯      │  ← ONE primary CTA + overflow(⋯) for
└──────────────────────────────────────────────────────────────┘     Show SQL / Deploy Script / Rollback / Copy
```
Rules:
- **Header → 1 line.** Move role badge to a pill; move the metrics row (`0 ⬡ 0% ACCT 1 contr`) into a `⋯`/hover popover. Saves ~80px.
- **One primary CTA per step**, bottom-right, full-emphasis. Everything else (downloads, copy, revert, clean-up) → a single `⋯` overflow menu. Today's 4 bottom SQL buttons + 3 top CTAs collapse to **Back + primary + ⋯**.
- **Step tabs carry state** (done ✓ / current / blocked ! / optional dimmed) so the user knows what's left; overflow `▸` when they don't fit (don't shrink labels).
- **Destructive items** (Rollback Script download, Revert, Clean Up, Start over) live in `⋯`, labeled, with a confirm.
- **Expand-to-overlay** (↗): for power users, pop the wizard to a centered full-width overlay (the canvas is irrelevant during deploy) — reuses the same `DeploymentProvider`, no logic change.
- **Persist** panel open-state + active tab + (optional) width.

## If handing to ChatGPT
Give it: the 3-zone target above + the constraint "must reuse the existing 8-step `DeploymentProvider` context (currentStep/goNext/config/results) and `useCanPerform` gates — visual reorg only, no new state machine." That keeps the redesign wireable.
