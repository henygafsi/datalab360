# Explore & Design — cible (maquettes) : faisabilité + axe paiement (2026-06-22)

Question: peut-on atteindre ces maquettes "avec nos moyens du bord", en maîtrisant toutes les actions user, + un axe paiement (model + ingestion: free = max 100k lignes/table/source ; live = abonnement ou pay-as-you-go) ?

## Verdict
**Oui, atteignable par incréments.** ~70% = re-skin + surfaçage de capacités déjà codées. Le net-new réel = (1) le shell unifié + polish dark, (2) cost-impact & AI-autofix dans le Deploy, (3) **l'axe paiement** (le plus gros morceau, nécessite backend), (4) tabs Contracts & APIs.

## Maquette → code (ce qu'on a déjà vs à construire)
| Élément maquette | Existe ? | Où | Gap |
|---|---|---|---|
| Wizard Deploy 8 étapes (Review→…→Verify) | ✅ | `DeploymentValidation` + `deployment/Step*` + `DeploymentContext` | polish visuel only |
| Canvas modeling (STG/DIM/FACT, lineage) | ✅ | `ModelingCanvas`, ReactFlow, source rail | reskin |
| Sources (Snowflake/S3/Salesforce/API/Files) | ✅ | Connect Data (`data-source-connection/config`) | "API Payment Gateway" = juste un connecteur de + |
| Data Products | ✅ | `(dashboard)/data-products` + backend `projects/data_products.py` | lier au projet (provenance) |
| Catalog (Live Data) + AI Health/Top Risks | ✅ partiel | catalog module, `aiSchemaHealth`, `catalog/scores` | badge LIVE = à gater (payant) |
| Cost Impact (mensuel $, tendance) dans Deploy | ✅ partiel | `StepImpact` estime déjà le coût | surfacer $/mois + sparkline + relier au PAYG |
| AI Advice + "Auto-fix with AI" (RLS manquante) | ✅ moteur | Cortex / `suggestDmfs` / advisor | wirer le CTA "Auto-fix" → action gouvernée |
| Data Quality / Observability tabs | ✅ | modules existants | intégrer dans le shell E&D |
| Dry Run log, Objects-to-create, Checks summary | ✅ | `StepDryRun`, `StepReview`, `StepPreChecks` | reskin |
| **Data Contracts** tab | ❌ | — | net-new (module + backend) |
| **APIs** tab (exposer product en REST) | ❌ | — | net-new |
| **Billing / plan / quota / PAYG** | ❌ | — | **net-new (cœur de l'axe paiement)** |

## Axe paiement — design (free 100k / live payant)
Deux lignes de produit sur la MÊME donnée :

### Free tier — "snapshot" (connect + ingestion)
- Chaque source/table ingérée est **plafonnée à 100k lignes** (one-shot ou refresh manuel). Assez pour modéliser, builder des products, tester le DWH.
- Backend: appliquer `LIMIT 100000` (ou comptage + troncature) dans le chemin d'ingestion (`SelfServeIngestionModal` → backend ingest) + persister `rows_ingested` par table.
- FE: badge d'usage par table/source ("82k / 100k · Free") + CTA "Upgrade for live".

### Live tier — abonnement OU pay-as-you-go
- "Live" = temps réel/streaming : Snowpipe streaming, Dynamic Tables auto-refresh, Streams, refresh haute-fréquence, catalog LIVE, **et ingestion > 100k lignes**.
- **Abonnement** : un `plan_tier` (Pro/Enterprise) débloque live + quotas hauts/illimités.
- **PAYG** : métré — par ligne ingérée au-delà de 100k, par live-refresh, par crédit-warehouse, par appel API. Le **Cost Impact mensuel du Deploy = l'estimation PAYG** (déjà presque là).

### Ce qu'il faut construire (mappé sur l'archi existante)
1. **Entitlements/plan service** (backend) : `plan_tier`, `live_enabled`, `row_quota`, `payg_enabled`, `api_quota`. (S'appuie sur l'`/administration/entitlements` existant — l'étendre.)
2. **Metering service** (backend) : compte rows ingérées, live-refreshes, crédits, appels API ; expose `GET /usage/current` + `/usage/forecast`.
3. **`useEntitlement(feature)` hook** (FE) — jumeau de `useCanPerform` : gate les toggles "live", les options Deploy "live", le streaming, l'ingestion >100k. **Même pattern que GovernedActionButton** → on réutilise le catalogue d'actions gouvernées déjà construit.
4. **Paywall/upgrade UX** : badge quota + modal "Go live" (subscribe vs PAYG estimate from Cost Impact).
5. **Cost Impact panel** (Deploy) : afficher coût mensuel estimé + tendance (déjà calculé dans StepImpact → surfacer).

> "Maîtriser toutes les actions user" = chaque action de la maquette (Add Source, Run Dry Run, Deploy, Auto-fix AI, Create Product, Add tag, Go Live…) devient une action **gouvernée (RBAC) + entitled (plan)**, via le catalogue `GovernedActionButton`/`useCanPerform` déjà en place, étendu d'un check `useEntitlement`.

## Plan par phases ("moyens du bord")
- **P1 — Shell + polish (FE only, ~rapide)** : shell unifié E&D avec top-tabs (Shared Modeling | Catalog | Data Products | Quality | Observability), thème dark, reskin du Deploy panel (header 1-ligne, stepper flottant — déjà fait, à finir). Aucune dépendance backend.
- **P2 — Surfacer l'existant (FE, peu de backend)** : Cost Impact $/mois + sparkline dans Deploy ; "Auto-fix with AI" wiré sur Cortex ; AI Health/Top Risks dans le catalog. 
- **P3 — Axe paiement MVP (FE+backend)** : entitlements étendus + metering rows + quota 100k appliqué à l'ingestion + `useEntitlement` + badges/paywall + "Go Live" (subscribe/PAYG). C'est le gros morceau (backend obligatoire).
- **P4 — Contracts & APIs tabs (FE+backend)** : net-new, plus tard.

## Caveats
- P1/P2 = faisables tout de suite, FE, sans risque (reskin + surfaçage).
- P3 (paiement) = nécessite backend (metering + plan) + déploiement (ton go). C'est ce qui transforme la démo en produit monétisable.
- Tout en local/uncommitted ; aucun déploiement sans ton accord.
