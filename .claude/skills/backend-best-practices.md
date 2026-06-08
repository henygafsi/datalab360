---
name: backend-best-practices
description: >
  Bonnes pratiques backend Data360 (FastAPI + Snowflake). Couvre: events SSE + cache
  invalidation, lineage tracking, tags Snowflake, tests réels endpoints, validation
  outputs. Source unique de vérité pour le backend repo (api.datalab360.io).
  Appliqué à toutes les routes SmartRightBar: catalog, governance, workflow, explore-design.
---

# Backend Best Practices — Data360 (FastAPI + Snowflake)

> Ce document est la référence pour le **backend repo séparé** (api.datalab360.io).
> Chaque section se traduit en code concret. Zéro abstraction sans implémentation.

---

## 1. EVENTS & SSE Cache Invalidation

### Principe

Chaque mutation backend doit :
1. Exécuter l'action Snowflake
2. Persister un événement dans `CP_DATA360.EVENT_STORE.USER_ACTIVITY`
3. Publier une invalidation SSE via `cache_stream` → le frontend recharge automatiquement

### Pattern de base (à appliquer à chaque router)

```python
# backend/app/core/events.py
from enum import str, Enum
from app.core.sse import publish_cache_invalidation
from app.db.event_store import insert_event

class EventType(str, Enum):
    # Catalog / SmartRightBar
    TAG_APPLIED           = "TAG_APPLIED"
    TAG_REMOVED           = "TAG_REMOVED"
    PII_CLASSIFIED        = "PII_CLASSIFIED"
    MASKING_APPLIED       = "MASKING_APPLIED"
    RLS_CREATED           = "RLS_CREATED"
    LINEAGE_COMPUTED      = "LINEAGE_COMPUTED"
    INGESTION_SUCCESS     = "INGESTION_SUCCESS"
    INGESTION_FAILURE     = "INGESTION_FAILURE"
    OWNERSHIP_UPDATED     = "OWNERSHIP_UPDATED"
    # Explore & Design
    TABLE_CREATED         = "TABLE_CREATED"
    FOREIGN_KEY_ADDED     = "FOREIGN_KEY_ADDED"
    SCHEMA_DRIFT          = "SCHEMA_DRIFT"
    DEPLOYED              = "DEPLOYED"
    ROLLBACK              = "ROLLBACK"
    # Workflow
    PIPELINE_RUN_SUCCESS  = "PIPELINE_RUN_SUCCESS"
    PIPELINE_RUN_FAILED   = "PIPELINE_RUN_FAILED"
    SCHEDULE_UPDATED      = "SCHEDULE_UPDATED"

async def emit_event(
    session,
    event_type: EventType,
    module: str,
    entity_id: str,
    actor: str,
    details: dict | None = None,
    cache_keys: list[str] | None = None,
):
    """
    Persiste l'événement dans EVENT_STORE et publie l'invalidation SSE.
    Appeler dans chaque endpoint mutant après le succès de l'opération Snowflake.
    """
    # 1. Persist event
    await insert_event(
        session=session,
        event_type=event_type.value,
        module=module,
        entity_id=entity_id,
        actor=actor,
        details=details or {},
    )
    # 2. SSE cache invalidation
    if cache_keys:
        await publish_cache_invalidation(
            cache_keys=cache_keys,
            reason=f"{event_type.value} on {entity_id}",
            triggered_by=actor,
        )
```

### Mapping Event → CACHE_KEYS (aligné avec frontend CACHE_KEYS)

| Opération backend | Event type | cache_keys à invalider |
|-------------------|------------|------------------------|
| POST /catalog/tags/apply | TAG_APPLIED | `['tags', 'table_governance', 'governance_rate', 'catalog']` |
| POST /governance/policies/rls | RLS_CREATED | `['row_access_policies', 'table_governance', 'governance_rate']` |
| POST /governance/policies/masking/apply | MASKING_APPLIED | `['masking_policies', 'table_governance', 'governance_rate']` |
| POST /catalog/classify/auto | PII_CLASSIFIED | `['tags', 'table_governance', 'governance_rate', 'data_quality']` |
| POST /explore-design/{id}/execute-ingestion | INGESTION_SUCCESS | `['table_ingestion', 'data_profiles', 'data_quality']` |
| POST /projects/{id}/deployments/{d}/execute | DEPLOYED | `['deployments', 'table_lineage', 'data_lineage', 'schemas', 'tables']` |
| PUT /catalog/tables/{db}/{s}/{t}/ownership | OWNERSHIP_UPDATED | `['table_ownership', 'catalog']` |
| POST /workflow/{id}/execute | PIPELINE_RUN_SUCCESS | `['workflows', 'tasks', 'table_ingestion']` |
| POST /explore-design/dynamic-tables | TABLE_CREATED | `['dynamic_tables', 'table_lineage', 'tables']` |

