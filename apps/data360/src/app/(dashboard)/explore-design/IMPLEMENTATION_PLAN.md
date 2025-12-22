# Explore & Design - Implementation Plan

## Overview
- **Catalog View**: Explore source data (tables, columns, metadata)
- **Modeling View**: Map source columns to target (DWH) columns

---

## KEY CONCEPTS

### FK Relationships vs ETL Column Mappings
- **FK Relationship**: Database constraint between DWH tables for referential integrity
  - Example: `ORDERS.customer_id` → `CUSTOMERS.id`
  - Display: Purple dashed lines (static, not animated)
  - Event: `RELATION_CREATED` (for custom FK definitions)

- **ETL Column Mapping**: User-defined mapping from source columns to target DWH columns
  - Example: `source.RAW_ORDERS.cust_id` → `DWH.ORDERS.customer_id`
  - Display: Blue/green solid lines (animated)
  - Event: `COLUMN_MAPPING_CREATED`

---

## CATALOG VIEW - Source Data Exploration

### Current State
- ✅ Table list with selection
- ✅ Table details (columns, data types)
- ✅ Primary key display and setting
- ✅ Add column (creates event)
- ✅ Rename table/column (creates events)
- ⚠️ Masking policy (placeholder)
- ⚠️ Ingestion mode (placeholder)
- ⚠️ Aggregation (placeholder)

### Catalog View Enhancements ✅ COMPLETE

#### 1. Column Data Preview ✅
- Preview sample data from columns
- Show data distribution statistics
- Component: `ColumnPreviewModal.tsx`
- API: `getColumnPreview()` in explore-design service

#### 2. Column Profiling ✅
- Null count, distinct values, min/max
- Data quality indicators (score 0-100)
- Most frequent values distribution
- String length statistics
- Component: Integrated in `ColumnPreviewModal.tsx` (Profile tab)
- API: `getColumnProfile()`, `getTableProfile()` in explore-design service

#### 3. Sensitive Data Detection Enhancement ✅
- Auto-detect PII columns by name patterns
- Mark columns as sensitive with type selection
- 10 sensitive data types: Email, Phone, SSN, Address, DOB, Name, Credit Card, Account, Password, Custom
- Recommended masking policies shown
- Component: `SensitiveColumnModal.tsx`
- Event: `TAG_APPLIED` with `SENSITIVE:type` tag

#### 4. Column Exclusion from Modeling ✅
- Exclude specific columns from being mapped
- Multiple exclusion reasons: Deprecated, Duplicate, Derived, Internal, Low Quality, Not Needed, Custom
- Component: `ColumnExclusionModal.tsx`
- Events: `COLUMN_EXCLUDED`, `COLUMN_INCLUDED`

---

## MODELING VIEW - Source to Target Mapping

### Current State
- ✅ Visual canvas with ReactFlow
- ✅ Default DWH tables load automatically
- ✅ Source tables added from Catalog
- ✅ DWH badge on target tables (purple theme)
- ✅ Connection enforcement (Source → Target only)
- ✅ Column mapping modal (multiple source → one target)
- ✅ Existing FK relationships displayed (purple dashed, static)
- ✅ ETL mappings displayed (blue/green solid, animated)
- ✅ Events: `COLUMN_MAPPING_CREATED`, `COLUMN_MAPPING_REMOVED`
- ✅ Data type compatibility warnings
- ✅ Unmapped columns indicator on DWH tables
- ✅ Mapping summary panel with export

### Missing Functionalities

#### 1. Transformation Rules
- Define transformations during mapping
- UPPER(), LOWER(), TRIM(), CONCAT(), CAST()
- UI in ColumnMappingModal
- Event: Already tracked in `COLUMN_MAPPING_CREATED` payload

---

## EVENTS IMPLEMENTED

### Event Types:
1. ✅ `COLUMN_MAPPING_CREATED` - When mapping source → target column
2. ✅ `COLUMN_MAPPING_REMOVED` - When removing a mapping
3. ✅ `TAG_APPLIED` (SENSITIVE:type) - When marking column as sensitive
4. ✅ `COLUMN_EXCLUDED` - When excluding column from modeling
5. ✅ `COLUMN_INCLUDED` - When including column back in modeling
6. ⬜ `TRANSFORMATION_ADDED` - When adding transformation rule

---

## IMPLEMENTATION ORDER

### Phase 1: Core Mapping ✅ COMPLETE
1. ✅ Column Mapping Modal improvements
2. ✅ FK vs ETL mapping separation (visual distinction)
3. ✅ Save mappings with `COLUMN_MAPPING_CREATED` event
4. ✅ View mappings summary (MappingSummaryPanel)

### Phase 2: Validation & UX ✅ COMPLETE
5. ✅ Data type compatibility warnings (TYPE_COMPATIBILITY matrix)
6. ✅ Unmapped columns indicator (TableNode with green check / orange warning)
7. ✅ Mapping summary panel (grouping by source table, export JSON)

### Phase 3: Backend Integration ✅ COMPLETE
8. ✅ Save mappings via existing `add-event` endpoint (uses `recordDesignEvents`)
9. ✅ Events saved when switching projects or during validation
10. ✅ `COLUMN_MAPPING_CREATED`/`REMOVED` added to EventType and SQL generation
11. ✅ Restore mappings on project load (initialMappings prop extracts from events)

### Phase 4: Catalog View Features ✅ COMPLETE
11. ✅ Column Data Preview (ColumnPreviewModal with sample data)
12. ✅ Column Profiling (statistics, quality score, distributions)
13. ✅ Sensitive Column Detection (SensitiveColumnModal with PII types)
14. ✅ Column Exclusion from Modeling (ColumnExclusionModal)

### Phase 5: Advanced Features (TODO)
15. [ ] Transformation rules UI in ColumnMappingModal

---

## FILES MODIFIED

### Events Store
- ✅ `stores/event-store.ts` - Added `COLUMN_MAPPING_CREATED`, `COLUMN_MAPPING_REMOVED`

### Modeling View
- ✅ `components/ModelingCanvas.tsx` - FK/ETL separation, edge styles, mapping summary
- ✅ `components/ColumnMappingModal.tsx` - Type compatibility, only ETL mappings shown
- ✅ `components/TableNode.tsx` - Mapped/unmapped indicators for DWH tables
- ✅ `components/MappingSummaryPanel.tsx` - ETL mappings only, export functionality
- ✅ `components/EventTable.tsx` - Added new event type display config

### Services ✅
- ✅ `services/explore-design/index.ts` - Added `COLUMN_MAPPING_CREATED`/`REMOVED` to EventType
- ✅ `generateEventSQL()` - Added SQL generation for mapping events
- ✅ `recordDesignEvents()` - Already handles all event types including mappings
- ✅ `getColumnPreview()` - Fetch sample data for column
- ✅ `getColumnProfile()` - Fetch column statistics
- ✅ `getTableProfile()` - Fetch all columns statistics for a table
- ✅ `markColumnSensitive()` - Mark column as sensitive with event
- ✅ `setColumnExclusion()` - Exclude/include column from modeling

### Catalog View Components ✅
- ✅ `components/ColumnPreviewModal.tsx` - Data preview and column profiling UI
- ✅ `components/SensitiveColumnModal.tsx` - Mark columns as sensitive with type selection
- ✅ `components/ColumnExclusionModal.tsx` - Exclude/include columns from modeling

### Event Store Updates ✅
- ✅ `stores/event-store.ts` - Added `createColumnExclusionEvent()`, `createSensitiveColumnEvent()`
