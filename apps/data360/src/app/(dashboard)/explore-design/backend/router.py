"""
FastAPI Router for Column Preview & Profiling endpoints
"""

from fastapi import APIRouter, HTTPException, Depends

from .schemas import (
    ColumnPreviewRequest,
    ColumnPreviewResponse,
    ColumnProfileRequest,
    ColumnProfileResponse,
    TableProfileRequest,
    TableProfileResponse,
    MarkSensitiveRequest,
    MarkSensitiveResponse,
    ColumnExclusionRequest,
    ColumnExclusionResponse,
)
from .services import (
    get_column_preview,
    get_column_profile,
    get_table_profile,
    mark_column_sensitive,
    set_column_exclusion,
)

# Import your dependencies - adjust path as needed
from app.core.auth import get_current_user
from app.core.database import get_snowflake_connection_for_user

router = APIRouter(prefix="/explore-design", tags=["explore-design"])


# ============================================
# Column Preview Endpoint
# ============================================

@router.post(
    "/column/preview",
    response_model=ColumnPreviewResponse,
    summary="Get column data preview",
    description="Fetches sample data values from a specific column"
)
async def column_preview_endpoint(
    request: ColumnPreviewRequest,
    current_user=Depends(get_current_user),
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


# ============================================
# Column Profile Endpoint
# ============================================

@router.post(
    "/column/profile",
    response_model=ColumnProfileResponse,
    summary="Get column profile statistics",
    description="Fetches detailed profiling statistics for a column"
)
async def column_profile_endpoint(
    request: ColumnProfileRequest,
    current_user=Depends(get_current_user),
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

@router.post(
    "/table/profile",
    response_model=TableProfileResponse,
    summary="Get table profile",
    description="Fetches profiling statistics for all columns in a table"
)
async def table_profile_endpoint(
    request: TableProfileRequest,
    current_user=Depends(get_current_user),
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

@router.post(
    "/column/mark-sensitive",
    response_model=MarkSensitiveResponse,
    summary="Mark column as sensitive",
    description="Marks a column as containing sensitive/PII data"
)
async def mark_sensitive_endpoint(
    request: MarkSensitiveRequest,
    current_user=Depends(get_current_user),
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

@router.post(
    "/column/exclude",
    response_model=ColumnExclusionResponse,
    summary="Exclude/include column from modeling",
    description="Excludes or includes a column from the modeling view"
)
async def column_exclusion_endpoint(
    request: ColumnExclusionRequest,
    current_user=Depends(get_current_user),
):
    """
    Exclude or include a column from modeling.

    - Set excluded=True to exclude the column
    - Set excluded=False to include it back
    - Optionally provide a reason for exclusion
    """
    try:
        conn = get_snowflake_connection_for_user(current_user)
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
