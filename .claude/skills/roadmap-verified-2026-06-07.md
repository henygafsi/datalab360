# Roadmap vérifiée — Alice → Henry — 2026-06-07

## Méthode de vérification (la règle désormais)

Toute entrée api-contracts DOIT être vérifiée **double source** avant ajout :
1. **Dump local** : `python3 -c "from app.main import app"` → 896 routes
2. **API live** : `curl api.datalab360.io<path>` → `401/405/422` = EXISTE, `404` = GAP

⚠ Le repo backend local peut être EN RETARD sur la prod (cas bi-dashboard : déployé en
prod, absent du repo local). Le curl live est l'arbitre final.

## Résultats du sweep live (preuve)

### Routes confirmées EXISTANTES (401 = auth requise)
```
401 /catalog/overview            401 /gouvernance/users
401 /data-quality/quality-summary 401 /observability/kpis
401 /cortex/kpis                 401 /workflow/capabilities
401 /command-center/overview-kpis 401 /data-products
401 /connect/connectors          405 /cortex/embeddings (POST-only ✓)
401 /cortex/snowpark/streamlit   401 /observability/trust-center/summary
401 /bi-dashboard/* (TOUT le module — prod ahead du repo local)
401 /explore-design/{projects,events,deployments,validate-events}
```

### Faux paths corrigés dans api-contracts.ts (le vrai existait)
| Avant (faux) | Après (vérifié) |
|---|---|
| `/workflow/runs/{id}/cancel` | `/workflow/{workflowId}/cancel` |
| `/workflow/runs/{id}/logs` | `/workflow/{workflowId}/tasks/{taskId}/logs` |
| `/cortex/vectors/embed` | `/cortex/embeddings` |
| `/cortex/snowpark/streamlit-apps` | `/cortex/snowpark/streamlit` |
| `/cortex/query-analytics/run` | `/cortex/query-analytics/analyze` |
| `/cortex/finetune` | `/cortex/ml/finetune` |
| `/observability/alerts/acknowledge` | `/observability/alerts/{alertId}/ack` |

### GAPS confirmés 404 (live ET local) → Henry P1 backend

| # | Routes | Module | Pour quoi |
|---|--------|--------|-----------|
| H1 | `/catalog/tables/{db}/{sch}/{tbl}/{context,governance,lineage,ownership,ingestion}` + `/catalog/profile/{}/{}/{}` + `/catalog/tags/flow` + `/catalog/tables/notify-consumers` | catalog | **SmartRightBar S1-S8** — le panel 8 sections n'a pas son backend |
| H2 | `/connect/connectors/{id}` + `/{id}/test` + `/{id}/sync` | connect | CRUD connecteur (R: détail, U: test, X: sync) |
| H3 | `/data-products/{id}/lineage` + `/{id}/consumers` | data-products | S4 Lignée + S6 Ownership du produit |
| H4 | `/data-quality/{snapshot,anomalies,anomaly-detection}` + `/trust-center/{enable,recommendations,report}` | data-quality | Fan-out 9 dimensions + anomalies ML + trust |
| H5 | `/cortex/analyst/query` | intelligent | NL→SQL structuré (Analyst API) |
| H6 | `/workflow/{id}/contributors` (GET/POST/DELETE) | workflow | Partage & ownership des pipelines |
| H7 | `/gouvernance/drop-users-batch` + `/gouvernance/policies` (liste unifiée) | governance | Batch ops + vue policies unifiée |
| H8 | `/explore-design/{project_id}/deployment-readiness` | explore-design | **Draft documenté** dans agent-henry.md — diff + lignée + coût + approbation |

Frontend : tous ces paths sont annotés `TODO(henry-P1)` dans api-contracts.ts et les
consommateurs UI utilisent le pattern **404-self-disable** (InsightActionButton /
useDeploymentReadiness → `unavailable`, jamais d'erreur brute à l'écran).

---

## ROADMAP — 4 phases

### Phase 1 — CRUDS complets par action (S1-S2 SmartRightBar) — 2 semaines
Pour CHAQUE objet de CHAQUE module, les 5 verbes exposés et gatés RBAC :