### Route catalog/refresh (SSE broadcast global)

```python
# backend/app/modules/catalog/router.py
@router.post("/refresh")
async def refresh_catalog(
    scope_type: str = "account",
    scope_value: str | None = None,
    session = Depends(get_snowflake_session),
    user = Depends(get_current_user),
):
    """
    Refresh catalog metadata depuis Snowflake INFORMATION_SCHEMA.
    Publie cache_invalidation pour CATALOG + TABLES + SCHEMAS après completion.
    """
    # Run SHOW TABLES in background (peut prendre 5-30s)
    result = await refresh_snowflake_metadata(session, scope_type, scope_value)

    await emit_event(
        session=session,
        event_type=EventType.TABLE_CREATED,  # generic refresh
        module="catalog",
        entity_id=scope_value or "account",
        actor=user.username,
        cache_keys=["catalog", "tables", "schemas", "databases"],
    )
    return {"status": "completed", "tables_refreshed": result.count}
```

---

## 2. EVENT_STORE — Schéma et insertion

### Tables Snowflake (CP_DATA360.EVENT_STORE)

```sql
-- Table universelle USER_ACTIVITY (audit + tracking)
CREATE TABLE IF NOT EXISTS CP_DATA360.EVENT_STORE.USER_ACTIVITY (
    event_id     VARCHAR(36) DEFAULT UUID_STRING(),
    event_type   VARCHAR(64)   NOT NULL,  -- 'TAG_APPLIED', 'INGESTION_SUCCESS', etc.
    module       VARCHAR(64)   NOT NULL,  -- 'catalog', 'governance', 'workflow', etc.
    entity_id    VARCHAR(256)  NOT NULL,  -- 'DB.SCHEMA.TABLE' ou ID projet/pipeline
    actor        VARCHAR(128)  NOT NULL,  -- username Snowflake ou email
    details      VARIANT,                 -- JSON payload libre
    created_at   TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY (module, event_type, TO_DATE(created_at));
```

### Fonction d'insertion (backend Python)

```python
# backend/app/db/event_store.py
async def insert_event(
    session,
    event_type: str,
    module: str,
    entity_id: str,
    actor: str,
    details: dict,
) -> None:
    """
    Insère un événement dans EVENT_STORE.USER_ACTIVITY.
    Utilise un paramètre %s pour VARIANT JSON (Snowflake accepte JSON string).
    Fire-and-forget : si ça échoue, loguer et continuer — ne jamais bloquer la réponse.
    """
    import json
    cursor = session.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO CP_DATA360.EVENT_STORE.USER_ACTIVITY
            (event_type, module, entity_id, actor, details)
            VALUES (%s, %s, %s, %s, PARSE_JSON(%s))
            """,
            (event_type, module, entity_id, actor, json.dumps(details)),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("event_store insert failed: %s", e)
        # NEVER raise — event persistence is non-blocking
```

### API events frontend (GET /api/data360/events)

```python
# backend/app/modules/api/router.py
@router.get("/events")
async def get_events(
    module: str,
    entity_id: str,
    limit: int = Query(default=5, le=50),
    session = Depends(get_snowflake_session),
    user = Depends(get_current_user),
):
    """
    Récupère les N derniers événements pour un entity_id/module donné.
    Utilisé par SmartRightBar S8 (Historique).
    """
    cursor = session.cursor()
    cursor.execute(
        """
        SELECT event_id, event_type, entity_id, actor,
               details, created_at::varchar AS timestamp
        FROM CP_DATA360.EVENT_STORE.USER_ACTIVITY
        WHERE module = %s AND entity_id = %s
          AND created_at >= DATEADD(day, -90, CURRENT_TIMESTAMP())
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (module, entity_id, limit),
    )
    rows = cursor.fetchall()
    cols = [d[0].lower() for d in cursor.description]
    return {"events": [dict(zip(cols, row)) for row in rows]}
```

