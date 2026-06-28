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

### W2 — Enrichir le catalogue (rôle IA / FinOps / clarté data_user)
- [ ] Affiner la classification dans `gen-api-catalog.mjs` (heuristiques + doc en ligne pour les 268 `needsDoc`). Régénérer `api-catalog.json`. Ajouter une colonne "audience" visible + filtre data_user.
- [ ] Pour les endpoints FinOps (132), vérifier la sémantique (observe/control/optimize) et ajouter un libellé d'action FinOps clair.

### W3 — Doc Obsidian fonctionnelle (read-only + write doc)
- [ ] `vault/data360_full_doc/` : 1 doc consolidé pages→actions→cause, wikilinké aux `pages/*.md` + `_FE_BACKEND_COVERAGE_GAP_2026-06-24.md`. Inclure le tableau runtime du sweep.

### W4 — Fixes par page (BLANK + outputs vides cause-FE)
- [ ] `/administration` (BLANK sans tab) + `/administration/access-center` (BLANK) : déterminer cause (FE vs backend), fixer si FE.
- [ ] Revue des pages où backend renvoie 200 mais UI vide (cause-FE wiring).

### W5 — Réponses stockées / coût (FinOps)
- [ ] Étendre le store "première réponse" au-delà du Probe manuel : stratégie de cache par endpoint cacheable (384) documentée + hint dans la vue.

## Journal des vagues
| Horodatage | Vague | Avancement |
|---|---|---|
| 2026-06-29 00:3x | W0 (fondation) | Vue fonctionnelle + route + générateur + fix crash snowpark + sweep 64 routes. Commit 769987a. Vérifié Playwright (600 lignes). |
| 2026-06-29 ~00:5x | W1 (partiel) | Cause racine `extractApiError` durcie (15 consommateurs) + 4 fichiers `toMessage` + fix types FunctionalApiView. **`pnpm iso:build` VERT**. Commit d686e46. Découvert : 769987a ne passait que le dev compile, pas `next build` → garde-fou renforcé. Reste : ~20 fichiers anti-pattern + re-sweep Playwright. |
| 2026-06-29 01:11 CEST | W1 (FAIT) | Sweep complet: 27 sites / 18 fichiers `toMessage` (commit d109496), build `pnpm iso:build` VERT. **Re-sweep Playwright: client-accounts/ai-advisor/snowpark/costGov = ok, 0 pageerror** (crash object-as-React-child éliminé). Gotcha .next/build-vs-dev documenté. Prochaine: W2 (enrichissement catalogue). |
