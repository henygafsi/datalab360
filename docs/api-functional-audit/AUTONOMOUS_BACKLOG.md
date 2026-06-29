# Autonomous backlog — Vue fonctionnelle des APIs + fixes par page

Mandate utilisateur (2026-06-29) : run autonome ~8h. Construire une vue fonctionnelle des 500+/820 APIs dans `/admin/api-health`, fixer page par page, identifier actions/rôle-IA/FinOps/réponses-stockées par page, lever les ambiguïtés via la doc en ligne (clarté pour le **data_user role**).

## Garde-fous (NON négociables)
- Front uniquement → push sur `feat/backlog-v1` (pré-approuvé). **Pas** de deploy backend/prod. Snowflake = **lecture/test** seulement, pas de DDL destructif.
- **Build-verify = `pnpm iso:build` (typecheck COMPLET)** AVANT chaque commit. ⚠️ Le compile dev (SWC) ne typecheck PAS — il laisse passer des erreurs `unknown`/types que `next build` rejette (vécu en W0). Ne jamais se fier au dev compile pour "vérifié". Pas de commit si build cassé.
- Classer chaque finding par **cause** : (1) bug FE · (2) backend 4xx/5xx (déployé dégradé, SVC down) · (3) backend 200 mais UI vide (cache non-provisionné) · (4) feature réellement manquante. Ne PAS lister les causes backend comme manquements FE.
- Env : `.env.local` basculé sur le backend **déployé** pour le run (local :8000 down). `.env.local` est gitignored — ne jamais le committer.
- Caveat scope : audit sous rôle **HAHA=ACCOUNTADMIN** (vue admin) ; gaps role-gated non-admin non couverts.

## DÉJÀ FAIT (vérifié, commit 769987a)
- [x] Vue fonctionnelle `/admin/api-health` : `FunctionalApiView.tsx` (1020 ops, action/temps/IA/FinOps/cache/clarté) + route `/api/admin/api-catalog` + générateur `gen-api-catalog.mjs` (depuis openapi snapshot). **Vérifié Playwright : 600 lignes rendues.**
- [x] Probe par endpoint GET → réponse stockée localStorage (1ʳᵉ fois = cache coût).
- [x] Fix crash partagé « object as React child » sur 503 → helper `toMessage()` + snowpark corrigé. **Vérifié : 0 pageerror.**
- [x] Sweep Playwright 64 routes → `e2e/results/pages-audit/summary.json` (6 non-ok : 4 CRASH même cause, 2 BLANK).

## VAGUES (chaque réveil : prendre la prochaine non cochée, build-verify, commit, journal)

### W1 — Sweep crash-fix `toMessage` (mécanique, sûr) ✅ FAIT (d686e46 + d109496)
- [x] Cause racine partagée `extractApiError` (org-accounts/utils) durcie → fixe ses **15 consommateurs** (client-accounts, costGov, …) d'un coup.
- [x] ai-advisor-content, snowflake-explorer-tab, QueryIntrospect, GovernanceTagsPanel → `toMessage`. Build `pnpm iso:build` VERT.
- [x] Reste du sweep : 27 sites / 18 fichiers passés à `toMessage` (observability, governance grants/roles/users, explore-design, mapping, data-quality, intelligent, api-health). Build VERT. Commit d109496.
- [x] Re-sweep Playwright : **client-accounts / ai-advisor / snowpark / costGov = ok, 0 pageerror** (crash éliminé, confirmé runtime).
- [ ] Différé (shapes ambigus, vague ultérieure) : PolicyAssignmentPanel (`detail || autre-champ`), explore-design/index.ts (service layer), explore-design fallback template-literal (l.3505).
- ⚠️ **Gotcha loop** : `pnpm iso:build` écrase le `.next` du dev server en cours → 404 « chunks ». APRÈS chaque build-verify : `rm -rf apps/data360/.next` + relancer `pnpm iso:dev` avant tout Playwright.

