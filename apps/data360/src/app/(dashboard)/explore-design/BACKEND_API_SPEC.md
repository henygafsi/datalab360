# Column Mapping Backend API Specification

## Overview
This document specifies the FastAPI backend services needed for persisting column mappings between source tables and target (DWH) tables.

---

## Database Schema

### Table: `column_mappings`

```sql
CREATE TABLE column_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(100) NOT NULL,

    -- Source table info
    source_database VARCHAR(255) NOT NULL,
    source_schema VARCHAR(255) NOT NULL,
    source_table VARCHAR(255) NOT NULL,
    source_column VARCHAR(255) NOT NULL,
    source_data_type VARCHAR(100),

    -- Target table info
    target_database VARCHAR(255) NOT NULL,
    target_schema VARCHAR(255) NOT NULL,
    target_table VARCHAR(255) NOT NULL,
    target_column VARCHAR(255) NOT NULL,
    target_data_type VARCHAR(100),

    -- Mapping metadata
    mapping_type VARCHAR(50) DEFAULT 'direct', -- direct, transformed, computed
    transformation_rule TEXT, -- e.g., "UPPER(source_column)", "TRIM(source_column)"
    is_active BOOLEAN DEFAULT TRUE,

    -- Audit fields
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE(project_id, source_database, source_schema, source_table, source_column,
           target_database, target_schema, target_table, target_column)
);

CREATE INDEX idx_column_mappings_project ON column_mappings(project_id);
CREATE INDEX idx_column_mappings_source ON column_mappings(source_database, source_schema, source_table);
CREATE INDEX idx_column_mappings_target ON column_mappings(target_database, target_schema, target_table);
```

---

## Pydantic Models

### File: `app/models/column_mapping.py`

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from enum import Enum


class MappingType(str, Enum):
    DIRECT = "direct"
    TRANSFORMED = "transformed"
    COMPUTED = "computed"


class TableReference(BaseModel):
    database: str
    schema_name: str = Field(alias="schema")
    table: str

    class Config:
        populate_by_name = True


class ColumnMappingBase(BaseModel):
    """Base model for column mapping"""
    source_database: str
    source_schema: str
    source_table: str
    source_column: str
    source_data_type: Optional[str] = None

    target_database: str
    target_schema: str
    target_table: str
    target_column: str
    target_data_type: Optional[str] = None

    mapping_type: MappingType = MappingType.DIRECT
    transformation_rule: Optional[str] = None


class ColumnMappingCreate(ColumnMappingBase):
    """Model for creating a new column mapping"""
    project_id: str


class ColumnMappingUpdate(BaseModel):
    """Model for updating a column mapping"""
    mapping_type: Optional[MappingType] = None
    transformation_rule: Optional[str] = None
    is_active: Optional[bool] = None


class ColumnMappingResponse(ColumnMappingBase):
    """Response model for column mapping"""
    id: UUID
    project_id: str
    is_active: bool
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ColumnMappingBulkCreate(BaseModel):
    """Model for creating multiple mappings at once"""
    project_id: str
    mappings: List[ColumnMappingBase]


class ColumnMappingBulkResponse(BaseModel):
    """Response for bulk operations"""
    success: int
    failed: int
    mappings: List[ColumnMappingResponse]
    errors: List[dict] = []


class MappingsByTableResponse(BaseModel):
    """Response for getting mappings grouped by table"""
    source_table: TableReference
    target_table: TableReference
    mappings: List[ColumnMappingResponse]
    total_mappings: int
```

---

## FastAPI Router

### File: `app/routers/column_mapping.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.database import get_db
from app.models.column_mapping import (
    ColumnMappingCreate,
    ColumnMappingUpdate,
    ColumnMappingResponse,
    ColumnMappingBulkCreate,
    ColumnMappingBulkResponse,
    MappingsByTableResponse
)
from app.services.column_mapping_service import ColumnMappingService
from app.auth.dependencies import get_current_user

router = APIRouter(
    prefix="/api/v1/column-mappings",
    tags=["Column Mappings"]
)


# ============================================
# CREATE ENDPOINTS
# ============================================

