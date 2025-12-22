"""
Service functions for Column Preview & Profiling
Handles Snowflake queries and data processing
"""

import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict
from decimal import Decimal


# ============================================
# Helper Functions
# ============================================

def execute_query(conn, query: str) -> List[Dict]:
    """Execute a query and return results as list of dicts"""
    cursor = conn.cursor()
    try:
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        results = []
        for row in cursor.fetchall():
            results.append(dict(zip(columns, row)))
        return results
    finally:
        cursor.close()


def execute_scalar(conn, query: str) -> Any:
    """Execute a query and return single value"""
    cursor = conn.cursor()
    try:
        cursor.execute(query)
        row = cursor.fetchone()
        return row[0] if row else None
    finally:
        cursor.close()


def convert_value(value: Any) -> Any:
    """Convert Snowflake types to JSON-serializable types"""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='replace')
    return value


def calculate_quality_score(
    null_percentage: float,
    distinct_percentage: float,
    is_unique: bool
) -> int:
    """
    Calculate data quality score (0-100)

    Factors:
    - Null percentage (lower is better)
    - Distinct percentage (context-dependent)
    - Uniqueness (for potential key columns)
    """
    score = 100

    # Penalize nulls (up to -50 points)
    score -= min(null_percentage * 0.5, 50)

    # Slight penalty for very low cardinality (might indicate data issues)
    if distinct_percentage < 1 and distinct_percentage > 0:
        score -= 10

    # Bonus for unique columns (good for keys)
    if is_unique:
        score += 5

    return max(0, min(100, int(score)))


def generate_event_id() -> str:
    """Generate a unique event ID"""
    return f"evt_{int(datetime.now().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}"


# ============================================
# Column Preview Service
# ============================================

async def get_column_preview(
    conn,
    database: str,
    schema: str,
    table: str,
    column: str,
    sample_size: int = 100
) -> Dict:
    """
    Get sample data preview for a column

    Args:
        conn: Snowflake connection
        database: Database name
        schema: Schema name
        table: Table name
        column: Column name
        sample_size: Number of sample rows (default 100)

    Returns:
        Dictionary with column, sample_values, total_rows, sample_size
    """
    # Get total row count
    count_query = f'''
        SELECT COUNT(*) as cnt
        FROM "{database}"."{schema}"."{table}"
    '''
    total_rows = execute_scalar(conn, count_query) or 0

    # Get sample values using TABLESAMPLE for efficiency on large tables
    if total_rows > 10000:
        # Use random sampling for large tables
        sample_query = f'''
            SELECT "{column}"
            FROM "{database}"."{schema}"."{table}"
            TABLESAMPLE BERNOULLI ({min(sample_size * 100 / total_rows, 100)})
            LIMIT {sample_size}
        '''
    else:
        # Use simple limit for smaller tables
        sample_query = f'''
            SELECT "{column}"
            FROM "{database}"."{schema}"."{table}"
            LIMIT {sample_size}
        '''

    results = execute_query(conn, sample_query)
    sample_values = [convert_value(row[column]) for row in results]

    return {
        "column": column,
        "sample_values": sample_values,
        "total_rows": total_rows,
        "sample_size": len(sample_values)
    }


# ============================================
# Column Profile Service
# ============================================

