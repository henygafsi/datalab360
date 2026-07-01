# 10-hour orchestrated run — integrate every endpoint option + Playwright-test every action

**Date:** 2026-06-29 · **Goal:** drive the 1020-op surface to full feature coverage — integrate unwired/hardcoded endpoints as governed UI actions (or retire dead ones), with **every action tested by Playwright** — using orchestrated, iterative agents at full M4 Max parallelism.

---

## 1. Summary of all requests (this conversation)

| # | Request | Status |
|---|---|---|
| 1 | Fix all problems in the API/Platform Health page | ✅ probe-noise classifier + app-only error rate + "Show probes"; pushed |
| 2 | Workflow "Run failed" | ✅ explained — unconfigured Source block (Database/Schema required), not a bug |
| 3 | Guardrails + secure caching + fix backend Snowflake fns (single conn/session, SVC-vs-user trace) + all-module real-time governed invalidation + AI scan/detect/prevent (modeling/BI/workflow) | ⏳ audited; FE parts planned; backend deferred (deploy-gated) |
| 4 | Audit-first, FE-only | ✅ cross-module audit delivered |
| 5 | Session/SSE anomalies + project-scoped tracing + account-overview approval metadata + collab version/payment history + gov/sec/cost/storage ROI KPIs | ✅ detected; **SSE singleton fixed**; rest planned |
| 6 | Push validated code → GitHub (front) + GitLab (backend) | ✅ 56 front + 17 backend commits pushed |
| 7 | Reload front + Playwright real integration & buttons | ✅ front repointed to local :8000, smoke green; ⛔ authed tests blocked on creds |
| 8 | State-of-the-art UX per feature + per-feature governed access + 100% display/cache/role/matrix tests + allow/deny/approval by project owner | ✅ audited; roadmap |
| 9 | Long-run study to 100% + MCP 1000+ endpoint enrichment + govern every feature/action + prompt-to-automate agent + cost→dry-run→pay (free, no prod) | ✅ `LONG_RUN_ROADMAP_TO_100_20260629.md` |
| 10 | **THIS:** plan next 10h orchestrated iterative agents — integrate every endpoint option / update unused / Playwright-test every action / optimize for M4 Max | 📋 this doc |

---

## 2. Orchestration model (M4 Max — full capacity)

- **Concurrency:** Workflow caps at `min(16, cores−2)`. M4 Max (16-core CPU) → **~14 concurrent agents**. Design every fan-out at 12–14 wide.
- **Control flow:** `Workflow` tool (deterministic JS). Default to `pipeline()` — each module flows integrate→test→verify with **no barriers**, so a module is being Playwright-tested while another is still integrating (wall-clock = slowest single chain, not sum).
- **Iteration:** `loop-until-dry` per module (keep integrating endpoints until none remain or budget hit) + a `completeness critic` between rounds that emits the next work-list.
- **Cheap vs deep:** Haiku/low-effort for mechanical stages (contract migration, test scaffolding); Sonnet for integration design + adversarial verify.
- **Isolation:** integration agents that mutate files in parallel run with `isolation: 'worktree'` to avoid collisions, then results are merged + a single build-verify gate.
- **Token discipline:** loops guarded on a token budget; `log()` anything truncated (no silent caps).

---

## 3. The work-list (what "every endpoint option" means)

Classify all 1020 ops (from `docs/api-functional-audit/missing-endpoints.json` + the api-catalog) into:
- **WT** wired + Playwright-tested → assert still green.
- **WU** wired + untested → write Playwright per action.
- **H** hardcoded (not in contracts) → migrate to `api-contracts.ts` + ensure a UI action + test.
- **U** genuinely unwired but backend-implemented → **integrate** as a governed UI action (+ dry-run/cost where costed) + test.
- **D** dead / backend-not-implemented → mark + retire the FE stub (don't fake).
Per-module counts known (explore-design 147, gouvernance 106 [12 truly-unwired], api 69, org-accounts 68, command-center 32, cortex 22, workflow 14, …).

Every integrated action must be: `useCanPerform`-gated → traced (`trackFeatureClick` + `project_id`) → costed actions behind `DryRunGate` → admin display-governable → Playwright-tested (happy + allow/deny + approval where applicable).

---

## 4. The 10-hour phase plan (pipelined)

| Hrs | Phase | Fan-out | Output |
|---|---|---|---|
| 0–0.5 | **P0 Work-list** | 1 builder + 1 critic | authoritative WT/WU/H/U/D matrix per module (JSON) |
| 0.5–4 | **P1 Integrate** (worktree, per-module) | 12–14 | unwired/hardcoded → governed UI actions + contracts; build-green per module |
| pipelined | **P2 Playwright per action** | per-module after its P1 | spec per action (CRUD/allow/deny/approve/dry-run) run vs local |
| pipelined | **P3 Adversarial verify** | per finding | confirm real (no fake-success / no [object Object]); kill false greens |
| 4–8 | **P1'/P2' Round 2** (loop-until-dry) | 12–14 | next batch of endpoints; re-audit closes gaps |
| 8–9.5 | **P4 Cross-cutting** | 6–8 | unify TabBar/RightTabPanel, brand P0, governance-catalog convergence |
| 9.5–10 | **P5 Synthesis** | 1 | coverage report (WT% per module), green-build, commit journal, next work-list |

**Acceptance per wave:** `pnpm iso:build` green + Playwright pass for the wave's actions + the re-audit shows the gap closed. Commit per wave on `feat/backlog-v1` (front pre-approved). Backend-dependent items → spec only (no deploy).

---

## 5. Blockers (gate specific phases — not the whole run)

1. **Playwright authed tests (P2):** need `DATA360_E2E_PASSWORD` exported (or refresh expired `e2e/.auth/state.json`). Without it, P2 degrades to **unauth smoke only** — integrations would ship *untested*, which defeats the goal. **This is the one unblock to set before launch.**
2. **Local backend health:** `:8000` is up + front repointed; confirm it has the live SVC key (else pages read "warming up").
3. **Backend-dependent endpoints / payment / project_id migration:** spec-only here (deploy-gated; no prod schedule; pay charges nothing).

---

## 6. Launch
On **go**, I call `Workflow` with this script (pipelined, 12–14 wide, loop-until-dry, worktree isolation, build+Playwright gates). It runs in the background with live progress; I stay in the loop between rounds and report coverage each phase. **Best run with the e2e password set** so P2 tests are real.
