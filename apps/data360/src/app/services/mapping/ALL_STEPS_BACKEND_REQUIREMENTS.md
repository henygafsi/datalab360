# Complete Backend Requirements for All Mapping Steps

## Overview
This document outlines what data each step in the mapping wizard stores and what backend endpoints are required.

## Step 0: Project Management
**Data Stored:** Project creation and basic project info
**Backend Endpoint:** Already implemented
- `POST /mapping/create-project/`

## Step 1: Primary Keys & Groups ✅ IMPLEMENTED
**Data Stored:** 
- Primary keys for source and target tables
- Group definitions (sources + target relationships)

**Backend Endpoints:**
- `POST /mapping/add-event/` (for groups) ✅ IMPLEMENTED
- `POST /mapping/add-primary-key/` (for primary keys) ✅ ALREADY EXISTS

**Data Retrieval:**
- `POST /mapping/get-steps-event/` ✅ ALREADY EXISTS (retrieves all events including ADD_GROUP)

**Event Structure for Groups:**
```json
{
  "project_id": "string",
  "event_type": "ADD_GROUP",
  "event_details": {
    "group_index": number,
    "sources": [{"database": "...", "schema": "...", "table": "..."}],
    "target": {"database": "...", "schema": "...", "table": "..."}
  }
}
```

## Step 2: Required Columns ✅ ALREADY IMPLEMENTED
**Data Stored:** Column attributes (nullable, required for mapping, data types, lengths)
**Backend Endpoint:** ✅ ALREADY EXISTS
- `POST /mapping/store-selected-columns/`

**Payload Structure:**
```json
{
  "project_id": "string",
  "database_name": "string",
  "schema_name": "string", 
  "table_name": "string",
  "selected_columns": ["column1", "column2", ...]
}
```

## Step 3: Table Relations ✅ ALREADY IMPLEMENTED
**Data Stored:** Column mappings between source and target tables
**Backend Endpoint:** ✅ ALREADY EXISTS
- `POST /mapping/test_mapping/` (for testing)
- Column mappings are stored in the main mapping data structure

**Test Mapping Payload:**
```json
{
  "project_id": "string",
  "mappings": [{
    "source_database": "string",
    "source_schema": "string", 
    "source_table": "string",
    "source_columns": ["col1", "col2"],
    "pk_source": ["pk_col"],
    "target_database": "string",
    "target_schema": "string",
    "target_table": "string", 
    "target_columns": ["col1", "col2"],
    "pk_target": ["pk_col"]
  }]
}
```

## Step 4: Add Columns ✅ ALREADY IMPLEMENTED
**Data Stored:** New target columns to be added to target tables
**Backend Endpoint:** ✅ ALREADY EXISTS
- `POST /mapping/add-columns/`

**Payload Structure:**
```json
{
  "project_id": "string",
  "database_name": "string",
  "schema_name": "string",
  "table_name": "string",
  "columns": [{
    "name": "string",
    "type": "string", 
    "default": "string",
    "comment": "string"
  }]
}
```

## Step 5: Deployment ✅ ALREADY IMPLEMENTED
**Data Stored:** Final mapping deployment
**Backend Endpoint:** ✅ ALREADY EXISTS
- `POST /mapping/deploy-model/`

**Payload Structure:**
```json
{
  "project_id": "string",
  "mappings": [{
    "source_database": "string",
    "source_schema": "string",
    "source_table": "string", 
    "source_columns": ["col1", "col2"],
    "pk_source": ["pk_col"],
    "target_database": "string",
    "target_schema": "string",
    "target_table": "string",
    "target_columns": ["col1", "col2"], 
    "pk_target": ["pk_col"]
  }]
}
```

## Data Retrieval for All Steps ✅ IMPLEMENTED

**Single Endpoint for All Data:**
- `POST /mapping/get-steps-event/` ✅ ALREADY EXISTS

This endpoint retrieves ALL events for a project, including:
- `CREATE_PROJECT` - Project info
- `ADD_PRIMARY_KEY` - Primary key definitions  
- `ADD_GROUP` - Group definitions ✅ NEW
- `ADD_REQUIRED_COLUMNS` - Required column selections
- `TEST_MAPPING` - Mapping validation tests
- `DEPLOY_MODEL` - Final mapping deployment

**Frontend Processing:**
The frontend automatically reconstructs the complete project state from these events, including:
- Groups and their source/target relationships
- Primary keys for all tables
- Column attributes and requirements
- Column mappings
- New target columns
- Deployment status

## Auto-Save on Next Button ✅ IMPLEMENTED

All steps now automatically save their data when the "Next" button is clicked:

- **Step 1:** Auto-saves groups before proceeding ✅
- **Step 2:** Auto-saves required columns before proceeding ✅
- **Step 3:** No data to save (visualization only) ✅
- **Step 4:** Auto-saves new columns before proceeding ✅
- **Step 5:** Auto-saves deployment (final step) ✅

## Summary

### ✅ Already Implemented:
- **Step 0:** Project creation
- **Step 1:** Primary keys (existing), Groups (newly implemented) ✅
- **Step 2:** Required columns
- **Step 3:** Column mappings & testing
- **Step 4:** Add columns
- **Step 5:** Deployment

### 🎯 What You Need to Implement:
**Nothing!** You already implemented the `ADD_GROUP` event endpoint and the retrieval is handled by the existing `get-steps-event` endpoint.

### 📋 Backend Endpoint You Need:
```python
POST /mapping/add-event/
{
  "project_id": "string",
  "event_type": "ADD_GROUP", 
  "event_details": {
    "group_index": number,
    "sources": [{"database": "...", "schema": "...", "table": "..."}],
    "target": {"database": "...", "schema": "...", "table": "..."}
  }
}
```

## Event Types Summary:
- `CREATE_PROJECT` - Project creation
- `ADD_PRIMARY_KEY` - Primary key definitions
- `ADD_GROUP` - Group definitions (sources + target) ✅ NEW
- `ADD_REQUIRED_COLUMNS` - Required column selections
- `TEST_MAPPING` - Mapping validation tests
- `DEPLOY_MODEL` - Final mapping deployment

All other steps already have their backend implementations! 🎉
