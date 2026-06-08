# Data360 — État consolidé DONE / TODO (2026-06-08, maj 2)

> Fichier maître unique : ce qui est **fait** et ce qui **reste**, dans le même endroit.
> Vérité établie par double-source (dump `from app.main import app` = 848 paths + curl live
> api.datalab360.io). Mettre à jour ici à chaque vague — ne pas éparpiller le statut.

## TL;DR

| Axe | État |
|-----|------|
| Endpoints backend (path-level) | ✅ 100% — tout contrat consommé pointe vers une route réelle |
| Endpoints (method-level) | ✅ 352/392 mutations OK ; 4 mismatch annotés P1 ; 36 literals hors-contrat à suivre |
| Frontend `feat/backlog-v1` | ✅ POUSSÉ (HEAD `64567e2`) |
| Backend `feat/backlog-v1` (GitLab) | ⏸ 12 commits LOCAUX (852 routes) — attendent un « push backend » explicite |
| Workflow page (SmartRightBar) | ✅ FAIT + zéro-bouton (7 actions → menu icône) |
| Capability audit (au-delà du path) | ✅ FAIT — 2 deltas réels (cost-sim, gov) + B1 clone livré ; Snowpark non requis |
| ⚠ Visible par l'utilisateur ? | ❌ NON — `feat/backlog-v1` pas mergée dans `dev` ni déployée |
| Zéro-popup | ✅ consultatif + 4 form-modals convertis ; confirms destructifs gardés (voulu) |

---

## ✅ DONE

### Backend — 25 routes neuves + 1 enrichie (commits LOCAUX, non poussés)
| Commit | Contenu | Vérif |
|--------|---------|-------|
| `627b241c` | **H1** catalog SmartRightBar (8) · **H2** connect CRUD (3) · **H3** data-products lineage/consumers (2) · **H4** data-quality snapshot+anomalies+trust (6) · **H5** cortex/analyst/query · **H6** workflow contributors (3) · **H7** gouvernance batch+policies (2) · **H8** deployment-readiness | 25/25 routes register |
| `b8ccc459` | bi_dashboard restauré (supprimé par erreur du working tree ; live en prod) | 18 routes remontées |
| `42cacc78` | 21 imports morts supprimés (12 fichiers) | app monte propre |
| `ed31f308` | `GET /command-center/tabs/{tab}` — enveloppe consolidée 9 tabs (compose les services existants) | registered, 848 paths |
| `8e13b8c3` | `POST /workflow/{id}/dry-run` accepte `{mode: clone\|temp_tables}` | registered |
| `b1 (local)` | **B1** : `mode=clone` dispatche le vrai clone zero-copy (`run_workflow_clone_data_tests`) ; `temp_tables` flag honnête « pending B2 » | syntax+route OK |

Garanties : `from app.main import app` OK, `py_compile` clean, OpenAPI build OK, dégradation
par champ (try/except → null, jamais 500). **Non testé runtime** (pas de creds Snowflake en session).

### Frontend — poussé sur `feat/backlog-v1`
- **Contrats** : ~116 entrées `API.*` ajoutées sur 11 modules, 7 faux paths corrigés, 4 entrées mortes `@deprecated`, toutes vérifiées vs dump backend
- **Workflow SmartRightBar** (`WorkflowSmartPanel.tsx`) : right-bar unique toujours visible, **menu icône vertical (zéro tab)** — Changes pré-soumission · Submit avec sélecteur **clone(prod)/temp-tables(pipeline)** · Deployments+versioning · Block details · AI assist · 4 sections legacy ; action capitalisée en événement `workflow_validation_submitted`
- **Workflow zéro-bouton** : 7 actions toolbar (New/AI/Import/Save/Run/Suspend-Resume/Schedule) relocalisées dans le cluster Actions du panel ; canvas ne garde que zoom/fit/palette
- **Capability delegation 2026-06-08** (`henry-delegation-2026-06-08.md`) : audit au-delà du path — anomaly ML + modeling/semantic/Analyst déjà livrés ; 2 deltas réels (A cost-sim 30j, D gov depth) + B1 clone livré ; Snowpark non requis (3 opportunités optionnelles différées)
- **SmartRightBar catalog** (`ObjectSmartPanel.tsx`) sur sources : S1/S3/S4/S5/S6 sur les routes H1, dégradation 404→"not deployed yet", null→"—"
- **AIActionFlow** : flux standardisé discussion→action→événement (`ai_action_executed`/`ai_suggestion_dismissed`) sur data-quality + étendu
- **MetricHelp** : helper corporate (def+source+plage saine) sur ~13 métriques (data-quality, observability, command-center, intelligent, data-products, sources)
- **Zéro-popup** : DAG/ingestion-runs/ImportTasks + budget/slo/bi-dashboard CreateModal → panneaux `ActionRail` (`aria-modal=false`)
- **SSE invalidation** : observability, data-products, sources branchés (clés réelles backend)
- **DesignEvent enrichi** : `lineageImpact`, `costEstimate`, `approvalStatus` + `useDeploymentReadiness` hook
- **Fake-zeros** corrigés (→"—") et **violations de marque** (Cortex/Snowflake→neutre) sur 6+ modules
- **57 appels services → `API.*`** (observability 30, data-quality 22, data-products 5)

