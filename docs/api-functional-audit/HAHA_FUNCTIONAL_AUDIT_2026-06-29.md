# Audit fonctionnel HAHA — affichage données + onglets/actions — 2026-06-29

> Réalisé après avoir **débloqué l'affichage des données** pour HAHA (backend local :8000 avec la clé SVC valide). Sweep runtime des 64 routes + 4 agents d'audit de code (read-only). **Aucun commit / aucune modif de code.**

## 0. Headline — la donnée s'affiche enfin
| | Avant (backend déployé, SVC mort) | **Maintenant (backend local)** |
|---|---|---|
| Pages OK | ~58 mais **outputs vides** (CACHE_NOT_READY partout) | **62 / 64** |
| Erreurs API | ~50 %+ | **5 / 532 = 0.9 %** |
| account-overview | err=6, vide | **api=18, err=0, ok=17** |
| client-accounts | **CRASH** | ok, 0 erreur |

**Le « cache initializing » n'était PAS un cache vide ni un bug FE** — uniquement le SVC du host déployé. En local la clé SVC lit `DATA360_CACHE` (peuplé+frais) → vraie donnée affichée.

## 1. Erreurs runtime résiduelles (vraies, classées par cause)
1. **`/admin/usage-by` + `/admin/endpoint-usage` (500) → ✅ CORRIGÉ (env-only)** — `get_admin_events_connection()` (`backend/app/core/connection_manager.py:424`) échouait sur le compte `ye35211` (org system, accès SVC désactivé) **sans déclencher le fallback SVC** car le flag dev `CACHE_READ_ALLOW_USER_FALLBACK` était OFF. **Fix appliqué : `CACHE_READ_ALLOW_USER_FALLBACK=1` dans `backend/app/.env`** (le setting dev documenté) → admin-events bascule sur le SVC (lit `EVENT_STORE` sur HAHA). **Re-testé : usage-by + endpoint-usage = 200, access-center + admin/performance rendent.** Aucun code modifié, aucun commit, aucun deploy (env local gitignored).
2. **`/administration?tab=costGov` 404** `/org-accounts/warehouses/uchsfvb-HAHA` — **bug FE identifiant de compte** : `CostGovernancePanel.tsx:393-395` lit `account = session.user.account_name = "uchsfvb-HAHA"` (login org-qualifié) et le passe à `/org-accounts/warehouses/{account_name}` qui attend le **nom de compte Snowflake `HAHA`** (comme dans `ORGANIZATION_USAGE` : HAHA/KY11038/…). Fix = normaliser l'identifiant (résoudre `CURRENT_ACCOUNT` ou accepter les 2 formes côté backend) — **pas un simple `split('-')` aveugle**, à valider. (Affecte aussi tout appel `/org-accounts/{account_name}/*` passant le login.)
3. **`/admin/platform-settings` 403** `/administration/performance/MDR/*` — permission **cross-account** (HAHA interroge le compte MDR).
4. **DQ monitoring view absente** (`DATA_QUALITY_MONITORING_RESULTS`) — **géré gracieusement** (WARNING "skipped"), pas une erreur UI. ✅

## 2. Audit fonctionnel par module (onglets · actions · manquements)

### 🔴 Bugs fonctionnels (priorité)
1. **Deploy DDL NON-GATÉ** — `explore-design/components/deployment/StepDeploy.tsx:321` exécute du **DDL + ingestion live** sans `useCanPerform` (seulement `disabled={isDeploying}`), avale les échecs par-statement (`catch {}`). **Le plus à risque.**
2. **cortex-chat perte de données** — `cortex-chat-content.tsx:350/199` : les résultats non-texte sont réduits à « Results generated successfully. » → **rouvrir une conversation perd tout le SQL/tables**.
3. **Risk score fabriqué affiché comme réel** — `StepPreChecks.tsx:59-70` : table de points hardcodée, fallback silencieux par-dessus le vrai `ai/deployment-risk`.
4. **ml-features « Content Guard » = no-op silencieux** — toggle envoie `guardrails`, le backend l'ignore → **fausse impression de filtrage sécurité**.
5. **Mutations non-gated** (incohérent) : AI Advisor (4 actions), Query Analytics "Run Analysis", Local Analytics "Run Query".
6. **RBAC mismatch** — `deploy-app/components/DeploymentApprovals.tsx:138,275` gate sur `explore_design` au lieu de `workflow`.

### 🟠 Stubs / onglets non-fonctionnels
- **AI Intelligence** : `cortex-agents`, `semantic-views`, `vector-search` = cartes marketing vantant des actions (générer YAML, embed colonne, recherche cosinus) **sans contrôles réels**.
- **Account Overview › Data Objects** : sous-onglet **Activity = stub** ; **Databases/Schemas/Objects = même endpoint relabelé** ; scores AI/Perf/Cost = **heuristiques client sous badge « données réelles »**.
- **ContextRightBar** : "Request edit access" = stub (`// no endpoint exists`).
- **Deploy-App ne déploie pas** : code-gen Cortex + handoff vers le service hébergé (acté en code, `AppCodeReview.tsx:236`).
- **Observability › Impact Analysis** : les 4 cartes de type-de-changement sont state-only (ne changent pas le calcul).