async def get_column_profile(
    conn,
    database: str,
    schema: str,
    table: str,
    column: str
) -> Dict:
    """
    Get detailed profiling statistics for a column

    Args:
        conn: Snowflake connection
        database: Database name
        schema: Schema name
        table: Table name
        column: Column name

    Returns:
        Dictionary with profiling statistics
    """
    # Get column data type
    dtype_query = f'''
        SELECT DATA_TYPE
        FROM "{database}".INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '{schema}'
          AND TABLE_NAME = '{table}'
          AND COLUMN_NAME = '{column}'
    '''
    data_type = execute_scalar(conn, dtype_query) or 'UNKNOWN'

    # Get basic statistics
    stats_query = f'''
        SELECT
            COUNT(*) as total_rows,
            COUNT("{column}") as non_null_count,
            COUNT(*) - COUNT("{column}") as null_count,
            COUNT(DISTINCT "{column}") as distinct_count
        FROM "{database}"."{schema}"."{table}"
    '''
    stats = execute_query(conn, stats_query)[0]

    total_rows = stats['TOTAL_ROWS'] or 0
    null_count = stats['NULL_COUNT'] or 0
    distinct_count = stats['DISTINCT_COUNT'] or 0

    null_percentage = (null_count / total_rows * 100) if total_rows > 0 else 0
    distinct_percentage = (distinct_count / total_rows * 100) if total_rows > 0 else 0

    # Initialize optional fields
    min_value = None
    max_value = None
    avg_value = None
    min_length = None
    max_length = None
    avg_length = None

    is_numeric = any(t in data_type.upper() for t in ['NUMBER', 'INT', 'FLOAT', 'DECIMAL', 'DOUBLE'])
    is_string = any(t in data_type.upper() for t in ['VARCHAR', 'CHAR', 'STRING', 'TEXT'])

    # Get numeric statistics
    if is_numeric:
        numeric_query = f'''
            SELECT
                MIN("{column}") as min_val,
                MAX("{column}") as max_val,
                AVG("{column}") as avg_val
            FROM "{database}"."{schema}"."{table}"
            WHERE "{column}" IS NOT NULL
        '''
        numeric_stats = execute_query(conn, numeric_query)[0]
        min_value = convert_value(numeric_stats.get('MIN_VAL'))
        max_value = convert_value(numeric_stats.get('MAX_VAL'))
        avg_value = convert_value(numeric_stats.get('AVG_VAL'))

    # Get string statistics
    if is_string:
        length_query = f'''
            SELECT
                MIN(LENGTH("{column}")) as min_len,
                MAX(LENGTH("{column}")) as max_len,
                AVG(LENGTH("{column}")) as avg_len,
                MIN("{column}") as min_val,
                MAX("{column}") as max_val
            FROM "{database}"."{schema}"."{table}"
            WHERE "{column}" IS NOT NULL
        '''
        length_stats = execute_query(conn, length_query)[0]
        min_length = length_stats.get('MIN_LEN')
        max_length = length_stats.get('MAX_LEN')
        avg_length = convert_value(length_stats.get('AVG_LEN'))
        min_value = length_stats.get('MIN_VAL')
        max_value = length_stats.get('MAX_VAL')

    # Get most frequent values (top 5)
    frequent_query = f'''
        SELECT
            "{column}" as value,
            COUNT(*) as cnt
        FROM "{database}"."{schema}"."{table}"
        WHERE "{column}" IS NOT NULL
        GROUP BY "{column}"
        ORDER BY cnt DESC
        LIMIT 5
    '''
    frequent_results = execute_query(conn, frequent_query)
    most_frequent = [
        {
            "value": convert_value(row['VALUE']),
            "count": row['CNT'],
            "percentage": round((row['CNT'] / total_rows * 100), 2) if total_rows > 0 else 0
        }
        for row in frequent_results
    ]

    # Calculate data quality score
    is_unique_col = (distinct_count == total_rows - null_count) if total_rows > 0 else False
    data_quality_score = calculate_quality_score(
        null_percentage=null_percentage,
        distinct_percentage=distinct_percentage,
        is_unique=is_unique_col
    )

    return {
        "column": column,
        "data_type": data_type,
        "total_rows": total_rows,
        "null_count": null_count,
        "null_percentage": round(null_percentage, 2),
        "distinct_count": distinct_count,
        "distinct_percentage": round(distinct_percentage, 2),
        "min_value": min_value,
        "max_value": max_value,
        "avg_value": round(avg_value, 2) if avg_value is not None else None,
        "min_length": min_length,
        "max_length": max_length,
        "avg_length": round(avg_length, 2) if avg_length is not None else None,
        "most_frequent": most_frequent,
        "data_quality_score": data_quality_score,
        "is_unique": is_unique_col,
        "has_nulls": null_count > 0
    }


# ============================================
# Table Profile Service
# ============================================