---

## 3. LINEAGE — OBJECT_DEPENDENCIES

### Snowflake native lineage

Snowflake maintient automatiquement `SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES`.
**Ne pas recalculer manuellement** — requêter cette vue directement.

```python
# backend/app/modules/catalog/lineage.py

async def get_table_lineage(session, db: str, schema: str, table: str) -> dict:
    """
    Retourne upstream (dépend de) et downstream (consommateurs) d'une table.
    Utilise OBJECT_DEPENDENCIES de Snowflake Account Usage.
    Latence: 3h maximum (Account Usage lag).
    Pour les données temps-réel: utiliser INFORMATION_SCHEMA.OBJECT_DEPENDENCIES (0 lag, moins de détails).
    """
    cursor = session.cursor()

    # Downstream — objets qui dépendent de cette table
    cursor.execute(
        """
        SELECT
            referencing_object_name   AS name,
            referencing_object_type   AS type,
            referencing_object_domain AS domain,
            referencing_database      AS db
        FROM snowflake.account_usage.object_dependencies
        WHERE referenced_object_name = UPPER(%s)
          AND referenced_object_domain = 'Table'
          AND referencing_database IS NOT NULL
        ORDER BY referencing_object_type, referencing_object_name
        LIMIT 50
        """,
        (table,)
    )
    downstream = [dict(zip([d[0].lower() for d in cursor.description], row))
                  for row in cursor.fetchall()]

    # Upstream — de quoi dépend cette table
    cursor.execute(
        """
        SELECT
            referenced_object_name   AS name,
            referenced_object_type   AS type,
            referenced_object_domain AS domain
        FROM snowflake.account_usage.object_dependencies
        WHERE referencing_object_name = UPPER(%s)
          AND referencing_object_domain = 'Table'
        ORDER BY referenced_object_type, referenced_object_name
        LIMIT 50
        """,
        (table,)
    )
    upstream = [dict(zip([d[0].lower() for d in cursor.description], row))
                for row in cursor.fetchall()]

    impact_count = len(downstream)
    risk_level = "HIGH" if impact_count > 5 else "MEDIUM" if impact_count > 2 else "LOW"

    return {
        "upstream":      upstream,
        "downstream":    downstream,
        "impact_count":  impact_count,
        "risk_level":    risk_level,
    }


# Route FastAPI — GET /catalog/tables/{db}/{schema}/{table}/lineage
@router.get("/tables/{db}/{schema}/{table}/lineage")
async def get_table_lineage_endpoint(
    db: str, schema: str, table: str,
    session = Depends(get_snowflake_session),
    _user = Depends(get_current_user),
):
    return await get_table_lineage(session, db, schema, table)
```

### Real-time lineage (INFORMATION_SCHEMA, 0 lag)

```python
# Pour les objets créés récemment (Account Usage lag = 3h max)
# INFORMATION_SCHEMA.OBJECT_DEPENDENCIES a 0 lag mais scope limité à la DB

cursor.execute(
    """
    SELECT referencing_object_name, referencing_object_type
    FROM {db}.information_schema.object_dependencies
    WHERE referenced_object_name = UPPER(%s)
    """.format(db=db),
    (table,)
)
```

---

## 4. TAGS Snowflake — Application et classification

### Auto-classification PII (via Cortex + INFORMATION_SCHEMA)