### W2 — Enrichir le catalogue (rôle IA / FinOps / clarté data_user) ✅ FAIT (commit 171578b)
- [x] `gen-api-catalog`: `hint` FR synthétisé pour les endpoints sans description claire (371 hints). Vue: **filtre data_user** + chip audience + ligne hint sous l'action (764/1020 = data-user). Build VERT.
- [x] FinOps déjà classés observe/control/optimize (132) + chip dédié dans la vue.
- [ ] Reste (deeper, non bloquant) : remplacer les `hint` heuristiques par du texte réel de la doc en ligne pour les 268 `needsDoc` — coûteux (par endpoint), à faire par petits batches ciblés.

### W3 — Doc Obsidian fonctionnelle (read-only + write doc) ✅ FAIT
- [x] `vault/data360_full_doc/_FUNCTIONAL_API_AUDIT_2026-06-29.md` : doc consolidé pages × APIs × manquements **classés par cause**, tableau runtime du sweep (58 ok/4 CRASH corrigés/2 BLANK), stats catalogue (1020/769 non-wirés), top modules non-wirés, wikilinks vers `pages/*.md` + [[_FE_BACKEND_COVERAGE_GAP_2026-06-24]]. (Dans le vault Obsidian, hors repo front → pas de commit git front.)

### W4 — Fixes par page (BLANK + outputs vides cause-FE) ✅ FAIT (commit 25fe9e9)
- [x] `/administration` (BLANK sans tab) : **vérifié runtime = faux-blank de compile dev** (rend ok: 2312 bodyLen, onglets visibles, 0 pageerror, défaute déjà à `health`). PAS un bug FE. Mais durci `Suspense fallback={null}` → skeleton (défensif). Build VERT.
- [x] `/administration/access-center` (BLANK) : **backend-cause** (503/500 sur 10/15 appels) — pas un fix FE. Laissé tel quel.
- [ ] Suivi (5 pages avec `fallback={null}` : data360-config, governance projects/policies, sources, bi-dashboard) → même durcissement skeleton, micro-vague.
- [ ] Pages "backend 200 mais UI vide" : à revoir quand le backend déployé est sain (actuellement tout est SVC-down = cause backend).

### W5 — Réponses stockées / coût (FinOps) ✅ FAIT (commit 6c03af6)
- [x] `probe()` court-circuite le réseau si déjà en cache (= appel backend évité) → **store-first = optimisation coût** explicite. Force-refresh via le bouton `✓ cache ⟳`. Résumé `♻ N en cache` + bouton vider. Hint cache (store-first/live/no-cache) déjà par endpoint (384 cacheables). Build VERT.
- [ ] Approfondissement (non bloquant) : estimation de crédits/coût par endpoint + TTL configurable du store.

---
## Élargissement (PS utilisateur 2026-06-29 ~01:2x) — backend on-disk + nouvelles features

**Contexte décisif :**
- Backend = repo git réel `/Users/datalab360/Documents/data360_pro/backend` sur `feat/backlog-v1`. Fixes backend **possibles MAIS deploy-gated** : le front tape le backend **déployé** (api.datalab360.io) → un fix backend local n'a **aucun effet** tant que non déployé (= `go` utilisateur). Et la mémoire interdit le bare-restart local → je ne peux pas tester un fix backend localement. ⇒ backend = **préparer + commit local seulement**, jamais deploy.
- 913 paths backend, **251 wirés FE / 769 NON-wirés** (rapport `docs/api-functional-audit/missing-endpoints.json`). La vue fonctionnelle affiche désormais le flag wiré/non-wiré + filtre.

