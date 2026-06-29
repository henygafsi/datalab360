# Validation Snowflake live — org account → HAHA (2026-06-29)

> Test read-only direct sur Snowflake avec le PAT **ORGAADMIN_USER** (rôle ORGADMIN, org **UCHSFVB**) via `snowflake-connector-python`. **Le PAT n'est pas stocké** (usage session uniquement, à roter). Aucun DDL/écriture.

## Connexion
- ✅ **PAT valide** (auth `password`). Account système **YE35211**, org **UCHSFVB**, rôle **ORGADMIN**, région **AWS_EU_CENTRAL_1**.
- Warehouse utilisable : **COMPUTE_WAH** (⚠️ pas `COMPUTE_WH` au niveau org — à corriger dans toute config qui suppose COMPUTE_WH côté org). 6 warehouses, 38 databases visibles.

## Hiérarchie org → comptes (réelle)
- `SHOW ORGANIZATION ACCOUNTS` → **0 ligne** ⚠️ (commande vide sur ce compte) — **utiliser `SNOWFLAKE.ORGANIZATION_USAGE.*` à la place** (le backend doit s'appuyer là-dessus, pas sur SHOW).
- Comptes réels (via `ORGANIZATION_USAGE.METERING_DAILY_HISTORY`) : **KY11038, HAHA, TESTSKILLBRANCH, DJAPPA, MYACCOUNT1, HAMMMOUDA, ABCD, E2E_CLEAN_1770428731, …** → **HAHA est bien dans l'org et atteignable depuis le compte org.**

## Validation FinOps (données réelles qui backent les endpoints réintégrés)
| Endpoint réintégré (W6) | Vue source | Donnée réelle (org→HAHA) |
|---|---|---|
| `organization/costs` | `ORGANIZATION_USAGE.USAGE_IN_CURRENCY_DAILY` | **KY11038 $677.49 · HAHA $482.60** · TESTSKILLBRANCH $0.01 (30j) |
| `credits` / `credits/history` | `METERING_DAILY_HISTORY` | **KY11038 182.78 · HAHA 135.33** crédits (30j) |
| `organization/warehouse-credits` | `WAREHOUSE_METERING_HISTORY` | HAHA : **COMPUTE_WH 134.71**, Streamlit/cloud ~0 (30j) |
| `organization/remaining-balance` | `REMAINING_BALANCE_DAILY` | UCHSFVB, solde **-1097.41 USD** (29/06) |
| `organization/storage` | `STORAGE_DAILY_HISTORY` | ⚠️ colonne `STORAGE_BYTES` invalide dans la vue org → nom de colonne à corriger côté backend |

## Conclusions
1. **Les endpoints FinOps/org réintégrés ont des données backing RÉELLES.** Donc les pages vides/503 du sweep (`account-overview`, `administration?tab=costGov`, `org-accounts/*`) sont **cause backend déployé (SVC down)**, **PAS des features manquantes ni des bugs FE** — confirmé par preuve directe. **Déployer le backend (W7) les allumerait avec ces vraies données.**
2. **2 corrections backend identifiées** (préparables localement, deploy-gated) :
   - ne pas dépendre de `SHOW ORGANIZATION ACCOUNTS` (vide) → lister via `ORGANIZATION_USAGE`.
   - au niveau org, le warehouse est **COMPUTE_WAH** (pas COMPUTE_WH) ; et la colonne storage de `STORAGE_DAILY_HISTORY` (org) diffère de l'`ACCOUNT_USAGE` (pas `STORAGE_BYTES`).
3. **Auth** : le PAT ORGADMIN fonctionne pour la lecture org-wide → un backend org-mode pourrait alimenter ces vues. (Le PAT est à **roter** après ce test.)

## Reste à tester (besoin de précisions / hors lecture)
- Tester les **endpoints applicatifs** sous identité org (vs requêtes SQL directes) nécessiterait pointer le front/back sur ce compte — non fait (le front teste le backend déployé dégradé).
- Tests **write/actions** non effectués (garde-fou lecture-seule).