```python
# backend/app/modules/governance/classifier.py

async def auto_classify_pii(session, db: str, schema: str, table: str, username: str) -> list[dict]:
    """
    Détecte automatiquement les colonnes PII en combinant:
    1. Noms de colonnes (heuristics)
    2. SNOWFLAKE.CORTEX.COMPLETE pour les cas ambigus
    Puis applique les tags DATA GOVERNANCE via ALTER TABLE.
    """
    # Étape 1: récupérer toutes les colonnes
    cursor = session.cursor()
    cursor.execute(
        """
        SELECT column_name, data_type, comment
        FROM {db}.information_schema.columns
        WHERE table_name = UPPER(%s) AND table_schema = UPPER(%s)
        ORDER BY ordinal_position
        """.format(db=db),
        (table, schema)
    )
    columns = cursor.fetchall()

    # Étape 2: heuristics + Cortex pour classification
    pii_heuristics = {
        'PII:EMAIL':    ['email', 'mail', 'e_mail', 'email_address'],
        'PII:PHONE':    ['phone', 'tel', 'telephone', 'mobile', 'cell'],
        'PII:SSN':      ['ssn', 'social_security', 'nin', 'sin'],
        'PII:DOB':      ['dob', 'birth_date', 'date_of_birth', 'birthdate'],
        'PII:NAME':     ['first_name', 'last_name', 'full_name', 'fname', 'lname'],
        'PII:ADDRESS':  ['address', 'street', 'city', 'zipcode', 'postal'],
        'PII:IP':       ['ip_address', 'ip_addr', 'ipv4', 'ipv6'],
        'CONFIDENTIAL': ['salary', 'wage', 'revenue', 'profit', 'compensation'],
    }

    classified = []
    for col_name, data_type, comment in columns:
        col_lower = col_name.lower()
        detected_tag = None
        for tag, keywords in pii_heuristics.items():
            if any(kw in col_lower for kw in keywords):
                detected_tag = tag
                break

        if detected_tag:
            # Appliquer le tag Snowflake
            cursor.execute(
                """
                ALTER TABLE {db}.{schema}.{table}
                MODIFY COLUMN {col}
                SET TAG SNOWFLAKE.CORE.PRIVACY_CATEGORY = %s
                """.format(db=db, schema=schema, table=table, col=col_name),
                (detected_tag,)
            )
            classified.append({
                "column_name": col_name,
                "tag_name":    "PRIVACY_CATEGORY",
                "tag_value":   detected_tag,
                "confidence":  "HIGH",
            })

    # Émettre événement + invalider cache
    if classified:
        await emit_event(
            session=session,
            event_type=EventType.PII_CLASSIFIED,
            module="catalog",
            entity_id=f"{db}.{schema}.{table}",
            actor=username,
            details={"classified_count": len(classified), "columns": classified},
            cache_keys=["tags", "table_governance", "governance_rate", "data_quality"],
        )

    return classified
```

### Calcul du Gov Rate

```python
# backend/app/modules/catalog/governance.py

async def get_table_governance(session, db: str, schema: str, table: str) -> dict:
    """
    Calcule le taux de gouvernance (gov_rate) et retourne le détail PII/RLS.
    gov_rate = (colonnes avec masking policy OU tag PII + masking) / total colonnes * 100
    """
    cursor = session.cursor()

    # Total colonnes
    cursor.execute(
        "SELECT COUNT(*) FROM {db}.information_schema.columns WHERE table_name = UPPER(%s) AND table_schema = UPPER(%s)".format(db=db),
        (table, schema)
    )
    total_cols = cursor.fetchone()[0] or 1

    # Colonnes avec masking policy
    cursor.execute(
        """
        SELECT pr.ref_column_name AS column_name, pr.policy_name, pr.policy_kind
        FROM {db}.information_schema.policy_references pr
        WHERE pr.ref_entity_name = UPPER(%s)
          AND pr.ref_entity_domain = 'TABLE'
          AND pr.policy_kind IN ('MASKING_POLICY', 'ROW_ACCESS_POLICY')
        """.format(db=db),
        (table,)
    )
    policies = cursor.fetchall()
    masking_cols = set(r[0] for r in policies if r[2] == 'MASKING_POLICY')
    rls_policies = [{"policy_name": r[1], "column": r[0]} for r in policies if r[2] == 'ROW_ACCESS_POLICY']

    # Colonnes avec tags PII
    cursor.execute(
        """
        SELECT column_name, tag_name, tag_value
        FROM snowflake.account_usage.tag_references
        WHERE object_name = UPPER(%s)
          AND domain = 'COLUMN'
          AND (tag_name ILIKE 'PII%' OR tag_name ILIKE 'SENSITIVE%'
               OR tag_name ILIKE 'PRIVACY%' OR tag_name ILIKE 'CONFIDENTIAL%')
        ORDER BY column_name
        """,
        (table,)
    )
    pii_cols_raw = cursor.fetchall()

    # Construire la liste PII avec statut masking
    pii_columns = []
    for col_name, tag_name, tag_value in pii_cols_raw:
        masking_status = "OK" if col_name in masking_cols else "NONE"
        pii_columns.append({
            "column_name":     col_name,
            "tag_name":        tag_name,
            "tag_value":       tag_value,
            "masking_policy":  masking_status,
        })

    # Gov rate = colonnes governed / total
    governed_count = len(masking_cols | {c["column_name"] for c in pii_columns if c["masking_policy"] == "OK"})
    gov_rate = round(governed_count / total_cols * 100, 1)

    return {
        "gov_rate":         gov_rate,
        "pii_columns":      pii_columns,
        "rls_policies":     rls_policies,
        "sensitive_columns": [],  # CONFIDENTIAL tag logic same pattern
        "total_cols":       total_cols,
        "governed_cols":    governed_count,
    }
```

