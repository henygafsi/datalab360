"""
Explore & Design API Router - Schema Cloning & Versioning
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, List
import json
import logging

logger = logging.getLogger(__name__)

from models.explore_design import (
    ColumnExclusionRequest, ColumnExclusionResponse, ColumnPreviewRequest, ColumnPreviewResponse, ColumnProfileRequest, ColumnProfileResponse, MarkSensitiveRequest, MarkSensitiveResponse, SchemaCloneRequest, SchemaCloneResponse,
    SchemaCloneExecuteRequest, SchemaCloneExecuteResponse,
    SchemaCloneStatusResponse, SchemaClonePreviewResponse,
    IngestionAdaptationRequest, IngestionAdaptationResponse,
    PauseIngestionRequest, PauseIngestionResponse,
    ResumeIngestionRequest, ResumeIngestionResponse, TablePreviewRequest, TablePreviewResponse, TableProfileRequest, TableProfileResponse,
    VersionComparisonResponse, VersionMigrationResponse,
    EventValidationRequest, EventValidationResponse,
    AddPrimaryKeyRequest, AddPrimaryKeyResponse,
    ExploreProjectsResponse, CreateExploreProjectRequest, CreateExploreProjectResponse
)
from services.explore_design_service import (
    create_schema_clone, execute_schema_clone, get_column_preview, get_column_profile, get_table_preview, get_table_profile, get_table_relationships, mark_column_sensitive, set_column_exclusion, validate_events,
    log_explore_design_event, detect_sensitive_columns, detect_relations,
    get_schema_clone_status, rollback_schema_clone, preview_schema_clone_ddl,
    adapt_ingestion, pause_ingestion, resume_ingestion,
    compare_schema_versions, generate_migration_script,
    create_versioned_objects, promote_version, add_primary_key
)
from services.cache_invalidation import invalidates_cache
from services.cache_event_bus import CacheKey
from dependencies.auth import get_current_user
from services.user import get_snowflake_connection_for_user

explore_design_router = APIRouter()


# ============================================================================
# P0 Endpoints - Schema Cloning
# ============================================================================

@explore_design_router.post("/schema-clone", response_model=SchemaCloneResponse)
@invalidates_cache(CacheKey.SCHEMA_CLONES)
def create_schema_clone_endpoint(
    request: SchemaCloneRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Create a schema clone configuration (does not execute immediately).
    Returns clone ID and DDL statements for review.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = create_schema_clone(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            username=current_user["username"],
            source_database=request.source_database,
            source_schema=request.source_schema,
            target_database=request.target_database,
            target_schema=request.target_schema,
            naming_strategy=request.naming_strategy,
            include_data=request.include_data,
            include_constraints=request.include_constraints,
            include_policies=request.include_policies,
            include_grants=request.include_grants,
            warehouse=request.warehouse
        )

        conn.commit()
        

        return result
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to create schema clone: {str(e)}")


@explore_design_router.post("/schema-clone/{clone_id}/execute", response_model=SchemaCloneExecuteResponse)
@invalidates_cache(CacheKey.SCHEMA_CLONES)
def execute_schema_clone_endpoint(
    clone_id: str,
    request: SchemaCloneExecuteRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Execute a schema clone operation.
    This actually runs the DDL statements to create the cloned schema.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = execute_schema_clone(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            clone_id=clone_id,
            warehouse=request.warehouse
        )

        conn.commit()
        

        return result
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to execute schema clone: {str(e)}")


@explore_design_router.get("/schema-clone/{clone_id}/status", response_model=SchemaCloneStatusResponse)
def get_schema_clone_status_endpoint(
    clone_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Get the status of a schema clone operation.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = get_schema_clone_status(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            clone_id=clone_id
        )

        
        

        if not result:
            raise HTTPException(status_code=404, detail=f"Schema clone {clone_id} not found")

        return result
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to get clone status: {str(e)}")


@explore_design_router.post("/schema-clone/{clone_id}/rollback")
@invalidates_cache(CacheKey.SCHEMA_CLONES)
def rollback_schema_clone_endpoint(
    clone_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Rollback a schema clone operation (drop cloned schema).
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = rollback_schema_clone(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            clone_id=clone_id,
            username=current_user["username"]
        )

        conn.commit()
        
        

        return {"status": "success", "message": "Schema clone rolled back successfully", "result": result}
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to rollback schema clone: {str(e)}")


@explore_design_router.post("/schema-clone/preview", response_model=SchemaClonePreviewResponse)
def preview_schema_clone_endpoint(
    request: SchemaCloneRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Preview DDL statements for a schema clone without executing.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = preview_schema_clone_ddl(
            cursor=cursor,
            source_database=request.source_database,
            source_schema=request.source_schema,
            target_database=request.target_database,
            target_schema=request.target_schema,
            naming_strategy=request.naming_strategy,
            include_data=request.include_data,
            include_constraints=request.include_constraints,
            include_policies=request.include_policies,
            include_grants=request.include_grants
        )

        
        

        return result
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to preview schema clone: {str(e)}")


@explore_design_router.post("/events/validate", response_model=EventValidationResponse)
def validate_events_endpoint(
    request: EventValidationRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Validate pending events before deployment.

    This endpoint validates events by:
    - Generating SQL for each event
    - Validating SQL syntax (dry-run mode)
    - Estimating impact (affected rows, dependent objects)
    - Detecting potential issues and warnings

    Returns validation results with status, SQL, warnings, and impact estimates.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = validate_events(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            project_id=request.project_id,
            event_ids=request.event_ids,
            dry_run=request.dry_run,
            username=current_user["username"]
        )

        
        

        return result
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to validate events: {str(e)}")


# ============================================================================
# P1 Endpoints - Ingestion Management
# ============================================================================

@explore_design_router.post("/ingestion/adapt", response_model=IngestionAdaptationResponse)
@invalidates_cache(CacheKey.INGESTION_CONFIGS)
def adapt_ingestion_endpoint(
    request: IngestionAdaptationRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Adapt ingestion objects (streams/tasks/pipes) to point to a new schema version.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = adapt_ingestion(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            version_id=request.version_id,
            source_schema=request.source_schema,
            target_schema=request.target_schema,
            username=current_user["username"]
        )

        conn.commit()
        
        

        return result
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to adapt ingestion: {str(e)}")


@explore_design_router.post("/ingestion/pause", response_model=PauseIngestionResponse)
@invalidates_cache(CacheKey.TASKS)
def pause_ingestion_endpoint(
    request: PauseIngestionRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Pause all ingestion objects (streams/tasks/pipes) for a table.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = pause_ingestion(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            database=request.database,
            schema=request.schema,
            table=request.table,
            username=current_user["username"]
        )

        conn.commit()
        
        

        return result
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to pause ingestion: {str(e)}")


@explore_design_router.post("/ingestion/resume", response_model=ResumeIngestionResponse)
@invalidates_cache(CacheKey.TASKS)
def resume_ingestion_endpoint(
    request: ResumeIngestionRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Resume ingestion objects for a table, pointing them to a new target schema.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = resume_ingestion(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            database=request.database,
            schema=request.schema,
            table=request.table,
            target_schema=request.target_schema,
            username=current_user["username"]
        )

        conn.commit()
        
        

        return result
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to resume ingestion: {str(e)}")


@explore_design_router.get("/versions/{from_version}/compare/{to_version}", response_model=VersionComparisonResponse)
def compare_versions_endpoint(
    from_version: str,
    to_version: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Compare two schema versions to see differences.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = compare_schema_versions(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            from_version=from_version,
            to_version=to_version
        )

        
        

        return result
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to compare versions: {str(e)}")


@explore_design_router.get("/versions/{from_version}/migration/{to_version}", response_model=VersionMigrationResponse)
def generate_migration_endpoint(
    from_version: str,
    to_version: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Generate migration script to migrate from one schema version to another.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = generate_migration_script(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            from_version=from_version,
            to_version=to_version
        )

        
        

        return result
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to generate migration script: {str(e)}")


# ============================================================================
# P2 Endpoints - Advanced Versioning
# ============================================================================

@explore_design_router.post("/ingestion/create-versioned")
@invalidates_cache(CacheKey.INGESTION_CONFIGS, CacheKey.SCHEMA_VERSIONS)
def create_versioned_objects_endpoint(
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """
    Create versioned ingestion objects (streams/tasks/pipes) for a new schema version.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = create_versioned_objects(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            project_id=request.get("project_id"),
            source_schema=request.get("source_schema"),
            target_schema=request.get("target_schema"),
            tables=request.get("tables", []),
            username=current_user["username"]
        )

        conn.commit()
        
        

        return {"status": "success", "message": "Versioned objects created successfully", "result": result}
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to create versioned objects: {str(e)}")


