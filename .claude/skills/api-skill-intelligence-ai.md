---
name: api-skill-intelligence-ai
description: >
  Module Intelligence / AI de Data360 (route /intelligent, module backend `ai_intelligence`).
  Couche IA partagée de la plateforme : Cortex LLM (complete, code-generate, synthesize, icon-suggest),
  NL→SQL (Cortex Analyst /query + /analyst/query), ML one-shot (sentiment/translate/summarize/embeddings),
  ML avancé (classification, finetune, Document AI, Top-Insights), Query Analytics, semantic models/views,
  vector search, Snowpark SPCS, Local Analytics DuckDB, agents. + modules adjacents recommendations
  (engine réel /api/recommendations), chat, notifications. 90+ endpoints live (tous 401 = déployés+gardés),
  re-testés IP directe 2026-06-09. Grounded sur le code réel — corrige une large dérive « 404 » du vault.
---

# Intelligence / AI — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Les endpoints viennent **uniquement** des slices live (`cortex-analytics-ai.md`, `recommendations.md`, `chat.md`) + `openapi.json`, et des décorateurs réels de `router.py`. Re-test live le 2026-06-09 via IP directe. Zones non confirmées = « non vérifié ».
>
> ⚠️ **Correction de dérive majeure.** Le vault `pages/intelligence.md` (état antérieur) marquait 🔴 / « 404 / no backend route » les familles **Advanced ML**, **Query Analytics**, **Snowpark/SPCS**, **code-generate** et les **mutations notifications**. C'est **faux** : ces routes ont toutes un décorateur dans `cortex/router.py` et répondent **401** live (déployées + gardées). Voir §7 (Drift) — c'est le cœur de ce skill.

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/intelligent` |
| **Entry point** | `apps/data360/src/app/(dashboard)/intelligent/page.tsx` (40,6 Ko — shell KPI + barre 11 onglets URL-driven `?tab=`) |
| **Module backend** | `app/modules/intelligence/cortex/router.py` (4818 l. ; `cortex_router = APIRouter(prefix=cortex, dependencies=[Depends(require_module("ai_intelligence"))])` — `router.py:50-55`) |
| **Service backend** | `intelligence/cortex/service.py`, `snowpark_services.py`, `duckdb_service.py`, `ai_cache.py`, `usage_metrics.py` |
| **Composants onglets** | `semantic-models-content.tsx` · `cortex-chat-content.tsx` · `ai-advisor-content.tsx` · `ml-features-content.tsx` · `advanced-ml-content.tsx` (60,5 Ko) · `query-analytics-content.tsx` (26 Ko) · `local-analytics-content.tsx` · `snowpark-services-content.tsx` (36,2 Ko) ; agents/semantic-views/vector-search rendus inline dans `page.tsx` |
| **Services API front** | `app/services/cortex/{ai,duckdb,kpis,ml-features,query-analytics,query,recommend,semantic-models,snowpark}.ts` + `app/services/recommendations/index.ts` + `app/services/notifications/index.ts` |
| **Modules backend adjacents** | `recommendations` (`/api/recommendations`, engine réel) · `chat` (`/chat`) · `notifications` (`/notifications`) |

**Tags OpenAPI couvrant la surface IA** (= regroupements de la doc générée, source `openapi.json`) : `Cortex Analytics & AI` **67 ops** · `Recommendations` **12** · `Chat` **11** · `Notifications` **5** = **95 ops** sur ce périmètre. Aucune feature de « tagging » Cortex distincte dans ce module (le tagging de données vit en gouvernance ; l'« étiquetage » IA le plus proche ici = `POST /cortex/icon-suggest` et `ai_classify` côté workflow).

**Gates par module (vérifiés dans le code, 2026-06-09).**

| Module | Gate router (vérifié) | Remarque |
|--------|------------------------|----------|
| `cortex` (`/cortex/*`) | `Depends(require_module("ai_intelligence"))` au niveau router (`router.py:53`) **+** rate-limit IP 20/60 s sur routes créditées (`_check_cortex_rate_limit`, `router.py:85`) | **Aucun** `require_action` ni `require_accountadmin` — pas de split par rôle dans le module |
| `recommendations` (`/api/recommendations/*`) | `Depends(get_current_user)` **par handler uniquement** (`router.py:74,111,…`) | **Pas** de `require_module`, **pas** de `require_action` → 401 sans token mais **aucune entitlement par module** (gap gouvernance) |
| `chat` (`/chat/*`) | `Depends(get_current_user)` par handler (`chat/routers/chat.py`) | auth-only, pas de module gate |
| `notifications` (`/notifications/*`) | `Depends(get_current_user)` par handler (`notifications/routers/notifications.py`) | auth-only — **PAS** `require_module("ai_intelligence")` (le vault le disait à tort) |

**Rôles** — le seul fait vérifiable est l'entitlement module `ai_intelligence` (router-level). Aucun `useCanPerform`/flag `canAi*` vérifié dans les composants (à confirmer). Personas ci-dessous = **non vérifié** : Data Analyst (chat NL, ML one-shot), Data Scientist (Advanced ML, semantic models), Platform Admin (Query Analytics coût, Snowpark lifecycle).

## 2. Capacités (grounded — câblé `[C]` vs déclaré-non-utilisé `[D]`)

| Capacité | Endpoint(s) | FE wiring (preuve) | Statut |
|----------|-------------|--------------------|--------|
| KPI strip Cortex | `GET /cortex/kpis` | `services/cortex/kpis.ts` ; `page.tsx` Refresh | [C] |
| Catalogue de modèles + défauts recommandés | `GET /cortex/models` | `ml-features-content.tsx:56` (« resolved live from GET /cortex/models ») | [C] |
| LLM completion (chat / assistant / advisor narratif) | `POST /cortex/complete` | `services/cortex/ml-features.ts:114 generateCompletion` | [C] |
| **NL→SQL** raw query (Cortex Analyst) | `POST /cortex/query` | `services/cortex/query.ts:31 queryCortex` | [C] |
| **NL→SQL** dédié (Analyst REST) | `POST /cortex/analyst/query` | path enregistré `api-contracts.ts:379` mais **TODO « no backend route … Analyst API not exposed »** (`:377`) + aucun service caller | **[D]** |
| Génération de code multi-langage | `POST /cortex/code-generate` | `services/cortex/ai.ts:105 generateCode` | [C] |
| Lignes synthétiques (≤1000) | `POST /cortex/synthesize-rows` | `services/cortex/ai.ts:110 synthesizeRows` | [C] |
| Suggestion d'icône Lucide (charts/titres) | `POST /cortex/icon-suggest` | `services/cortex/ai.ts:115` | [C] |
| Sentiment / Translate / Summarize | `POST /cortex/ml/{sentiment,translate,summarize}` | `services/cortex/ml-features.ts:141,199,222` | [C] |
| Embeddings (batch) | `POST /cortex/embeddings` | `services/cortex/ml-features.ts:251` | [C] |
| Semantic models CRUD + génération DDL→YAML | `GET/POST/PUT/DELETE /cortex/semantic-models[/...]`, `/generate`, `/generate-and-save` | `services/cortex/semantic-models.ts` | [C] |
| Semantic views (inventaire) | `GET /cortex/semantic-views` | `page.tsx` onglet inline | [C] |
| Vector columns (inventaire) | `GET /cortex/vectors/columns` | `page.tsx` onglet inline | [C] |
| Agents Cortex (inventaire) | `GET /cortex/agents` | `page.tsx` onglet inline | [C] |
| **ML avancé — Classification** | `POST /cortex/ml/classification/{train,predict}`, `GET …/models`, `GET …/{name}/metrics`, `DELETE …/{name}` | `advanced-ml-content.tsx:69-71` (apiClient typé) | [C] |
| **ML avancé — Fine-tuning** | `POST /cortex/ml/finetune`, `GET …/jobs[/{id}]`, `POST …/{id}/cancel` | `advanced-ml-content.tsx:58-61` | [C] |
| **ML avancé — Document AI** | `POST /cortex/ml/document-ai/{models,predict,upload,extract-to-table}`, `GET …/models` | `advanced-ml-content.tsx:64-66` | [C] |
| **ML avancé — Top-Insights** | `POST /cortex/ml/top-insights[/{name}/analyze]`, `GET …` | `advanced-ml-content.tsx` | [C] |
| **Query Analytics** (analyse batch de QUERY_HISTORY) | `POST /cortex/query-analytics/analyze`, `GET …/{results,summary,redundant-groups}` | `services/cortex/query-analytics.ts` (4 paths) | [C] |
| **Local Analytics** DuckDB (zéro warehouse) | `GET /cortex/duckdb/datasets`, `POST /cortex/duckdb/{query,query-stage}` | `services/cortex/duckdb.ts` | [C] |
| Explorateur DB/schémas/tables (contexte chat) | `GET /cortex/explore/databases|schemas`, `POST /cortex/explore/tables` | `services/cortex/` | [C] |
| **Snowpark / SPCS** — pools, services, Streamlit, repos, endpoints | 17 routes `/cortex/snowpark/*` (`router.py:3818-4308`) | `services/cortex/snowpark.ts` + `snowpark-services-content.tsx` | [C] |
| **AI Advisor — engine réel** (analyse + cycle de vie) | `POST /api/recommendations/analyze`, `GET /`, `POST /{id}/{acknowledge,resolve,dismiss,…}` | `ai-advisor-content.tsx:21-25` importe `services/recommendations` | [C] |
| Advisor narratif (legacy/fallback) | `POST /cortex/recommend` | `services/cortex/recommend.ts` — **route 404 backend** | **[D] cassé** |
| Notifications (inbox + mutations) | `GET /notifications`, `/unread-count`, `PATCH /{id}/read`, `POST /mark-all-read`, `/broadcast` | `services/notifications/index.ts` | [C] |
| Chat (DM/groupe/messages/attachments/online) | 11 routes `/chat/*` + WS | `services/chat` (non lu en détail) | [C] |

## 3. Référence endpoints — statut live (re-test IP directe 2026-06-09)

**Méthode de re-test.** `curl -s -m 12 -H "Host: api.datalab360.io" -X <M> http://167.172.162.172<PATH>`. `401` = route déployée + gardée + présente OpenAPI. `200` = publique. `404` = absente du déploiement. Aucun `5xx`. Un `401` prouve l'existence + le gardiennage, **pas** la logique métier (compte Snowflake de test expiré → test fonctionnel authentifié non fait).

### 3a. Cortex — LLM, NL→SQL, génération (slice cortex-analytics-ai, extrait)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/cortex/kpis` | KPIs IA (models_active, queries_today, avg_response, accuracy, cortex_usage) |
| 401 | GET | `/cortex/models` | Catalogue modèles complete+embedding + défauts recommandés |
| 401 | POST | `/cortex/complete` | LLM completion (rate-limité) |
| 401 | POST | `/cortex/query` | Raw query / Cortex Analyst NL→SQL (utilisé par le chat) |
| 401 | POST | `/cortex/analyst/query` | Cortex Analyst NL→SQL→results **dédié** (déclaré, FE 0 ref) |
| 401 | POST | `/cortex/code-generate` | Génère Python/SQL/YAML/JSON/TS/Bash (rate-limité) |
| 401 | POST | `/cortex/synthesize-rows` | ≤1000 lignes synthétiques sur schéma cible (rate-limité) |
| 401 | POST | `/cortex/icon-suggest` | Cortex choisit l'icône Lucide d'un chart/titre |
| 401 | POST | `/cortex/embeddings` | Embeddings batch (rate-limité) |
| 401 | GET | `/cortex/conversations[/{id}]` | Historique des échanges IA de l'appelant |

### 3b. Cortex — ML one-shot + ML avancé (★ = vault disait 404, RÉEL 401)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | POST | `/cortex/ml/sentiment` | Sentiment (inline ou table) |
| 401 | POST | `/cortex/ml/translate` | Traduction (11 langues) |
| 401 | POST | `/cortex/ml/summarize` | Résumé (max_length ignoré côté serveur) |
| 401 ★ | POST | `/cortex/ml/classification/train` · `/predict` | Entraîner / prédire (`router.py:2881,2937`) |
| 401 ★ | GET | `/cortex/ml/classification/models` · `…/{name}/metrics` | Lister modèles / métriques |
| 401 ★ | DELETE | `/cortex/ml/classification/{name}` | Drop modèle |
| 401 ★ | POST | `/cortex/ml/finetune` · `…/jobs/{id}/cancel` | Créer / annuler un job fine-tune (`router.py:2460,2571`) |
| 401 ★ | GET | `/cortex/ml/finetune/jobs[/{id}]` | Lister / décrire jobs |
| 401 ★ | POST | `/cortex/ml/document-ai/{models,predict,upload,extract-to-table}` | Document AI (`router.py:2595-2790`) |
| 401 ★ | GET | `/cortex/ml/document-ai/models` | Lister modèles Doc-AI |
| 401 ★ | POST | `/cortex/ml/top-insights[/{name}/analyze]` | Top-Insights (`router.py:3058,3084`) |
| 401 ★ | GET | `/cortex/ml/top-insights` | Lister instances |

### 3c. Cortex — Query Analytics (★ vault 404 → RÉEL 401) + semantic + vectors + agents

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 ★ | POST | `/cortex/query-analytics/analyze` | Analyse Cortex de QUERY_HISTORY (`router.py:3205`) |
| 401 ★ | GET | `/cortex/query-analytics/{results,summary,redundant-groups}` | Findings / KPIs / groupes redondants (`router.py:3449,3496,3618`) |
| 401 | GET/POST/PUT/DELETE | `/cortex/semantic-models[/list,/{name},/generate,/generate-and-save]` | CRUD + génération DDL→YAML |
| 401 | GET | `/cortex/semantic-views` | Inventaire semantic views natives |
| 401 | GET | `/cortex/vectors/columns` | Inventaire colonnes VECTOR + summary |
| 401 | GET | `/cortex/agents` | Inventaire Cortex Search Services |

### 3d. Cortex — Local Analytics (DuckDB) + Snowpark/SPCS (★ 17 routes, vault 404 → RÉEL 401)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/cortex/duckdb/datasets` | Datasets stagés pour analytics local |
| 401 | POST | `/cortex/duckdb/{query,query-stage}` | Query locale / sur stage (zéro warehouse) |
| 401 ★ | GET/POST | `/cortex/snowpark/compute-pools[/{name}/{suspend,resume}]` | CRUD + cycle pools (`router.py:3818-3893`) |
| 401 ★ | DELETE | `/cortex/snowpark/compute-pools/{name}` | Hard-drop pool (frees node-hours) |
| 401 ★ | GET/POST | `/cortex/snowpark/services` | Lister / déployer service container |
| 401 ★ | GET | `/cortex/snowpark/services/{name}/{status,logs}` | Santé / logs container |
| 401 ★ | POST | `/cortex/snowpark/services/{name}/{suspend,resume,auto-stop}` | Cycle de vie + auto-stop (frees credits) |
| 401 ★ | DELETE | `/cortex/snowpark/services/{name}` | Hard-drop service (irréversible) |
| 401 ★ | GET/POST | `/cortex/snowpark/{streamlit,image-repos,endpoints/{svc}}` | Streamlit apps / repos Docker / endpoints |

### 3e. Recommendations (engine réel) · Chat · Notifications

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | POST | `/api/recommendations/analyze` | Recompute + upsert + renvoie les recos d'un scope |
| 401 | GET | `/api/recommendations/[{reco_id}]` | Liste (page/module/scope/statuses/severities) / une reco |
| 200 | GET | `/api/recommendations/glossary` | **Public** : glossaire signaux→actions (inspectable sans auth) |
| 401 | GET | `/api/recommendations/capabilities` | Hint capacité (gating UX) |
| 401 | POST | `/api/recommendations/{id}/{acknowledge,snooze,resolve,dismiss,reopen,apply}` | Cycle de vie d'une reco (`apply` renvoie son SQL) |
| 401 | POST | `/api/recommendations/cache/install` | Crée `EVENT_STORE.AI_RECOMMENDATIONS` (idempotent) |
| 401 | GET/POST | `/chat/conversations[/dm,/group,/{id}[/messages,/participants,/read,/attachments]]` | DM/groupe, messages, lecture, pièces jointes |
| 401 | GET | `/chat/online-users` | Présence |
| 401 | GET | `/notifications` · `/unread-count` | Inbox paginé · compteur badge |
| 401 ★ | PATCH/POST | `/notifications/{id}/read` · `/mark-all-read` · `/broadcast` | Mutations (vault disait « empty stub » → RÉEL déployé) |

**Routes NON déployées (drift FE→endpoint mort)** :
- `POST /cortex/recommend` — **404** live + absent de `router.py`. `services/cortex/recommend.ts` l'appelle encore (legacy fallback de l'AI Advisor narratif). À retirer / rebrancher sur `/api/recommendations/analyze`.

## 4. Modèle de données (objets owned + lus)

**Owned (`CP_DATA360`)** : `EVENT_STORE.CHAT_HISTORY` (prompt/réponse complete+Analyst) · `EVENT_STORE.AI_ADVISOR_CACHE` (résultats IA mis en cache, clé `(module, operation, model, prompt-hash)`, TTL 7 j / 168 h ; colonnes `validated`/`applied`) · `EVENT_STORE.AI_RECOMMENDATIONS` (recos persistées de l'engine réel — créée par `/cache/install`) · `EVENT_STORE.QUERY_ANALYTICS` (findings query-history) · `EVENT_STORE.ML_MODELS_REGISTRY` (modèles custom) · `STAGING.SEMANTIC_STAGE` (YAML semantic models) · `STAGING.DOCUMENT_AI_STAGE` (docs uploadés) · `EVENT_STORE.NOTIFICATIONS_RAW` + `NOTIFICATIONS_USER` (inbox).

**Lus (n'owns pas)** : `SNOWFLAKE.ACCOUNT_USAGE.{QUERY_HISTORY, CORTEX_FUNCTIONS_USAGE_HISTORY, METERING_HISTORY}` · `INFORMATION_SCHEMA.{QUERY_HISTORY, COLUMNS}`.
**Appelle** : `SNOWFLAKE.CORTEX.{COMPLETE, SENTIMENT, TRANSLATE, SUMMARIZE, EMBED_TEXT_768}`, Cortex Analyst REST, `SNOWFLAKE.ML.{CLASSIFICATION, ...}`, SPCS DDL (`CREATE SERVICE/COMPUTE POOL`), Document AI.

**Cache (clé par session, `cache_decorators.py:210`)** : `@session_cache` sur lectures invalidables (kpis → `CacheKey.CORTEX` ; semantic-models → `CacheKey.SEMANTIC_MODELS`) ; `@shared_cache(ttl=900)` (compte-partagé) sur inventaires read-only stables : agents, semantic-views, vectors/columns. Mutations Cortex portent `@invalidates_cache` (Redis pattern delete + SSE push).

**Reuse cross-module** : `CortexService` est consommé par Explore/Design (completion, embeddings, classification, forecasting, anomaly) — couche IA partagée de la plateforme.

## 5. FOCUS — Inventaire des features IA : feature → endpoint → exposition UI → câblé/déclaré

> Le module = **trifecta IA** : (a) **LLM** génératif, (b) **NL→SQL/chart**, (c) **ML/recommendations**. État réel après re-test (≠ vault antérieur).

### 5a. Trifecta — où c'est exposé, et ce qui est réellement câblé

| Bloc | Feature | Endpoint principal | Exposition UI | Câblé ? |
|------|---------|--------------------|---------------|---------|
| **LLM** | Chat libre / Assistant | `POST /cortex/complete` | onglet AI Chat + ML Features « AI Assistant » | ✅ câblé |
| **LLM** | Génération de code | `POST /cortex/code-generate` | shell intelligence (form code-gen) | ✅ câblé (vault disait 🔴) |
| **LLM** | Synthèse de lignes / icône | `/cortex/synthesize-rows`, `/cortex/icon-suggest` | helpers (data gen, charts) | ✅ câblé |
| **NL→SQL** | Question langage naturel → SQL + table | `POST /cortex/query` | onglet AI Chat (Send) | ✅ câblé |
| **NL→SQL** | Route Analyst dédiée | `POST /cortex/analyst/query` | path-builder `api-contracts.ts:379` (TODO « not exposed ») | ⚠️ **déclaré-non-utilisé** : déployé live (401) mais le FE le croit absent et passe par `/cortex/query` |
| **NL→chart** | Suggestion d'icône de chart | `POST /cortex/icon-suggest` | titres/charts | ✅ câblé |
| **ML one-shot** | Sentiment / Translate / Summarize / Embeddings | `/cortex/ml/{sentiment,translate,summarize}`, `/cortex/embeddings` | onglet ML Features (4 sous-onglets) | ✅ câblé |
| **ML avancé** | Classification / Fine-tune / Document AI / Top-Insights | `/cortex/ml/{classification,finetune,document-ai,top-insights}/*` | onglet Advanced ML (`advanced-ml-content.tsx`) | ✅ câblé (vault disait 🔴 frontend-only) |
| **Query Analytics** | Analyse IA de QUERY_HISTORY | `/cortex/query-analytics/*` | onglet Query Analytics | ✅ câblé (vault disait 🔴) |
| **Recommendations** | Analyse + cycle de vie gouverné | `/api/recommendations/*` | onglet AI Advisor (`ai-advisor-content.tsx`) | ✅ câblé (vault disait 🔴 lifecycle non câblé) |
| **Recommendations** | Advisor narratif legacy | `POST /cortex/recommend` | (fallback) | ❌ **404 backend** — endpoint mort |
| **Semantic** | Models YAML (CRUD + génération) | `/cortex/semantic-models/*` | onglet Semantic Models | ✅ câblé |
| **Vector** | Colonnes VECTOR (inventaire) | `GET /cortex/vectors/columns` | onglet Vector Search inline | ✅ câblé (lecture seule ; pas de builder similarité) |
| **Agents** | Cortex agents (inventaire) | `GET /cortex/agents` | onglet AI Agents inline | ✅ câblé (lecture seule) |
| **SPCS** | Pools / services / Streamlit | `/cortex/snowpark/*` (17) | onglet Container Apps | ✅ câblé (vault disait 🔴) |
| **Local** | DuckDB zéro-coût | `/cortex/duckdb/*` | onglet Local Analytics | ✅ câblé |

### 5b. Fiche « ins / outs » des endpoints clés (de quoi rejouer chaque feature)

> Tous **401 live** (déployés). Body = forme attendue ; OUTS = forme consommée par l'UI (déduite slices + service.py — `non vérifié` côté runtime).

| Feature | Endpoint | INS (body · path · query) | OUTS (réponse consommée) |
|---------|----------|---------------------------|--------------------------|
| Completion LLM | `POST /cortex/complete` | body `CompletionRequest{prompt*, model?, context?{module,table,project_id}, guardrails?(ignoré)}` | `{data:{response, model, cached}}` |
| NL→SQL chat | `POST /cortex/query` | body `CortexQueryRequest{prompt*, semantic_model?}` | `{request_id, results[]{type:'text'\|'sql', text?, query?, data?[]}}` (FE déballe 5 enveloppes, `query.ts:36-68`) |
| NL→SQL Analyst dédié | `POST /cortex/analyst/query` | body `QueryRequest{prompt*, semantic_model?}` | `StandardResponse` (interprétation + SQL + results) — **non câblé FE** |
| Code-gen | `POST /cortex/code-generate` | body `_CodeGenerateRequest{language*, spec*, model?, context?, allow_destructive?(def.false), request_critique?(def.true)}` | `data{response, raw, language, model, cached, syntax_valid, blocked_tokens, critique, credits_estimate_micro}` |
| Sentiment | `POST /cortex/ml/sentiment` | body `{texts?[], text_column(="inline"), table_name?, database?, schema?}` | `SentimentResult[]{text, sentiment:number, category}` (FE bucket ±0.3) |
| Translate | `POST /cortex/ml/translate` | body `{text*, from_language*, to_language*}` (enum 11 langues) | `{original, translated, from, to}` |
| Summarize | `POST /cortex/ml/summarize` | body `{text*, max_length?(ignoré)}` | `{original_length, summary, summary_length, compression_ratio}` |
| Embeddings | `POST /cortex/embeddings` | body `{texts*[], model?(def. e5-base-v2)}` | `{text, embedding:number[]}[]` (**non persisté**) |
| Classification train | `POST /cortex/ml/classification/train` | body `MLClassificationTrainRequest{training_table, target_column, ...}` | `object` (job/model) |
| Fine-tune create | `POST /cortex/ml/finetune` | body `FineTuneCreateRequest{base_model, training_table, ...}` | `object` (job_id) |
| Query Analytics run | `POST /cortex/query-analytics/analyze` | query `hours?(def.5)` | `{analyzed, inserted, cortex_issues, redundant_groups, hours}` (timeout FE 120 s) |
| Semantic gen+save | `POST /cortex/semantic-models/generate-and-save` | body `SemanticModelGenerateRequest{database*, schema*, tables?[], model_name?, include_views?, sample_values_limit?}` | `{model_name, yaml_content, tables_count, stage_path, saved}` |
| Reco analyze (engine réel) | `POST /api/recommendations/analyze` | body `AnalyzeBody{scopes:Set<Scope>, page?, module?, target?}` | `{recommendations[]{reco_id, severity, score, savings, title, rationale, target, status, proposed_sql}}` |
| Reco lifecycle | `POST /api/recommendations/{id}/{acknowledge\|resolve\|dismiss\|snooze\|reopen}` | path `{reco_id}` · body `{reason?}` (dismiss : reason requis) | reco mise à jour `{status}` |
| Reco apply | `POST /api/recommendations/{id}/apply` | path `{reco_id}` | `{applied:true, sql}` (mark-applied + renvoie le SQL de remédiation) |
| Notifications inbox | `GET /notifications` | query `unread_only?, kind?, project_id?, page?(≥1), page_size?(1-100)` | `{items[]{notification_id, kind, title, body, link, actor_username, read_at}, total, unread_count}` |
| Notifications mark-all | `POST /notifications/mark-all-read` | — | `{updated:N}` |
| SPCS deploy | `POST /cortex/snowpark/services` | body `{name, database, schema, compute_pool, spec_yaml, min/max_instances?, comment?}` | service descriptor |

> Renvoi : matrice gouvernance/coût/cache par rôle + advisor CTA = vault `data360_full_doc/pages/intelligence.md` §Enrichissement (2026-06-09).

## 6. UX front — 4 axes + accessibilité (grounded)

| Axe | Verdict | Preuve (fichier:occurrences) | Microcopy |
|-----|---------|------------------------------|-----------|
| **loading** | ✓ | `loading.tsx:5` skeleton route-level `role="status" aria-label="Loading"` (4 cards + chart, `animate-pulse`) ; états `isLoading`/Skeleton : page 20, advanced-ml 25, snowpark 28, ml-features 18 | KPI = `—` tant que non chargé (jamais de valeur fake) |
| **empty** | ✓ partiel | empty-states : page 1, advanced-ml 4, snowpark 4, query-analytics 2, ai-advisor 3 ; onglets inline (agents/views/vectors) dégradent en liste vide si feature non activée sur le compte | « Refresh » / « Run Analysis » CTA selon l'onglet |
| **error** | ✓ fort | error/catch : semantic-models 108, advanced-ml 146 (display inline, `advanced-ml-content.tsx:27` « replaces error toasts »), ml-features 41, snowpark 59 | inline error block par action ; `getApiErrorMessage` |
| **dark mode** | ✓ | `dark:` : page 169, advanced-ml 162, query-analytics 149, local-analytics 109, semantic-models 99, snowpark 79, ml-features 76, chat 70, ai-advisor 68 ; `loading.tsx` `dark:bg-gray-800/900` | — |

**Accessibilité** : `role="status"`/`aria-label="Loading"` sur le skeleton (`loading.tsx:5`). Reste à vérifier : labels ARIA sur sélecteurs de modèle/langue, navigation clavier des onglets scrollables. ⚠️ non vérifié.

## 7. Drift détecté (vs vault `pages/intelligence.md` antérieur + vs code/live)

> Le vault antérieur a été écrit contre un commit plus ancien (avant l'implémentation des routes ML/QA/SPCS et du re-branchement AI Advisor). **Toutes les dérives ci-dessous sont confirmées par deux preuves : décorateur dans `cortex/router.py` ET re-test live 401 le 2026-06-09.**

1. **Advanced ML « entièrement frontend-only, tout 404 » → FAUX.** Les routes `/cortex/ml/{classification,finetune,document-ai,top-insights}` ont leurs décorateurs (`router.py:2460-3117`) et répondent **401**. Le FE est typé et câblé (`advanced-ml-content.tsx:58-71`, apiClient + inline error). Statut réel : **🟢 câblé** (test fonctionnel authentifié restant).
2. **Query Analytics « 4 routes 404 » → FAUX.** `/cortex/query-analytics/{analyze,results,summary,redundant-groups}` ont leurs décorateurs (`router.py:3205-3618`) et répondent **401**. FE `query-analytics.ts` les appelle. Statut : **🟢 câblé**.
3. **Snowpark/SPCS « 17 routes 404 » → FAUX.** Toutes implémentées (`router.py:3818-4308`, fichier `snowpark_services.py`) et **401** live. FE `snowpark.ts` + `snowpark-services-content.tsx`. Statut : **🟢 câblé**.
4. **`POST /cortex/code-generate` « abandoned scaffold, no decorator » → FAUX.** Décorateur `router.py:623` (« List Cortex models … » helper à `:327`), **401** live. FE `ai.ts:105`. Statut : **🟢 câblé**.
5. **`GET /cortex/models` « missing » → FAUX.** Route `router.py:327` (« List Cortex models + recommended defaults »), **401** live. FE résout les défauts vivants (`ml-features-content.tsx:56`).
6. **Notifications mutations « empty stub / missing » → FAUX.** `/unread-count`, `PATCH /{id}/read`, `/mark-all-read`, `/broadcast` existent (`notifications.py:66-172`) et **401** live.
7. **AI Advisor lifecycle « UI appelle le wrapper COMPLETE, lifecycle non câblé » → DÉPASSÉ.** `ai-advisor-content.tsx:21-25` importe et appelle l'**engine réel** : `analyzeRecommendations` (`:162`), `listRecommendations` (`:138`), `acknowledgeRecommendation` (`:200`), `resolveRecommendation` (`:213`), `dismissRecommendation` (`:231`). Statut : **🟢 câblé**.
8. **Gates gouvernance mal documentés.** `recommendations`, `chat`, `notifications` sont **auth-only** (`get_current_user` par handler) — **pas** de `require_module`. Le vault attribuait `require_module("ai_intelligence")` aux notifications : faux. (Gap réel : l'engine recos n'a aucune entitlement module.)

**Drift réels persistants (vrais 🔴/⚠️)** :
- `POST /cortex/recommend` : **404** (jamais construit) ; `services/cortex/recommend.ts` l'appelle encore → fallback mort.
- `/cortex/analyst/query` : déployé mais **0 référence FE** (déclaré-non-utilisé ; le chat passe par `/cortex/query`).
- Embeddings non persistés (pas de colonne VECTOR / Cortex Search builder) ; Vector Search = lecture seule.
- `max_length` (summarize) et `guardrails` (complete) acceptés mais ignorés serveur.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Retirer le chemin mort `/cortex/recommend`** dans `recommend.ts` (404) et router l'AI Advisor narratif sur `POST /api/recommendations/analyze` (engine réel déjà câblé ailleurs). Bénéfice : un seul moteur de recos, plus de fallback silencieux.
2. **Câbler `/cortex/analyst/query`** comme mode « Analyst strict » dans le chat (vs `/cortex/query` raw) — toggle « SQL gouverné par semantic model ». Bénéfice : exploite la route dédiée déployée mais orpheline.
3. **Builder de similarité vectorielle** dans l'onglet Vector Search : bouton « embed cette colonne » → `POST /cortex/embeddings` puis écriture VECTOR + création Cortex Search. Aujourd'hui l'onglet est lecture seule. [moyen]
4. **Désactiver visuellement `max_length` (Summarizer) et `guardrails` (Assistant)** tant que le backend les ignore, ou afficher un tooltip « non appliqué ». Bénéfice : microcopy honnête. [trivial-safe]
5. **CTA structuré sur les recos** : rendre `proposed_sql` / `apply` en bouton « Appliquer » désactivé sans grant (`useCanPerform`), branché sur `POST /api/recommendations/{id}/apply`. Bénéfice : advisor → action gouvernée en un clic.
6. **Badge « feature non activée sur ce compte »** sur agents/semantic-views/vectors quand la liste est vide (vs simple empty), pour distinguer « rien créé » de « capacité Snowflake absente ». [trivial-safe]
7. **Entitlement module pour les recos** : proposer d'ajouter `require_module` sur `/api/recommendations/*` (aujourd'hui auth-only) pour aligner sur la discipline du reste de la plateforme. (proposition gouvernance, pas UX pure.)
8. **Normaliser `hours`/`days`** (Query Analytics, KPIs) avant le hash de cache pour éviter le thrashing (cf. vault §C cache par rôle).

## 9. Plan de test fonctionnel

> Sans token → **401** sur tout `/cortex/*`, `/api/recommendations/*` (sauf `/glossary` = 200 public), `/chat/*`, `/notifications/*`. Obtenir un JWT (`POST /signin` body `{account_name, username, password}`), puis `-H "Authorization: Bearer $TOKEN"`. Module requis pour Cortex : entitlement `ai_intelligence`.

```bash
BASE=http://167.172.162.172 ; HOST='-H Host:api.datalab360.io'
H="$HOST -H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 0. Sanity sans token (contrat RBAC) — attendu 401, sauf glossary 200
curl -s -o /dev/null -w "%{http_code}\n" $HOST "$BASE/cortex/kpis"                 # 401
curl -s -o /dev/null -w "%{http_code}\n" $HOST "$BASE/api/recommendations/glossary" # 200

# 1. LLM + NL→SQL (rôle: module ai_intelligence)
curl -s $H "$BASE/cortex/models"
curl -s $H -X POST "$BASE/cortex/complete" -d '{"prompt":"Explique le RFM","model":"mistral-large2"}'
curl -s $H -X POST "$BASE/cortex/query"    -d '{"prompt":"top 5 clients par CA ce mois","semantic_model":"@CP_DATA360.STAGING.SEMANTIC_STAGE/sales.yaml"}'
curl -s $H -X POST "$BASE/cortex/code-generate" -d '{"language":"sql","spec":"requête des commandes du jour","request_critique":true}'

# 2. ML one-shot
curl -s $H -X POST "$BASE/cortex/ml/sentiment" -d '{"texts":["super produit","livraison lente"],"text_column":"inline"}'
curl -s $H -X POST "$BASE/cortex/ml/translate" -d '{"text":"hello","from_language":"en","to_language":"fr"}'
curl -s $H -X POST "$BASE/cortex/embeddings"   -d '{"texts":["a","b"]}'

# 3. ML avancé (vault disait 404 — vérifier que c'est bien 200 authentifié, pas 404 applicatif)
curl -s $H "$BASE/cortex/ml/classification/models"
curl -s $H "$BASE/cortex/ml/finetune/jobs"
curl -s $H -X POST "$BASE/cortex/ml/classification/train" -d '{"training_table":"ML.LABELED","target_column":"CLASS"}'

# 4. Query Analytics (batch — timeout client 120 s)
curl -s $H -X POST "$BASE/cortex/query-analytics/analyze?hours=24"
curl -s $H "$BASE/cortex/query-analytics/summary"
curl -s $H "$BASE/cortex/query-analytics/redundant-groups?limit=20"

# 5. Semantic models
curl -s $H "$BASE/cortex/semantic-models/list"
curl -s $H -X POST "$BASE/cortex/semantic-models/generate-and-save" -d '{"database":"CP_DATA360","schema":"SALES"}'

# 6. AI Advisor — engine réel + cycle de vie
RID=$(curl -s $H -X POST "$BASE/api/recommendations/analyze" -d '{"scopes":["cost"],"page":"intelligence"}' | jq -r '.recommendations[0].reco_id')
curl -s $H "$BASE/api/recommendations/?statuses=open"
curl -s $H -X POST "$BASE/api/recommendations/$RID/acknowledge"
curl -s $H -X POST "$BASE/api/recommendations/$RID/dismiss" -d '{"reason":"faux positif"}'
curl -s $H -X POST "$BASE/api/recommendations/$RID/apply"        # renvoie le SQL de remédiation

# 7. Snowpark / SPCS (lecture d'abord — coût zéro)
curl -s $H "$BASE/cortex/snowpark/compute-pools"
curl -s $H "$BASE/cortex/snowpark/services"
curl -s $H "$BASE/cortex/snowpark/services/<NAME>/status"

# 8. Notifications (inbox + mutations — vault disait stub)
curl -s $H "$BASE/notifications?unread_only=true"
curl -s $H "$BASE/notifications/unread-count"
curl -s $H -X POST "$BASE/notifications/mark-all-read"

# 9. Chemins morts attendus 404 (drift documenté)
curl -s -o /dev/null -w "%{http_code}\n" $H -X POST "$BASE/cortex/recommend"  # 404 (jamais construit)
```

**Résultats attendus** :
- Sans token → 401 partout (sauf `/api/recommendations/glossary` = 200).
- `/cortex/recommend` → **404** (endpoint mort — utiliser `/api/recommendations/analyze`).
- ML avancé / Query Analytics / Snowpark / code-generate → **200 authentifié** attendu (et non 404) ; un 404 *applicatif* (ressource introuvable) reste possible et signalerait un bug métier distinct du gardiennage.
- Sentiment/translate/summarize avec `max_length`/`guardrails` → la réponse ignore ces champs (no-op confirmé).

> Vérifié 2026-06-09 : 30 endpoints vérifiés vs sources (slices cortex-analytics-ai.md/recommendations.md/chat.md/notifications.md + openapi.json). 0 inventé corrigé — tous les paths documentés existent dans les sources SAUF `/cortex/analyst/query` (absent d'openapi.json et cortex-analytics-ai.md slice, mais 401 live POST confirmé — note déjà inline §3a/§5a/§7 ; /cortex/recommend absent + 404 live confirmé — note déjà inline). 3 claims UI vérifiés : `ai-advisor-content.tsx:21-27` ✓, `advanced-ml-content.tsx:58-78` ✓, `api-contracts.ts:377-379` ✓. Live-retest OK : `POST /cortex/analyst/query`=401, `POST /cortex/recommend`=404, `GET /cortex/kpis`=401, `/api/recommendations/glossary`=200. Aucun secret dans le skill. VERDICT : GROUNDED.
