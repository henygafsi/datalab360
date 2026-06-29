# Validation HAHA — cache & events (2026-06-29)

> Test read-only direct sur le compte **HAHA** (`uchsfvb-HAHA`, ACCOUNTADMIN, COMPUTE_WH, CP_DATA360) via `snowflake-connector-python`. Déclenché par les screenshots montrant **toutes les pages HAHA en « Live analytics are warming up / cache is initializing »**. Creds non stockés (session-only, à roter).

## Verdict : le cache ET les events sont PLEINS et FRAIS — le front échoue parce que le backend **déployé** ne peut pas les lire (SVC mort).

### Cache analytics — `CP_DATA360.DATA360_CACHE` ✅ peuplé & frais
| Table | Lignes | Note |
|---|---|---|
| `OVERVIEW_KPIS` | 4 | **KPI réels de HAHA** : governance 98.80% / 100%, storage 167 GB, module usage `{bi_dashboard:20, explore_design:16, workflow:48}` |
| `DATA360_SF_COLUMNS` | 5 520 | métadonnée colonnes |
| `DATA360_SF_OBJECT_USAGE_DAILY` | 3 313 | **fraîcheur : max USAGE_DATE = 2026-06-28** (hier) |
| `DATA360_SF_OBJECT_LINEAGE` | 118 | lineage |

→ La page **account-overview** (et ses KPI) a ses **données cachées, réelles et fraîches**. Si le backend pouvait lire `DATA360_CACHE`, la page s'afficherait.

### Events — `CP_DATA360.EVENT_STORE` ✅ 76 tables, riche
| Table | Lignes |
|---|---|
| `USER_REQUESTS` | **14 669** |
| `USER_ACTIVITY` | **3 451** (cols : EVENT_ID, PROJECT_ID, ORG_ID, MODULE_NAME, EVENT_TYPE, STATUS…) |
| `AUDIT_LOG` | 2 291 |
| `PROJECT_EVENTS` | 1 902 |
| `API_HEALTH_RUNS` | 495 · `CATALOG_OBJECT_SCORES` 257 · `BI_DASHBOARD_CHARTS` 201 · `WORKFLOW_ACTIONS` 117 |

→ Les **events actions** sont bien écrits/loggés (event sourcing fonctionnel au niveau data).

## Cause des pages vides (confirmée, classée)
Les bannières du front (screenshots) :
- *« Live analytics are warming up — the data cache is being provisioned »*
- *« Your data is being prepared. This account's analytics cache is initializing »*
- *« Failed to load connected sources »* / *« Impossible de charger les utilisateurs »*

= **CACHE_NOT_READY renvoyé par le backend déployé** parce que son **service account SVC (SVC_DATA360_API) est mort** (host-side) → il **n'arrive pas à se connecter à CP_DATA360** pour lire ces tables pourtant pleines. **Ce n'est PAS** un cache vide, **ni** un bug FE.
- **Côté FE c'est sain** : le message « warming up » est honnête et **il n'y a aucun crash** (le fix W1 `toMessage`/`extractApiError` fonctionne — visible dans les screenshots : erreurs propres, pas d'écran blanc).

## Ce qui ferait marcher le front HAHA (aucun changement FE requis)
Un **backend avec une connexion CP_DATA360 valide** :
1. soit **réparer le SVC déployé** (host-side, key-pair `SVC_DATA360_API` — besoin accès host + go) ;
2. soit **lancer le backend local :8000** avec une connexion HAHA valide (et pointer `.env.local` dessus) — le front servirait alors ce cache réel.

Le **data layer (cache + events) est prêt** ; il ne manque que la **connexion backend** pour le servir.

## Garde-fous respectés
Lecture seule (aucune écriture/DDL — la sonde d'écriture a été refusée par la table inexistante, non ré-essayée). PAT/mot de passe non stockés, à roter.