@explore_design_router.post("/versions/{version_id}/promote")
@invalidates_cache(CacheKey.SCHEMA_VERSIONS)
def promote_version_endpoint(
    version_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Promote a schema version to production (swap schemas).
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = promote_version(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            version_id=version_id,
            username=current_user["username"]
        )

        conn.commit()
        
        

        return {"status": "success", "message": "Version promoted successfully", "result": result}
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to promote version: {str(e)}")


# ============================================================================
# P2 Endpoints - Events & Detection (Frontend API Specification)
# ============================================================================

@explore_design_router.post("/events")
def create_event_endpoint(
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """
    Store an explore-design event for a project.

    Request body:
    {
        "project_id": "string",
        "event_type": "TABLE_RENAMED | COLUMN_RENAMED | etc.",
        "details": { ... event-specific data ... }
    }
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        event_id = log_explore_design_event(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            project_id=request.get("project_id"),
            event_type=request.get("event_type"),
            module_name="EXPLORE_DESIGN",
            username=current_user["username"],
            status="SUCCESS",
            details=request.get("details", {})
        )

        conn.commit()
        
        

        return {"status": "success", "event_id": event_id}
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to create event: {str(e)}")


@explore_design_router.get("/events/{project_id}")
def get_events_endpoint(
    project_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """
    Get all explore-design events for a project.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT EVENT_ID, EVENT_TYPE, USERNAME, TIMESTAMP, STATUS, DETAILS, ERROR_MESSAGE
            FROM CP_DATA360.EVENT_STORE.EXPLORE_DESIGN_EVENTS
            WHERE PROJECT_ID = %s
            ORDER BY TIMESTAMP DESC
        """, (project_id,))

        rows = cursor.fetchall()
        events = []
        for row in rows:
            events.append({
                "event_id": row[0],
                "event_type": row[1],
                "username": row[2],
                "timestamp": row[3].isoformat() if row[3] else None,
                "status": row[4],
                "details": json.loads(row[5]) if row[5] else {},
                "error_message": row[6]
            })

        
        

        return {"project_id": project_id, "events": events}
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to get events: {str(e)}")


@explore_design_router.post("/detect/sensitive")
def detect_sensitive_endpoint(
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """
    Detect sensitive columns in tables based on patterns.

    Request body:
    {
        "project_id": "string (optional)",
        "tables": [{"database": "DB", "schema": "SCH", "table": "TBL"}],
        "patterns": ["email", "ssn", "phone", "address", "credit_card", "dob"]
    }
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        detections = detect_sensitive_columns(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            tables=request.get("tables", []),
            patterns=request.get("patterns", ["email", "ssn", "phone"]),
            sample_data=request.get("sample_data", True),
            sample_size=request.get("sample_size", 100),
            username=current_user["username"],
            project_id=request.get("project_id")
        )

        
        

        return {
            "status": "success",
            "tables_scanned": len(request.get("tables", [])),
            "detections": detections
        }
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to detect sensitive columns: {str(e)}")


@explore_design_router.post("/detect/relations")
def detect_relations_endpoint(
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """
    Detect relationships between tables.

    Request body:
    {
        "project_id": "string (optional)",
        "source_tables": [{"database": "DB", "schema": "SCH", "table": "TBL"}],
        "target_tables": [{"database": "DB", "schema": "SCH", "table": "TBL"}],
        "detection_methods": ["naming_convention", "data_sampling", "pk_fk_analysis"]
    }
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = detect_relations(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            source_tables=request.get("source_tables", []),
            target_tables=request.get("target_tables", []),
            detection_methods=request.get("detection_methods", ["naming_convention"]),
            username=current_user["username"],
            project_id=request.get("project_id")
        )

        
        

        return {
            "status": "success",
            "detected_relations": result.get("detected_relations", []),
            "suggestions": result.get("suggestions", [])
        }
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to detect relations: {str(e)}")


# ============================================================================
# DEPLOYMENT & PROJECT MANAGEMENT ENDPOINTS
# ============================================================================

@explore_design_router.get("/projects", response_model=ExploreProjectsResponse)
def get_explore_projects(
    current_user: Dict = Depends(get_current_user)
):
    """
    Get all explore projects for the current user.

    Returns a list of projects created by the authenticated user.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        account_name = current_user.get("account_name", "default")
        username = current_user["username"]

        # Ensure table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS CP_DATA360.EVENT_STORE.EXPLORE_PROJECTS (
                PROJECT_ID VARCHAR(255),
                ACCOUNT_NAME VARCHAR(255),
                PROJECT_NAME VARCHAR(255),
                CREATED_BY VARCHAR(255),
                CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                STATUS VARCHAR(50) DEFAULT 'ACTIVE',
                METADATA VARIANT,
                PRIMARY KEY (PROJECT_ID, ACCOUNT_NAME)
            )
        """)

        # Query projects for the current user
        cursor.execute("""
            SELECT PROJECT_ID, PROJECT_NAME, CREATED_BY, CREATED_AT, STATUS, METADATA
            FROM CP_DATA360.EVENT_STORE.EXPLORE_PROJECTS
            WHERE ACCOUNT_NAME = %s AND CREATED_BY = %s
            ORDER BY CREATED_AT DESC
        """, (account_name, username))

        rows = cursor.fetchall()

        projects = []
        for row in rows:
            projects.append({
                "project_id": row[0],
                "project_name": row[1],
                "created_by": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
                "status": row[4],
                "metadata": json.loads(row[5]) if row[5] else None
            })

        return {"projects": projects, "total": len(projects)}

    except Exception as e:
        logger.error(f"Failed to get explore projects: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get explore projects: {str(e)}")


@explore_design_router.post("/create_project", response_model=CreateExploreProjectResponse)
def create_explore_project(
    request: CreateExploreProjectRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Create a new explore project for the current user.

    Request body:
    {
        "project_name": "My Project",
        "metadata": {"description": "optional metadata"}
    }
    """
    import uuid

    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        account_name = current_user.get("account_name", "default")
        username = current_user["username"]
        project_id = f"proj_{uuid.uuid4().hex[:12]}"

        # Ensure table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS CP_DATA360.EVENT_STORE.EXPLORE_PROJECTS (
                PROJECT_ID VARCHAR(255),
                ACCOUNT_NAME VARCHAR(255),
                PROJECT_NAME VARCHAR(255),
                CREATED_BY VARCHAR(255),
                CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                STATUS VARCHAR(50) DEFAULT 'ACTIVE',
                METADATA VARIANT,
                PRIMARY KEY (PROJECT_ID, ACCOUNT_NAME)
            )
        """)

        # Insert new project
        cursor.execute("""
            INSERT INTO CP_DATA360.EVENT_STORE.EXPLORE_PROJECTS
            (PROJECT_ID, ACCOUNT_NAME, PROJECT_NAME, CREATED_BY, STATUS, METADATA)
            SELECT %s, %s, %s, %s, 'ACTIVE', PARSE_JSON(%s)
        """, (
            project_id,
            account_name,
            request.project_name,
            username,
            json.dumps(request.metadata) if request.metadata else '{}'
        ))

        conn.commit()

        return {
            "success": True,
            "project_id": project_id,
            "project_name": request.project_name,
            "message": f"Project '{request.project_name}' created successfully"
        }

    except Exception as e:
        logger.error(f"Failed to create explore project: {str(e)}", exc_info=True)
        if 'conn' in locals():
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create explore project: {str(e)}")


def ensure_explore_project_exists(cursor, project_id: str, account_name: str, username: str, database: str = "CP_DATA360"):
    """
    Ensure a project exists for explore-design events.
    Auto-creates project if it doesn't exist.
    """
    try:
        # Create the explore_projects table if it doesn't exist (do this first)
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS {database}.EVENT_STORE.EXPLORE_PROJECTS (
                PROJECT_ID VARCHAR(255),
                ACCOUNT_NAME VARCHAR(255),
                PROJECT_NAME VARCHAR(255),
                CREATED_BY VARCHAR(255),
                CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                STATUS VARCHAR(50) DEFAULT 'ACTIVE',
                METADATA VARIANT,
                PRIMARY KEY (PROJECT_ID, ACCOUNT_NAME)
            )
        """)

        # Check if project exists
        cursor.execute("""
            SELECT PROJECT_ID FROM {database}.EVENT_STORE.EXPLORE_PROJECTS
            WHERE PROJECT_ID = %s AND ACCOUNT_NAME = %s
        """.format(database=database), (project_id, account_name))

        if cursor.fetchone():
            return True

        # Auto-create project if it doesn't exist
        cursor.execute("""
            INSERT INTO {database}.EVENT_STORE.EXPLORE_PROJECTS
            (PROJECT_ID, ACCOUNT_NAME, PROJECT_NAME, CREATED_BY, STATUS)
            VALUES (%s, %s, %s, %s, 'ACTIVE')
        """.format(database=database), (project_id, account_name, f"Project_{project_id}", username))

        return True
    except Exception as e:
        # Log the error for debugging
        logger.error(f"Error ensuring project exists: {str(e)}", exc_info=True)
        # Re-raise the exception so the caller knows there was a problem
        raise