### 🟠 Actions manquantes (endpoints live, aucune UI)
- **Account lifecycle** (le plus gros gap) : `dropAccount/suspend/resetPassword/setMfa/createResourceMonitor/suspendWarehouse/createReaderAccount…` **wirés mais surfacés dans `/client-accounts`, pas dans l'onglet Organization** (100 % lecture seule). `resumeAccount`/`rotateKeys` = 0 call site (morts).
- **Governance** : **object-picker** (`/policies/objects/{databases,schemas,tables,columns}`) **0 référence** → cause du bug « create ignore le DB/schema » ; **MFA enroll/reset**, **GUI page-access**, **security-matrix init/bulk/clear-role**, **PII scan**, **OAuth network-policies & SAML creation**.
- **Observability** : **CRUD spend-budgets + cost-monitors** (edit/delete/assign) construit en service, **0 UI** ; `probesBatchCheck`/`sensorsAll` sans wrapper.
- **Explore-Design** : **business glossary** (5 endpoints, service complet) = **0 importeur** ; tasks UI ; scheduled-deployment approval queue ; version compare/promote ; smart PK/semantic ; column ops/lineage.
- **Intelligent** : `cortex/code-generate`, `icon-suggest`, classification single-GET, snowpark `getServiceStatus` + drop-pool.
- **Workflow** : block-events SSE, dag, validate-block, estimate, run-logs ; `createActionTemplate` (pas d'UI d'authoring).

### 🟡 Dette / hygiène
- **~1800 lignes de code mort** dans `command-center/index.ts` : 4 onglets inline jamais rendus (`GovernanceGrantsTab/DataOperationsTab/PerformanceTab/ComputeTab`) + fetchers + `/command-center/tabs/{tab}` (payload consolidé) + 9 wrappers inutilisés.
- **~11 composants orphelins** explore-design (TableProfileModal, VersionHistory, ColumnPreviewModal…) + `identity-integrations.ts` (gov) + `snowflake-objects.ts` (doublon de `de-objects.ts`) = morts.
- **Drift de contrat** : `/command-center/*`, `/cortex/*` (sentiment/translate/synthesize), `/observability/*` (ack/slo/impact), 4 modals explore-design = **strings hardcodés hors `API.*`** → le registre typé est largement décoratif sur ces modules.
- **Fuites de marque** dans la copie user : `ACCOUNT_USAGE.*`, `SHOW ROLES`, `ORGANIZATION_USAGE.*`, « Snowflake account » (surface admin, borderline).
- **Erreurs avalées en « vide »** : Data Objects, Modules feed, Org audit/anomalies → 404/500 → vide, indistinguable d'un compte vraiment vide.
- **Route orpheline** : `workflow/dev-tools` (fonctionnel) absent de `routes.ts`/`modules.ts`/nav.

### ✅ Bien fait (références)
Data Quality (9 onglets réels, fallbacks honnêtes, 0 fake) · Semantic Models · AI Console · Snowpark Services · Workflow builder (lifecycle complet RBAC-gated) · Projects (approve/reject réels gated).

## 3. Top fixes priorisés (pour 100 % data + 0 erreur)
1. **Backend** : repointer la connexion **admin-events** sur le compte HAHA (débloque les 2 dernières pages admin → 100 % data). *(deploy-gated, besoin go)*
2. **Gater le deploy DDL** (`StepDeploy`) — sécurité.
3. **Fix cortex-chat** (perte de résultats SQL/tables à la réouverture).
4. **Retirer/implémenter** Content-Guard, risk-score fabriqué, Impact-Analysis cartes (anti-trompeur).
5. **Gater** AI Advisor / Query Analytics / Local Analytics.
6. **Surfacer ou supprimer** : account-lifecycle dans Organization, object-picker governance, budgets CRUD, glossary, ou les retirer si hors-scope.
7. **Hygiène** : supprimer le code mort (~1800 l. + composants orphelins), lever les strings hardcodés dans `API.*`, fixer le RBAC mismatch DeploymentApprovals.

## Annexe — comment la donnée a été débloquée (pour reproduire)
1. Backend local : `cd backend && .venv/bin/uvicorn app.main:app --port 8000` (la clé SVC `secrets/svc_data360_api.p8` lit `uchsfvb-HAHA` ✅).
2. Front : `.env.local` → `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` + `API_PROXY_UPSTREAM=…:8000`, relancer `pnpm iso:dev`.
3. Le SVC du host **déployé** reste mort (host-side) — non corrigé ici.
</content>