@router.post("/", response_model=ColumnMappingResponse, status_code=status.HTTP_201_CREATED)
async def create_column_mapping(
    mapping: ColumnMappingCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new column mapping between source and target columns.

    - **project_id**: Project identifier
    - **source_***: Source table/column information
    - **target_***: Target (DWH) table/column information
    - **mapping_type**: direct, transformed, or computed
    - **transformation_rule**: SQL transformation (optional)
    """
    service = ColumnMappingService(db)
    return service.create_mapping(mapping, current_user["username"])


@router.post("/bulk", response_model=ColumnMappingBulkResponse)
async def create_bulk_mappings(
    bulk_request: ColumnMappingBulkCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Create multiple column mappings in a single request.
    Used when mapping multiple source columns to target columns at once.

    Returns success/failure counts and created mappings.
    """
    service = ColumnMappingService(db)
    return service.create_bulk_mappings(bulk_request, current_user["username"])


# ============================================
# READ ENDPOINTS
# ============================================

@router.get("/project/{project_id}", response_model=List[ColumnMappingResponse])
async def get_project_mappings(
    project_id: str,
    include_inactive: bool = Query(False, description="Include inactive mappings"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all column mappings for a project.
    """
    service = ColumnMappingService(db)
    return service.get_mappings_by_project(project_id, include_inactive)


@router.get("/project/{project_id}/by-source-table", response_model=List[MappingsByTableResponse])
async def get_mappings_by_source_table(
    project_id: str,
    database: str = Query(..., description="Source database"),
    schema: str = Query(..., description="Source schema"),
    table: str = Query(..., description="Source table"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all mappings for a specific source table.
    Returns mappings grouped by target table.
    """
    service = ColumnMappingService(db)
    return service.get_mappings_by_source_table(
        project_id, database, schema, table
    )


@router.get("/project/{project_id}/by-target-table", response_model=List[MappingsByTableResponse])
async def get_mappings_by_target_table(
    project_id: str,
    database: str = Query(..., description="Target database"),
    schema: str = Query(..., description="Target schema"),
    table: str = Query(..., description="Target table"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all mappings for a specific target (DWH) table.
    Returns mappings grouped by source table.
    """
    service = ColumnMappingService(db)
    return service.get_mappings_by_target_table(
        project_id, database, schema, table
    )


@router.get("/project/{project_id}/between-tables")
async def get_mappings_between_tables(
    project_id: str,
    source_database: str,
    source_schema: str,
    source_table: str,
    target_database: str,
    target_schema: str,
    target_table: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all column mappings between a specific source and target table pair.
    Used by the ColumnMappingModal to show existing mappings.
    """
    service = ColumnMappingService(db)
    return service.get_mappings_between_tables(
        project_id,
        source_database, source_schema, source_table,
        target_database, target_schema, target_table
    )


@router.get("/{mapping_id}", response_model=ColumnMappingResponse)
async def get_mapping_by_id(
    mapping_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get a specific column mapping by ID.
    """
    service = ColumnMappingService(db)
    mapping = service.get_mapping_by_id(mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return mapping


# ============================================
# UPDATE ENDPOINTS
# ============================================

@router.patch("/{mapping_id}", response_model=ColumnMappingResponse)
async def update_mapping(
    mapping_id: UUID,
    update_data: ColumnMappingUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Update a column mapping (transformation rule, active status, etc.)
    """
    service = ColumnMappingService(db)
    mapping = service.update_mapping(mapping_id, update_data)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return mapping


# ============================================
# DELETE ENDPOINTS
# ============================================

@router.delete("/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapping(
    mapping_id: UUID,
    hard_delete: bool = Query(False, description="Permanently delete instead of soft delete"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a column mapping.
    By default, performs soft delete (sets is_active=False).
    Use hard_delete=True to permanently remove.
    """
    service = ColumnMappingService(db)
    success = service.delete_mapping(mapping_id, hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="Mapping not found")


@router.delete("/project/{project_id}/between-tables", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mappings_between_tables(
    project_id: str,
    source_database: str,
    source_schema: str,
    source_table: str,
    target_database: str,
    target_schema: str,
    target_table: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete all mappings between a specific source and target table pair.
    """
    service = ColumnMappingService(db)
    service.delete_mappings_between_tables(
        project_id,
        source_database, source_schema, source_table,
        target_database, target_schema, target_table
    )


# ============================================
# UTILITY ENDPOINTS
# ============================================

@router.get("/project/{project_id}/unmapped-columns")
async def get_unmapped_target_columns(
    project_id: str,
    target_database: str,
    target_schema: str,
    target_table: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of target columns that don't have any mappings yet.
    Used to show unmapped columns indicator on DWH tables.
    """
    service = ColumnMappingService(db)
    return service.get_unmapped_target_columns(
        project_id, target_database, target_schema, target_table
    )


@router.post("/project/{project_id}/validate")
async def validate_mappings(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Validate all mappings for a project.
    Checks:
    - Data type compatibility
    - Missing required mappings
    - Circular dependencies
    - Transformation syntax

    Returns validation results with warnings and errors.
    """
    service = ColumnMappingService(db)
    return service.validate_project_mappings(project_id)
```

---

## Service Layer

### File: `app/services/column_mapping_service.py`

```python
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from app.models.column_mapping import (
    ColumnMappingCreate,
    ColumnMappingUpdate,
    ColumnMappingBulkCreate,
    ColumnMappingBulkResponse,
    ColumnMappingResponse,
    MappingsByTableResponse,
    TableReference
)
from app.database.models import ColumnMapping  # SQLAlchemy model


class ColumnMappingService:
    def __init__(self, db: Session):
        self.db = db

    # ==========================================
    # CREATE OPERATIONS
    # ==========================================

    def create_mapping(
        self,
        mapping_data: ColumnMappingCreate,
        created_by: str
    ) -> ColumnMappingResponse:
        """Create a single column mapping"""

        # Check for duplicate
        existing = self.db.query(ColumnMapping).filter(
            and_(
                ColumnMapping.project_id == mapping_data.project_id,
                ColumnMapping.source_database == mapping_data.source_database,
                ColumnMapping.source_schema == mapping_data.source_schema,
                ColumnMapping.source_table == mapping_data.source_table,
                ColumnMapping.source_column == mapping_data.source_column,
                ColumnMapping.target_database == mapping_data.target_database,
                ColumnMapping.target_schema == mapping_data.target_schema,
                ColumnMapping.target_table == mapping_data.target_table,
                ColumnMapping.target_column == mapping_data.target_column,
            )
        ).first()

        if existing:
            # Reactivate if soft-deleted
            if not existing.is_active:
                existing.is_active = True
                existing.updated_at = datetime.utcnow()
                self.db.commit()
                self.db.refresh(existing)
                return ColumnMappingResponse.from_orm(existing)
            raise ValueError("Mapping already exists")

        # Create new mapping
        db_mapping = ColumnMapping(
            project_id=mapping_data.project_id,
            source_database=mapping_data.source_database,
            source_schema=mapping_data.source_schema,
            source_table=mapping_data.source_table,
            source_column=mapping_data.source_column,
            source_data_type=mapping_data.source_data_type,
            target_database=mapping_data.target_database,
            target_schema=mapping_data.target_schema,
            target_table=mapping_data.target_table,
            target_column=mapping_data.target_column,
            target_data_type=mapping_data.target_data_type,
            mapping_type=mapping_data.mapping_type,
            transformation_rule=mapping_data.transformation_rule,
            created_by=created_by,
        )

        self.db.add(db_mapping)
        self.db.commit()
        self.db.refresh(db_mapping)

        return ColumnMappingResponse.from_orm(db_mapping)

    def create_bulk_mappings(
        self,
        bulk_request: ColumnMappingBulkCreate,
        created_by: str
    ) -> ColumnMappingBulkResponse:
        """Create multiple mappings at once"""

        success_count = 0
        failed_count = 0
        created_mappings = []
        errors = []

        for mapping_base in bulk_request.mappings:
            try:
                mapping_create = ColumnMappingCreate(
                    project_id=bulk_request.project_id,
                    **mapping_base.dict()
                )
                created = self.create_mapping(mapping_create, created_by)
                created_mappings.append(created)
                success_count += 1
            except Exception as e:
                failed_count += 1
                errors.append({
                    "source_column": mapping_base.source_column,
                    "target_column": mapping_base.target_column,
                    "error": str(e)
                })

        return ColumnMappingBulkResponse(
            success=success_count,
            failed=failed_count,
            mappings=created_mappings,
            errors=errors
        )

    # ==========================================
    # READ OPERATIONS
    # ==========================================

    def get_mapping_by_id(self, mapping_id: UUID) -> Optional[ColumnMappingResponse]:
        """Get a single mapping by ID"""
        mapping = self.db.query(ColumnMapping).filter(
            ColumnMapping.id == mapping_id
        ).first()

        if mapping:
            return ColumnMappingResponse.from_orm(mapping)
        return None

    def get_mappings_by_project(
        self,
        project_id: str,
        include_inactive: bool = False
    ) -> List[ColumnMappingResponse]:
        """Get all mappings for a project"""

        query = self.db.query(ColumnMapping).filter(
            ColumnMapping.project_id == project_id
        )

        if not include_inactive:
            query = query.filter(ColumnMapping.is_active == True)

        mappings = query.order_by(
            ColumnMapping.source_table,
            ColumnMapping.source_column
        ).all()

        return [ColumnMappingResponse.from_orm(m) for m in mappings]

    def get_mappings_by_source_table(
        self,
        project_id: str,
        database: str,
        schema: str,
        table: str
    ) -> List[MappingsByTableResponse]:
        """Get mappings grouped by target table for a source table"""

        mappings = self.db.query(ColumnMapping).filter(
            and_(
                ColumnMapping.project_id == project_id,
                ColumnMapping.source_database == database,
                ColumnMapping.source_schema == schema,
                ColumnMapping.source_table == table,
                ColumnMapping.is_active == True
            )
        ).all()

        # Group by target table
        grouped = {}
        for m in mappings:
            key = f"{m.target_database}.{m.target_schema}.{m.target_table}"
            if key not in grouped:
                grouped[key] = {
                    "source_table": TableReference(
                        database=m.source_database,
                        schema=m.source_schema,
                        table=m.source_table
                    ),
                    "target_table": TableReference(
                        database=m.target_database,
                        schema=m.target_schema,
                        table=m.target_table
                    ),
                    "mappings": []
                }
            grouped[key]["mappings"].append(ColumnMappingResponse.from_orm(m))

        return [
            MappingsByTableResponse(
                **data,
                total_mappings=len(data["mappings"])
            )
            for data in grouped.values()
        ]

    def get_mappings_by_target_table(
        self,
        project_id: str,
        database: str,
        schema: str,
        table: str
    ) -> List[MappingsByTableResponse]:
        """Get mappings grouped by source table for a target table"""

        mappings = self.db.query(ColumnMapping).filter(
            and_(
                ColumnMapping.project_id == project_id,
                ColumnMapping.target_database == database,
                ColumnMapping.target_schema == schema,
                ColumnMapping.target_table == table,
                ColumnMapping.is_active == True
            )
        ).all()

        # Group by source table
        grouped = {}
        for m in mappings:
            key = f"{m.source_database}.{m.source_schema}.{m.source_table}"
            if key not in grouped:
                grouped[key] = {
                    "source_table": TableReference(
                        database=m.source_database,
                        schema=m.source_schema,
                        table=m.source_table
                    ),
                    "target_table": TableReference(
                        database=m.target_database,
                        schema=m.target_schema,
                        table=m.target_table
                    ),
                    "mappings": []
                }
            grouped[key]["mappings"].append(ColumnMappingResponse.from_orm(m))

        return [
            MappingsByTableResponse(
                **data,
                total_mappings=len(data["mappings"])
            )
            for data in grouped.values()
        ]

    def get_mappings_between_tables(
        self,
        project_id: str,
        source_database: str,
        source_schema: str,
        source_table: str,
        target_database: str,
        target_schema: str,
        target_table: str
    ) -> List[ColumnMappingResponse]:
        """Get all mappings between a specific source and target table"""

        mappings = self.db.query(ColumnMapping).filter(
            and_(
                ColumnMapping.project_id == project_id,
                ColumnMapping.source_database == source_database,
                ColumnMapping.source_schema == source_schema,
                ColumnMapping.source_table == source_table,
                ColumnMapping.target_database == target_database,
                ColumnMapping.target_schema == target_schema,
                ColumnMapping.target_table == target_table,
                ColumnMapping.is_active == True
            )
        ).all()

        return [ColumnMappingResponse.from_orm(m) for m in mappings]

    # ==========================================
    # UPDATE OPERATIONS
    # ==========================================

    def update_mapping(
        self,
        mapping_id: UUID,
        update_data: ColumnMappingUpdate
    ) -> Optional[ColumnMappingResponse]:
        """Update a mapping"""

        mapping = self.db.query(ColumnMapping).filter(
            ColumnMapping.id == mapping_id
        ).first()

        if not mapping:
            return None

        update_dict = update_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(mapping, field, value)

        mapping.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(mapping)

        return ColumnMappingResponse.from_orm(mapping)

    # ==========================================
    # DELETE OPERATIONS
    # ==========================================

    def delete_mapping(self, mapping_id: UUID, hard_delete: bool = False) -> bool:
        """Delete a mapping (soft or hard)"""

        mapping = self.db.query(ColumnMapping).filter(
            ColumnMapping.id == mapping_id
        ).first()

        if not mapping:
            return False

        if hard_delete:
            self.db.delete(mapping)
        else:
            mapping.is_active = False
            mapping.updated_at = datetime.utcnow()

        self.db.commit()
        return True

    def delete_mappings_between_tables(
        self,
        project_id: str,
        source_database: str,
        source_schema: str,
        source_table: str,
        target_database: str,
        target_schema: str,
        target_table: str
    ) -> int:
        """Delete all mappings between two tables (soft delete)"""

        result = self.db.query(ColumnMapping).filter(
            and_(
                ColumnMapping.project_id == project_id,
                ColumnMapping.source_database == source_database,
                ColumnMapping.source_schema == source_schema,
                ColumnMapping.source_table == source_table,
                ColumnMapping.target_database == target_database,
                ColumnMapping.target_schema == target_schema,
                ColumnMapping.target_table == target_table,
            )
        ).update({
            "is_active": False,
            "updated_at": datetime.utcnow()
        })

        self.db.commit()
        return result

    # ==========================================
    # UTILITY OPERATIONS
    # ==========================================

    def get_unmapped_target_columns(
        self,
        project_id: str,
        target_database: str,
        target_schema: str,
        target_table: str
    ) -> dict:
        """
        Get columns in target table that don't have mappings.
        Requires querying Snowflake for table columns and comparing with mappings.
        """

        # Get existing mappings for this target table
        mapped_columns = self.db.query(ColumnMapping.target_column).filter(
            and_(
                ColumnMapping.project_id == project_id,
                ColumnMapping.target_database == target_database,
                ColumnMapping.target_schema == target_schema,
                ColumnMapping.target_table == target_table,
                ColumnMapping.is_active == True
            )
        ).distinct().all()

        mapped_column_names = {m[0] for m in mapped_columns}

        # TODO: Query Snowflake for all columns in target table
        # For now, return the mapped columns info
        return {
            "target_table": f"{target_database}.{target_schema}.{target_table}",
            "mapped_columns": list(mapped_column_names),
            "mapped_count": len(mapped_column_names)
        }

    def validate_project_mappings(self, project_id: str) -> dict:
        """Validate all mappings for a project"""

        mappings = self.get_mappings_by_project(project_id)

        warnings = []
        errors = []

        # Data type compatibility check
        incompatible_types = {
            ("VARCHAR", "NUMBER"),
            ("VARCHAR", "BOOLEAN"),
            ("NUMBER", "BOOLEAN"),
            ("DATE", "NUMBER"),
            ("TIMESTAMP", "NUMBER"),
        }

        for mapping in mappings:
            source_type = (mapping.source_data_type or "").upper().split("(")[0]
            target_type = (mapping.target_data_type or "").upper().split("(")[0]

            if source_type and target_type:
                type_pair = (source_type, target_type)
                reverse_pair = (target_type, source_type)

                if type_pair in incompatible_types or reverse_pair in incompatible_types:
                    warnings.append({
                        "type": "data_type_mismatch",
                        "mapping_id": str(mapping.id),
                        "message": f"Incompatible types: {source_type} → {target_type}",
                        "source": f"{mapping.source_table}.{mapping.source_column}",
                        "target": f"{mapping.target_table}.{mapping.target_column}"
                    })

        return {
            "project_id": project_id,
            "total_mappings": len(mappings),
            "valid": len(errors) == 0,
            "warnings": warnings,
            "errors": errors
        }
```

---

## Frontend Service Integration

### File: `apps/data360/src/app/services/explore-design/column-mappings.ts`

```typescript
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const MAPPINGS_BASE = `${API_BASE}/api/v1/column-mappings`;

// Get auth headers
const getHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// Types
export interface ColumnMappingCreate {
  project_id: string;
  source_database: string;
  source_schema: string;
  source_table: string;
  source_column: string;
  source_data_type?: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  target_column: string;
  target_data_type?: string;
  mapping_type?: 'direct' | 'transformed' | 'computed';
  transformation_rule?: string;
}

export interface ColumnMappingResponse {
  id: string;
  project_id: string;
  source_database: string;
  source_schema: string;
  source_table: string;
  source_column: string;
  source_data_type?: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  target_column: string;
  target_data_type?: string;
  mapping_type: string;
  transformation_rule?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface BulkMappingRequest {
  project_id: string;
  mappings: Omit<ColumnMappingCreate, 'project_id'>[];
}

export interface BulkMappingResponse {
  success: number;
  failed: number;
  mappings: ColumnMappingResponse[];
  errors: Array<{ source_column: string; target_column: string; error: string }>;
}

// API Functions

/**
 * Create a single column mapping
 */
export async function createColumnMapping(
  mapping: ColumnMappingCreate
): Promise<ColumnMappingResponse> {
  const response = await axios.post(MAPPINGS_BASE, mapping, {
    headers: getHeaders(),
  });
  return response.data;
}

/**
 * Create multiple column mappings at once
 */
export async function createBulkMappings(
  request: BulkMappingRequest
): Promise<BulkMappingResponse> {
  const response = await axios.post(`${MAPPINGS_BASE}/bulk`, request, {
    headers: getHeaders(),
  });
  return response.data;
}

/**
 * Get all mappings for a project
 */
export async function getProjectMappings(
  projectId: string,
  includeInactive: boolean = false
): Promise<ColumnMappingResponse[]> {
  const response = await axios.get(`${MAPPINGS_BASE}/project/${projectId}`, {
    params: { include_inactive: includeInactive },
    headers: getHeaders(),
  });
  return response.data;
}

/**
 * Get mappings between two specific tables
 */
export async function getMappingsBetweenTables(
  projectId: string,
  sourceDatabase: string,
  sourceSchema: string,
  sourceTable: string,
  targetDatabase: string,
  targetSchema: string,
  targetTable: string
): Promise<ColumnMappingResponse[]> {
  const response = await axios.get(
    `${MAPPINGS_BASE}/project/${projectId}/between-tables`,
    {
      params: {
        source_database: sourceDatabase,
        source_schema: sourceSchema,
        source_table: sourceTable,
        target_database: targetDatabase,
        target_schema: targetSchema,
        target_table: targetTable,
      },
      headers: getHeaders(),
    }
  );
  return response.data;
}

/**
 * Delete a single mapping
 */
export async function deleteColumnMapping(
  mappingId: string,
  hardDelete: boolean = false
): Promise<void> {
  await axios.delete(`${MAPPINGS_BASE}/${mappingId}`, {
    params: { hard_delete: hardDelete },
    headers: getHeaders(),
  });
}

/**
 * Delete all mappings between two tables
 */
export async function deleteMappingsBetweenTables(
  projectId: string,
  sourceDatabase: string,
  sourceSchema: string,
  sourceTable: string,
  targetDatabase: string,
  targetSchema: string,
  targetTable: string
): Promise<void> {
  await axios.delete(
    `${MAPPINGS_BASE}/project/${projectId}/between-tables`,
    {
      params: {
        source_database: sourceDatabase,
        source_schema: sourceSchema,
        source_table: sourceTable,
        target_database: targetDatabase,
        target_schema: targetSchema,
        target_table: targetTable,
      },
      headers: getHeaders(),
    }
  );
}

/**
 * Validate all mappings for a project
 */
export async function validateProjectMappings(
  projectId: string
): Promise<{
  project_id: string;
  total_mappings: number;
  valid: boolean;
  warnings: Array<{ type: string; message: string; source: string; target: string }>;
  errors: Array<{ type: string; message: string }>;
}> {
  const response = await axios.post(
    `${MAPPINGS_BASE}/project/${projectId}/validate`,
    {},
    { headers: getHeaders() }
  );
  return response.data;
}

/**
 * Get unmapped columns in a target table
 */
export async function getUnmappedTargetColumns(
  projectId: string,
  targetDatabase: string,
  targetSchema: string,
  targetTable: string
): Promise<{
  target_table: string;
  mapped_columns: string[];
  mapped_count: number;
}> {
  const response = await axios.get(
    `${MAPPINGS_BASE}/project/${projectId}/unmapped-columns`,
    {
      params: {
        target_database: targetDatabase,
        target_schema: targetSchema,
        target_table: targetTable,
      },
      headers: getHeaders(),
    }
  );
  return response.data;
}
```

---

## Usage Example in ColumnMappingModal

```typescript
// In ColumnMappingModal.tsx - when saving mappings

import { createBulkMappings, BulkMappingRequest } from '@/app/services/explore-design/column-mappings';

const handleSaveMappings = async () => {
  if (!projectId || localMappings.length === 0) return;

  setIsSaving(true);

  try {
    const request: BulkMappingRequest = {
      project_id: projectId,
      mappings: localMappings.map(m => ({
        source_database: sourceTable.database,
        source_schema: sourceTable.schema,
        source_table: sourceTable.table,
        source_column: m.sourceColumns[0], // Handle multiple in loop
        source_data_type: sourceColumns.find(c => c.name === m.sourceColumns[0])?.dataType,
        target_database: targetTable.database,
        target_schema: targetTable.schema,
        target_table: targetTable.table,
        target_column: m.targetColumn,
        target_data_type: targetColumns.find(c => c.name === m.targetColumn)?.dataType,
        mapping_type: 'direct',
      })),
    };

    const result = await createBulkMappings(request);

    if (result.failed > 0) {
      toast.error(`${result.failed} mappings failed to save`);
    }

    if (result.success > 0) {
      toast.success(`Saved ${result.success} column mappings`);
      onClose();
    }
  } catch (error) {
    toast.error('Failed to save mappings');
    console.error(error);
  } finally {
    setIsSaving(false);
  }
};
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/column-mappings/` | Create single mapping |
| POST | `/api/v1/column-mappings/bulk` | Create multiple mappings |
| GET | `/api/v1/column-mappings/project/{project_id}` | Get all project mappings |
| GET | `/api/v1/column-mappings/project/{project_id}/by-source-table` | Get mappings by source |
| GET | `/api/v1/column-mappings/project/{project_id}/by-target-table` | Get mappings by target |
| GET | `/api/v1/column-mappings/project/{project_id}/between-tables` | Get mappings between tables |
| GET | `/api/v1/column-mappings/{mapping_id}` | Get single mapping |
| PATCH | `/api/v1/column-mappings/{mapping_id}` | Update mapping |
| DELETE | `/api/v1/column-mappings/{mapping_id}` | Delete mapping |
| DELETE | `/api/v1/column-mappings/project/{project_id}/between-tables` | Delete mappings between tables |
| GET | `/api/v1/column-mappings/project/{project_id}/unmapped-columns` | Get unmapped target columns |
| POST | `/api/v1/column-mappings/project/{project_id}/validate` | Validate project mappings |