---

## 5. INGESTION — COPY_HISTORY + TASK_HISTORY

```python
# backend/app/modules/catalog/ingestion.py

async def get_table_ingestion(session, db: str, schema: str, table: str) -> dict:
    """
    Retourne le statut d'ingestion: mode, dernière run, prochaine run, coût moyen.
    Combine COPY_HISTORY (Snowpipe/COPY INTO) + TASK_HISTORY (tasks) + DYNAMIC_TABLE_REFRESH_HISTORY.
    """
    cursor = session.cursor()

    # Dernier COPY INTO
    cursor.execute(
        """
        SELECT status, last_load_time::varchar, row_count, file_size,
               error_count, error_message,
               ROUND(credits_used, 4) AS credits_used
        FROM snowflake.account_usage.copy_history
        WHERE table_name = UPPER(%s)
          AND last_load_time >= DATEADD(day, -30, CURRENT_TIMESTAMP())
        ORDER BY last_load_time DESC
        LIMIT 10
        """,
        (table,)
    )
    copy_runs = cursor.fetchall()

    # Tâches liées (mode INCREMENTAL / schedule)
    cursor.execute(
        """
        SELECT t.name, t.state, t.schedule, t.definition,
               t.last_committed_on::varchar
        FROM information_schema.tasks t
        WHERE UPPER(t.definition) LIKE UPPER(%s)
        LIMIT 5
        """,
        (f'%{table}%',)
    )
    tasks = cursor.fetchall()

    # Dynamic table refresh history
    cursor.execute(
        """
        SELECT name, refresh_start_time::varchar, refresh_end_time::varchar,
               refresh_trigger, data_timestamp::varchar, num_rows_inserted,
               ROUND(credits_used, 4) AS credits_used
        FROM snowflake.account_usage.dynamic_table_refresh_history
        WHERE UPPER(name) = UPPER(%s)
          AND refresh_start_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
        ORDER BY refresh_start_time DESC
        LIMIT 10
        """,
        (table,)
    )
    dt_runs = cursor.fetchall()

    # Calculer le coût moyen
    all_credits = [r[6] for r in copy_runs if r[6]] + [r[6] for r in dt_runs if r[6]]
    avg_cost = round(sum(all_credits) / len(all_credits), 4) if all_credits else None

    # Dernière run (COPY ou DT)
    last_run = None
    if copy_runs:
        last_run = {
            "status": copy_runs[0][0],
            "time": copy_runs[0][1],
            "rows": copy_runs[0][2],
            "size_bytes": copy_runs[0][3],
            "errors": copy_runs[0][4],
        }

    # Prochaine run depuis tasks
    next_run = None
    schedule_cron = None
    if tasks:
        schedule_cron = tasks[0][2]  # cron expression

    return {
        "mode":               "INCREMENTAL" if tasks else ("DYNAMIC_TABLE" if dt_runs else ("COPY" if copy_runs else None)),
        "last_run_time":      last_run["time"] if last_run else None,
        "last_run_status":    last_run["status"] if last_run else None,
        "last_run_rows":      last_run["rows"] if last_run else None,
        "next_run_time":      next_run,
        "schedule_cron":      schedule_cron,
        "avg_cost_credits":   avg_cost,
        "recent_copy_runs":   len(copy_runs),
        "recent_dt_runs":     len(dt_runs),
    }
```

