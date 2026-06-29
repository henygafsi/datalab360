# Plan de fixes backend (W7) — validés via Snowflake live, deploy-gated

> Fixes **localisés dans le code backend on-disk** (`data360_pro/backend`) et **validés au niveau SQL** via le PAT ORGADMIN (lecture seule). **Non appliqués / non commités** : le backend est deploy-gated et non-testable localement (pas de restart) → **attente d'un `go` explicite** pour éditer le repo backend.

## Fix #1 — Détection org-admin via une vue vide (bug confirmé)
**Fichier** : `app/modules/org_accounts/router.py` (~ligne 2654, endpoint org-summary top-strip).
**Bug** : la détection org-admin + le listing des comptes utilisent
```sql
SHOW ORGANIZATION ACCOUNTS
```
qui **retourne 0 ligne** sur cet org (vérifié). Conséquence : un **vrai ORGADMIN** est classé `is_org_admin = False`, `accounts = []` → le top-strip org affiche du vide / retombe en scope-compte au lieu des vrais rollups org. (Le code voisin l.175 **sait déjà** que `SHOW ORGANIZATION ACCOUNTS` est vide et utilise `ORGANIZATION_USAGE.ACCOUNTS` — **incohérence interne**.)

**Preuve (PAT ORGADMIN, org UCHSFVB)** :
| Source | Résultat |
|---|---|
| `SHOW ORGANIZATION ACCOUNTS` | **0 ligne** |
| `SELECT … FROM SNOWFLAKE.ORGANIZATION_USAGE.ACCOUNTS` | **35 lignes** (incl. HAHA, KY11038, MDR, WAYLA…) |

**Fix proposé** (aligner sur la source déjà fiable) :
```python
# au lieu de:  cursor.execute("SHOW ORGANIZATION ACCOUNTS")
cursor.execute(
    "SELECT ACCOUNT_NAME, ACCOUNT_LOCATOR, CREATED_ON, REGION_GROUP, SNOWFLAKE_REGION "
    "FROM SNOWFLAKE.ORGANIZATION_USAGE.ACCOUNTS "
    "WHERE DELETED_ON IS NULL"
)
cols = [d[0] for d in cursor.description] if cursor.description else []
accounts = [dict(zip(cols, row)) for row in cursor.fetchall()]
is_org_admin = len(accounts) > 0   # ORGANIZATION_USAGE readable ⇒ org admin
```
→ exécute sur le `_get_org_cursor` (connexion ORGADMIN). Garder le `except → is_org_admin=False` pour les non-admins. **SQL validée (35 lignes).**

## Fix #2 — Warehouse org = COMPUTE_WAH (à vérifier selon contexte)
Au niveau **org** (connexion ORGADMIN), le warehouse utilisable est **COMPUTE_WAH** (pas `COMPUTE_WH`, qui est celui du compte HAHA). Si une config/connexion org hardcode `COMPUTE_WH`, les requêtes `ORGANIZATION_USAGE` échouent en *"No active warehouse"*. **À vérifier** : `app/core/snowflake_config.py` / `connection_manager.py` côté org-cursor. (Le `COMPUTE_WH` côté compte HAHA reste correct.)

## Fix #3 — Colonne storage de la vue ORG (mineur)
`SNOWFLAKE.ORGANIZATION_USAGE.STORAGE_DAILY_HISTORY` n'a **pas** `STORAGE_BYTES` (≠ `ACCOUNT_USAGE`). Tout code org-storage qui suppose `STORAGE_BYTES` doit utiliser les colonnes réelles de la vue org (à introspecter via `INFORMATION_SCHEMA` ou la doc ORGANIZATION_USAGE). Endpoints concernés : `organization/storage`.

## Impact (pourquoi ça compte)
Le test live a prouvé que **les données existent** (org costs KY11038 $677 / HAHA $482, credits, balance). Donc une fois ces fixes **déployés**, les pages `account-overview` / `costGov` / `org-accounts` — actuellement vides (cause backend déployé) — afficheraient les **vrais rollups org**. Fix #1 est le plus impactant (débloque toute la détection org-admin).

## Procédure recommandée (besoin go)
1. `go` utilisateur → j'applique ces diffs sur la branche backend `feat/backlog-v1` (commit LOCAL).
2. **Tu** relances le backend local (règle : pas de bare-restart par moi) ou déploies → validation runtime.
3. Re-tester les pages org dans le front.
