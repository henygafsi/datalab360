# Governance Policies Frontend-Backend Integration Fix

## Critical Issue Identified

The backend helper functions (`get_databases`, `get_schemas`, `get_tables`, `get_columns`) return arrays of **strings**, but the frontend expects arrays of **objects**.

### Backend Current Output (WRONG):
```python
def get_databases(cursor) -> List[str]:
    return ["CP_DATA360", "SNOWFLAKE", "DATA360"]  # ❌ Array of strings
```

### Frontend Expected Input (CORRECT):
```typescript
interface DatabaseObject {
  name: string;
  created_on?: string;
  owner?: string;
}
// Expects: [{name: "CP_DATA360"}, {name: "SNOWFLAKE"}, {name: "DATA360"}]
```

---

## Backend Fixes Required

Update these functions in your backend `gouvernance.py` file:

### 1. Fix `get_databases()` function

**BEFORE:**
```python
def get_databases(cursor) -> List[str]:
    """Get all databases"""
    sql = "SHOW DATABASES"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Database name is typically the second column (index 1)
    return [row[1] for row in results]  # ❌ Returns strings
```

**AFTER:**
```python
def get_databases(cursor) -> List[Dict[str, Any]]:
    """Get all databases"""
    sql = "SHOW DATABASES"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Return array of objects with 'name' property
    return [{"name": row[1]} for row in results]  # ✅ Returns objects
```

### 2. Fix `get_schemas()` function

**BEFORE:**
```python
def get_schemas(cursor, database: str) -> List[str]:
    """Get all schemas in a database"""
    sql = f"SHOW SCHEMAS IN DATABASE {database}"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Schema name is typically the second column (index 1)
    return [row[1] for row in results]  # ❌ Returns strings
```

**AFTER:**
```python
def get_schemas(cursor, database: str) -> List[Dict[str, Any]]:
    """Get all schemas in a database"""
    sql = f"SHOW SCHEMAS IN DATABASE {database}"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Return array of objects with 'name' property
    return [{"name": row[1], "database": database} for row in results]  # ✅ Returns objects
```

### 3. Fix `get_tables()` function

**BEFORE:**
```python
def get_tables(cursor, database: str, schema: str) -> List[str]:
    """Get all tables in a schema"""
    sql = f"SHOW TABLES IN SCHEMA {database}.{schema}"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Table name is typically the second column (index 1)
    return [row[1] for row in results]  # ❌ Returns strings
```

**AFTER:**
```python
def get_tables(cursor, database: str, schema: str) -> List[Dict[str, Any]]:
    """Get all tables in a schema"""
    sql = f"SHOW TABLES IN SCHEMA {database}.{schema}"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Return array of objects with 'name' property
    return [{"name": row[1], "database": database, "schema": schema} for row in results]  # ✅ Returns objects
```

### 4. Fix `get_columns()` function

**BEFORE:**
```python
def get_columns(cursor, database: str, schema: str, table: str) -> List[Dict[str, Any]]:
    """Get all columns in a table with their data types"""
    sql = f"SHOW COLUMNS IN TABLE {database}.{schema}.{table}"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Return column info as list of dicts
    return [dict(zip([desc[0] for desc in cursor.description], row)) for row in results]
```

**AFTER (Update to ensure 'name' and 'type' fields):**
```python
def get_columns(cursor, database: str, schema: str, table: str) -> List[Dict[str, Any]]:
    """Get all columns in a table with their data types"""
    sql = f"SHOW COLUMNS IN TABLE {database}.{schema}.{table}"
    cursor.execute(sql)
    results = cursor.fetchall()

    if not results:
        return []

    # Extract column name and data type from SHOW COLUMNS result
    # Typically: column_name is index 2, data_type is index 3
    columns = []
    for row in results:
        columns.append({
            "name": row[2],      # Column name
            "type": row[3],      # Data type
            "nullable": row[5] == "Y" if len(row) > 5 else None,  # Nullable (Y/N)
        })

    return columns
```

---

## Complete Backend Service File Section

Here's the complete fixed section for your `gouvernance.py`:

```python
# ===== OBJECT HELPER FUNCTIONS =====

def get_databases(cursor) -> List[Dict[str, Any]]:
    """Get all databases"""
    try:
        sql = "SHOW DATABASES"
        cursor.execute(sql)
        results = cursor.fetchall()

        if not results:
            return []

        # Return array of objects with 'name' property
        return [{"name": row[1]} for row in results]
    except Exception as e:
        print(f"Error in get_databases: {str(e)}")
        return []


def get_schemas(cursor, database: str) -> List[Dict[str, Any]]:
    """Get all schemas in a database"""
    try:
        sql = f"SHOW SCHEMAS IN DATABASE {database}"
        cursor.execute(sql)
        results = cursor.fetchall()

        if not results:
            return []

        # Return array of objects with 'name' property
        return [{"name": row[1], "database": database} for row in results]
    except Exception as e:
        print(f"Error in get_schemas: {str(e)}")
        return []


def get_tables(cursor, database: str, schema: str) -> List[Dict[str, Any]]:
    """Get all tables in a schema"""
    try:
        sql = f"SHOW TABLES IN SCHEMA {database}.{schema}"
        cursor.execute(sql)
        results = cursor.fetchall()

        if not results:
            return []

        # Return array of objects with 'name' property
        return [{"name": row[1], "database": database, "schema": schema} for row in results]
    except Exception as e:
        print(f"Error in get_tables: {str(e)}")
        return []


def get_columns(cursor, database: str, schema: str, table: str) -> List[Dict[str, Any]]:
    """Get all columns in a table with their data types"""
    try:
        sql = f"SHOW COLUMNS IN TABLE {database}.{schema}.{table}"
        cursor.execute(sql)
        results = cursor.fetchall()

        if not results:
            return []

        # Extract column name and data type from SHOW COLUMNS result
        # SHOW COLUMNS typically returns: [created_on, name, schema_name, table_name, column_name, data_type, null?, default, ...]
        # Indices: 0=created_on, 1=name(full), 2=schema, 3=table, 4=column_name, 5=data_type, 6=null?
        columns = []
        for row in results:
            columns.append({
                "name": row[2] if len(row) > 2 else "unknown",      # Column name
                "type": row[3] if len(row) > 3 else "unknown",      # Data type
                "nullable": row[4] == "Y" if len(row) > 4 else None,  # Nullable
            })

        return columns
    except Exception as e:
        print(f"Error in get_columns: {str(e)}")
        return []
```

---

## Test Plan

### 1. Test Backend Endpoints Directly

Use `curl` or Postman to test:

```bash
# Test databases
curl -X GET "http://localhost:8000/gouvernance/policies/objects/databases" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "message": "Databases fetched successfully",
  "data": {
    "databases": [
      {"name": "CP_DATA360"},
      {"name": "SNOWFLAKE"}
    ]
  }
}

# Test schemas
curl -X GET "http://localhost:8000/gouvernance/policies/objects/schemas/CP_DATA360" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
{
  "message": "Schemas fetched successfully",
  "data": {
    "schemas": [
      {"name": "GOUVERNANCE", "database": "CP_DATA360"},
      {"name": "PUBLIC", "database": "CP_DATA360"}
    ]
  }
}
```

### 2. Test Frontend Integration

After fixing the backend, test the frontend by:

1. Open browser DevTools (F12) → Network tab
2. Navigate to governance policies page
3. Check the API responses:
   - Should see 200 OK (not 500)
   - Response should contain objects, not strings

### 3. Test Policy List Endpoints

```bash
# Test RLS policies
curl -X GET "http://localhost:8000/gouvernance/policies/row-access/list?schema=gouvernance" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test Masking policies
curl -X GET "http://localhost:8000/gouvernance/policies/masking/list?schema=gouvernance" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test Aggregation policies
curl -X GET "http://localhost:8000/gouvernance/policies/aggregation/list?schema=gouvernance" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Frontend Already Fixed ✅

The frontend defensive checks we added earlier will handle any edge cases:

1. ✅ All service methods return empty arrays `[]` on error
2. ✅ All components check `Array.isArray()` before setting state
3. ✅ All list operations use defensive checks `policies?.filter()` with fallbacks

---

## Summary of Changes Needed

### Backend (`gouvernance.py`):
- [ ] Update `get_databases()` to return `[{name: "..."}]` instead of `["..."]`
- [ ] Update `get_schemas()` to return `[{name: "..."}]` instead of `["..."]`
- [ ] Update `get_tables()` to return `[{name: "..."}]` instead of `["..."]`
- [ ] Verify `get_columns()` returns proper structure with `name` and `type` fields

### Testing:
- [ ] Test all 4 object endpoints with curl/Postman
- [ ] Verify responses match expected format
- [ ] Test policy list endpoints (RLS, Masking, Aggregation)
- [ ] Test frontend UI to confirm 500 errors are gone

---

## Quick Fix Command

Apply these changes to your backend `gouvernance.py` file, then restart your FastAPI server:

```bash
# Restart backend
cd your-backend-directory
uvicorn main:app --reload --port 8000
```

Then refresh your frontend - the 500 errors should be resolved!