---

## 6. OWNERSHIP — ACCESS_HISTORY

```python
# backend/app/modules/catalog/ownership.py

async def get_table_ownership(session, db: str, schema: str, table: str) -> dict:
    """
    Retourne: propriétaire, équipe, classification source/product, consommateurs 30j.
    Access_history identifie les usages réels (humains + apps).
    """
    cursor = session.cursor()

    # Tags ownership depuis ACCOUNT_USAGE.TAG_REFERENCES
    cursor.execute(
        """
        SELECT tag_name, tag_value
        FROM snowflake.account_usage.tag_references
        WHERE UPPER(object_name) = UPPER(%s)
          AND domain = 'TABLE'
          AND tag_name IN ('OWNER_EMAIL', 'OWNER_TEAM', 'DATA_CLASS',
                           'PIPELINE_STEP', 'PIPELINE_NAME', 'DATA_PRODUCT_ID')
        """,
        (table,)
    )
    tags = {r[0]: r[1] for r in cursor.fetchall()}

    # Consommateurs réels via ACCESS_HISTORY (30j)
    cursor.execute(
        """
        SELECT
            user_name,
            query_type,
            COUNT(*) AS access_count,
            MAX(query_start_time)::varchar AS last_access
        FROM snowflake.account_usage.access_history,
             LATERAL FLATTEN(base_objects_accessed) f
        WHERE UPPER(f.value:objectName::string) = UPPER(%s)
          AND query_start_time >= DATEADD(day, -30, CURRENT_TIMESTAMP())
          AND user_name NOT IN ('SYSTEM', 'SNOWFLAKE')
        GROUP BY user_name, query_type
        ORDER BY access_count DESC
        LIMIT 20
        """,
        (f"{db}.{schema}.{table}",)
    )
    access_rows = cursor.fetchall()

    # Séparer humains vs apps (heuristic: apps ont des patterns spécifiques)
    app_patterns = ['dbt', 'tableau', 'looker', 'fivetran', 'airbyte', 'streamlit',
                    'power_bi', 'sigma', 'thoughtspot', 'svc_', 'sa_', 'etl_']
    consumers_human = []
    consumers_apps = []
    for user, qtype, count, last_access in access_rows:
        is_app = any(p in user.lower() for p in app_patterns)
        entry = {"user_name": user, "query_type": qtype, "access_count": count, "last_access": last_access}
        if is_app:
            consumers_apps.append(entry)
        else:
            consumers_human.append(entry)

    return {
        "classification":    tags.get("DATA_CLASS"),  # SOURCE|INTERMEDIATE|PRODUCT|DERIVED
        "owner_email":       tags.get("OWNER_EMAIL"),
        "owner_team":        tags.get("OWNER_TEAM"),
        "pipeline_step":     int(tags.get("PIPELINE_STEP", 0)) or None,
        "pipeline_name":     tags.get("PIPELINE_NAME"),
        "data_product_id":   tags.get("DATA_PRODUCT_ID"),
        "consumers_human":   consumers_human,
        "consumers_apps":    consumers_apps,
    }
```

---

## 7. TESTS RÉELS — Validation des endpoints

### Pattern de test recommandé (pytest + Snowflake réel)