| Objet | C | R | U | D | eXec |
|-------|---|---|---|---|------|
| Connector | ✅ create | ⚠ H2 detail | — | — | ⚠ H2 test/sync |
| Data Product | ✅ | ✅ | ✅ | ✅ | ✅ publish/refresh/subscribe |
| DMF Rule | ✅ associate | ✅ catalog | ✅ thresholds | ✅ | ✅ run-check |
| User/Role | ✅ add | ✅ | ✅ enable/disable | ✅ drop (⚠ H7 batch) | ✅ grant |
| Workflow | ✅ | ✅ | ✅ | ✅ | ✅ run/cancel(✓fixé)/logs(✓fixé) |
| Model sémantique | ✅ generate | ✅ list | ✅ save | — | ✅ query |
| Table (catalog) | — | ⚠ H1 360° | ⚠ H1 tags | — | ⚠ H1 notify |
| Déploiement | ✅ request | ✅ list | ✅ approve/reject | ✅ cancel | ✅ execute |

Livrable : matrice CRUD×RBAC complète dans chaque page-*.md + boutons InsightActionButton
manquants câblés. Gaps backend = H1-H8.

### Phase 2 — Métriques cost / DQ / perf par feature et projet — 2 semaines
Chaque item sélectionné affiche dans le panel droit (S3-S5) :
- **Cost** : crédits 7j/30j de l'objet (`WAREHOUSE_METERING_HISTORY` + `QUERY_ATTRIBUTION`),
  null → "—" jamais 0 fictif
- **DQ** : score DMF + breaches + freshness (`/data-quality/dmf/breaches` ✅ existe)
- **Perf** : latence requêtes + spill + queue (`/observability/performance/metrics` ✅ existe)

Backend existant suffisant à 80% — il manque la **vue agrégée par objet**
(`/catalog/tables/{}/{}/{}/context` → H1 livre cost+dq+perf en un appel cached).

### Phase 3 — Cost prediction + prévision 30 jours avant engagement — 3 semaines
Le cœur de la demande "test along 30 days before pay" :

1. **`GET /finops/cost-simulation/{object_or_project}?days=30`** (Henry P1 nouveau)
   - Baseline : pattern réel des 30 derniers jours (`METERING_HISTORY` du même type d'objet)
   - Projection : crédits/jour × 30 avec bandes basse/haute (méthode documentée,
     jamais un chiffre sans `method` + `basis`)
   - Patron existant à réutiliser : `_wizard_cost_estimate()` dans connectors/router.py
     (formule + baseline 7j AVG live)
2. **UI "Cost Preview" avant chaque action payante** (ingestion, fine-tune, clone, deploy) :
   - InsightActionButton annotation `cost:` devient cliquable → panneau prévision 30j
   - Graphe burn projeté + seuil budget + CTA "Set resource monitor"
3. **Mode trial** : toute ressource créée passe par dry-run/clone échantillon d'abord
   (R4/R5 Alice déjà en place), la prévision 30j s'affiche AVANT le bouton "Confirm & Execute"
4. **CTA d'optimisation** : si prévision > budget → suggestions automatiques
   (warehouse downsize, schedule off-peak, auto-suspend) avec delta crédits chiffré

### Phase 4 — Skills & sous-agents optimisés pour la recherche doc — 1 semaine
1. **agent-alice.md** : Étape 2 devient double-source (dump local + curl live) — OBLIGATOIRE
2. **agent-henry.md** : règle "no contract entry without 401/405 proof" + le template
   `cached_sf_get` pour chaque nouveau GET
3. **Sous-agent research-docs** : nouveau skill qui consulte
   docs.snowflake.com (ACCOUNT_USAGE, METERING, DMF) + fastapi + react-query AVANT
   chaque implémentation Henry, et colle les extraits pertinents dans la task
4. **Run KPIs** : chaque run d'agent écrit ses Global KPIs EN PREMIER dans le .md du module
   (format déjà standardisé dans agent-henry/alice)

## Ordre d'exécution recommandé
1. H1 SmartRightBar backend (débloque Phase 1 ET Phase 2 d'un coup)
2. Phase 3.1 cost-simulation endpoint (le différenciateur)
3. H2-H8 par ordre de consommation UI
4. Phase 4 skills (continu)
