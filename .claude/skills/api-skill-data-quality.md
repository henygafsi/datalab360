---
name: api-skill-data-quality
description: >
  Module Data Quality de Data360 (route /(dashboard)/data-quality, page non-routée mono-écran).
  DQ comme thème REPORTING : scorecard santé (quality-summary), explorateur 9 onglets de
  métriques, trends, anomalies ML Snowflake, Trust Center, et cycle de vie DMF complet
  (associate / custom / schedule / thresholds / breaches / catalog). 32 endpoints live
  (25 router.py + 7 dmf_lifecycle_router ; tous 401 AUTH_REQUIRED = déployés + gardés ; 32/32 re-testés IP directe 2026-06-09). Plusieurs
  routes que l'ancien doc disait « 404 / non montées » sont en réalité déployées — drift
  corrigé. Grounded sur le code réel (router.py + dmf_lifecycle_router.py) — 2026-06-09.
---

# Data Quality — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice live). Les endpoints viennent **uniquement** du slice `slices/data-quality.md`, de `openapi.json`, du code `backend/app/modules/data_quality/` et d'un **re-test live** (IP directe, 2026-06-09). Aucun endpoint inventé. Les zones non confirmées sont marquées « non vérifié ». Un `401` prouve l'existence + le gardiennage RBAC, **pas** la logique métier (compte Snowflake de test expiré → pas de test authentifié).

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/(dashboard)/data-quality` — **page non-routée mono-écran** (pas de sous-routes ; les « onglets » sont un state local) |
| **Entry point** | `apps/data360/src/app/(dashboard)/data-quality/page.tsx` (128 Ko, ~2700 l. — shell complet : KPI bar + analytics + recommandations + explorateur 9 onglets + drawers) |
| **Skeleton route** | `data-quality/loading.tsx` (705 o.) |
| **Service API front** | `apps/data360/src/app/services/data-quality/index.ts` |
| **Module backend** | `backend/app/modules/data_quality/router.py` (110 Ko) + `dmf_lifecycle_router.py` (cycle de vie DMF) + `services.py` + `dmf_lifecycle_service.py` |
| **Gate module** | router-level `dependencies=[Depends(require_module("data_quality"))]` `[trace: router.py:29]` ; le 2e router (`dmf_lifecycle_router.py:36-39`) a le même gate + `require_feature("data_quality","dmf_lifecycle")` sur associate/custom/schedule |
| **Persona principal** | DQ Analyst / Data Steward (lecture des scorecards + pilotage des DMF) — *détail métier non vérifié dans le code* |

**Nature du module = REPORTING.** Contrairement à Workflow (builder transactionnel), DQ est d'abord un **tableau de bord** : la majorité des routes sont des **lectures `GET`** servies par un **compte de service** (pas de RLS → mêmes données account-wide pour tout le rôle). Les écritures (run-check, auto-profile, dmf/*, anomaly-detection, trust-center/enable) utilisent la **connexion Snowflake de l'utilisateur** (ses propres grants).

## 2. Capacités (grounded)

| Capacité | Implémentation (endpoint · trace) |
|----------|-----------------------------------|
| **Scorecard santé** (7 KPI) | `GET /data-quality/quality-summary` `[router.py:659]` → `health_score, total_tables, freshness_violations, dmf_pass_rate, checks_run_30d, schema_changes_30d, dq_credits_30d` |
| **Snapshot mono-appel** (fan-out 9 dimensions) | `GET /data-quality/snapshot` `[router.py:2105]` — wired front derrière flag `NEXT_PUBLIC_DQ_USE_SNAPSHOT` (défaut OFF, `page.tsx:149`) |
| **Trend (reporting temporel)** | `GET /data-quality/trend-analysis?days` `[router.py:1821]` |
| **Explorateur 9 onglets** | completeness / uniqueness / freshness / ingestion / schema / classification / cost / security / dmf-results (1 GET par onglet) |
| **Anomalies ML** | `GET /data-quality/anomalies` (liste les détecteurs `SHOW SNOWFLAKE.ML.ANOMALY_DETECTION`) `[router.py:2165]` + `POST /data-quality/anomaly-detection` (crée+lance un détecteur ML) `[router.py:2211]` |
| **Trust Center DQ** | `GET …/trust-center/recommendations` `[2354]` · `POST …/trust-center/enable` `[2396]` · `GET …/trust-center/report` `[2435]` (réutilise `SNOWFLAKE.TRUST_CENTER.FINDINGS` via le module observability) |
| **DMF — cycle de vie** | `POST /data-quality/dmf/associate` · `/dmf/custom` · `/dmf/schedule` (gate `require_feature`) `[dmf_lifecycle_router.py:93/122/152]` |
| **DMF — seuils & breaches** | `POST|GET /data-quality/dmf/thresholds` `[174/197]` (persiste dans `PROJECT_EVENTS`) · `GET /data-quality/dmf/breaches` `[213]` (mesures vs seuils → breaches + actions) · `GET /data-quality/dmf/catalog` `[231]` |
| **DMF — par projet** | `POST …/projects/{id}/dmf-check` `[router.py:448]` · `GET …/projects/{id}/dmf-results` `[467]` · `GET …/projects/{id}/dmf-suggest` `[483]` · `POST /data-quality/dmf/suggest` `[504]` (variante front-contract) |
| **Check à la demande** | `POST /data-quality/run-check` (QualityCheckConfig) `[router.py:327]` + `GET /data-quality/run-history` `[407]` |
| **Profilage / ingestion** | `POST /data-quality/auto-profile` `[2037]` · `GET …/ingestion-metrics` `[1297]` |
| **Optimisation table** | `POST /data-quality/tables/{db}/{schema}/{table}/optimize` (RECLUSTER si clustered, sinon no-op + suggestion) — slice |
| **Refresh client** | bouton « Force Refresh » → re-émet les 9 GET avec `Cache-Control: no-cache` (pas d'endpoint de bust dédié) |

## 3. Référence endpoints (32 ops — statut live)

**Contrat de statut.** Re-test live le **2026-06-09** via **IP directe du host + en-tête `Host`** (sans token) : **les 32 ops (25 `router.py` + 7 `dmf_lifecycle_router.py`) renvoient `401 AUTH_REQUIRED`** = routes enregistrées, déployées, protégées par le gate module (RBAC actif). Aucune route publique (200), aucun `404`/`5xx`. Donc : tout ce qui suit est **déployé** — y compris des routes que l'ancienne doc vault disait « 404 / non montées » (voir §7 Drift).

### 3a. Reporting — scorecard, snapshot, trend (lectures service-account)
| Live | Méthode | Path | Query/params | OUTS clés |
|------|---------|------|--------------|-----------|
| 401 | GET | `/data-quality/quality-summary` | `database`, `page`, `page_size`, `sort_by`, `sort_dir`, `search` | `{data:{health_score, total_tables, freshness_violations, dmf_pass_rate, checks_run_30d, schema_changes_30d, dq_credits_30d, …}}` |
| 401 | GET | `/data-quality/snapshot` | `database` | `{generated_at, database, sections:{quality_summary, completeness, freshness, uniqueness, schema_quality, dmf_breaches, cost_metrics, ingestion_metrics, security_posture}}` (chaque section `null` si échec — dégrade par section) |
| 401 | GET | `/data-quality/trend-analysis` | `database`, `days` | `{trend:[{date, check_count, pass_count, fail_count}]}` |

### 3b. Explorateur 9 onglets (lectures service-account, pagination offset/limit)
| Live | Méthode | Path | Query | Source Snowflake |
|------|---------|------|-------|------------------|
| 401 | GET | `/data-quality/completeness-metrics` | `database`,`offset`,`limit` | `LOCAL.DATA_QUALITY_MONITORING_RESULTS` (NULL_COUNT réel) LEFT JOIN `ACCOUNT_USAGE.TABLES` — **NULL si non mesuré** (n'invente plus 0) |
| 401 | GET | `/data-quality/uniqueness-metrics` | `database`,`offset`,`limit` | candidate-keys heuristiques + `DUPLICATE_COUNT` mesuré si DMF |
| 401 | GET | `/data-quality/freshness-metrics` | `database`,`offset`,`limit`,`max_age_hours` | `INFORMATION_SCHEMA.TABLES.LAST_ALTERED` |
| 401 | GET | `/data-quality/ingestion-metrics` | `limit`,`days` | `ACCOUNT_USAGE.COPY_HISTORY` |
| 401 | GET | `/data-quality/schema-quality` | `database`,`offset`,`limit` | `INFORMATION_SCHEMA.TABLES/.COLUMNS/.TABLE_CONSTRAINTS` |
| 401 | GET | `/data-quality/classification-coverage` | `limit` | `ACCOUNT_USAGE.TAG_REFERENCES` |
| 401 | GET | `/data-quality/cost-metrics` | `database`,`offset`,`limit` | `ACCOUNT_USAGE.TABLE_STORAGE_METRICS` |
| 401 | GET | `/data-quality/security-posture` | `database`,`offset`,`limit` | `ACCOUNT_USAGE.POLICY_REFERENCES/.GRANTS_TO_ROLES` |
| 401 | GET | `/data-quality/dmf-results` | `limit`,`days` | `LOCAL.DATA_QUALITY_MONITORING_RESULTS` (fallback `INFORMATION_SCHEMA.DATA_METRIC_FUNCTION_REFERENCES`) |

### 3c. Anomalies & Trust Center (REPORTING — déployées, non surfacées front)
| Live | Méthode | Path | INS | OUTS |
|------|---------|------|-----|------|
| 401 | GET | `/data-quality/anomalies` | — | `{anomalies:[], detectors[], detector_count, note}` — `SHOW SNOWFLAKE.ML.ANOMALY_DETECTION`, **honnête vide** si aucun détecteur |
| 401 | POST | `/data-quality/anomaly-detection` | body `{database*, schema*(alias), table*, timestamp_column*, value_column*}` | crée (IF NOT EXISTS) + lance un modèle `SNOWFLAKE.ML.ANOMALY_DETECTION` ; 403 honnête si privilège manquant |
| 401 | GET | `/data-quality/trust-center/recommendations` | — | `{recommendations[], count, source:"SNOWFLAKE.TRUST_CENTER.FINDINGS"}` (findings filtrés DQ) |
| 401 | POST | `/data-quality/trust-center/enable` | body `{database*, schema*(alias), table*}` | opt-in d'une table au tracking Trust-Center DQ |
| 401 | GET | `/data-quality/trust-center/report` | — | findings Trust-Center des tables opt-in |

### 3d. DMF — cycle de vie & seuils (écritures per-user ; `dmf_lifecycle_router.py`)
| Live | Méthode | Path | Gate add. | INS | OUTS |
|------|---------|------|-----------|-----|------|
| 401 | POST | `/data-quality/dmf/associate` | `require_feature("data_quality","dmf_lifecycle")` | `AssociateDmfRequest` | feedback par colonne — `ALTER TABLE … ADD DATA METRIC FUNCTION` |
| 401 | POST | `/data-quality/dmf/custom` | idem | `CreateCustomDmfRequest` | `CREATE … DATA METRIC FUNCTION` |
| 401 | POST | `/data-quality/dmf/schedule` | idem | `SetScheduleRequest` | `ALTER TABLE … SET DATA_METRIC_SCHEDULE` |
| 401 | POST | `/data-quality/dmf/thresholds` | (module) | `ThresholdRequest{table_name, metric, threshold, operator?, project_id?}` | persiste **réellement** dans `PROJECT_EVENTS` `[dmf_lifecycle_router.py:174]` |
| 401 | GET | `/data-quality/dmf/thresholds` | (module) | `table_name?`,`project_id?` | `{thresholds[], count}` (dernier seuil par table·métrique) |
| 401 | GET | `/data-quality/dmf/breaches` | (module) | `table_name?`,`project_id?`,`limit=200` | `{breaches[…+ actions]}` — compare `DATA_QUALITY_MONITORING_RESULTS` aux seuils |
| 401 | GET | `/data-quality/dmf/catalog` | (module) | `project_id?` | inventaire par compte (tables × métriques × breaches) |

### 3e. DMF par projet · check à la demande · profilage · optimisation
| Live | Méthode | Path | INS | OUTS |
|------|---------|------|-----|------|
| 401 | POST | `/data-quality/projects/{project_id}/dmf-check` | path `project_id` · query `table*`,`columns*`(csv),`dmf_name="NULL_COUNT"` | `{…results}` — `SELECT <DMF>(REF(table[,'col']))` ; **sécurisé** : `quote_identifier(allow_qualified)` + `validate_identifier` `[services.py:711]` |
| 401 | GET | `/data-quality/projects/{project_id}/dmf-results` | path `project_id` · query `table_name*` | associations + résultats DMF |
| 401 | GET | `/data-quality/projects/{project_id}/dmf-suggest` | path `project_id` · query `table_name*` | suggestions (`DESC TABLE` + heuristiques) |
| 401 | POST | `/data-quality/dmf/suggest` | body `{table_name*}` | suggestions remappées `dmf_name`/`applicable_columns` (+ clés d'origine `dmf`/`columns`) — variante front-contract (DQ-03) |
| 401 | POST | `/data-quality/run-check` | body `QualityCheckConfig{table*, completeness_checks?, uniqueness_checks?, freshness_config?, expected_schema?, custom_rules?}` | `StandardResponse{data:{table, checks[], summary:{total, passed, failed, overall_status}}}` — non persisté |
| 401 | GET | `/data-quality/run-history` | `table?`,`project_id?`,`limit` | `StandardResponse` |
| 401 | POST | `/data-quality/auto-profile` | body `AutoProfileRequest{table_fqn*}` | par colonne `{APPROX_COUNT_DISTINCT, MIN, MAX, AVG, STDDEV, null_count}` (1 requête agrégée, pas de N+1) |
| 401 | POST | `/data-quality/tables/{database}/{schema}/{table}/optimize` | path `db*`,`schema*`,`table*` | RECLUSTER si clustered, sinon no-op + suggestion |

## 4. Modèle de données (sources Snowflake)

| Source | Opération | Endpoints | Connexion | Cache (app) |
|--------|-----------|-----------|-----------|-------------|
| `SNOWFLAKE.ACCOUNT_USAGE.TABLES` | SELECT | quality-summary, completeness, freshness(violations), trend | service | 900 s (`_TTL_HISTORICAL`) |
| `…ACCOUNT_USAGE.COLUMNS / TAG_REFERENCES / TABLE_CONSTRAINTS / COPY_HISTORY / TABLE_STORAGE_METRICS / POLICY_REFERENCES / GRANTS_TO_ROLES` | SELECT | onglets explorateur respectifs | service | 900 s |
| `SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS` | SELECT | dmf-results, completeness (NULL_COUNT réel), uniqueness, quality-summary(dmf_pass_rate), breaches | service | 900 s |
| `INFORMATION_SCHEMA.TABLES/.COLUMNS/.TABLE_CONSTRAINTS` | SELECT | freshness, schema-quality | service | 300 s (`_TTL_LIVE`) |
| `INFORMATION_SCHEMA.DATA_METRIC_FUNCTION_REFERENCES` | SELECT | dmf-results (fallback), projects/dmf-results | service | 300-900 s |
| `SNOWFLAKE.TRUST_CENTER.FINDINGS` (via observability) | SELECT | trust-center/recommendations,/report | user | 600 s |
| `SNOWFLAKE.ML.ANOMALY_DETECTION` | SHOW / CREATE / `<!RESULT>` | anomalies, anomaly-detection | user | 300 s (GET) |
| `SNOWFLAKE.CORE.<DMF>(REF(…))` | SELECT | run-check, projects/dmf-check | user | none |
| table cible (`DB.SCHEMA.TABLE`) | SELECT COUNT/DISTINCT/MAX/agg | run-check, auto-profile | user | none |
| table cible | `ALTER TABLE ADD/SET DATA METRIC FUNCTION` | dmf/associate, dmf/schedule | user | invalide `DATA_QUALITY` |
| `CP_DATA360.GOUVERNANCE` (schéma) | `CREATE … DATA METRIC FUNCTION` | dmf/custom | user | invalide `DATA_QUALITY` |
| `CP_DATA360.PROJECT_EVENTS` | INSERT (audit + seuils) | dmf/thresholds, associate, custom, schedule | service/user | — |

**Classes de cache** : `_TTL_HISTORICAL=900 s` (ACCOUNT_USAGE / DMF results, latence source 45 min–3 h) ; `_TTL_LIVE=300 s` (INFORMATION_SCHEMA, quasi-temps réel). Décorateurs `@session_cache(ttl)` (clé `session:{user}:{account}:{func}:{hash}`) ; mutations `@invalidates_cache(CacheKey.DATA_QUALITY[, QUALITY_CHECKS])` + push SSE.

## 5. §5 deep — DQ comme thème REPORTING (trifecta scorecard / charts / breaches)

### 5.1 Le « trifecta » reporting
1. **Scorecard** — `quality-summary` produit un `health_score` pondéré côté serveur + 6 sous-KPI ⇒ la barre KPI 7-tuiles. Reporting pur, lecture service-account, 900 s.
2. **Charts/trends** — `trend-analysis` (aire quotidienne pass/fail) + radar/distribution/heatmap **dérivés client** des données déjà chargées (pas d'endpoint dédié). `snapshot` mutualise le tout en un appel (fan-out 9 sections, dégrade par section).
3. **Breaches / triage** — `dmf/breaches` compare les mesures DMF aux seuils persistés et renvoie **breaches + actions suggérées** ; surfacé front (`page.tsx:1268/1436/1861`, threshold-aware). C'est le vrai moteur de triage (l'ancien « breach banner » diagnostique-only est dépassé).

### 5.2 Fiche « ins/outs » des endpoints clés (rejouable)
> Tous `401` live (déployés, re-test 2026-06-09). Le test authentifié reste à faire.

| But | Endpoint | INS (path · query · body) | OUTS (consommée) |
|-----|----------|---------------------------|------------------|
| scorecard | `GET /data-quality/quality-summary` | query `database?`,`days?`(30) | `{data:{health_score, dmf_pass_rate, freshness_violations, checks_run_30d, …}}` |
| snapshot 1-appel | `GET /data-quality/snapshot` | query `database?` | `{sections:{quality_summary, completeness, …, dmf_breaches}}` |
| trend | `GET /data-quality/trend-analysis` | query `days?`(≤90) | `{trend:[{date, pass_count, fail_count}]}` |
| triage breaches | `GET /data-quality/dmf/breaches` | query `table_name?`,`project_id?`,`limit?`(200) | `{breaches:[{metric, value, threshold, action}]}` |
| catalogue DMF | `GET /data-quality/dmf/catalog` | query `project_id?` | inventaire tables × métriques × breaches |
| suggérer DMF | `POST /data-quality/dmf/suggest` | body `{table_name*}` | `{suggestions:[{dmf_name, applicable_columns, …}]}` |
| associer DMF | `POST /data-quality/dmf/associate` | body `AssociateDmfRequest{table, columns[], dmf_name}` | feedback par colonne |
| seuil (persiste) | `POST /data-quality/dmf/thresholds` | body `{table_name, metric, threshold, operator?}` | `{status, …}` → `PROJECT_EVENTS` |
| planifier DMF | `POST /data-quality/dmf/schedule` | body `SetScheduleRequest{table, schedule}` | `ALTER TABLE … SET DATA_METRIC_SCHEDULE` |
| anomalies (liste) | `GET /data-quality/anomalies` | — | `{detectors[], detector_count, note}` |
| anomalie (run ML) | `POST /data-quality/anomaly-detection` | body `{database, schema, table, timestamp_column, value_column}` | anomalies détectées |
| check ad-hoc | `POST /data-quality/run-check` | body `QualityCheckConfig{table*, completeness_checks?, …}` | `{data:{summary:{overall_status}, checks[]}}` |
| profilage | `POST /data-quality/auto-profile` | body `{table_fqn*}` | stats par colonne |
| Trust Center | `GET /data-quality/trust-center/report` | — | findings DQ des tables opt-in |

### 5.3 Optimisation cache par rôle Snowflake (renvoi vault)
Les lectures 3a/3b/3c utilisent un **compte de service** → réponse **identique pour tout le rôle** (pas de RLS). Candidates idéales pour un keying **par rôle** (`session:{role}:…`) ou `shared_cache`, comme détaillé dans le vault `workflow.md §C` et `data-quality.md §C`. Normaliser `days`/`max_age_hours` (arrondi) avant le hash pour éviter le cache thrashing temporel. **Garde-fou** : ne PAS keyer par rôle les routes `projects/{id}/*` (scope projet).

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) |
|-----|---------|------------------------|
| **loading** | ✓ | `loading.tsx` skeleton route-level ; `KpiSkeleton` inline + skeleton par onglet (`page.tsx`) ; freshness badge « fresh 30s ago » / « cached 2m ago » |
| **empty** | ✓ | états vides par onglet (« Run NULL_COUNT checks to see this data ») ; « All quality checks passed » (recommandations) ; empty-state DMF Results pointe vers Governance > Policies |
| **error** | ✓ | `ErrorBoundary` au niveau page ; bannière d'erreur + Retry par panneau ; trend a sa propre error boundary inline (un échec trend ne casse pas la page) |
| **dark mode** | ✓ | **205 occurrences `dark:`** dans `page.tsx` ; 3 dans `loading.tsx` ; pills statut, KPI tiles, tables, pagination toutes déclinées `dark:` |

**Accessibilité** : skeletons animés `animate-pulse` ; pills PASS/FAIL/WARNING colorées + texte (pas couleur-seule). ⚠ Vérifier `aria-label` sur les chips de filtre et boutons d'action header — **non vérifié**.

**Dedupe & flag** : `_inFlight` Map coalesce les GET identiques dans le même tick (`page.tsx:159`, corrige un double-appel completeness en prod) ; `USE_SNAPSHOT` (`page.tsx:149`, `NEXT_PUBLIC_DQ_USE_SNAPSHOT`, défaut OFF) bascule l'init vers `/snapshot`.

## 7. Drift détecté (vs ancien vault data-quality.md + vs slice + vs code)

> Cause racine identique à Workflow : l'ancien doc a confondu **route absente du déploiement (404)** avec **route présente mais non-câblée front / `deprecated`**. Le re-test live (2026-06-09, **32/32 = `401`**) corrige.

1. **`projects/{id}/dmf-check` & `dmf-suggest` — dits « non montés → 404 » ⇒ DÉPLOYÉS (`401` live).** Décorés `@router.post`/`@router.get` à `router.py:448/483`. **De plus la faille d'injection est corrigée** : `dmf-check` utilise désormais `quote_identifier(table, allow_qualified=True)` + `validate_identifier(col)` `[services.py:711]` (l'ancien doc signalait des f-strings non sécurisées — DQ-03 résolu).
2. **`POST /data-quality/dmf/suggest` (504) ajouté** — variante front-contract qui **remappe** `dmf`/`columns` → `dmf_name`/`applicable_columns` (l'ancien « key mismatch latent » est corrigé, les deux jeux de clés sont présents).
3. **`completeness-metrics` ne hardcode plus `0`/`100`.** Lit le `NULL_COUNT` **réel** depuis `LOCAL.DATA_QUALITY_MONITORING_RESULTS`, renvoie **`NULL` si non mesuré** (DQ-01 résolu). L'ancien diagnostic « FAKED METRIC » est obsolète.
4. **Seuils : `POST /data-quality/thresholds` (stub non-persistant) → remplacé par `POST/GET /data-quality/dmf/thresholds`** qui **persiste réellement** dans `PROJECT_EVENTS` `[dmf_lifecycle_router.py:174-211]` (DQ — gap « threshold non persisté » résolu). Path drift : l'ancien `/data-quality/thresholds` n'existe plus dans le router.
5. **`dmf/breaches` est désormais surfacé front** (threshold-aware, `page.tsx:1268/1436/1861`) — l'ancien Gap « pas de surface de remédiation » est partiellement résolu (breaches + actions retournées).
6. **5 routes ABSENTES du slice 2026-06-08 mais présentes dans le code + `401` live 2026-06-09** ⇒ **déployées après le sweep** : `/snapshot`, `/anomaly-detection`, `/trust-center/recommendations`, `/trust-center/enable`, `/trust-center/report`. (Le slice n'en liste que 25 ; le module en compte 27 côté `router.py` + 7 côté `dmf_lifecycle_router.py`.) Provenance honnête : code + live (deux sources), pas le slice.
7. **`/anomalies` n'est PLUS un z-score hand-rolled.** Implémentation actuelle = `SHOW SNOWFLAKE.ML.ANOMALY_DETECTION` (liste les détecteurs ML natifs, honnête vide). L'ancien doc décrivait une CTE z-score `2.0` sur `ACCOUNT_USAGE.TABLES` — obsolète.

**Non vérifié / gaps** : `anomalies`, `anomaly-detection`, `trust-center/*` sont **déployés mais sans caller front** (aucun appel dans `page.tsx`/`index.ts`) → capacités REPORTING invisibles (🟡). `run-check` ✅ **DQ-02 résolu (2026-06-09, vérif adversariale)** : `handleRunThresholdCheck` (`page.tsx:1780`) appelle `runQualityCheckOnTable({table, completeness_checks, …})` (`index.ts:295`) — body correct ; ancien `{database: 'CP_DATA360'}` = `@deprecated` dans le service. Gap résiduel : affichage des résultats `thResult` non testé runtime authentifié. Logique métier (valeurs réelles) **non testée** (compte Snowflake expiré).

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Onglet « Anomalies »** dans l'explorateur, branché sur `GET /data-quality/anomalies` (+ CTA « Lancer un détecteur » → `POST /anomaly-detection`). Bénéfice : surface une capacité ML déployée mais invisible.
2. **Panneau « Trust Center »** (carte repliable) branché sur `GET /data-quality/trust-center/report` + `recommendations` — findings DQ-pertinents avec deep-link Governance/Observability. Capacité déployée, 0 caller front aujourd'hui.
3. **Activer `/snapshot` par défaut** (`NEXT_PUBLIC_DQ_USE_SNAPSHOT=true`) une fois validé authentifié : 1 appel au lieu de N au chargement initial. [perf]
4. **Drawer « Breaches »** dédié sur `dmf/breaches` rendant les `action` par breach en boutons (backfill nulls / dédup keys / check upstream), `disabled` si grant manquant (`useCanPerform`). Bénéfice : remédiation gouvernée, pas seulement diagnostic.
5. **CTA « Suggérer des monitors »** par table (onglet Schema/Completeness) → `POST /dmf/suggest` puis boutons Apply → `dmf/associate`. Bénéfice : boucle suggest→apply complète (routes maintenant déployées).
6. **Câbler le bouton « Profile »** (aujourd'hui `toast.success` stub) sur `POST /auto-profile` + drawer de résultats. [trivial-safe]
7. **KPI `dq_credits_30d`** : sourcer `ACCOUNT_USAGE.DATA_QUALITY_MONITORING_USAGE_HISTORY` (retourne 0 aujourd'hui) ou afficher `—` honnête. [reporting fidélité]
8. **Badge `require_feature` désactivé** sur Associate/Custom/Schedule si le feature `dmf_lifecycle` n'est pas accordé (gate réel `dmf_lifecycle_router.py:94`), au lieu d'un 403 au submit. [honnêteté UX]

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir un JWT (login Data360), puis `-H "Authorization: Bearer $TOKEN"`. Rôle requis = module `data_quality` actif ; associate/custom/schedule exigent en plus le feature `dmf_lifecycle`. Re-test structurel possible sans token via IP directe du host + en-tête `Host` (un `401` = route déployée + gardée).

```bash
BASE=https://<host>        # ex. http://localhost:80
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Reporting — scorecard, snapshot, trend (lecture ; tout rôle data_quality)
curl -s $H "$BASE/data-quality/quality-summary?days=30"     # attendu 200 (401 sans token)
curl -s $H "$BASE/data-quality/snapshot"                    # fan-out 9 sections
curl -s $H "$BASE/data-quality/trend-analysis?days=30"

# 2. Explorateur (1 GET par onglet)
for t in completeness uniqueness freshness ingestion schema classification cost security ; do
  curl -s $H "$BASE/data-quality/${t}-metrics?limit=50" ; done
curl -s $H "$BASE/data-quality/dmf-results?limit=200"

# 3. Anomalies ML (REPORTING — déployé, non surfacé)
curl -s $H "$BASE/data-quality/anomalies"
curl -s $H -X POST "$BASE/data-quality/anomaly-detection" \
  -d '{"database":"RAW","schema":"SALES","table":"ORDERS","timestamp_column":"ORDER_TS","value_column":"AMOUNT"}'

# 4. Trust Center DQ
curl -s $H "$BASE/data-quality/trust-center/report"
curl -s $H "$BASE/data-quality/trust-center/recommendations"

# 5. DMF — suggest → associate → schedule → thresholds → breaches → catalog
curl -s $H -X POST "$BASE/data-quality/dmf/suggest" -d '{"table_name":"RAW.SALES.ORDERS"}'
curl -s $H -X POST "$BASE/data-quality/dmf/associate" -d '{"table":"RAW.SALES.ORDERS","columns":["EMAIL"],"dmf_name":"NULL_COUNT"}'  # feature dmf_lifecycle requis
curl -s $H -X POST "$BASE/data-quality/dmf/schedule"  -d '{"table":"RAW.SALES.ORDERS","schedule":"60 MINUTE"}'
curl -s $H -X POST "$BASE/data-quality/dmf/thresholds" -d '{"table_name":"RAW.SALES.ORDERS","metric":"NULL_COUNT","threshold":0,"operator":">"}'
curl -s $H "$BASE/data-quality/dmf/breaches?table_name=RAW.SALES.ORDERS"
curl -s $H "$BASE/data-quality/dmf/catalog"

# 6. Check à la demande + profilage
curl -s $H -X POST "$BASE/data-quality/run-check" \
  -d '{"table":"RAW.SALES.ORDERS","completeness_checks":["EMAIL"],"uniqueness_checks":["ORDER_ID"],"freshness_config":{"column":"ORDER_TS","max_age_hours":24}}'
curl -s $H -X POST "$BASE/data-quality/auto-profile" -d '{"table_fqn":"RAW.SALES.ORDERS"}'
```

**Résultats attendus** :
- Sans token → **401 AUTH_REQUIRED** sur les 32 ops (contrat RBAC vérifié, 32/32 re-testées live 2026-06-09).
- Lectures service-account → mêmes données account-wide pour tout le rôle (pas de RLS).
- `dmf-check` avec identifiant invalide → **400** (`validate_identifier`/`quote_identifier`).
- `anomaly-detection` sans privilège ML → **403 honnête** (pas de fabrication).
- associate/custom/schedule sans feature `dmf_lifecycle` → **403** (gate `require_feature`).
- `anomalies` sans détecteur configuré → `{anomalies:[], note:"no anomaly detectors configured"}` (vide honnête, pas d'erreur).
```
```
> **Findings sécurité** (IP du host, modèle de cache par rôle, gate `/cache/*`) : voir le rapport privé `.claude/skills/` — **hors vault publié**.

> Vérifié 2026-06-09 (vérification adversariale) : 32 endpoints vérifiés — contrôle négatif 404 confirme 401=déployé ; 7 routes absentes openapi/slice live-confirmées ; 3 corrections (DQ-02 résolu, Gap#8 obsolète, §7 mis à jour) ; 3 claims UI vérifiés ; backend DQ-01 spot-checké ; vault propre ; live-retest OK.