```python
# backend/tests/integration/test_catalog_smartrightbar.py
"""
Tests d'intégration RÉELS contre Snowflake.
NE PAS mocker Snowflake — les mocks ont causé des faux positifs en production.
Utiliser un compte de test dédié (HAHA / test env).
"""
import pytest
import httpx

BASE_URL = "http://localhost:8000"
TEST_HEADERS = None  # populated in fixture

@pytest.fixture(scope="session")
def auth_headers():
    """Obtenir un token JWT depuis l'endpoint de login."""
    resp = httpx.post(f"{BASE_URL}/auth/login", json={
        "username": "HAHA",
        "password": "...",
        "account": "HAHA",
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Catalog SmartRightBar endpoints ──────────────────────────────────────

class TestTableContext:
    def test_returns_200_for_existing_table(self, auth_headers):
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/PUBLIC/TEST_TABLE/context",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # Valider les champs obligatoires
        assert "name" in data
        assert "type" in data
        assert isinstance(data.get("row_count"), (int, type(None)))
        assert isinstance(data.get("tags"), list)

    def test_returns_404_for_nonexistent_table(self, auth_headers):
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/PUBLIC/TABLE_DOES_NOT_EXIST_XYZ/context",
            headers=auth_headers,
        )
        assert resp.status_code == 404


class TestTableGovernance:
    def test_gov_rate_is_between_0_and_100(self, auth_headers):
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/PUBLIC/TEST_TABLE/governance",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert 0 <= data["gov_rate"] <= 100
        assert isinstance(data["pii_columns"], list)
        assert isinstance(data["rls_policies"], list)
        # Chaque pii_column a les champs requis
        for col in data["pii_columns"]:
            assert "column_name" in col
            assert "masking_policy" in col
            assert col["masking_policy"] in ("OK", "PARTIAL", "NONE")


class TestTableLineage:
    def test_lineage_structure_valid(self, auth_headers):
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/SALES/ORDERS_FACT/lineage",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "upstream" in data
        assert "downstream" in data
        assert "impact_count" in data
        assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH")
        # Chaque downstream a name + type
        for node in data["downstream"]:
            assert "name" in node
            assert "type" in node


class TestTableIngestion:
    def test_returns_mode(self, auth_headers):
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/SALES/ORDERS_RAW/ingestion",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "mode" in data
        # avg_cost_credits peut être None si pas de runs
        if data.get("avg_cost_credits") is not None:
            assert data["avg_cost_credits"] >= 0


class TestEventStore:
    def test_events_returned_for_module(self, auth_headers):
        resp = httpx.get(
            f"{BASE_URL}/api/data360/events",
            params={"module": "catalog", "entity_id": "CP_DATA360.SALES.ORDERS_FACT", "limit": 5},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "events" in data
        assert len(data["events"]) <= 5
        for event in data["events"]:
            assert "event_type" in event
            assert "timestamp" in event
            assert "actor" in event


class TestCacheInvalidation:
    def test_catalog_refresh_triggers_sse_event(self, auth_headers):
        """
        Vérifie qu'un refresh catalog publie un événement SSE.
        Ce test nécessite que le stream SSE soit connecté.
        """
        import threading, queue, json

        received_events = queue.Queue()

        def listen_sse():
            with httpx.stream("GET", f"{BASE_URL}/cache-stream/stream", headers=auth_headers) as r:
                for chunk in r.iter_lines():
                    if chunk.startswith("data:"):
                        evt = json.loads(chunk[5:])
                        if evt.get("type") == "cache_invalidation":
                            received_events.put(evt)
                            return

        t = threading.Thread(target=listen_sse, daemon=True)
        t.start()

        # Trigger refresh
        resp = httpx.post(f"{BASE_URL}/catalog/refresh", params={"scope_type": "database", "scope_value": "CP_DATA360"}, headers=auth_headers)
        assert resp.status_code == 200

        # Attendre max 10s pour l'event SSE
        t.join(timeout=10)
        assert not received_events.empty(), "No SSE cache_invalidation event received after catalog refresh"
        evt = received_events.get()
        assert "catalog" in evt.get("cache_keys", [])
```

### Validation des outputs de données