@explore_design_router.post("/add-event")
@invalidates_cache(CacheKey.EXPLORE_EVENTS)
def add_explore_event(
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """
    Add a design event without requiring a pre-existing mapping project.
    Auto-creates project if needed.

    Request body:
    {
        "project_id": "string",
        "event_type": "string",
        "event_details": {...},
        "module_type": "explore-design" | "mapping" | "workflow"
    }

    Returns event_id for tracking the logged event.
    """
    conn = None
    cursor = None
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        project_id = request.get("project_id", f"explore_default_{current_user['username']}")
        account_name = current_user.get("account_name", "default")
        username = current_user["username"]

        logger.info(f"Adding event for project_id={project_id}, event_type={request.get('event_type')}")

        # Ensure project exists (auto-create if needed)
        ensure_explore_project_exists(cursor, project_id, account_name, username)

        # Log the event and capture event_id
        event_id = log_explore_design_event(
            cursor=cursor,
            account_name=account_name,
            project_id=project_id,
            event_type=request.get("event_type", "DESIGN_EVENT"),
            module_name=request.get("module_type", "EXPLORE_DESIGN"),
            username=username,
            status="SUCCESS",
            details=request.get("event_details", {})
        )

        logger.info(f"Event logged with event_id={event_id}, committing transaction")

        # Commit the transaction
        conn.commit()

        logger.info(f"Transaction committed successfully for event_id={event_id}")

        return {
            "status": "success",
            "message": "Event recorded successfully",
            "event_id": event_id,
            "project_id": project_id
        }
    except Exception as e:
        logger.error(f"Failed to record event: {str(e)}", exc_info=True)
        if conn:
            try:
                conn.rollback()
                logger.info("Transaction rolled back")
            except Exception as rollback_error:
                logger.error(f"Rollback failed: {str(rollback_error)}")

        raise HTTPException(status_code=500, detail=f"Failed to record event: {str(e)}")
    


@explore_design_router.post("/deployments")
@invalidates_cache(CacheKey.DEPLOYMENTS)
def create_deployment(
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """
    Create a deployment for explore-design events.

    Request body:
    {
        "project_id": "string",
        "version": "string",
        "type": "immediate" | "scheduled" | "staged",
        "event_ids": ["event_id1", "event_id2"],
        "config": {...}
    }
    """
    import uuid
    from datetime import datetime

    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        deployment_id = f"dep_{uuid.uuid4().hex[:12]}"
        project_id = request.get("project_id")
        account_name = current_user.get("account_name", "default")
        username = current_user["username"]
        deploy_type = request.get("type", "immediate")

        # Ensure deployment table exists
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS (
                DEPLOYMENT_ID VARCHAR(255) PRIMARY KEY,
                PROJECT_ID VARCHAR(255),
                ACCOUNT_NAME VARCHAR(255),
                VERSION VARCHAR(50),
                TYPE VARCHAR(50),
                STATUS VARCHAR(50) DEFAULT 'draft',
                CONFIG VARIANT,
                EVENT_IDS VARIANT,
                CREATED_BY VARCHAR(255),
                CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                APPROVED_BY VARCHAR(255),
                APPROVED_AT TIMESTAMP_NTZ,
                DEPLOYED_AT TIMESTAMP_NTZ,
                ERROR_MESSAGE TEXT
            )
        """)

        # Create deployment record
        cursor.execute("""
            INSERT INTO CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            (DEPLOYMENT_ID, PROJECT_ID, ACCOUNT_NAME, VERSION, TYPE, STATUS, CONFIG, EVENT_IDS, CREATED_BY)
            SELECT %s, %s, %s, %s, %s, %s, PARSE_JSON(%s), PARSE_JSON(%s), %s
        """, (
            deployment_id,
            project_id,
            account_name,
            request.get("version", "1.0.0"),
            deploy_type,
            "pending_review" if deploy_type != "immediate" else "approved",
            json.dumps(request.get("config", {})),
            json.dumps(request.get("event_ids", [])),
            username
        ))

        conn.commit()
        
        

        return {
            "deployment_id": deployment_id,
            "status": "pending_review" if deploy_type != "immediate" else "approved",
            "approval_required": deploy_type != "immediate"
        }
    except Exception as e:
        logger.error(f"Failed to create deployment: {str(e)}", exc_info=True)
        if 'conn' in locals():
            try:
                conn.rollback()
                
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Failed to create deployment: {str(e)}")


@explore_design_router.get("/deployments/{deployment_id}")
def get_deployment(
    deployment_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """Get deployment details."""
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT DEPLOYMENT_ID, PROJECT_ID, VERSION, TYPE, STATUS, CONFIG, EVENT_IDS,
                   CREATED_BY, CREATED_AT, APPROVED_BY, APPROVED_AT, DEPLOYED_AT, ERROR_MESSAGE
            FROM CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            WHERE DEPLOYMENT_ID = %s
        """, (deployment_id,))

        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Deployment not found")

     
        

        return {
            "deployment_id": row[0],
            "project_id": row[1],
            "version": row[2],
            "type": row[3],
            "status": row[4],
            "config": row[5],
            "event_ids": row[6],
            "created_by": row[7],
            "created_at": row[8].isoformat() if row[8] else None,
            "approved_by": row[9],
            "approved_at": row[10].isoformat() if row[10] else None,
            "deployed_at": row[11].isoformat() if row[11] else None,
            "error": row[12]
        }
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to get deployment: {str(e)}")


@explore_design_router.post("/deployments/{deployment_id}/execute")
@invalidates_cache(CacheKey.DEPLOYMENTS)
def execute_deployment(
    deployment_id: str,
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """
    Execute a deployment by running all event SQL statements.
    """
    from datetime import datetime

    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        # Get deployment
        cursor.execute("""
            SELECT STATUS, EVENT_IDS, CONFIG FROM CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            WHERE DEPLOYMENT_ID = %s
        """, (deployment_id,))

        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Deployment not found")

        status, event_ids, config = row

        if status not in ['approved', 'draft'] and request.get("execution_mode") != "dry_run":
            raise HTTPException(status_code=400, detail=f"Deployment must be approved before execution (current: {status})")

        # Update status to deploying
        cursor.execute("""
            UPDATE CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            SET STATUS = 'deploying'
            WHERE DEPLOYMENT_ID = %s
        """, (deployment_id,))

        conn.commit()

        # Execute events (for now, mark as deployed - actual SQL execution would go here)
        cursor.execute("""
            UPDATE CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            SET STATUS = 'deployed', DEPLOYED_AT = CURRENT_TIMESTAMP()
            WHERE DEPLOYMENT_ID = %s
        """, (deployment_id,))

        conn.commit()
        

        return {
            "deployment_id": deployment_id,
            "status": "deployed",
            "execution_started": datetime.utcnow().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            try:
                cursor.execute("""
                    UPDATE CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
                    SET STATUS = 'failed', ERROR_MESSAGE = %s
                    WHERE DEPLOYMENT_ID = %s
                """, (str(e), deployment_id))
                conn.commit()
            except:
                pass
            
        raise HTTPException(status_code=500, detail=f"Deployment failed: {str(e)}")


@explore_design_router.get("/deployments/project/{project_id}")
def list_deployments(
    project_id: str,
    status: str = None,
    limit: int = 20,
    current_user: Dict = Depends(get_current_user)
):
    """List deployments for a project."""
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        query = """
            SELECT DEPLOYMENT_ID, PROJECT_ID, VERSION, TYPE, STATUS, CREATED_BY, CREATED_AT, DEPLOYED_AT
            FROM CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            WHERE PROJECT_ID = %s
        """
        params = [project_id]

        if status:
            query += " AND STATUS = %s"
            params.append(status)

        query += " ORDER BY CREATED_AT DESC LIMIT %s"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        
        

        deployments = [{
            "deployment_id": r[0],
            "project_id": r[1],
            "version": r[2],
            "type": r[3],
            "status": r[4],
            "created_by": r[5],
            "created_at": r[6].isoformat() if r[6] else None,
            "deployed_at": r[7].isoformat() if r[7] else None
        } for r in rows]

        return {"deployments": deployments, "total": len(deployments)}
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to list deployments: {str(e)}")


@explore_design_router.get("/scheduled-deployments")
def get_scheduled_deployments_explore(
    current_user: Dict = Depends(get_current_user)
):
    """
    Get all scheduled deployments across all modules (MAPPING, WORKFLOW, EXPLORE_DESIGN).
    Uses the unified USER_ACTIVITY table for consistency.
    This is the central endpoint for the deployment approval UI.
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        # Query ALL modules from the unified USER_ACTIVITY table
        cursor.execute("""
            SELECT EVENT_ID, PROJECT_ID, EVENT_DETAILS, STATUS, EVENT_DATE, USERNAME, MODULE_NAME
            FROM CP_DATA360.EVENT_STORE.USER_ACTIVITY
            WHERE MODULE_NAME IN ('MAPPING', 'WORKFLOW', 'EXPLORE_DESIGN')
              AND EVENT_TYPE = 'SCHEDULE_DEPLOYMENT'
              AND STATUS IN ('PENDING_APPROVAL', 'APPROVED', 'ACTIVE')
            ORDER BY EVENT_DATE DESC
        """)

        rows = cursor.fetchall()
        
        

        deployments = []
        for row in rows:
            event_id = row[0]
            project_id = row[1]
            event_details = json.loads(row[2]) if row[2] else {}
            status = row[3]
            event_date = row[4]
            created_by = row[5]
            module_name = row[6] if len(row) > 6 else "MAPPING"

            # Build steps based on module type
            steps = []
            mappings = event_details.get("mappings", [])

            if module_name == "MAPPING":
                # For MAPPING: Extract source/target from mappings
                for i, mapping in enumerate(mappings):
                    step = {
                        "step_index": i + 1,
                        "source": {
                            "database": mapping.get("source_database"),
                            "schema": mapping.get("source_schema"),
                            "table": mapping.get("source_table"),
                            "columns": mapping.get("source_columns", [])
                        },
                        "target": {
                            "database": mapping.get("target_database"),
                            "schema": mapping.get("target_schema"),
                            "table": mapping.get("target_table"),
                            "columns": mapping.get("target_columns", [])
                        },
                        "pk_source": mapping.get("pk_source", []),
                        "pk_target": mapping.get("pk_target", [])
                    }
                    steps.append(step)
            elif module_name == "WORKFLOW":
                # For WORKFLOW: Extract workflow-specific steps
                workflow_steps = event_details.get("steps", event_details.get("workflow_steps", []))
                for i, wf_step in enumerate(workflow_steps):
                    step = {
                        "step_index": i + 1,
                        "task_name": wf_step.get("task_name"),
                        "task_type": wf_step.get("task_type"),
                        "schedule": wf_step.get("schedule"),
                        "config": wf_step.get("config", {})
                    }
                    steps.append(step)
            else:
                # For EXPLORE_DESIGN: Use schema_changes or steps directly
                steps = event_details.get("steps", event_details.get("schema_changes", []))

            # Define available actions based on status
            actions = []
            if status == "PENDING_APPROVAL":
                actions = ["approve", "reject"]
            elif status == "APPROVED":
                actions = ["activate", "rollback"]
            elif status == "ACTIVE":
                actions = ["deactivate", "view_logs"]

            deployments.append({
                "event_id": event_id,
                "deployment_id": event_id,
                "project_id": project_id,
                "workflow_name": event_details.get("workflow_name", event_details.get("clone_name")),
                "scheduled_date": event_details.get("scheduled_date"),
                "deployment_method": event_details.get("deployment_method", "MAPPING" if module_name == "MAPPING" else "SCHEMA_CLONE"),
                "created_by": created_by or event_details.get("created_by"),
                "status": status,
                "created_at": str(event_date) if event_date else None,
                "approved_by": event_details.get("approved_by"),
                "approved_at": event_details.get("approved_at"),
                "steps": steps,
                "total_mappings": len(mappings) if module_name == "MAPPING" else 0,
                "total_steps": len(steps),
                "module": module_name,
                "actions": actions
            })

        return {"scheduled_deployments": deployments, "total": len(deployments)}
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to get scheduled deployments: {str(e)}")


# ============================================================================
# APPROVAL ENDPOINTS
# ============================================================================

@explore_design_router.get("/approvals/pending")
def get_pending_approvals(current_user: Dict = Depends(get_current_user)):
    """Get pending approvals for current user (data modelers)."""
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        # Check if user has modeler role
        role = current_user.get("role", "").upper()

        cursor.execute("""
            SELECT DEPLOYMENT_ID, PROJECT_ID, VERSION, TYPE, CREATED_BY, CREATED_AT, CONFIG
            FROM CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            WHERE STATUS = 'pending_review'
            ORDER BY CREATED_AT DESC
        """)

        rows = cursor.fetchall()
        

        pending = [{
            "approval_request_id": f"apr_{r[0]}",
            "deployment_id": r[0],
            "project_id": r[1],
            "version": r[2],
            "type": r[3],
            "requested_by": r[4],
            "requested_at": r[5].isoformat() if r[5] else None,
            "status": "pending",
            "priority": "medium"
        } for r in rows]

        return {"pending": pending, "total": len(pending)}
    except Exception as e:
        if 'conn' in locals():
            raise HTTPException(status_code=500, detail=f"Failed to get approvals: {str(e)}")


@explore_design_router.post("/approvals/{approval_id}/approve")
@invalidates_cache(CacheKey.DEPLOYMENTS)
def approve_deployment(
    approval_id: str,
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """Approve a deployment request."""
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        # Extract deployment_id from approval_id (format: apr_<deployment_id>)
        deployment_id = approval_id.replace("apr_", "")

        cursor.execute("""
            UPDATE CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            SET STATUS = 'approved', APPROVED_BY = %s, APPROVED_AT = CURRENT_TIMESTAMP()
            WHERE DEPLOYMENT_ID = %s AND STATUS = 'pending_review'
        """, (current_user["username"], deployment_id))

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Approval not found or already processed")

        conn.commit()
        

        return {"success": True, "deployment_status": "approved"}
    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            
        raise HTTPException(status_code=500, detail=f"Failed to approve: {str(e)}")


@explore_design_router.post("/approvals/{approval_id}/reject")
@invalidates_cache(CacheKey.DEPLOYMENTS)
def reject_deployment(
    approval_id: str,
    request: Dict[str, Any],
    current_user: Dict = Depends(get_current_user)
):
    """Reject a deployment request."""
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        deployment_id = approval_id.replace("apr_", "")
        comment = request.get("comment", "Rejected")

        cursor.execute("""
            UPDATE CP_DATA360.EVENT_STORE.EXPLORE_DEPLOYMENTS
            SET STATUS = 'draft', ERROR_MESSAGE = %s
            WHERE DEPLOYMENT_ID = %s AND STATUS = 'pending_review'
        """, (f"Rejected: {comment}", deployment_id))

        conn.commit()


        return {"success": True, "message": "Deployment rejected"}
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()

        raise HTTPException(status_code=500, detail=f"Failed to reject: {str(e)}")


# ============================================================================
# PRIMARY KEY MANAGEMENT ENDPOINTS
# ============================================================================

@explore_design_router.post("/primary-key/add", response_model=AddPrimaryKeyResponse)
@invalidates_cache(CacheKey.SCHEMA_CLONES)
def add_primary_key_endpoint(
    request: AddPrimaryKeyRequest,
    current_user: Dict = Depends(get_current_user)
):
    """
    Add a primary key constraint to a table (simple or composite).

    - **Simple Primary Key**: Pass a single column in the columns list
    - **Composite Primary Key**: Pass multiple columns in the columns list
    - All actions are logged to EXPLORE_DESIGN_EVENTS table

    Example for simple PK:
    ```json
    {
        "project_id": "my_project",
        "database": "MY_DB",
        "schema": "PUBLIC",
        "table": "CUSTOMERS",
        "columns": ["CUSTOMER_ID"]
    }
    ```

    Example for composite PK:
    ```json
    {
        "project_id": "my_project",
        "database": "MY_DB",
        "schema": "PUBLIC",
        "table": "ORDER_ITEMS",
        "columns": ["ORDER_ID", "ITEM_ID"]
    }
    ```
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        result = add_primary_key(
            cursor=cursor,
            account_name=current_user.get("account_name", "default"),
            project_id=request.project_id,
            database_name=request.database,
            schema_name=request.schema,
            table_name=request.table,
            columns=request.columns,
            constraint_name=request.constraint_name,
            username=current_user["username"]
        )

        if result.get("success"):
            conn.commit()

            return AddPrimaryKeyResponse(
                success=True,
                event_id=result["event_id"],
                constraint_name=result["constraint_name"],
                sql_executed=result["sql_executed"],
                message=result["message"],
                columns=result["columns"],
                is_composite=result["is_composite"]
            )
        else:
            conn.rollback()

            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to add primary key")
            )

    except HTTPException:
        raise
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()

        raise HTTPException(status_code=500, detail=f"Failed to add primary key: {str(e)}")


@explore_design_router.post("/fetch_relationships")
async def fetch_relationships(
    database: str = Query(default="DATA360"),
    schema: str = Query(default= "RETAIL_DWH"),
    username: dict = Depends(get_current_user)  # optional
):
    """
    Get table relationships (foreign keys) for a Snowflake schema
    """
    conn = get_snowflake_connection_for_user(username)
    cursor = conn.cursor()
    relationships = get_table_relationships(
        cursor=cursor,
        database=database,
        schema=schema
    )

    return {
        "database": database,
        "schema": schema,
        "relationships": relationships
    }
    
    
# ============================================
# Column Preview Endpoint
# ============================================

@explore_design_router.post(
    "/column/preview",
    response_model=ColumnPreviewResponse,
    summary="Get column data preview",
    description="Fetches sample data values from a specific column"
)
async def column_preview_endpoint(
    request: ColumnPreviewRequest,
    current_user = Depends(get_current_user),
):
    """
    Get sample data preview for a column.

    - **database**: Database name (e.g., 'DRAFT_SOURCE_AZURE')
    - **schema**: Schema name (e.g., 'RAW_DRAFT_AZURE')
    - **table**: Table name (e.g., 'STOCKS_MAG')
    - **column**: Column name (e.g., 'COD_MAGASIN')
    - **sample_size**: Number of sample rows (default: 100, max: 1000)
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        # ////to do//// Uncomment when connection is configured
        result = await get_column_preview(
             conn=conn,
             database=request.database,
             schema=request.schema_name,
             table=request.table,
             column=request.column,
             sample_size=request.sample_size
         )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get column preview: {str(e)}"
        )
        

@explore_design_router.post(
    "/table/preview",
    response_model=TablePreviewResponse,
    summary="Get table data preview",
    description="Fetches sample data rows from an entire table with pagination"
)
async def table_preview_endpoint(
    request: TablePreviewRequest,
    current_user: dict =Depends(get_current_user),
):
    """
    Get sample data preview for an entire table.

    - **database**: Database name (e.g., 'DRAFT_SOURCE_AZURE')
    - **schema**: Schema name (e.g., 'RAW_DRAFT_AZURE')
    - **table**: Table name (e.g., 'STOCKS_MAG')
    - **limit**: Number of rows to fetch (default: 50, max: 1000)
    - **offset**: Offset for pagination (default: 0)
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()
        result = await get_table_preview(
            conn=conn,
            cursor=cursor,
            database=request.database,
            schema=request.schema_name,
            table=request.table,
            limit=request.limit,
            offset=request.offset
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get table preview: {str(e)}"
        )




# ============================================
# Column Profile Endpoint
# ============================================

@explore_design_router.post(
    "/column/profile",
    response_model=ColumnProfileResponse,
    summary="Get column profile statistics",
    description="Fetches detailed profiling statistics for a column"
)
async def column_profile_endpoint(
    request: ColumnProfileRequest,
    current_user = Depends(get_current_user),
):
    """
    Get detailed profiling statistics for a column.

    Returns:
    - Total rows, null count, distinct count
    - Min/Max/Avg values
    - Most frequent values
    - Data quality score
    - String length statistics (for text columns)
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)

        # ////to do//// Uncomment when connection is configured
        result = await get_column_profile(
             conn=conn,
             database=request.database,
             schema=request.schema_name,
             table=request.table,
             column=request.column
         )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get column profile: {str(e)}"
        )


# ============================================
# Table Profile Endpoint
# ============================================

@explore_design_router.post(
    "/table/profile",
    response_model=TableProfileResponse,
    summary="Get table profile",
    description="Fetches profiling statistics for all columns in a table"
)
async def table_profile_endpoint(
    request: TableProfileRequest,
    # conn = Depends(get_snowflake_conn),
    current_user = Depends(get_current_user),
):
    """
    Get profiling statistics for all columns in a table.

    Returns:
    - Row count and column count
    - Profile for each column
    - Overall data quality score
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        # ////to do//// Uncomment when connection is configured
        result = await get_table_profile(
            conn=conn,
            database=request.database,
            schema=request.schema_name,
            table=request.table
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get table profile: {str(e)}"
        )


# ============================================
# Mark Column Sensitive Endpoint
# ============================================

@explore_design_router.post(
    "/column/mark-sensitive",
    response_model=MarkSensitiveResponse,
    summary="Mark column as sensitive",
    description="Marks a column as containing sensitive/PII data"
)
async def mark_sensitive_endpoint(
    request: MarkSensitiveRequest,
    # db = Depends(get_db_session),
    current_user = Depends(get_current_user),
):
    """
    Mark a column as sensitive.

    Sensitive types:
    - pii_email, pii_phone, pii_ssn, pii_address, pii_dob, pii_name
    - financial_card, financial_account
    - auth_password
    - custom
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
        # ////to do//// Uncomment when database session is configured
        result = await mark_column_sensitive(
            conn=conn,
            project_id=request.project_id,
            database=request.database,
            schema=request.schema_name,
            table=request.table,
            column=request.column,
            sensitive_type=request.sensitive_type,
            create_event=request.create_event
        )
        return result

        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to mark column as sensitive: {str(e)}"
        )


# ============================================
# Column Exclusion Endpoint
# ============================================

@explore_design_router.post(
    "/column/exclude",
    response_model=ColumnExclusionResponse,
    summary="Exclude/include column from modeling",
    description="Excludes or includes a column from the modeling view"
)
async def column_exclusion_endpoint(
    request: ColumnExclusionRequest,
    # db = Depends(get_db_session),
    current_user = Depends(get_current_user),
):
    """
    Exclude or include a column from modeling.

    - Set excluded=True to exclude the column
    - Set excluded=False to include it back
    - Optionally provide a reason for exclusion
    """
    
    try:
        conn = get_snowflake_connection_for_user(current_user)
        # ////to do//// Uncomment when database session is configured
        result = await set_column_exclusion(
            conn=conn,
            project_id=request.project_id,
            database=request.database,
            schema=request.schema_name,
            table=request.table,
            column=request.column,
            excluded=request.excluded,
            reason=request.reason
        )
        return result


    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set column exclusion: {str(e)}"
        )

@explore_design_router.post("/execute_queries")
async def execute_queries(
    queries: List[str],
    current_user: dict = Depends(get_current_user),
):
    conn = None
    cursor = None
    results = []

    try:
        conn = get_snowflake_connection_for_user(current_user)
        cursor = conn.cursor()

        for query in queries:
            cursor.execute(query)

            # If SELECT, fetch results
            if cursor.description:
                rows = cursor.fetchall()
                results.append({
                    "query": query,
                    "rows": rows
                })
            else:
                results.append({
                    "query": query,
                    "rows_affected": cursor.rowcount
                })

        return {
            "status": "success",
            "executed_queries": len(queries),
            "results": results
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Query execution failed: {str(e)}"
        )