### W6 — Réintégration des endpoints manquants (769 non-wirés) — FRONT, sûr ⏳ EN COURS
- [x] Plan priorisé `docs/api-functional-audit/REINTEGRATION_PLAN.md` (26 modules, paths + summaries).
- [x] **Batch 1 — `/cache/*`** (18 endpoints) : groupe `cacheService` dans api-contracts + service typé `services/admin-cache` (observability + control, signal FinOps). Wired **251→268**. Build VERT, commit f80563b.
- [x] **Batch 2 — finding honnête** : le compteur "non-wiré" est une **BORNE HAUTE** (le détecteur rate les paths interpolés `${...}`). Mesuré : observability 23/25 déjà wirés, **2 vrais gaps** (probesBatchCheck, sensorsAll) wirés. Caveat ajouté au plan. wired 268→270. Commit cde2ec5.
- [x] **Détecteur raffiné** (match template-literals `${enc(id)}` + retrait suffixe `${qs(...)}`) → compteur **précis** : wired 270→**503**, unwired 752→**517**. Spot-checké (pas de faux-wired). missing-endpoints.json + plan régénérés. Commit 764d1fb.
- [ ] Batchs suivants (vrais gaps, désormais fiables) : **explore-design 147**, **gouvernance 106**, api 69, org-accounts 68… 1 batch validé/vague.

### W7 — Validation/réparation backend — DEPLOY-GATED (préparer, ne pas déployer)
- [ ] Croiser openapi déployé vs routes backend on-disk vs annuaire (`vault/.../api-reference`) → lister endpoints en erreur (503/500 réels code vs SVC-down) + manquants. Préparer fixes sur la branche backend `feat/backlog-v1` (commit LOCAL). **NE PAS déployer** — journaliser "prêt à déployer, besoin go". Flag chaque fix : testé localement ? (non, backend non-restart) → à valider au deploy.

### W8 — Paiement UI + dry-run gratuit (sample data) + coût maîtrisé — FRONT
- [ ] Réutiliser `account-settings/billing-*` existants. Avant toute action coûteuse : **mode dry-run gratuit avec sample data** (pas de crédits Snowflake), estimation de coût + bouton paiement explicite pour passer en run réel. Patterns + KPIs coût dans la vue.

### W9 — Chat agentic vs datalakes entreprise — FRONT (s'appuie sur cortex-chat existant)
- [ ] Enrichir `intelligent/cortex-chat-content` + `ai-prompt-console` : récupérer des données en ligne + résultats agentic + discussion comparée aux datalakes entreprise. Gouverné (RBAC) + coût affiché.

> ⚠️ W8/W9 sont de **grosses features** (décisions produit : provider de paiement, quels datalakes). En autonomie : scaffolder incrémentalement, build-verify, journaliser les décisions ouvertes plutôt que deviner en grand.