### Skills / docs
- `agent-henry.md` : pattern DRY `cached_sf_get`, Run KPI format, section Event Store Enrichment
- `agent-alice.md` : Étape 2b bonnes pratiques backend, Run KPI format
- `roadmap-verified-2026-06-07.md`, `henry-delegation-2026-06-07.md` (corrigé), `cleaner-report-2026-06-07.md`, `ux-audit-index.md`
- Sections « Module Run » / « Alice Run » dans les 11 `page-*.md`

---

## ⏳ TODO

### 🔴 P0 — décision utilisateur (bloquant)
- [ ] **Push backend** : 5 commits locaux prêts sur `feat/backlog-v1` (GitLab). Frontière mémoire « backend needs a go » → requiert accord explicite. Cmd : `git -C .../backend push origin feat/backlog-v1`
- [ ] **PR frontend** : https://github.com/henygafsi/datalab360/compare/dev...feat/backlog-v1 (`gh` CLI absent localement → création web)

### ✅ P1 backend — TOUT FAIT (commits locaux, non poussés)
- [x] **B1** : `mode=clone` dispatche le vrai clone zero-copy + gate corrigé (`ok`) — `5dc91ab5`/fix
- [x] **B2** : `mode=temp_tables` matérialise de vraies temp tables (garde `skipped_unsafe`) — `74c3eb47`
- [x] **A** : `GET /org-accounts/cost-simulation/{type}/{id}?days=30` (baseline metering + bandes forecast) — `5dc91ab5`
- [x] **D1** : `POST /gouvernance/policies/row-access/simulate` (read-only, predicate sûr) — `d7112d50`
- [x] **D2** : `POST /gouvernance/policies/masking/preview` (sample sous le rôle appelant, jamais de bypass) — `d7112d50`
- [x] **D3** : `GET /gouvernance/roles/{role}/least-privilege` (FQN-matched, advisory) — `d7112d50`
- [x] Contrats FE des 4 routes ajoutés (`6823c1f`, poussé) ; 852 paths backend vérifiés
- ⏳ Reste runtime-only : confirmer grants ACCOUNT_USAGE + shape réponse sur warehouse live
- [ ] 4 method-mismatch (FE écrit, backend GET-only) : `POST /projects`, `POST /org-accounts/reader-accounts`, `PATCH /workflow/compute-pools/{}`, `POST /gouvernance/rls-policies`
- [ ] Routes ML non testées runtime : `POST /data-quality/anomaly-detection`, `POST /cortex/analyst/query` (vérifier shape réponse Cortex Analyst sur warehouse live)
- [ ] H1 catalog : confirmer colonnes ACCOUNT_USAGE sur rôle réellement granté (dégrade en null sinon)

### 🟡 P2 — frontend (non bloquant)
- [ ] Migration governance services (10 fichiers) → `API.gouvernance.*` (agent expiré timeout ; chemins runtime déjà corrects)
- [ ] 36 literals hors-contrat dans `services/explore-design/*` + `projectsApi.ts` (suivi path-coverage)
- [ ] Le call temp-tables du WorkflowSmartPanel utilise `apiClient.post` brut → passer par `API.workflow.dryRun`
- [ ] `useCacheInvalidation` non câblé : intelligent, workflow, governance, data-quality detail
- [ ] `InsightActionButton` annotations cost/risk/govDelta/lineageImpact pas encore sur tous les CTAs governance
- [ ] Imports morts en zones actives (171) + 36 composants FE morts (report-only dans cleaner-report)

### 🟢 P3 — différé / dépréciations
- [ ] Routes dépréciées à supprimer après confirmation non-usage : `viewDdl`, `detectedModels`, `biRetail.salesOverview/salesDashboard`
- [ ] `.gitlab-ci.yml` backend réécrit localement (suite complète par branche + job `sample_deploy`) — relire avant adoption, non commité
- [ ] Roadmap Phase 3 : `GET /finops/cost-simulation/{object}?days=30` — prévision coût 30j avant engagement (le différenciateur, voir roadmap-verified)

---

## Journal des vagues
- **Vague 1** (06-07) : audit 11 modules + contrats + fake-zeros + brand (4e1ac9f→04f8992)
- **Vague H** (06-07) : 8 agents backend H1-H8 + 4 frontend (helpers/popups/services/AIflow) → bi_dashboard restauré
- **Vague 2** (06-07/08) : form-modals, SmartRightBar wiring, SSE, method-verify, workflow SmartRightBar (ec6221a→8e13b8c3)

_Speedup multi-agent mesuré ≈ ×5.4 (102 min séquentiel → 19 min réels). Contention : `api-contracts.ts` (réservé à 1 agent/vague), races `.next` transitoires._