async def get_table_profile(
    conn,
    database: str,
    schema: str,
    table: str
) -> Dict:
    """
    Get profiling for all columns in a table

    Args:
        conn: Snowflake connection
        database: Database name
        schema: Schema name
        table: Table name

    Returns:
        Dictionary with table profile including all column profiles
    """
    # Get list of columns
    columns_query = f'''
        SELECT COLUMN_NAME
        FROM "{database}".INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '{schema}'
          AND TABLE_NAME = '{table}'
        ORDER BY ORDINAL_POSITION
    '''
    columns_result = execute_query(conn, columns_query)
    column_names = [row['COLUMN_NAME'] for row in columns_result]

    # Get row count
    count_query = f'''
        SELECT COUNT(*) as cnt
        FROM "{database}"."{schema}"."{table}"
    '''
    row_count = execute_scalar(conn, count_query) or 0

    # Profile each column
    column_profiles = []
    total_quality_score = 0

    for col_name in column_names:
        profile = await get_column_profile(conn, database, schema, table, col_name)
        column_profiles.append(profile)
        total_quality_score += profile['data_quality_score']

    overall_quality_score = int(total_quality_score / len(column_profiles)) if column_profiles else 0

    return {
        "table": table,
        "row_count": row_count,
        "column_count": len(column_names),
        "columns": column_profiles,
        "overall_quality_score": overall_quality_score
    }


# ============================================
# Sensitive Column Service
# ============================================

async def mark_column_sensitive(
    conn,
    project_id: str,
    database: str,
    schema: str,
    table: str,
    column: str,
    sensitive_type: str,
    create_event: bool = True
) -> Dict:
    """
    Mark a column as sensitive

    Args:
        conn: Snowflake connection
        project_id: Project ID
        database: Database name
        schema: Schema name
        table: Table name
        column: Column name
        sensitive_type: Type of sensitive data
        create_event: Whether to create an event record

    Returns:
        Dictionary with success status and event_id
    """
    event_id = None

    if create_event:
        event_id = generate_event_id()

        # Insert event into events table
        insert_query = f'''
            INSERT INTO EVENTS (
                EVENT_ID, EVENT_TYPE, PROJECT_ID,
                TARGET_DATABASE, TARGET_SCHEMA, TARGET_TABLE, TARGET_COLUMN,
                PAYLOAD, STATUS, CREATED_AT
            ) VALUES (
                '{event_id}', 'TAG_APPLIED', '{project_id}',
                '{database}', '{schema}', '{table}', '{column}',
                PARSE_JSON('{{"tagName": "SENSITIVE:{sensitive_type}", "columnName": "{column}", "sensitiveType": "{sensitive_type}"}}'),
                'pending', CURRENT_TIMESTAMP()
            )
        '''
        cursor = conn.cursor()
        try:
            cursor.execute(insert_query)
        finally:
            cursor.close()

    return {
        "success": True,
        "event_id": event_id
    }


# ============================================
# Column Exclusion Service
# ============================================

async def set_column_exclusion(
    conn,
    project_id: str,
    database: str,
    schema: str,
    table: str,
    column: str,
    excluded: bool,
    reason: Optional[str] = None
) -> Dict:
    """
    Exclude or include a column from modeling

    Args:
        conn: Snowflake connection
        project_id: Project ID
        database: Database name
        schema: Schema name
        table: Table name
        column: Column name
        excluded: Whether to exclude the column
        reason: Reason for exclusion

    Returns:
        Dictionary with success status and event_id
    """
    event_id = generate_event_id()
    event_type = "COLUMN_EXCLUDED" if excluded else "COLUMN_INCLUDED"
    reason_json = f', "reason": "{reason}"' if reason else ''

    # Insert event into events table
    insert_query = f'''
        INSERT INTO EVENTS (
            EVENT_ID, EVENT_TYPE, PROJECT_ID,
            TARGET_DATABASE, TARGET_SCHEMA, TARGET_TABLE, TARGET_COLUMN,
            PAYLOAD, STATUS, CREATED_AT
        ) VALUES (
            '{event_id}', '{event_type}', '{project_id}',
            '{database}', '{schema}', '{table}', '{column}',
            PARSE_JSON('{{"columnName": "{column}", "excluded": {str(excluded).lower()}{reason_json}}}'),
            'pending', CURRENT_TIMESTAMP()
        )
    '''
    cursor = conn.cursor()
    try:
        cursor.execute(insert_query)
    finally:
        cursor.close()

    return {
        "success": True,
        "event_id": event_id
    }