## Journal des vagues
| Horodatage | Vague | Avancement |
|---|---|---|
| 2026-06-29 00:3x | W0 (fondation) | Vue fonctionnelle + route + générateur + fix crash snowpark + sweep 64 routes. Commit 769987a. Vérifié Playwright (600 lignes). |
| 2026-06-29 ~00:5x | W1 (partiel) | Cause racine `extractApiError` durcie (15 consommateurs) + 4 fichiers `toMessage` + fix types FunctionalApiView. **`pnpm iso:build` VERT**. Commit d686e46. Découvert : 769987a ne passait que le dev compile, pas `next build` → garde-fou renforcé. Reste : ~20 fichiers anti-pattern + re-sweep Playwright. |
| 2026-06-29 01:11 CEST | W1 (FAIT) | Sweep complet: 27 sites / 18 fichiers `toMessage` (commit d109496), build `pnpm iso:build` VERT. **Re-sweep Playwright: client-accounts/ai-advisor/snowpark/costGov = ok, 0 pageerror** (crash object-as-React-child éliminé). Gotcha .next/build-vs-dev documenté. Prochaine: W2 (enrichissement catalogue). |
| 2026-06-29 04:36 CEST | W6 (détecteur corrigé) | Raffiné le détecteur `wired` pour matcher les paths template-literals → **compteur précis** : wired 270→503, unwired 752→**517** (le 752 était une borne haute). Spot-check OK (cost/monitors, budgets, cache, sensors), pas de faux-wired. missing-endpoints.json + plan régénérés. Build VERT, commit 764d1fb. Vrais gaps concentrés : explore-design 147, gouvernance 106. Prochaine : batch explore-design ou gouvernance (vrais gaps fiables). |
| 2026-06-29 04:07 CEST | W6 (batch 2) + finding | **Le "752 non-wirés" est une borne haute** : détecteur rate les paths interpolés. Mesuré observability = 23/25 déjà wirés ⇒ vrai besoin ≪ 752. Wiré les 2 vrais gaps (probesBatchCheck, sensorsAll), caveat au plan. wired 268→270, build VERT, commit cde2ec5. Stratégie ajustée : valider les vrais gaps par module avant de wirer. Prochaine : batch validé (explore-design/gouvernance) ou W8/W9. |
| 2026-06-29 03:36 CEST | W6 (batch 1) | Réintégration : plan priorisé `REINTEGRATION_PLAN.md` (26 modules) + **batch `/cache/*` wiré** (18 endpoints → groupe `cacheService` + service `admin-cache` typé). Wired 251→268. Build VERT, commit f80563b. Reste 752 (explore-design 146, gouvernance 100…) — 1 batch/vague. |
| 2026-06-29 03:05 CEST | W5 (FAIT) → **backlog initial W1–W5 bouclé** | Store-first cache : `probe()` court-circuite le réseau si en cache (appel backend évité = coût) + résumé `♻ N en cache`/vider + force-refresh. Build VERT, commit 6c03af6. **W1–W5 tous faits.** Restent W6 (réintégration 769) / W7 (backend deploy-gated, besoin go) / W8 (paiement dry-run) / W9 (chat agentic). Prochaine vague : W6. |
| 2026-06-29 02:37 CEST | W4 (FAIT) | BLANK élucidés par cause : `/administration` = **faux-blank compile dev** (rend ok runtime, défaute déjà à health) → durci Suspense `null`→skeleton (commit 25fe9e9, build VERT) ; `/administration/access-center` = **backend-cause** (503/500), pas FE. Suivi : 5 autres `fallback={null}`. Prochaine : W5 (cache coût) ou W6 (réintégration). |
| 2026-06-29 01:4x CEST | W3 (FAIT) | Doc Obsidian consolidé `vault/data360_full_doc/_FUNCTIONAL_API_AUDIT_2026-06-29.md` (5.4KB) : pages × APIs × manquements par cause, tableau runtime sweep, 769 non-wirés par module, wikilinks validés (cibles `pages/*.md` existent). Hors repo front → pas de commit git. Prochaine : W4 (BLANK /administration) ou W6 (réintégration). |
| 2026-06-29 01:36 CEST | W2 (FAIT) | Catalogue enrichi : `hint` FR synthétisé (371 endpoints sans desc claire) + **filtre data_user** + chip audience + ligne hint dans la vue. FinOps observe/control/optimize confirmés. Build `pnpm iso:build` VERT. Commit 171578b. Reste différé : texte doc-en-ligne réel pour les 268 `needsDoc` (par batches). Prochaine : W3 (doc Obsidian) ou W6 (réintégration endpoints). |
| 2026-06-29 01:18 CEST | Élargissement PS + wired-flag | Backend localisé on-disk (`data360_pro/backend`, repo git feat/backlog-v1, **deploy-gated**). Rapport **769 endpoints non-wirés** (missing-endpoints.json). Vue fonctionnelle: KPI/filtre/marqueur **wiré vs non-wiré** (251/769). Build VERT, commit 6bda5fe. Backlog étendu **W6** (réintégration) / **W7** (backend repair deploy-gated) / **W8** (paiement dry-run+sample) / **W9** (chat agentic vs datalakes). |