```python
# backend/tests/integration/test_data_outputs.py
"""
Valide que les réponses backend ont les shapes attendus par le frontend SmartRightBar.
Source unique: smart-rightbar-spec.md + page-catalog.md
"""

class TestDataOutputShapes:
    """
    Chaque test vérifie le contrat entre backend et frontend SmartRightBar.
    Si un test échoue → le SmartRightBar section correspondant sera vide ou crashé.
    """

    def test_table_context_has_required_s1_fields(self, auth_headers):
        """S1 Context: champs requis pour le rendu frontend."""
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/SALES/ORDERS_FACT/context",
            headers=auth_headers,
        )
        data = resp.json()
        # Ces champs sont rendus dans SectionContext.tsx — leur absence = blank panel
        required = ["name", "type", "row_count", "size_gb", "owner", "tags"]
        for field in required:
            assert field in data, f"S1 missing required field: {field}"

    def test_governance_pii_masking_status_valid(self, auth_headers):
        """S3 Governance: masking_policy doit être OK|PARTIAL|NONE — jamais null dans la liste."""
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/SALES/ORDERS_FACT/governance",
            headers=auth_headers,
        )
        data = resp.json()
        valid_statuses = {"OK", "PARTIAL", "NONE"}
        for col in data.get("pii_columns", []):
            assert col["masking_policy"] in valid_statuses, \
                f"Invalid masking_policy '{col['masking_policy']}' for column {col['column_name']}"

    def test_lineage_risk_level_matches_downstream_count(self, auth_headers):
        """S4 Lineage: risk_level doit correspondre au downstream count."""
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/SALES/ORDERS_FACT/lineage",
            headers=auth_headers,
        )
        data = resp.json()
        count = data["impact_count"]
        level = data["risk_level"]
        expected = "HIGH" if count > 5 else "MEDIUM" if count > 2 else "LOW"
        assert level == expected, f"risk_level={level} doesn't match impact_count={count} (expected {expected})"

    def test_ingestion_cost_never_negative(self, auth_headers):
        """S5 Ingestion: avg_cost_credits ne peut pas être négatif."""
        resp = httpx.get(
            f"{BASE_URL}/catalog/tables/CP_DATA360/SALES/ORDERS_RAW/ingestion",
            headers=auth_headers,
        )
        data = resp.json()
        cost = data.get("avg_cost_credits")
        if cost is not None:
            assert cost >= 0, f"avg_cost_credits must be >= 0, got {cost}"
```

---

## 8. BONNES PRATIQUES GÉNÉRALES

### Règles SQL Snowflake

```python
# TOUJOURS:
cursor.execute("SELECT ... WHERE created_at >= DATEADD(day, -30, CURRENT_TIMESTAMP())")

# JAMAIS:
cursor.execute(f"SELECT ... WHERE table_name = '{table_name}'")  # SQL injection

# TOUJOURS:
cursor.execute("SELECT ... WHERE table_name = UPPER(%s)", (table_name,))

# TOUJOURS LIMITER:
cursor.execute("SELECT ... LIMIT 50")  # jamais de scan illimité

# COLONNES en snake_case dans SELECT:
cursor.execute("""
    SELECT
        table_name      AS name,
        row_count       AS row_count,
        bytes / 1e9     AS size_gb,  -- convert bytes → GB
        table_owner     AS owner,
        created         AS created_at,
        last_altered    AS last_altered
    FROM information_schema.tables
    WHERE table_name = UPPER(%s)
""", (table,))
```

### Pattern Pydantic response models

```python
from pydantic import BaseModel, Field
from typing import Optional

class TableContextResponse(BaseModel):
    """Contrat frontend↔backend pour S1 SmartRightBar Context."""
    name:         str
    type:         str  # TABLE | VIEW | EXTERNAL TABLE | DYNAMIC TABLE
    row_count:    Optional[int] = None
    size_gb:      Optional[float] = None
    cluster_key:  Optional[str] = None
    owner:        Optional[str] = None
    created_at:   Optional[str] = None
    last_altered: Optional[str] = None
    database:     str
    schema_name:  str = Field(alias="schema")
    tags:         list[dict] = Field(default_factory=list)

    class Config:
        populate_by_name = True
```

### Ne jamais retourner de données raw Snowflake Row

```python
# JAMAIS:
return cursor.fetchall()  # tuples non typés

# TOUJOURS:
cols = [d[0].lower() for d in cursor.description]
rows = cursor.fetchall()
return [TableContextResponse(**dict(zip(cols, row))) for row in rows]
```

---

## Checklist avant merge (backend)

- [ ] Chaque endpoint mutant appelle `emit_event()` avec les bons `cache_keys`
- [ ] Toutes les requêtes SQL utilisent des paramètres `%s` (pas de f-strings)
- [ ] Chaque requête a `LIMIT N` et `DATEADD(day, -30/90, ...)` pour les vues Account Usage
- [ ] Chaque réponse est un Pydantic model (pas de dict brut)
- [ ] Tests d'intégration réels écrits pour chaque nouvel endpoint (voir §7)
- [ ] Tests de validation output écrits pour vérifier les shapes attendus par le frontend
- [ ] SSE cache_invalidation testé explicitement (voir TestCacheInvalidation)
