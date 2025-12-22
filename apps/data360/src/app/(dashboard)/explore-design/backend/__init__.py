"""
Explore & Design Backend API

Column Preview & Profiling endpoints for FastAPI

Usage in your main.py:
    from app.routers.explore_design import router as explore_design_router
    app.include_router(explore_design_router)

Or copy the files to your backend structure:
    backend/
    ├── routers/
    │   └── explore_design.py  (copy router.py content)
    ├── schemas/
    │   └── explore_design.py  (copy schemas.py content)
    └── services/
        └── explore_design.py  (copy services.py content)
"""

from .router import router
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
    # Helper functions
    execute_query,
    execute_scalar,
    convert_value,
    calculate_quality_score,
    generate_event_id,
)

__all__ = [
    # Router
    "router",
    # Schemas
    "ColumnPreviewRequest",
    "ColumnPreviewResponse",
    "ColumnProfileRequest",
    "ColumnProfileResponse",
    "TableProfileRequest",
    "TableProfileResponse",
    "MarkSensitiveRequest",
    "MarkSensitiveResponse",
    "ColumnExclusionRequest",
    "ColumnExclusionResponse",
    # Service functions
    "get_column_preview",
    "get_column_profile",
    "get_table_profile",
    "mark_column_sensitive",
    "set_column_exclusion",
    # Helper functions
    "execute_query",
    "execute_scalar",
    "convert_value",
    "calculate_quality_score",
    "generate_event_id",
]
