"""
Pydantic schemas for Column Preview & Profiling API
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any


# ============================================
# Column Preview Schemas
# ============================================

class ColumnPreviewRequest(BaseModel):
    database: str = Field(..., description="Database name")
    schema_name: str = Field(..., alias="schema", description="Schema name")
    table: str = Field(..., description="Table name")
    column: str = Field(..., description="Column name")
    sample_size: int = Field(default=100, ge=1, le=1000, description="Number of sample rows")

    class Config:
        populate_by_name = True


class ColumnPreviewResponse(BaseModel):
    column: str
    sample_values: List[Any]
    total_rows: int
    sample_size: int


# ============================================
# Column Profile Schemas
# ============================================

class ColumnProfileRequest(BaseModel):
    database: str = Field(..., description="Database name")
    schema_name: str = Field(..., alias="schema", description="Schema name")
    table: str = Field(..., description="Table name")
    column: str = Field(..., description="Column name")

    class Config:
        populate_by_name = True


class FrequentValue(BaseModel):
    value: Any
    count: int
    percentage: float


class ColumnProfileResponse(BaseModel):
    column: str
    data_type: str
    total_rows: int
    null_count: int
    null_percentage: float
    distinct_count: int
    distinct_percentage: float
    min_value: Optional[Any] = None
    max_value: Optional[Any] = None
    avg_value: Optional[float] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    avg_length: Optional[float] = None
    most_frequent: Optional[List[FrequentValue]] = None
    data_quality_score: int
    is_unique: bool
    has_nulls: bool


# ============================================
# Table Profile Schemas
# ============================================

class TableProfileRequest(BaseModel):
    database: str = Field(..., description="Database name")
    schema_name: str = Field(..., alias="schema", description="Schema name")
    table: str = Field(..., description="Table name")

    class Config:
        populate_by_name = True


class TableProfileResponse(BaseModel):
    table: str
    row_count: int
    column_count: int
    columns: List[ColumnProfileResponse]
    overall_quality_score: int


# ============================================
# Sensitive Column Schemas
# ============================================

class MarkSensitiveRequest(BaseModel):
    project_id: str = Field(..., description="Project ID")
    database: str = Field(..., description="Database name")
    schema_name: str = Field(..., alias="schema", description="Schema name")
    table: str = Field(..., description="Table name")
    column: str = Field(..., description="Column name")
    sensitive_type: str = Field(..., description="Type of sensitive data (e.g., pii_email, pii_phone)")
    create_event: bool = Field(default=True, description="Whether to create an event")

    class Config:
        populate_by_name = True


class MarkSensitiveResponse(BaseModel):
    success: bool
    event_id: Optional[str] = None


# ============================================
# Column Exclusion Schemas
# ============================================

class ColumnExclusionRequest(BaseModel):
    project_id: str = Field(..., description="Project ID")
    database: str = Field(..., description="Database name")
    schema_name: str = Field(..., alias="schema", description="Schema name")
    table: str = Field(..., description="Table name")
    column: str = Field(..., description="Column name")
    excluded: bool = Field(..., description="Whether to exclude the column")
    reason: Optional[str] = Field(default=None, description="Reason for exclusion")

    class Config:
        populate_by_name = True


class ColumnExclusionResponse(BaseModel):
    success: bool
    event_id: Optional[str] = None
