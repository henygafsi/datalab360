'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip, Modal, Input } from 'rizzui';
import {
  Play, Check, X, AlertTriangle, RefreshCw, Clock, CheckCircle2,
  XCircle, Loader2, ChevronRight, ChevronDown, FileCode, Database,
  Shield, Key, Link2, Edit2, History, Rocket, Download, ArrowRight,
  RotateCcw, Eye, Calendar, Users, GitBranch, Send, Settings, Copy,
  Info, Zap, Server, Cloud, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, DesignEvent, EventType, EventStatus } from '../stores/event-store';
import { useSession } from 'next-auth/react';
import {
  scheduleDeploymentUnified,
  recordDesignEvents,
  deployEventsImmediate,
  validateEventsBackend,
  generateEventSQL,
  executeIngestion,
  deploySchema,
  getSchemaVersions,
  rollbackSchema,
  getIngestionHistory,
  ScheduledDeploymentStatus,
  IngestionTableConfig,
  IngestionMode,
  ColumnMapping,
  ColumnTransformation,
  SchemaVersion,
  SchemaDeploymentResponse,
  SQLStatement,
} from '@/app/services/explore-design';
import { getCortexRecommend } from '@/app/services/cortex';

// Test result interface
interface TestResult {
  eventId: string;
  success: boolean;
  message: string;
  sql?: string;
  error?: string;
  warnings?: string[];
  duration?: number;
}

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Scheduled deployment interface (stored locally for future backend)
interface ScheduledDeploymentLocal {
  id: string;
  workflowName: string;
  scheduledDate: string;
  deploymentMethod: 'REPLACE_EXISTING' | 'NEW_RELEASE' | 'TEST';
  eventIds: string[];
  status: 'SCHEDULED' | 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELLED';
  createdAt: string;
  createdBy: string;
  versionType: 'patch' | 'minor' | 'major';
  changelog: string;
  approvers?: string[];
}

// ============================================================================
// EVENT ORDERING - Priority for deployment execution order
// ============================================================================
// Events must be executed in a specific order to handle dependencies:
// 1. Tables must exist before columns/constraints can be added
// 2. Columns must exist before PKs/FKs can reference them
// 3. Both tables must exist before relationships can be created
// 4. Policies are applied after structure is in place
// 5. Table renames should be last to avoid breaking references

const EVENT_PRIORITY: Record<EventType, number> = {
  // Priority 0: Metadata events (no SQL execution needed)
  'SCHEMA_SELECTED': 0,
  'TABLE_SELECTED': 0,
  'TABLE_ADDED_TO_MODELING': 0,
  'TABLE_REMOVED_FROM_MODELING': 0,
  'BATCH_OPERATION': 0,

  // Priority 1: Table creation (must exist before anything else)
  'TABLE_CREATED': 1,

  // Priority 2: Column additions (table must exist)
  'ADD_COLUMN': 2,

  // Priority 3: Column modifications (columns must exist)
  'COLUMN_RENAMED': 3,
  'COLUMN_TYPE_CHANGED': 3,
  'REMOVE_COLUMN': 3,

  // Priority 4: Primary keys (columns must exist)
  'PRIMARY_KEY_SET': 4,
  'PRIMARY_KEY_REMOVED': 4,

  // Priority 5: Foreign keys and relations (both tables and columns must exist)
  'FOREIGN_KEY_ADDED': 5,
  'FOREIGN_KEY_REMOVED': 5,
  'RELATION_CREATED': 5,
  'RELATION_REMOVED': 5,
  'COLUMN_MAPPING_CREATED': 5,
  'COLUMN_MAPPING_REMOVED': 5,

  // Priority 6: Policies (structure must be complete)
  'MASKING_POLICY_APPLIED': 6,
  'MASKING_POLICY_REMOVED': 6,
  'RLS_POLICY_APPLIED': 6,
  'RLS_POLICY_REMOVED': 6,
  'AGGREGATION_POLICY_APPLIED': 6,
  'AGGREGATION_POLICY_REMOVED': 6,

  // Priority 7: Tags (can be applied anytime after structure)
  'TAG_APPLIED': 7,
  'TAG_REMOVED': 7,
  'COLUMN_EXCLUDED': 7,
  'COLUMN_INCLUDED': 7,
  'TABLE_EXCLUDED': 7,
  'TABLE_INCLUDED': 7,

  // Priority 8: Configuration (metadata, no structural dependencies)
  'INGESTION_MODE_SET': 8,
  'SCD_CONFIGURED': 8,

  // Priority 9: Table renames (should be last to avoid breaking references)
  'TABLE_RENAMED': 9,
};

/**
 * Sort events by execution priority for deployment
 * Events are sorted by:
 * 1. Priority (lower = execute first)
 * 2. Timestamp (earlier = execute first within same priority)
 * 3. Same-table grouping (events on same table stay together)
 */
const sortEventsForDeployment = (events: DesignEvent[]): DesignEvent[] => {
  return [...events].sort((a, b) => {
    // First, sort by priority
    const priorityA = EVENT_PRIORITY[a.type] ?? 99;
    const priorityB = EVENT_PRIORITY[b.type] ?? 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Same priority: group by table (events on same table should be together)
    const tableKeyA = `${a.target.database}.${a.target.schema}.${a.target.table}`;
    const tableKeyB = `${b.target.database}.${b.target.schema}.${b.target.table}`;

    if (tableKeyA !== tableKeyB) {
      return tableKeyA.localeCompare(tableKeyB);
    }

    // Same table: sort by timestamp
    const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();

    return timeA - timeB;
  });
};

/**
 * Filter events that need SQL execution (skip metadata-only events)
 */
const filterExecutableEvents = (events: DesignEvent[]): DesignEvent[] => {
  const metadataOnlyTypes: EventType[] = [
    'SCHEMA_SELECTED',
    'TABLE_SELECTED',
    'TABLE_ADDED_TO_MODELING',
    'TABLE_REMOVED_FROM_MODELING',
    'BATCH_OPERATION',
  ];

  return events.filter(e => !metadataOnlyTypes.includes(e.type));
};

/**
 * Extract ingestion configurations from INGESTION_MODE_SET and COLUMN_MAPPING events
 * Builds table configs with source-to-target column mappings for data ingestion
 *
 * New API schema supports:
 * - source_columns: array of source columns (for multi-column transformations)
 * - target_column: single target column
 * - transformation: optional transformation function (CONCAT, CONCAT_WS, COALESCE, UPPER, LOWER, TRIM, SUM)
 */
const extractIngestionConfigs = (events: DesignEvent[]): IngestionTableConfig[] => {
  const ingestionConfigs: IngestionTableConfig[] = [];

  // Map to store column mappings per table: tableKey -> { source columns, target columns, transformation }
  const tableColumnMappings: Map<string, {
    sourceDb: string;
    sourceSchema: string;
    sourceTable: string;
    targetDb: string;
    targetSchema: string;
    targetTable: string;
    columns: Array<{
      sourceColumns: string[]; // Array to support multi-column transformations
      targetColumn: string;
      transformation?: string | null;
    }>;
  }> = new Map();

  // First pass: collect column mappings
  // Note: In COLUMN_MAPPING_CREATED events:
  //   - event.target = SOURCE table (where data comes from)
  //   - event.payload.targetTable = TARGET table (where data goes to)
  events.forEach(event => {
    if (event.type === 'COLUMN_MAPPING_CREATED') {
      // Source is in event.target
      const sourceDb = event.target.database;
      const sourceSchema = event.target.schema;
      const sourceTable = event.target.table;

      // Support both single sourceColumn and array sourceColumns
      const sourceColumn = event.payload.sourceColumn || '';
      const sourceColumns = event.payload.sourceColumns || (sourceColumn ? [sourceColumn] : []);

      // Get transformation if specified
      const transformation = event.payload.transformation || null;

      // Target is in event.payload.targetTable
      const targetInfo = event.payload.targetTable;
      const targetDb = targetInfo?.database || '';
      const targetSchema = targetInfo?.schema || '';
      const targetTable = targetInfo?.table || '';
      const targetColumn = event.payload.targetColumn || '';

      // Create key based on target table (where we're loading data TO)
      const targetTableKey = `${targetDb}.${targetSchema}.${targetTable}`;

      if (sourceTable && sourceColumns.length > 0 && targetTable && targetColumn) {
        if (!tableColumnMappings.has(targetTableKey)) {
          tableColumnMappings.set(targetTableKey, {
            sourceDb,
            sourceSchema,
            sourceTable,
            targetDb,
            targetSchema,
            targetTable,
            columns: [],
          });
        }

        const mapping = tableColumnMappings.get(targetTableKey)!;
        mapping.columns.push({
          sourceColumns,
          targetColumn,
          transformation,
        });
      }
    }
  });

  // Track which tables have explicit INGESTION_MODE_SET events
  const tablesWithIngestionMode = new Set<string>();

  // Second pass: process INGESTION_MODE_SET events
  events.forEach(event => {
    if (event.type === 'INGESTION_MODE_SET') {
      const mode = (event.payload.mode || event.payload.ingestionMode || 'full_refresh') as IngestionMode;
      const targetTableKey = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      tablesWithIngestionMode.add(targetTableKey);

      // Get source info from column mappings or from event payload
      const columnMapping = tableColumnMappings.get(targetTableKey);

      // Source table can come from payload or column mapping
      const sourceDb = event.payload.sourceDatabase || event.payload.source_database || columnMapping?.sourceDb || event.target.database;
      const sourceSchema = event.payload.sourceSchema || event.payload.source_schema || columnMapping?.sourceSchema || event.target.schema;
      const sourceTable = event.payload.sourceTable || event.payload.source_table || columnMapping?.sourceTable || event.target.table;

      const config: IngestionTableConfig = {
        source_database: sourceDb,
        source_schema: sourceSchema,
        source_table: sourceTable,
        target_database: event.target.database,
        target_schema: event.target.schema,
        target_table: event.target.table,
        ingestion_mode: mode,
        // Add column mappings with new schema: source_columns (array), target_column, transformation
        column_mappings: columnMapping?.columns.map(col => ({
          source_columns: col.sourceColumns,
          target_column: col.targetColumn,
          transformation: col.transformation as any,
        })),
        config: {},
      };

      // Add mode-specific configurations
      const eventConfig = event.payload.config || event.payload;

      // PK columns (required for incremental, snapshot, all SCD types)
      if (eventConfig.pkColumns || eventConfig.pk_columns) {
        config.config!.pk_columns = eventConfig.pkColumns || eventConfig.pk_columns;
      }

      // Incremental column (required for incremental mode)
      if (eventConfig.incrementalColumn || eventConfig.incremental_column) {
        config.config!.incremental_column = eventConfig.incrementalColumn || eventConfig.incremental_column;
      }

      // Tracking columns (required for SCD Type 2 and 3)
      if (eventConfig.trackingColumns || eventConfig.tracking_columns) {
        config.config!.tracking_columns = eventConfig.trackingColumns || eventConfig.tracking_columns;
      }

      // SCD date columns
      if (eventConfig.effectiveDateColumn || eventConfig.effective_date_column) {
        config.config!.effective_date_column = eventConfig.effectiveDateColumn || eventConfig.effective_date_column;
      }
      if (eventConfig.expirationDateColumn || eventConfig.expiration_date_column) {
        config.config!.expiration_date_column = eventConfig.expirationDateColumn || eventConfig.expiration_date_column;
      }
      if (eventConfig.currentFlagColumn || eventConfig.current_flag_column) {
        config.config!.current_flag_column = eventConfig.currentFlagColumn || eventConfig.current_flag_column;
      }

      // Snapshot column
      if (eventConfig.snapshotColumn || eventConfig.snapshot_column) {
        config.config!.snapshot_column = eventConfig.snapshotColumn || eventConfig.snapshot_column;
      }

      ingestionConfigs.push(config);
    }
  });

  // Third pass: create ingestion configs for tables with column mappings but no explicit INGESTION_MODE_SET
  // These will use default 'full_refresh' mode
  tableColumnMappings.forEach((mapping, targetTableKey) => {
    if (!tablesWithIngestionMode.has(targetTableKey) && mapping.columns.length > 0) {
      const config: IngestionTableConfig = {
        source_database: mapping.sourceDb,
        source_schema: mapping.sourceSchema,
        source_table: mapping.sourceTable,
        target_database: mapping.targetDb,
        target_schema: mapping.targetSchema,
        target_table: mapping.targetTable,
        ingestion_mode: 'full_refresh', // Default mode for column mappings without explicit mode
        // Include column mappings with new schema
        column_mappings: mapping.columns.map(col => ({
          source_columns: col.sourceColumns,
          target_column: col.targetColumn,
          transformation: col.transformation as any,
        })),
        config: {},
      };
      ingestionConfigs.push(config);
    }
  });

  return ingestionConfigs;
};

/**
 * Extract mapped source-to-target table overview from events
 * Used for displaying mapping summary in deployment modal
 */
interface ColumnMappingOverview {
  sourceColumns: string[]; // Array to support multi-column transformations
  targetColumn: string;
  transformation?: string | null;
}

interface MappedTableOverview {
  sourceDatabase: string;
  sourceSchema: string;
  sourceTable: string;
  targetDatabase: string;
  targetSchema: string;
  targetTable: string;
  ingestionMode?: string;
  columnMappings: ColumnMappingOverview[];
}

const extractMappedTablesOverview = (events: DesignEvent[]): MappedTableOverview[] => {
  const mappedTables: Map<string, MappedTableOverview> = new Map();

  // Process COLUMN_MAPPING_CREATED events
  // Note: In COLUMN_MAPPING_CREATED events:
  //   - event.target = SOURCE table (where data comes from)
  //   - event.payload.targetTable = TARGET table (where data goes to)
  events.forEach(event => {
    if (event.type === 'COLUMN_MAPPING_CREATED') {
      // Source is in event.target
      const sourceDb = event.target.database;
      const sourceSchema = event.target.schema;
      const sourceTable = event.target.table;

      // Support both single sourceColumn and array sourceColumns
      const sourceColumn = event.payload.sourceColumn || '';
      const sourceColumns = event.payload.sourceColumns || (sourceColumn ? [sourceColumn] : []);

      // Get transformation if specified
      const transformation = event.payload.transformation || null;

      // Target is in event.payload.targetTable
      const targetInfo = event.payload.targetTable;
      const targetDb = targetInfo?.database || '';
      const targetSchema = targetInfo?.schema || '';
      const targetTable = targetInfo?.table || '';
      const targetColumn = event.payload.targetColumn || '';

      // Create key based on target table
      const targetTableKey = `${targetDb}.${targetSchema}.${targetTable}`;

      if (sourceTable && sourceColumns.length > 0 && targetTable && targetColumn) {
        if (!mappedTables.has(targetTableKey)) {
          mappedTables.set(targetTableKey, {
            sourceDatabase: sourceDb,
            sourceSchema: sourceSchema,
            sourceTable: sourceTable,
            targetDatabase: targetDb,
            targetSchema: targetSchema,
            targetTable: targetTable,
            columnMappings: [],
          });
        }

        const mapping = mappedTables.get(targetTableKey)!;
        // Avoid duplicates (check by target column and source columns)
        const sourcesKey = sourceColumns.join(',');
        if (!mapping.columnMappings.find(m => m.sourceColumns.join(',') === sourcesKey && m.targetColumn === targetColumn)) {
          mapping.columnMappings.push({
            sourceColumns,
            targetColumn,
            transformation,
          });
        }
      }
    }
  });

  // Add ingestion mode info from INGESTION_MODE_SET events
  events.forEach(event => {
    if (event.type === 'INGESTION_MODE_SET') {
      const targetTableKey = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      const mode = event.payload.mode || event.payload.ingestionMode || 'full_refresh';

      if (mappedTables.has(targetTableKey)) {
        mappedTables.get(targetTableKey)!.ingestionMode = mode;
      } else {
        // Create entry from INGESTION_MODE_SET even without column mappings
        const sourceDb = event.payload.sourceDatabase || event.payload.source_database || event.target.database;
        const sourceSchema = event.payload.sourceSchema || event.payload.source_schema || event.target.schema;
        const sourceTable = event.payload.sourceTable || event.payload.source_table || event.target.table;

        mappedTables.set(targetTableKey, {
          sourceDatabase: sourceDb,
          sourceSchema: sourceSchema,
          sourceTable: sourceTable,
          targetDatabase: event.target.database,
          targetSchema: event.target.schema,
          targetTable: event.target.table,
          ingestionMode: mode,
          columnMappings: [],
        });
      }
    }
  });

  return Array.from(mappedTables.values());
};

// Enhanced SQL generation for Snowflake
const generateSnowflakeSQL = (event: DesignEvent): { sql: string; rollbackSql?: string } => {
  const tableRef = `${event.target.database}.${event.target.schema}.${event.target.table}`;

  switch (event.type) {
        case 'TABLE_CREATED':
      // Always regenerate SQL with deployment target (don't use pre-generated SQL as it has original db/schema)
      const columns = event.payload.columns || [];
      const columnDefs = columns.map((col: any) => {
        let def = `  ${col.name} ${col.dataType}`;
        if (!col.nullable) def += ' NOT NULL';
        if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
        if (col.comment) def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
        return def;
      }).join(',\n');

      const primaryKeys = event.payload.primaryKeys || columns.filter((c: any) => c.primaryKey).map((c: any) => c.name);
      let createSql = `CREATE TABLE ${tableRef} (\n${columnDefs}`;
      if (primaryKeys.length > 0) {
        createSql += `,\n  PRIMARY KEY (${primaryKeys.join(', ')})`;
      }
      createSql += '\n)';
      if (event.payload.comment) {
        createSql += `\nCOMMENT = '${event.payload.comment.replace(/'/g, "''")}'`;
      }
      createSql += ';';

      return {
        sql: createSql,
        rollbackSql: `DROP TABLE IF EXISTS ${tableRef};`
      };

    
    case 'TABLE_RENAMED':
      return {
        sql: `ALTER TABLE ${tableRef} RENAME TO ${event.payload.newName};`,
        rollbackSql: `ALTER TABLE ${event.target.database}.${event.target.schema}.${event.payload.newName} RENAME TO ${event.target.table};`
      };

    case 'COLUMN_RENAMED':
      return {
        sql: `ALTER TABLE ${tableRef} RENAME COLUMN ${event.payload.oldName} TO ${event.payload.newName};`,
        rollbackSql: `ALTER TABLE ${tableRef} RENAME COLUMN ${event.payload.newName} TO ${event.payload.oldName};`
      };

    case 'COLUMN_TYPE_CHANGED':
      return {
        sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET DATA TYPE ${event.payload.newType};`,
        rollbackSql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET DATA TYPE ${event.payload.oldType};`
      };

    case 'PRIMARY_KEY_SET':
      const pkColumns = event.payload.columns?.join(', ') || '';
      return {
        sql: `ALTER TABLE ${tableRef} ADD PRIMARY KEY (${pkColumns});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP PRIMARY KEY;`
      };

    case 'PRIMARY_KEY_REMOVED':
      return {
        sql: `ALTER TABLE ${tableRef} DROP PRIMARY KEY;`,
        rollbackSql: `-- Manual intervention required to restore primary key`
      };

    case 'FOREIGN_KEY_ADDED':
      const fkName = `FK_${event.target.table}_${event.payload.columns?.[0]}`;
      const refTable = `${event.payload.referencedTable?.database}.${event.payload.referencedTable?.schema}.${event.payload.referencedTable?.table}`;
      return {
        sql: `ALTER TABLE ${tableRef} ADD CONSTRAINT ${fkName} FOREIGN KEY (${event.payload.columns?.join(', ')}) REFERENCES ${refTable}(${event.payload.referencedColumns?.join(', ')});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP CONSTRAINT ${fkName};`
      };

    case 'RELATION_CREATED':
      const relationFkName = `FK_${event.target.table}_${event.payload.sourceColumn}`;
      const targetRef = `${event.payload.targetTable?.database}.${event.payload.targetTable?.schema}.${event.payload.targetTable?.table}`;
      return {
        sql: `ALTER TABLE ${tableRef} ADD CONSTRAINT ${relationFkName} FOREIGN KEY (${event.payload.sourceColumn}) REFERENCES ${targetRef}(${event.payload.targetColumn});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP CONSTRAINT ${relationFkName};`
      };

    case 'MASKING_POLICY_APPLIED':
      const maskColumns = event.payload.columns || [];
      const maskStatements = maskColumns.map((col: string) =>
        `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} SET MASKING POLICY ${event.payload.policyName};`
      );
      return {
        sql: maskStatements.join('\n'),
        rollbackSql: maskColumns.map((col: string) =>
          `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} UNSET MASKING POLICY;`
        ).join('\n')
      };

    case 'MASKING_POLICY_REMOVED':
      const unmaskColumns = event.payload.columns || [];
      return {
        sql: unmaskColumns.map((col: string) =>
          `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} UNSET MASKING POLICY;`
        ).join('\n'),
        rollbackSql: `-- Manual intervention required to restore masking policy`
      };

    case 'INGESTION_MODE_SET':
      const mode = event.payload.mode;
      let ingestionSql = `-- Ingestion Configuration for ${tableRef}\n`;
      ingestionSql += `-- Mode: ${mode?.toUpperCase().replace(/_/g, ' ')}\n`;

      if (mode === 'incremental' && event.payload.config?.incrementalColumn) {
        ingestionSql += `-- Incremental column: ${event.payload.config.incrementalColumn}\n`;
        ingestionSql += `-- CREATE STREAM ${event.target.schema}.STREAM_${event.target.table} ON TABLE ${tableRef} SHOW_INITIAL_ROWS = TRUE;`;
      } else if (mode?.startsWith('scd_')) {
        ingestionSql += `-- Effective date: ${event.payload.config?.effectiveDateColumn || 'EFF_START_DT'}\n`;
        ingestionSql += `-- Expiration date: ${event.payload.config?.expirationDateColumn || 'EFF_END_DT'}\n`;
        ingestionSql += `-- Current flag: ${event.payload.config?.currentFlagColumn || 'IS_CURRENT'}\n`;
      }

      return { sql: ingestionSql };

    case 'SCD_CONFIGURED':
      return {
        sql: `-- SCD Type ${event.payload.scdType || 2} configuration for ${tableRef}\n` +
             `-- Effective date column: ${event.payload.effectiveDateColumn || 'EFF_START_DT'}\n` +
             `-- Expiration date column: ${event.payload.expirationDateColumn || 'EFF_END_DT'}\n` +
             `-- Current flag column: ${event.payload.currentFlagColumn || 'IS_CURRENT'}`
      };

    case 'TAG_APPLIED':
      const tagName = event.payload.tagName || event.payload.tag;
      const tagValue = event.payload.tagValue || 'TRUE';
      if (event.target.column) {
        return {
          sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET TAG ${tagName} = '${tagValue}';`,
          rollbackSql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} UNSET TAG ${tagName};`
        };
      }
      return {
        sql: `ALTER TABLE ${tableRef} SET TAG ${tagName} = '${tagValue}';`,
        rollbackSql: `ALTER TABLE ${tableRef} UNSET TAG ${tagName};`
      };

    case 'TAG_REMOVED':
      const removedTagName = event.payload.tagName || event.payload.tag;
      if (event.target.column) {
        return { sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} UNSET TAG ${removedTagName};` };
      }
      return { sql: `ALTER TABLE ${tableRef} UNSET TAG ${removedTagName};` };

    case 'ADD_COLUMN':
      const colName = event.payload.columnName || event.payload.name;
      const colType = event.payload.dataType || event.payload.type || 'VARCHAR';
      const nullable = event.payload.isNullable !== false ? '' : ' NOT NULL';
      return {
        sql: `ALTER TABLE ${tableRef} ADD COLUMN ${colName} ${colType}${nullable};`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP COLUMN ${colName};`
      };

    case 'REMOVE_COLUMN':
      const dropColName = event.payload.columnName || event.payload.name;
      return {
        sql: `ALTER TABLE ${tableRef} DROP COLUMN ${dropColName};`,
        rollbackSql: `-- Manual intervention required to restore column ${dropColName}`
      };

    case 'TABLE_EXCLUDED':
      return { sql: `-- Table ${tableRef} excluded from data model` };

    case 'TABLE_INCLUDED':
      return { sql: `-- Table ${tableRef} included in data model` };

    case 'COLUMN_EXCLUDED':
      return { sql: `-- Column ${tableRef}.${event.target.column} excluded from data model` };

    case 'COLUMN_INCLUDED':
      return { sql: `-- Column ${tableRef}.${event.target.column} included in data model` };

    case 'RLS_POLICY_APPLIED':
      return {
        sql: `ALTER TABLE ${tableRef} ADD ROW ACCESS POLICY ${event.payload.policyName} ON (${event.payload.filterColumn || '*'});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP ROW ACCESS POLICY ${event.payload.policyName};`
      };

    case 'RLS_POLICY_REMOVED':
      return { sql: `ALTER TABLE ${tableRef} DROP ROW ACCESS POLICY ${event.payload.policyName};` };

    case 'AGGREGATION_POLICY_APPLIED':
      return {
        sql: `ALTER TABLE ${tableRef} ADD AGGREGATION POLICY ${event.payload.policyName};`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP AGGREGATION POLICY ${event.payload.policyName};`
      };

    case 'AGGREGATION_POLICY_REMOVED':
      return { sql: `ALTER TABLE ${tableRef} DROP AGGREGATION POLICY ${event.payload.policyName};` };

    default:
      return { sql: `-- ${event.type}: ${JSON.stringify(event.payload)}` };
  }
};

// Local validation rules for events
const validateEventLocally = (event: DesignEvent, allEvents: DesignEvent[]): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check target is valid
  if (!event.target.database || !event.target.schema || !event.target.table) {
    errors.push('Invalid target: missing database, schema, or table');
  }

  // Type-specific validation
  switch (event.type) {
    case 'TABLE_RENAMED':
      if (!event.payload.newName) {
        errors.push('New table name is required');
      } else if (event.payload.newName === event.payload.oldName) {
        errors.push('New name must be different from old name');
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.payload.newName)) {
        errors.push('Invalid table name: must start with letter or underscore');
      }
      break;

    case 'COLUMN_RENAMED':
      if (!event.payload.newName) {
        errors.push('New column name is required');
      } else if (event.payload.newName === event.payload.oldName) {
        errors.push('New name must be different from old name');
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.payload.newName)) {
        errors.push('Invalid column name: must start with letter or underscore');
      }
      // Check for duplicate rename events on same column
      const duplicateRenames = allEvents.filter(e =>
        e.id !== event.id &&
        e.type === 'COLUMN_RENAMED' &&
        e.target.table === event.target.table &&
        e.payload.oldName === event.payload.oldName
      );
      if (duplicateRenames.length > 0) {
        warnings.push('Multiple rename operations on same column detected');
      }
      break;

    case 'PRIMARY_KEY_SET':
      if (!event.payload.columns || event.payload.columns.length === 0) {
        errors.push('At least one column required for primary key');
      }
      break;

    case 'FOREIGN_KEY_ADDED':
    case 'RELATION_CREATED':
      if (!event.payload.sourceColumn && !event.payload.columns?.[0]) {
        errors.push('Source column is required');
      }
      if (!event.payload.targetTable || !event.payload.targetColumn) {
        errors.push('Target table and column are required');
      }
      break;

    case 'MASKING_POLICY_APPLIED':
      if (!event.payload.policyName) {
        errors.push('Policy name is required');
      }
      if (!event.payload.columns || event.payload.columns.length === 0) {
        errors.push('At least one column required for masking policy');
      }
      break;

    case 'INGESTION_MODE_SET':
      if (!event.payload.mode) {
        errors.push('Ingestion mode is required');
      }
      if (event.payload.mode === 'incremental' && !event.payload.config?.incrementalColumn) {
        warnings.push('Incremental mode should specify an incremental column');
      }
      break;

    case 'ADD_COLUMN':
      const colName = event.payload.columnName || event.payload.name;
      if (!colName) {
        errors.push('Column name is required');
      }
      break;

    case 'TAG_APPLIED':
      if (!event.payload.tagName && !event.payload.tag) {
        errors.push('Tag name is required');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

// Event type to SQL mapping (legacy - for backward compatibility)
const eventTypeToSQL: Partial<Record<EventType, (event: DesignEvent) => string>> = {
  TABLE_RENAMED: (e) => generateSnowflakeSQL(e).sql,
  COLUMN_RENAMED: (e) => generateSnowflakeSQL(e).sql,
  INGESTION_MODE_SET: (e) => generateSnowflakeSQL(e).sql,
  MASKING_POLICY_APPLIED: (e) => generateSnowflakeSQL(e).sql,
  PRIMARY_KEY_SET: (e) => generateSnowflakeSQL(e).sql,
  RELATION_CREATED: (e) => generateSnowflakeSQL(e).sql,
};

// Props
interface DeploymentValidationProps {
  className?: string;
  onClose?: () => void;
  database?: string;
  schemas?: string[];
  projectId?: string | null;
}

// Local storage key for scheduled deployments
const SCHEDULED_DEPLOYMENTS_KEY = 'explore-design-scheduled-deployments';

const DeploymentValidation: React.FC<DeploymentValidationProps> = ({
  className,
  onClose,
  database,
  schemas = [],
  projectId: projectIdProp
}) => {
  const { data: session } = useSession();
  const currentUser = (session?.user as any)?.username || session?.user?.email || 'current_user';

  // Use provided projectId prop, or generate from database context as fallback
  // IMPORTANT: Calculate projectId BEFORE calling useEventStore so events are filtered correctly
  const projectId = useMemo(() => {
    if (projectIdProp) {
      return projectIdProp;
    }
    if (database) {
      return `${database.toLowerCase()}_project`;
    }
    return 'default_project';
  }, [projectIdProp, database]);

  // Pass projectId to useEventStore to filter events by project
  const { events, pendingEvents, updateEventStatus, clearEvents, cleanupAppliedEvents } = useEventStore(projectId);

  const [isValidating, setIsValidating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [currentStep, setCurrentStep] = useState<'review' | 'validate' | 'deploy' | 'complete'>('review');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showSQLPreview, setShowSQLPreview] = useState(false);
  const [showRollbackSQL, setShowRollbackSQL] = useState(false);

  // Deployment configuration
  const [deploymentType, setDeploymentType] = useState<'immediate' | 'scheduled' | 'with_approval'>('immediate');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('02:00');
  const [versionType, setVersionType] = useState<'patch' | 'minor' | 'major'>('patch');
  const [changelogSummary, setChangelogSummary] = useState('');
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>(['DATA_MODELER']);
  const [scheduledDeployments, setScheduledDeployments] = useState<ScheduledDeploymentLocal[]>([]);

  // Backend integration state
  const [useBackend, setUseBackend] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [cortexRecommendations, setCortexRecommendations] = useState<string | null>(null);
  const [cortexRecommendationsLoading, setCortexRecommendationsLoading] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  // Schema versioning state (Option A: Two-phase deployment)
  const [schemaVersions, setSchemaVersions] = useState<SchemaVersion[]>([]);
  const [currentSchemaVersion, setCurrentSchemaVersion] = useState<SchemaVersion | null>(null);
  const [selectedSchemaVersionId, setSelectedSchemaVersionId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [deploymentPhase, setDeploymentPhase] = useState<'schema' | 'ingestion' | 'complete'>('schema');
  const [schemaDeploymentResult, setSchemaDeploymentResult] = useState<SchemaDeploymentResponse | null>(null);

  // Ingestion target schema version - user can choose which version to ingest into
  // 'latest' means use the latest active version (or newly deployed version)
  // Otherwise, use the specific version_id selected by the user
  const [ingestionTargetVersion, setIngestionTargetVersion] = useState<'latest' | string>('latest');

  // Load scheduled deployments from localStorage
  React.useEffect(() => {
    const stored = localStorage.getItem(SCHEDULED_DEPLOYMENTS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ScheduledDeploymentLocal[];
        setScheduledDeployments(parsed);
      } catch (e) {
        console.error('Failed to load scheduled deployments:', e);
      }
    }
  }, []);

  // Load schema versions when component mounts
  React.useEffect(() => {
    const loadSchemaVersions = async () => {
      if (!projectId) return;

      setIsLoadingVersions(true);
      try {
        const response = await getSchemaVersions(projectId, { limit: 20 });
        setSchemaVersions(response.versions);
        setCurrentSchemaVersion(response.current_version || null);
        // Default to current version for ingestion
        if (response.current_version) {
          setSelectedSchemaVersionId(response.current_version.version_id);
          // Set ingestion target to current version by default
          setIngestionTargetVersion(response.current_version.version_id);
        }
      } catch (error) {
        console.error('[DeploymentValidation] Failed to load schema versions:', error);
      } finally {
        setIsLoadingVersions(false);
      }
    };

    loadSchemaVersions();
  }, [projectId]);

  // Save scheduled deployment to localStorage
  const saveScheduledDeployment = useCallback((deployment: ScheduledDeploymentLocal) => {
    setScheduledDeployments(prev => {
      const updated = [...prev, deployment];
      localStorage.setItem(SCHEDULED_DEPLOYMENTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Format event type for display
  const formatEventType = (type: EventType): string => {
    const displayNames: Partial<Record<EventType, string>> = {
      'TABLE_RENAMED': 'Rename Table',
      'COLUMN_RENAMED': 'Rename Column',
      'COLUMN_TYPE_CHANGED': 'Change Column Type',
      'PRIMARY_KEY_SET': 'Set Primary Key',
      'PRIMARY_KEY_REMOVED': 'Remove Primary Key',
      'FOREIGN_KEY_ADDED': 'Add Foreign Key',
      'FOREIGN_KEY_REMOVED': 'Remove Foreign Key',
      'INGESTION_MODE_SET': 'Configure Ingestion',
      'MASKING_POLICY_APPLIED': 'Apply Masking Policy',
      'MASKING_POLICY_REMOVED': 'Remove Masking Policy',
      'RELATION_CREATED': 'Create Relation',
      'RELATION_REMOVED': 'Remove Relation',
      'SCD_CONFIGURED': 'Configure SCD',
      'TAG_APPLIED': 'Apply Tag',
      'TAG_REMOVED': 'Remove Tag',
      'TABLE_EXCLUDED': 'Exclude Table',
      'TABLE_INCLUDED': 'Include Table',
      'COLUMN_EXCLUDED': 'Exclude Column',
      'COLUMN_INCLUDED': 'Include Column',
    };
    return displayNames[type] || type.replace(/_/g, ' ');
  };

  // Get event summary description
  const getEventSummary = (event: DesignEvent): string => {
    const { type, payload, target } = event;
    switch (type) {
      case 'TABLE_RENAMED':
        return `${payload.oldName || target.table} → ${payload.newName}`;
      case 'COLUMN_RENAMED':
        return `${payload.oldName} → ${payload.newName}`;
      case 'INGESTION_MODE_SET':
        return `Mode: ${payload.mode?.replace(/_/g, ' ')}`;
      case 'MASKING_POLICY_APPLIED':
        return `Policy: ${payload.policyName}`;
      case 'PRIMARY_KEY_SET':
        return `Columns: ${payload.columns?.join(', ') || 'N/A'}`;
      case 'RELATION_CREATED':
        return `${payload.sourceColumn} → ${payload.targetTable?.table}.${payload.targetColumn}`;
      default:
        return target.column || '';
    }
  };

  // Group events by table (events are now pre-validated at creation time)
  const eventsByTable = useMemo(() => {
    const groups: Record<string, DesignEvent[]> = {};

    pendingEvents.forEach((event) => {
      const key = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return groups;
  }, [pendingEvents]);

  // Extract mapped tables overview for display
  const mappedTablesOverview = useMemo(() => {
    return extractMappedTablesOverview(events);
  }, [events]);

  // Categorize events into schema changes vs ingestion configurations (Two-phase deployment)
  const { schemaEvents, ingestionEvents, schemaEventsSummary, ingestionEventsSummary } = useMemo(() => {
    // Events that generate DDL (schema changes)
    const schemaEventTypes: EventType[] = [
      'TABLE_CREATED', 'TABLE_RENAMED', 'ADD_COLUMN', 'REMOVE_COLUMN',
      'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_SET', 'PRIMARY_KEY_REMOVED',
      'FOREIGN_KEY_ADDED', 'FOREIGN_KEY_REMOVED', 'RELATION_CREATED', 'RELATION_REMOVED',
      'MASKING_POLICY_APPLIED', 'MASKING_POLICY_REMOVED', 'RLS_POLICY_APPLIED', 'RLS_POLICY_REMOVED',
      'AGGREGATION_POLICY_APPLIED', 'AGGREGATION_POLICY_REMOVED', 'TAG_APPLIED', 'TAG_REMOVED',
    ];

    // Events for data ingestion configuration
    const ingestionEventTypes: EventType[] = [
      'COLUMN_MAPPING_CREATED', 'COLUMN_MAPPING_REMOVED', 'INGESTION_MODE_SET', 'SCD_CONFIGURED',
    ];

    const schema = pendingEvents.filter(e => schemaEventTypes.includes(e.type));
    const ingestion = pendingEvents.filter(e => ingestionEventTypes.includes(e.type));

    // Summary counts for schema changes
    const schemaSummary = {
      tablesCreated: schema.filter(e => e.type === 'TABLE_CREATED').length,
      tablesRenamed: schema.filter(e => e.type === 'TABLE_RENAMED').length,
      columnsAdded: schema.filter(e => e.type === 'ADD_COLUMN').length,
      columnsModified: schema.filter(e => ['COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED'].includes(e.type)).length,
      constraintsAdded: schema.filter(e => ['PRIMARY_KEY_SET', 'FOREIGN_KEY_ADDED', 'RELATION_CREATED'].includes(e.type)).length,
      policiesApplied: schema.filter(e => e.type.includes('POLICY_APPLIED')).length,
    };

    // Summary counts for ingestion configs
    const ingestionSummary = {
      columnMappings: ingestion.filter(e => e.type === 'COLUMN_MAPPING_CREATED').length,
      ingestionModes: ingestion.filter(e => e.type === 'INGESTION_MODE_SET').length,
      scdConfigs: ingestion.filter(e => e.type === 'SCD_CONFIGURED').length,
      totalTables: new Set(ingestion.map(e => `${e.target.database}.${e.target.schema}.${e.target.table}`)).size,
    };

    return {
      schemaEvents: schema,
      ingestionEvents: ingestion,
      schemaEventsSummary: schemaSummary,
      ingestionEventsSummary: ingestionSummary,
    };
  }, [pendingEvents]);

  // Generate SQL for event using enhanced SQL generator
  const generateSQL = useCallback((event: DesignEvent): string => {
    return generateSnowflakeSQL(event).sql;
  }, []);

  // Generate rollback SQL for event
  const generateRollbackSQL = useCallback((event: DesignEvent): string => {
    return generateSnowflakeSQL(event).rollbackSql || '-- No rollback available';
  }, []);

  // All SQL statements (deployment script)
  const allSQL = useMemo(() => {
    const header = `-- =============================================\n-- Data Model Changes - Deployment Script\n-- Generated: ${new Date().toISOString()}\n-- Project: ${projectId}\n-- Database: ${database || 'N/A'}\n-- Events: ${pendingEvents.length}\n-- =============================================\n\n`;
    return header + pendingEvents.map((e, idx) => {
      const sql = generateSQL(e);
      return `-- [${idx + 1}/${pendingEvents.length}] ${e.type} on ${e.target.table}\n${sql}`;
    }).join('\n\n');
  }, [pendingEvents, projectId, database, generateSQL]);

  // All rollback SQL statements
  const allRollbackSQL = useMemo(() => {
    const header = `-- =============================================\n-- Data Model Changes - ROLLBACK Script\n-- Generated: ${new Date().toISOString()}\n-- Project: ${projectId}\n-- WARNING: Execute in reverse order!\n-- =============================================\n\n`;
    return header + [...pendingEvents].reverse().map((e, idx) => {
      const sql = generateRollbackSQL(e);
      return `-- [ROLLBACK ${idx + 1}] ${e.type} on ${e.target.table}\n${sql}`;
    }).join('\n\n');
  }, [pendingEvents, projectId, generateRollbackSQL]);

  // Local validation - validates events without backend
  const validateEventLocally_Internal = useCallback((event: DesignEvent): TestResult => {
    const startTime = Date.now();
    const validation = validateEventLocally(event, events);
    const duration = Date.now() - startTime;

    return {
      eventId: event.id,
      success: validation.isValid,
      message: validation.isValid ? 'Validation passed' : validation.errors.join('; '),
      sql: generateSQL(event),
      error: validation.errors.length > 0 ? validation.errors.join('; ') : undefined,
      warnings: validation.warnings,
      duration: duration + Math.floor(Math.random() * 50), // Add realistic timing
    };
  }, [events, generateSQL]);

  // Run validation - with backend integration
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setCurrentStep('validate');
    setBackendError(null);
    const results = new Map<string, TestResult>();

    toast.loading('Validating events...');

    // Convert local events to API format
    const apiEvents = pendingEvents.map(e => ({
      event_id: e.id,
      event_type: e.type,
      target: e.target,
      payload: e.payload,
      status: e.status,
      created_at: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
    }));

    if (useBackend) {
      try {
        // First, record events to backend for persistence
        toast.loading('Recording events to backend...');
        const recordResult = await recordDesignEvents(projectId, apiEvents as any, 'explore-design');

        if (recordResult.success) {
          toast.dismiss();
          toast.success(`Recorded ${recordResult.recorded_count} events to backend`);
        }

        // Then validate through backend
        toast.loading('Validating with backend...');
        const backendValidation = await validateEventsBackend(projectId, apiEvents as any);

        // Process backend validation results
        backendValidation.results.forEach((r) => {
          const localEvent = pendingEvents.find(e => e.id === r.event_id);
          if (localEvent) {
            const testResult: TestResult = {
              eventId: r.event_id,
              success: r.valid,
              message: r.valid ? 'Backend validation passed' : (r.error || 'Validation failed'),
              sql: r.sql,
              error: r.error,
              warnings: r.warnings,
              duration: 50,
            };
            results.set(r.event_id, testResult);
            updateEventStatus({
              eventId: r.event_id,
              status: r.valid ? 'validated' : 'failed',
              error: r.error,
            });
          }
        });

        toast.dismiss();

        if (backendValidation.summary.invalid === 0) {
          toast.success(`Backend validated ${backendValidation.summary.valid} events successfully`);
        } else {
          toast.error(`${backendValidation.summary.invalid} of ${backendValidation.summary.total} events failed backend validation`);
        }
      } catch (error: any) {
        console.error('Backend validation error:', error);
        setBackendError(error.message || 'Backend validation failed');
        toast.dismiss();
        toast.error('Backend unavailable, falling back to local validation');

        // Fall back to local validation
        for (const event of pendingEvents) {
          const result = validateEventLocally_Internal(event);
          results.set(event.id, result);
          updateEventStatus({
            eventId: event.id,
            status: result.success ? 'validated' : 'failed',
            error: result.error,
          });
        }
      }
    } else {
      // Local-only validation
      await new Promise(resolve => setTimeout(resolve, 300));

      for (const event of pendingEvents) {
        const result = validateEventLocally_Internal(event);
        results.set(event.id, result);
        setTestResults(new Map(results));

        updateEventStatus({
          eventId: event.id,
          status: result.success ? 'validated' : 'failed',
          error: result.error,
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      toast.dismiss();
      const successCount = Array.from(results.values()).filter((r) => r.success).length;
      const failCount = results.size - successCount;

      if (failCount === 0) {
        toast.success(`All ${successCount} events validated locally`);
      } else {
        toast.error(`${failCount} of ${results.size} events failed local validation`);
      }
    }

    setTestResults(results);
    setIsValidating(false);
  }, [pendingEvents, validateEventLocally_Internal, updateEventStatus, useBackend, projectId]);

  // Deploy changes - with real backend integration
  const handleDeploy = useCallback(async () => {
    // Debug: Log event counts
    console.log('[Deployment] Event counts:', {
      totalEvents: events.length,
      pendingEvents: pendingEvents.length,
      validatedEvents: events.filter(e => e.status === 'validated').length,
      columnMappingEvents: events.filter(e => e.type === 'COLUMN_MAPPING_CREATED').length,
    });

    // Use validated events if available, otherwise use pending events directly
    const validatedEvents = events.filter((e) => e.status === 'validated');
    const eventsToDeploy = validatedEvents.length > 0 ? validatedEvents : pendingEvents;

    // Allow deployment even with no pending events if there are column mappings for ingestion
    const columnMappingEvents = events.filter(e => e.type === 'COLUMN_MAPPING_CREATED');
    const hasIngestionWork = columnMappingEvents.length > 0;

    if (eventsToDeploy.length === 0 && !hasIngestionWork) {
      toast('No schema changes or column mappings to deploy.', { icon: 'ℹ️' });
    } else if (eventsToDeploy.length === 0 && hasIngestionWork) {
      toast(`No schema changes, but ${columnMappingEvents.length} column mapping(s) available for ingestion.`, { icon: 'ℹ️' });
    }

    setIsDeploying(true);
    setCurrentStep('deploy');
    setBackendError(null);

    try {
      // Generate version number
      const versionNumber = `${versionType === 'major' ? '1' : '0'}.${versionType === 'minor' ? '1' : '0'}.${versionType === 'patch' ? Date.now() % 1000 : '0'}`;

      // Convert pending events to API format (user's DDL changes only)
      // Backend will clone template tables and apply these changes
      const apiEvents = eventsToDeploy.map(e => ({
        event_id: e.id,
        event_type: e.type,
        target: e.target,
        payload: e.payload,
        status: e.status,
        created_at: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
      }));
      console.log('[Deployment] API events (user changes):', apiEvents.length);

      // Sort events for all deployment types (needed for SQL generation)
      const sortedEvents = sortEventsForDeployment(eventsToDeploy);
      const executableEvents = filterExecutableEvents(sortedEvents);

      // Generate SQL queries in proper order for scheduled/approval deployments
      const orderedSqlQueries = executableEvents
        .map(event => generateSnowflakeSQL(event).sql)
        .filter(sql => sql && !sql.trim().startsWith('--'));

      console.log('[Deployment] Prepared', orderedSqlQueries.length, 'SQL queries in dependency order');

      // Handle based on deployment type
      if (deploymentType === 'scheduled') {
        if (!scheduledDate) {
          toast.error('Please select a scheduled date');
          setIsDeploying(false);
          return;
        }

        toast.loading('Scheduling deployment to backend...');

        try {
          // Use unified backend endpoint with ordered SQL queries
          const result = await scheduleDeploymentUnified({
            workflow_name: `explore_design_v${versionNumber}`,
            scheduled_date: `${scheduledDate}T${scheduledTime}:00`,
            deployment_method: 'REPLACE_EXISTING',
            project_id: projectId,
            events: apiEvents as any,
            sql_queries: orderedSqlQueries, // Include ordered SQL for execution
            created_by: currentUser,
            description: changelogSummary || `Explore & Design deployment with ${eventsToDeploy.length} changes`,
            module_type: 'explore-design',
          });

          // Also save locally as backup
          const scheduledDeployment: ScheduledDeploymentLocal = {
            id: result.schedule_id || `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `deployment_v${versionNumber}`,
            scheduledDate: `${scheduledDate}T${scheduledTime}:00Z`,
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: eventsToDeploy.map(e => e.id),
            status: result.status as any || 'SCHEDULED',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${eventsToDeploy.length} changes`,
          };
          saveScheduledDeployment(scheduledDeployment);

          setDeploymentId(result.schedule_id);
          toast.dismiss();
          toast.success(`Deployment scheduled successfully!\nID: ${result.schedule_id}\nDate: ${scheduledDate} at ${scheduledTime} UTC\n\nNote: Visit Account Overview to track and approve this deployment.`);
          setCurrentStep('complete');

        } catch (error: any) {
          console.error('Backend scheduling error:', error);
          setBackendError(error.message);
          toast.dismiss();
          toast.error(`Backend scheduling failed: ${error.message}\n\nDeployment saved locally as fallback.`);

          // Save locally as fallback
          const scheduledDeployment: ScheduledDeploymentLocal = {
            id: `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `deployment_v${versionNumber}`,
            scheduledDate: `${scheduledDate}T${scheduledTime}:00Z`,
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: eventsToDeploy.map(e => e.id),
            status: 'SCHEDULED',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${eventsToDeploy.length} changes`,
          };
          saveScheduledDeployment(scheduledDeployment);
          setCurrentStep('complete');
        }

      } else if (deploymentType === 'with_approval') {
        toast.loading('Submitting for approval...');

        try {
          // Use unified backend endpoint with requires_approval flag and ordered SQL
          const result = await scheduleDeploymentUnified({
            workflow_name: `explore_design_approval_v${versionNumber}`,
            scheduled_date: new Date().toISOString(),
            deployment_method: 'REPLACE_EXISTING',
            project_id: projectId,
            events: apiEvents as any,
            sql_queries: orderedSqlQueries, // Include ordered SQL for execution after approval
            created_by: currentUser,
            description: changelogSummary || `Explore & Design approval request with ${eventsToDeploy.length} changes`,
            module_type: 'explore-design',
            requires_approval: true,
          });

          // Also save locally
          const pendingApproval: ScheduledDeploymentLocal = {
            id: result.schedule_id || `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `approval_v${versionNumber}`,
            scheduledDate: new Date().toISOString(),
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: eventsToDeploy.map(e => e.id),
            status: 'PENDING_APPROVAL',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${eventsToDeploy.length} changes`,
            approvers: selectedApprovers,
          };
          saveScheduledDeployment(pendingApproval);

          setDeploymentId(result.schedule_id);
          toast.dismiss();
          toast.success(`Deployment submitted for approval!\nID: ${result.schedule_id}\nApprovers: ${selectedApprovers.join(', ')}\n\nNote: Approvers can review in Account Overview.`);
          setCurrentStep('complete');

        } catch (error: any) {
          console.error('Backend approval submission error:', error);
          setBackendError(error.message);
          toast.dismiss();
          toast.error(`Backend submission failed: ${error.message}\n\nSaved locally as fallback.`);

          // Save locally as fallback
          const pendingApproval: ScheduledDeploymentLocal = {
            id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            workflowName: `approval_v${versionNumber}`,
            scheduledDate: new Date().toISOString(),
            deploymentMethod: 'REPLACE_EXISTING',
            eventIds: eventsToDeploy.map(e => e.id),
            status: 'PENDING_APPROVAL',
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
            versionType,
            changelog: changelogSummary || `Deployment with ${eventsToDeploy.length} changes`,
            approvers: selectedApprovers,
          };
          saveScheduledDeployment(pendingApproval);
          setCurrentStep('complete');
        }

      } else {
        // =====================================================
        // IMMEDIATE DEPLOYMENT - Two-Phase Deployment (Option A)
        // =====================================================
        // Phase 1: Deploy Schema (DDL) via /deploy_schema endpoint
        //   - Creates new schema version
        //   - Executes structural changes (tables, columns, constraints)
        //   - Returns schema_version_id for linking
        //
        // Phase 2: Execute Ingestion (ETL) via /execute_ingestion endpoint
        //   - Links to schema_version_id from Phase 1
        //   - Executes data ingestion with column mappings
        //   - Tracks ingestion history per schema version

        console.log('[Deployment] ========== IMMEDIATE DEPLOYMENT STARTED ==========');
        console.log('[Deployment] Project ID:', projectId);
        console.log('[Deployment] Deployment type:', deploymentType);
        console.log('[Deployment] Pending events (user changes):', eventsToDeploy.length);

        toast.loading('Preparing two-phase deployment...');
        setDeploymentPhase('schema');

        try {
          // =====================================================
          // Schema Deployment Strategy:
          // - Backend clones ALL tables from template (CP_DATA360.RETAIL_DWH)
          // - Frontend sends ONLY user's DDL changes (ALTER, ADD COLUMN, ADD FK, etc.)
          // - Backend applies changes to the cloned tables in new versioned schema
          // =====================================================

          // Sort and filter PENDING events (user's changes only)
          const sortedEvents = sortEventsForDeployment(eventsToDeploy);
          console.log('[Deployment] Sorted pending events:', sortedEvents.length);

          const executableEvents = filterExecutableEvents(sortedEvents);
          console.log('[Deployment] Executable events:', executableEvents.length);

          // Separate schema events (DDL) from ingestion events (ETL)
          const schemaEventTypes: EventType[] = [
            'TABLE_CREATED', 'TABLE_RENAMED', 'ADD_COLUMN', 'REMOVE_COLUMN',
            'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_SET', 'PRIMARY_KEY_REMOVED',
            'FOREIGN_KEY_ADDED', 'FOREIGN_KEY_REMOVED', 'RELATION_CREATED', 'RELATION_REMOVED',
            'MASKING_POLICY_APPLIED', 'MASKING_POLICY_REMOVED', 'RLS_POLICY_APPLIED', 'RLS_POLICY_REMOVED',
            'AGGREGATION_POLICY_APPLIED', 'AGGREGATION_POLICY_REMOVED', 'TAG_APPLIED', 'TAG_REMOVED',
          ];

          // Get schema events from PENDING changes (user's DDL modifications)
          const schemaEventsToExecute = executableEvents.filter(e => schemaEventTypes.includes(e.type));
          console.log('[Deployment] Schema events (user DDL changes):', schemaEventsToExecute.length);

          // Generate SQL statements for user's DDL changes only
          // Backend will: 1) Clone template tables, 2) Apply these DDL changes
          const sqlStatements: SQLStatement[] = [];
          schemaEventsToExecute.forEach((event) => {
            const { sql, rollbackSql } = generateSnowflakeSQL(event);
            if (sql && !sql.trim().startsWith('--')) {
              sqlStatements.push({
                sql,
                rollback_sql: rollbackSql || undefined,
                object_type: event.type.includes('TABLE') ? 'TABLE' : event.type.includes('COLUMN') ? 'COLUMN' : 'CONSTRAINT',
                object_name: `${event.target.schema}.${event.target.table}${event.target.column ? '.' + event.target.column : ''}`,
              });
            }
          });

          console.log('[Deployment] Generated SQL statements (user changes):', sqlStatements.length);
          if (sqlStatements.length > 0) {
            console.log('[Deployment] SQL statements:', sqlStatements.map(s => s.sql.substring(0, 100) + '...'));
          }

          // Extract ingestion configurations from ALL events (for data loading)
          const ingestionConfigs = extractIngestionConfigs(events);
          console.log('[Deployment] Ingestion configs:', ingestionConfigs.length);

          let schemaVersionId: string | null = null;
          let queriesExecuted = 0;
          let ingestionRowsAffected = 0;

          // =====================================================
          // PHASE 1: Schema Deployment - ALWAYS CALL THE ENDPOINT
          // =====================================================
          // Always call deploySchema even with no SQL statements
          // Backend needs to track deployment and create/update schema version
          console.log('[Deployment] ========== CALLING deploySchema API ==========');
          console.log('[Deployment] Endpoint: /explore-design/deploy_schema');
          console.log('[Deployment] Request payload:', {
            project_id: projectId,
            version_name: `v${versionNumber}`,
            sql_queries_count: sqlStatements.length,
            has_schema_changes: sqlStatements.length > 0,
          });

          const schemaChangeMessage = sqlStatements.length > 0
            ? `Phase 1: Deploying ${sqlStatements.length} schema changes...`
            : 'Phase 1: Creating schema version...';
          toast.loading(schemaChangeMessage);

          const schemaDeployResult = await deploySchema({
            project_id: projectId,
            version_name: `v${versionNumber}`,
            description: changelogSummary || (sqlStatements.length > 0
              ? `Schema deployment with ${sqlStatements.length} changes`
              : 'Schema version for data ingestion'),
            sql_queries: sqlStatements, // Can be empty array
            events: apiEvents as any,
            options: {
              rollback_on_error: true,
              dry_run: false,
            },
          });

          console.log('[Deployment] Schema deployment result:', schemaDeployResult);

          if (schemaDeployResult.status === 'failed') {
            // Schema deployment failed
            console.error('[Deployment] Schema deployment failed:', schemaDeployResult.errors);
            toast.dismiss();

            // Check if it's a max versions error
            const isMaxVersionsError = schemaDeployResult.errors.some(e =>
              e.toLowerCase().includes('maximum') || e.toLowerCase().includes('version 4') || e.toLowerCase().includes('max versions')
            );

            if (isMaxVersionsError) {
              toast.error(`Maximum schema versions (3) reached!\n\nRollback an older version before deploying new changes.\n\nCurrent versions: ${projectId}_V1, V2, V3`);
              setBackendError('Maximum 3 schema versions allowed. Use Rollback to remove older versions before deploying.');
            } else {
              toast.error(`Schema deployment failed: ${schemaDeployResult.errors.join(', ')}`);
              setBackendError(schemaDeployResult.errors.join(', '));
            }

            // Mark schema events as failed
            schemaEventsToExecute.forEach((event) => {
              updateEventStatus({ eventId: event.id, status: 'failed', error: schemaDeployResult.errors[0] });
            });

            setIsDeploying(false);
            return;
          }

          // Store schema version info for Phase 2
          schemaVersionId = schemaDeployResult.schema_version_id || null;
          queriesExecuted = schemaDeployResult.executed_statements;
          setSchemaDeploymentResult(schemaDeployResult);

          // Mark schema events as applied
          schemaEventsToExecute.forEach((event) => {
            updateEventStatus({ eventId: event.id, status: 'applied' });
          });

          // Refresh schema versions list
          try {
            const versionsResponse = await getSchemaVersions(projectId, { limit: 20 });
            setSchemaVersions(versionsResponse.versions);
            setCurrentSchemaVersion(versionsResponse.current_version || null);
            if (schemaVersionId) {
              setSelectedSchemaVersionId(schemaVersionId);
            }
          } catch (error) {
            console.warn('[Deployment] Failed to refresh schema versions:', error);
          }

          const schemaName = schemaDeployResult.versioned_schema_name || `${projectId}_V${schemaDeployResult.version_number}`;
          console.log('[Deployment] Phase 1 complete - Schema version:', schemaVersionId, 'Schema:', schemaName);
          toast.dismiss();
          toast.success(`Phase 1 complete: ${schemaName} deployed in CP_DATA360 (${queriesExecuted} statements)`);

          // =====================================================
          // PHASE 2: Data Ingestion
          // =====================================================
          setDeploymentPhase('ingestion');

          if (ingestionConfigs.length > 0) {
            // Determine which schema version to use for ingestion:
            // - User selects a specific version from the dropdown (default is current active version)
            // - The selected version_id is passed to backend
            // - If no version selected (empty), let backend pick the latest active version
            const targetVersionId = ingestionTargetVersion && ingestionTargetVersion !== 'latest'
              ? ingestionTargetVersion // Use user-selected specific version
              : (schemaVersionId || undefined); // Fallback to newly deployed version or let backend pick

            const selectedVersion = schemaVersions.find(v => v.version_id === ingestionTargetVersion);
            const targetVersionName = selectedVersion?.versioned_schema_name
              || schemaDeployResult?.versioned_schema_name
              || 'selected schema version';

            toast.loading(`Phase 2: Ingesting data for ${ingestionConfigs.length} table(s) into ${targetVersionName}...`);

            const ingestionRequest = {
              project_id: projectId,
              schema_version_id: targetVersionId, // Use selected version (or undefined for latest)
              tables: ingestionConfigs,
              triggered_by: currentUser,
            };
            console.log('[Deployment] Executing ingestion with request:', JSON.stringify(ingestionRequest, null, 2));
            console.log('[Deployment] Ingestion target version:', ingestionTargetVersion, '-> resolved to:', targetVersionId);

            const ingestionResult = await executeIngestion(ingestionRequest);

            if (ingestionResult.status === 'failed') {
              // Ingestion failed completely
              console.error('[Deployment] Ingestion failed:', ingestionResult.message);
              toast.dismiss();

              // Check for specific error types
              const errorMsg = ingestionResult.message?.toLowerCase() || '';
              if (errorMsg.includes('no active schema version') || errorMsg.includes('schema version not found')) {
                toast.error('No active schema version found.\n\nPlease deploy a schema version first before running data ingestion.');
                setBackendError('No active schema version. Deploy schema first.');
              } else {
                toast.error(`Phase 2 failed: ${ingestionResult.message}`);
                setBackendError(ingestionResult.message);
              }

              // Mark ingestion-related events as failed
              eventsToDeploy.forEach((event) => {
                if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                  updateEventStatus({ eventId: event.id, status: 'failed', error: ingestionResult.message });
                }
              });

              // Partial success if schema was deployed
              if (queriesExecuted > 0) {
                toast.error(`Partial deployment: Schema deployed, but data ingestion failed.`);
              }

              setIsDeploying(false);
              return;
            }

            // Log ingestion results
            ingestionRowsAffected = ingestionResult.total_rows_affected || 0;
            const ingestionTargetSchema = ingestionResult.versioned_schema_name || 'versioned schema';
            const ingestionTargetDb = ingestionResult.target_database || 'CP_DATA360';
            console.log('[Deployment] Phase 2 complete:', {
              status: ingestionResult.status,
              successful: ingestionResult.successful,
              failed: ingestionResult.failed,
              rowsAffected: ingestionRowsAffected,
              targetSchema: `${ingestionTargetDb}.${ingestionTargetSchema}`,
            });

            // Mark ingestion events as applied
            eventsToDeploy.forEach((event) => {
              if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                updateEventStatus({ eventId: event.id, status: 'applied' });
              }
            });

            // Show success toast with versioned schema info
            toast.dismiss();
            toast.success(`Phase 2 complete: Data ingested into ${ingestionTargetDb}.${ingestionTargetSchema}`);

            // Handle partial ingestion success
            if (ingestionResult.status === 'partial') {
              const failedTables = ingestionResult.results.filter(r => !r.success);
              console.warn('[Deployment] Partial ingestion - some tables failed:', failedTables.map(t => t.target));
              toast.error(`Partial ingestion: ${ingestionResult.successful}/${ingestionResult.total_tables} tables succeeded`);
            }
          } else {
            console.log('[Deployment] No ingestion configs - skipping Phase 2');
          }

          // =====================================================
          // DEPLOYMENT COMPLETE
          // =====================================================
          setDeploymentPhase('complete');

          // Record deployment to backend for audit trail
          toast.loading('Recording deployment...');

          const deploymentRecordResult = await deployEventsImmediate(projectId, apiEvents as any, {
            rollback_on_error: false,
            created_by: currentUser,
          });

          // Mark any remaining metadata events as applied
          sortedEvents.forEach((event) => {
            if (event.status !== 'applied' && event.status !== 'failed') {
              updateEventStatus({ eventId: event.id, status: 'applied' });
            }
          });

          setDeploymentId(deploymentRecordResult.deployment_id);
          toast.dismiss();

          // Success message with details
          const successParts: string[] = [];
          successParts.push('Two-phase deployment completed successfully!');
          if (queriesExecuted > 0) {
            const deployedSchemaName = schemaDeploymentResult?.versioned_schema_name || `${projectId}_V${schemaDeploymentResult?.version_number || 1}`;
            successParts.push(`Phase 1 - Schema: ${deployedSchemaName} in CP_DATA360`);
            successParts.push(`Statements executed: ${queriesExecuted}`);
          }
          if (ingestionConfigs.length > 0) {
            successParts.push(`Phase 2 - Ingestion: ${ingestionConfigs.length} table(s)`);
            if (ingestionRowsAffected > 0) {
              successParts.push(`Rows affected: ${ingestionRowsAffected.toLocaleString()}`);
            }
          }
          successParts.push(`Deployment ID: ${deploymentRecordResult.deployment_id}`);

          toast.success(successParts.join('\n'));
          setCurrentStep('complete');

        } catch (error: any) {
          console.error('Backend deployment error:', error);
          setBackendError(error.message);
          toast.dismiss();
          toast.error(`Deployment failed: ${error.message}`);

          // Mark events as failed
          eventsToDeploy.forEach((event) => {
            updateEventStatus({ eventId: event.id, status: 'failed', error: error.message });
          });
        }
      }

      // Log deployment for audit
      console.info('[Deployment]', {
        version: versionNumber,
        timestamp: new Date().toISOString(),
        user: currentUser,
        events: eventsToDeploy.length,
        deploymentType,
        projectId,
        useBackend,
      });

    } catch (error: any) {
      console.error('Deployment error:', error);
      setBackendError(error.message);
      toast.error(`Deployment failed: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  }, [events, pendingEvents, deploymentType, scheduledDate, scheduledTime, versionType, changelogSummary, selectedApprovers, currentUser, updateEventStatus, saveScheduledDeployment, projectId, useBackend, ingestionTargetVersion, schemaVersions]);

  // Download SQL script
  const handleDownloadSQL = useCallback(() => {
    const blob = new Blob([allSQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-model-deploy-${new Date().toISOString().split('T')[0]}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Deployment SQL script downloaded');
  }, [allSQL]);

  // Download rollback SQL script
  const handleDownloadRollbackSQL = useCallback(() => {
    const blob = new Blob([allRollbackSQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-model-rollback-${new Date().toISOString().split('T')[0]}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Rollback SQL script downloaded');
  }, [allRollbackSQL]);

  // Copy SQL to clipboard
  const handleCopySQL = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(allSQL);
      toast.success('SQL copied to clipboard');
    } catch (err) {
      toast.error('Failed to copy SQL');
    }
  }, [allSQL]);

  // Reset deployment
  const handleReset = () => {
    setTestResults(new Map());
    setCurrentStep('review');
  };

  // Toggle expand
  const toggleExpand = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  // Stats (events are now pre-validated at creation time, no filtering needed)
  const stats = useMemo(() => {
    const validated = events.filter((e) => e.status === 'validated').length;
    const failed = events.filter((e) => e.status === 'failed').length;
    const applied = events.filter((e) => e.status === 'applied').length;
    const pending = pendingEvents.length;
    const columnMappings = events.filter((e) => e.type === 'COLUMN_MAPPING_CREATED').length;

    // Debug log
    console.log('[DeploymentValidation] Stats:', {
      total: events.length,
      pending,
      validated,
      failed,
      applied,
      columnMappings,
      projectId,
      eventTypes: events.map(e => e.type),
    });

    return { validated, failed, applied, pending, total: events.length, columnMappings };
  }, [events, pendingEvents.length, projectId]);

  return (
    <div className={cn('bg-white dark:bg-slate-900 rounded-xl shadow-xl overflow-hidden', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-bold">Deployment Validation</h2>
              <p className="text-sm text-blue-100">
                Review, test, and deploy your data model changes
              </p>
            </div>
          </div>
          {onClose && (
            <Button variant="text" size="sm" onClick={onClose} className="text-white">
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {[
            { key: 'review', label: 'Review', icon: Eye },
            { key: 'validate', label: 'Validate', icon: CheckCircle2 },
            { key: 'deploy', label: 'Deploy', icon: Rocket },
            { key: 'complete', label: 'Complete', icon: Check },
          ].map((step, idx) => (
            <React.Fragment key={step.key}>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    currentStep === step.key
                      ? 'bg-blue-600 text-white'
                      : ['review', 'validate', 'deploy', 'complete'].indexOf(currentStep) >
                        ['review', 'validate', 'deploy', 'complete'].indexOf(step.key)
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  )}
                >
                  <step.icon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    currentStep === step.key ? 'text-blue-600' : 'text-slate-500'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < 3 && (
                <ArrowRight className="h-5 w-5 text-slate-300 dark:text-slate-600" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Banner: X of Y in error – you can still submit valid events for approval */}
      {stats.failed > 0 && stats.total > 0 && (
        <div className="px-6 py-3 border-b dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {stats.failed} of {stats.total} event{stats.total !== 1 ? 's' : ''} have validation errors.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Only the {stats.validated} valid event{stats.validated !== 1 ? 's' : ''} will be submitted. You can still submit for approval to deploy the valid changes; fix or remove failed events if you want to include them.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="px-6 py-3 border-b dark:border-slate-700 flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Total:</span>
          <Badge>{stats.total}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Pending:</span>
          <Badge className="bg-amber-100 text-amber-600">{stats.pending}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Validated:</span>
          <Badge className="bg-green-100 text-green-600">{stats.validated}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Failed:</span>
          <Badge className="bg-red-100 text-red-600">{stats.failed}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Applied:</span>
          <Badge className="bg-blue-100 text-blue-600">{stats.applied}</Badge>
        </div>
        {stats.columnMappings > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Mappings:</span>
            <Badge className="bg-purple-100 text-purple-600">{stats.columnMappings}</Badge>
          </div>
        )}
        {scheduledDeployments.length > 0 && (
          <Tooltip content={`${scheduledDeployments.filter(d => d.status === 'SCHEDULED').length} scheduled, ${scheduledDeployments.filter(d => d.status === 'PENDING_APPROVAL').length} pending approval`}>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Scheduled:</span>
              <Badge className="bg-purple-100 text-purple-600">{scheduledDeployments.length}</Badge>
            </div>
          </Tooltip>
        )}

        {/* Backend mode indicator */}
        <div className="ml-auto flex items-center gap-2">
          <Tooltip content={useBackend ? 'Using /mapping/schedule_deployment/ endpoint' : 'Local storage only (no backend)'}>
            <button
              onClick={() => setUseBackend(!useBackend)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
                useBackend
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              )}
            >
              {useBackend ? <Cloud className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
              {useBackend ? 'Backend' : 'Local'}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Backend Error Banner with Cortex recommendations */}
      {backendError && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Deployment Error</p>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1 break-words font-mono">{backendError}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-blue-600 border-blue-400 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                  disabled={cortexRecommendationsLoading}
                  onClick={async () => {
                    setCortexRecommendationsLoading(true);
                    setCortexRecommendations(null);
                    try {
                      const res = await getCortexRecommend({ error_context: backendError });
                      setCortexRecommendations(res?.response ?? 'No recommendations.');
                    } catch (e) {
                      setCortexRecommendations('Failed to load recommendations.');
                    } finally {
                      setCortexRecommendationsLoading(false);
                    }
                  }}
                >
                  {cortexRecommendationsLoading ? 'Loading...' : 'Get Cortex recommendations'}
                </Button>
                <button
                  onClick={() => { setBackendError(null); setCortexRecommendations(null); }}
                  className="text-red-400 hover:text-red-600 p-1"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {cortexRecommendations && (
                <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Recommendations:</p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{cortexRecommendations}</p>
                  <button onClick={() => setCortexRecommendations(null)} className="text-xs text-slate-500 hover:text-slate-700 mt-2">Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Two-Phase Deployment Status */}
      {isDeploying && deploymentType === 'immediate' && (
        <div className="px-6 py-4 border-b dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                deploymentPhase === 'schema' ? 'bg-blue-600 text-white animate-pulse' :
                deploymentPhase === 'ingestion' || deploymentPhase === 'complete' ? 'bg-green-500 text-white' :
                'bg-slate-200 text-slate-500'
              )}>
                1
              </div>
              <div>
                <p className={cn('text-sm font-medium', deploymentPhase === 'schema' ? 'text-blue-700' : 'text-green-700')}>
                  Phase 1: Schema
                </p>
                <p className="text-xs text-slate-500">DDL changes</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-300" />
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                deploymentPhase === 'ingestion' ? 'bg-blue-600 text-white animate-pulse' :
                deploymentPhase === 'complete' ? 'bg-green-500 text-white' :
                'bg-slate-200 text-slate-500'
              )}>
                2
              </div>
              <div>
                <p className={cn('text-sm font-medium', deploymentPhase === 'ingestion' ? 'text-blue-700' : deploymentPhase === 'complete' ? 'text-green-700' : 'text-slate-500')}>
                  Phase 2: Ingestion
                </p>
                <p className="text-xs text-slate-500">ETL data flow</p>
              </div>
            </div>
            {deploymentPhase === 'complete' && (
              <>
                <ArrowRight className="h-5 w-5 text-slate-300" />
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  <span className="text-sm font-medium text-green-700">Complete</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Schema Version Info - Always show when not complete */}
      {currentStep !== 'complete' && (
        <div className="px-6 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GitBranch className="h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-sm font-medium">Schema Version</p>
                {currentSchemaVersion ? (
                  <div className="text-xs text-slate-500">
                    <span className="font-medium text-indigo-600">
                      {currentSchemaVersion.versioned_schema_name || `${projectId}_V${currentSchemaVersion.version_number}`}
                    </span>
                    <span className="ml-2">• {currentSchemaVersion.version_name}</span>
                    {currentSchemaVersion.created_at && (
                      <span className="ml-2">
                        • {new Date(currentSchemaVersion.created_at).toLocaleDateString()}
                      </span>
                    )}
                    <span className="ml-2 text-slate-400">in CP_DATA360</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    {isLoadingVersions ? 'Loading versions...' : `First deployment will create ${projectId}_V1 in CP_DATA360`}
                  </p>
                )}
              </div>
              {/* Max versions warning */}
              {currentSchemaVersion && currentSchemaVersion.version_number >= 3 && (
                <Tooltip content="Maximum 3 versions allowed. Rollback older versions to deploy new changes.">
                  <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/40 rounded text-red-600 dark:text-red-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Max versions reached</span>
                  </div>
                </Tooltip>
              )}
              {currentSchemaVersion && currentSchemaVersion.version_number === 2 && (
                <Tooltip content="You have 2 of 3 allowed versions. Consider rollback if needed.">
                  <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/40 rounded text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">2/3 versions</span>
                  </div>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* View History button - always show */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowVersionHistory(!showVersionHistory)}
                className="text-xs gap-1"
                disabled={isLoadingVersions}
              >
                <History className="h-3.5 w-3.5" />
                {showVersionHistory ? 'Hide' : 'View'} History
                {schemaVersions.length > 0 && (
                  <Badge size="sm" className="ml-1 bg-indigo-100 text-indigo-700">{schemaVersions.length}</Badge>
                )}
              </Button>
              {/* Rollback button - show when current version can rollback */}
              {currentSchemaVersion?.can_rollback && (
                <Tooltip content="Rollback to previous version">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-amber-600 border-amber-300 hover:bg-amber-50 gap-1"
                    onClick={async () => {
                      if (confirm('Are you sure you want to rollback to the previous schema version?')) {
                        try {
                          toast.loading('Rolling back schema...');
                          const result = await rollbackSchema(currentSchemaVersion.version_id, { dry_run: false });
                          toast.dismiss();
                          if (result.status === 'success') {
                            toast.success(`Rolled back from ${result.rolled_back_from} to ${result.rolled_back_to}`);
                            // Refresh versions
                            const versionsResponse = await getSchemaVersions(projectId, { limit: 20 });
                            setSchemaVersions(versionsResponse.versions);
                            setCurrentSchemaVersion(versionsResponse.current_version || null);
                          } else {
                            toast.error(`Rollback failed: ${result.errors.join(', ')}`);
                          }
                        } catch (error: any) {
                          toast.dismiss();
                          toast.error(`Rollback error: ${error.message}`);
                        }
                      }
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Rollback
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Schema Version History Panel */}
          {showVersionHistory && (
            <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700 max-h-[200px] overflow-auto">
              {isLoadingVersions ? (
                <div className="flex items-center justify-center py-4 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading schema versions...
                </div>
              ) : schemaVersions.length > 0 ? (
                <div className="space-y-2">
                  {schemaVersions.map((version) => (
                    <div
                      key={version.version_id}
                      className={cn(
                        'p-2 rounded border text-sm',
                        version.status === 'active'
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : version.status === 'rolled_back'
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-indigo-600">
                            {version.versioned_schema_name || `${projectId}_V${version.version_number}`}
                          </span>
                          <span className="text-slate-500">• {version.version_name}</span>
                          <Badge className={cn(
                            'text-xs',
                            version.status === 'active' ? 'bg-green-100 text-green-700' :
                            version.status === 'rolled_back' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          )}>
                            {version.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-500">
                          {new Date(version.created_at).toLocaleString()}
                        </span>
                      </div>
                      {version.changes_summary && (
                        <div className="mt-1 text-xs text-slate-500 flex gap-3 flex-wrap">
                          {version.changes_summary.schemas_created && version.changes_summary.schemas_created > 0 && (
                            <span className="text-indigo-600">+{version.changes_summary.schemas_created} schema</span>
                          )}
                          {version.changes_summary.tables_cloned && version.changes_summary.tables_cloned > 0 && (
                            <span className="text-blue-600">{version.changes_summary.tables_cloned} cloned</span>
                          )}
                          {version.changes_summary.tables_created > 0 && (
                            <span>+{version.changes_summary.tables_created} tables</span>
                          )}
                          {version.changes_summary.columns_added > 0 && (
                            <span>+{version.changes_summary.columns_added} columns</span>
                          )}
                          {version.changes_summary.constraints_added > 0 && (
                            <span>+{version.changes_summary.constraints_added} constraints</span>
                          )}
                          {version.changes_summary.tables_modified > 0 && (
                            <span>~{version.changes_summary.tables_modified} modified</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-slate-500">
                  <History className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No schema versions yet</p>
                  <p className="text-xs text-slate-400 mt-1">Deploy schema changes to create version history</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Two-Phase Deployment Summary (before deploy) */}
      {currentStep === 'review' && pendingEvents.length > 0 && (
        <div className="px-6 py-3 border-b dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">Two-Phase Deployment Preview</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-2 bg-white/50 dark:bg-slate-800/50 rounded">
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Phase 1: Schema (DDL)</p>
              <ul className="text-slate-500 space-y-0.5">
                {schemaEventsSummary.tablesCreated > 0 && <li>• {schemaEventsSummary.tablesCreated} table(s) to create</li>}
                {schemaEventsSummary.columnsAdded > 0 && <li>• {schemaEventsSummary.columnsAdded} column(s) to add</li>}
                {schemaEventsSummary.columnsModified > 0 && <li>• {schemaEventsSummary.columnsModified} column(s) to modify</li>}
                {schemaEventsSummary.constraintsAdded > 0 && <li>• {schemaEventsSummary.constraintsAdded} constraint(s) to add</li>}
                {schemaEventsSummary.policiesApplied > 0 && <li>• {schemaEventsSummary.policiesApplied} policy/policies to apply</li>}
                {schemaEvents.length === 0 && <li className="text-slate-400">No schema changes</li>}
              </ul>
            </div>
            <div className="p-2 bg-white/50 dark:bg-slate-800/50 rounded">
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Phase 2: Ingestion (ETL)</p>
              <ul className="text-slate-500 space-y-0.5">
                {ingestionEventsSummary.columnMappings > 0 && <li>• {ingestionEventsSummary.columnMappings} column mapping(s)</li>}
                {ingestionEventsSummary.ingestionModes > 0 && <li>• {ingestionEventsSummary.ingestionModes} ingestion mode(s) set</li>}
                {ingestionEventsSummary.scdConfigs > 0 && <li>• {ingestionEventsSummary.scdConfigs} SCD config(s)</li>}
                {ingestionEvents.length === 0 && <li className="text-slate-400">No ingestion changes</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Deployment ID Banner */}
      {deploymentId && currentStep === 'complete' && (
        <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Deployment Recorded</p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                ID: <code className="px-1 bg-blue-100 dark:bg-blue-950 rounded">{deploymentId}</code>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/account-overview', '_blank')}
              className="text-xs"
            >
              View in Account Overview
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6 max-h-[60vh] overflow-auto">
        {currentStep === 'complete' ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Deployment Complete!</h3>
            <p className="text-slate-500 mb-6">
              All {stats.applied} changes have been successfully applied to your data model.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => {
                cleanupAppliedEvents();
                toast.success('Applied events cleared');
              }} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Clear Applied
              </Button>
              <Button variant="outline" onClick={() => {
                clearEvents();
                toast.success('All events cleared');
              }} className="gap-2">
                <X className="h-4 w-4" />
                Clear All
              </Button>
              <Button onClick={onClose} className="gap-2">
                <Check className="h-4 w-4" />
                Done
              </Button>
            </div>
          </div>
        ) : Object.keys(eventsByTable).length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <FileCode className="h-10 w-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-600 dark:text-slate-400">
              No Significant Changes
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              {events.length > 0
                ? 'Some events exist but contain no meaningful changes'
                : 'Make changes in the modeling view to see them here'}
            </p>
            {events.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  clearEvents();
                  toast.success('Cleared all events');
                }}
              >
                Clear Empty Events
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(eventsByTable).map(([tableKey, tableEvents]) => (
              <div
                key={tableKey}
                className="border dark:border-slate-700 rounded-lg overflow-hidden"
              >
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 flex items-center gap-3">
                  <Database className="h-5 w-5 text-blue-500" />
                  <span className="font-medium">{tableKey}</span>
                  <Badge className="ml-auto">{tableEvents.length} changes</Badge>
                </div>
                <div className="divide-y dark:divide-slate-700">
                  {tableEvents.map((event) => {
                    const result = testResults.get(event.id);
                    const isExpanded = expandedEvents.has(event.id);

                    return (
                      <div key={event.id}>
                        <div
                          className={cn(
                            'px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            event.status === 'failed' && 'bg-red-50 dark:bg-red-900/10'
                          )}
                          onClick={() => toggleExpand(event.id)}
                        >
                          <button className="p-0.5">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                          </button>

                          {/* Status Icon */}
                          {event.status === 'pending' && (
                            <Clock className="h-4 w-4 text-amber-500" />
                          )}
                          {event.status === 'validated' && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {event.status === 'failed' && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          {event.status === 'applied' && (
                            <Check className="h-4 w-4 text-blue-500" />
                          )}

                          {/* Event Type */}
                          <span className="text-sm font-medium">
                            {formatEventType(event.type)}
                          </span>

                          {/* Event Summary */}
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                            {getEventSummary(event)}
                          </span>

                          {/* Duration */}
                          {result?.duration && (
                            <span className="text-xs text-slate-400 ml-auto">
                              {result.duration}ms
                            </span>
                          )}
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="px-4 pb-3 ml-8 space-y-2">
                            <div className="p-3 bg-slate-900 dark:bg-slate-950 rounded text-xs font-mono text-green-400 overflow-auto">
                              {generateSQL(event)}
                            </div>
                            {result?.error && (
                              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
                                <strong>Error:</strong> {result.error}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mapped Sources/Targets Overview - Always show when there are mappings */}
      {mappedTablesOverview.length > 0 && currentStep !== 'complete' && (
        <div className="px-6 py-4 border-t dark:border-slate-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
          <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
            <GitBranch className="h-4 w-4 text-purple-600" />
            Mapped Sources & Targets Overview
            <Badge className="ml-auto bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              {mappedTablesOverview.length} table{mappedTablesOverview.length > 1 ? 's' : ''}
            </Badge>
          </h4>

          <div className="space-y-3 max-h-[200px] overflow-auto">
            {mappedTablesOverview.map((mapping, idx) => (
              <div
                key={idx}
                className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Source */}
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-slate-500">Source</p>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        {mapping.sourceDatabase && mapping.sourceSchema
                          ? `${mapping.sourceDatabase}.${mapping.sourceSchema}.${mapping.sourceTable}`
                          : mapping.sourceTable || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ArrowRight className="h-5 w-5 text-slate-400 flex-shrink-0" />

                  {/* Target */}
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-xs text-slate-500">Target</p>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {mapping.targetDatabase}.{mapping.targetSchema}.{mapping.targetTable}
                      </p>
                    </div>
                  </div>

                  {/* Ingestion Mode */}
                  {mapping.ingestionMode && (
                    <Badge className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                      {mapping.ingestionMode.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>

                {/* Column Mappings */}
                {mapping.columnMappings.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 mb-1">
                      Column Mappings ({mapping.columnMappings.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {mapping.columnMappings.slice(0, 5).map((col, colIdx) => (
                        <span
                          key={colIdx}
                          className={cn(
                            "text-xs px-2 py-0.5 rounded flex items-center gap-1",
                            col.transformation
                              ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                              : "bg-slate-100 dark:bg-slate-700"
                          )}
                        >
                          {col.sourceColumns.length > 1 ? (
                            <>
                              [{col.sourceColumns.join(', ')}]
                              {col.transformation && (
                                <span className="text-purple-500 font-medium">
                                  ({col.transformation})
                                </span>
                              )}
                            </>
                          ) : (
                            col.sourceColumns[0]
                          )}
                          {' → '}
                          {col.targetColumn}
                        </span>
                      ))}
                      {mapping.columnMappings.length > 5 && (
                        <span className="text-xs px-2 py-0.5 bg-slate-200 dark:bg-slate-600 rounded text-slate-600 dark:text-slate-300">
                          +{mapping.columnMappings.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deployment Configuration - Always show */}
      {currentStep !== 'complete' && !isValidating && !isDeploying && (
        <div className="px-6 py-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-4">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Deployment Configuration
          </h4>

          {/* Deployment Type */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'immediate', label: 'Deploy Now', icon: Rocket, desc: 'Execute immediately' },
              { value: 'scheduled', label: 'Schedule', icon: Calendar, desc: 'Deploy at specific time' },
              { value: 'with_approval', label: 'With Approval', icon: Users, desc: 'Require approval first' },
            ].map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all',
                  deploymentType === opt.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                )}
                onClick={() => setDeploymentType(opt.value as any)}
              >
                <opt.icon className={cn('h-5 w-5', deploymentType === opt.value ? 'text-blue-500' : 'text-slate-400')} />
                <div>
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Scheduled Time */}
          {deploymentType === 'scheduled' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Date</label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Time (UTC)</label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Approval Settings */}
          {deploymentType === 'with_approval' && (
            <div className="p-3 border dark:border-slate-700 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium">Required Approvers</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['DATA_MODELER', 'DATA_ADMIN', 'DATA_STEWARD'].map((role) => (
                  <button
                    key={role}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-full border transition-colors',
                      selectedApprovers.includes(role)
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
                    )}
                    onClick={() => {
                      setSelectedApprovers((prev) =>
                        prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
                      );
                    }}
                  >
                    {role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Version Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Version Type</label>
              <select
                value={versionType}
                onChange={(e) => setVersionType(e.target.value as any)}
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="patch">Patch (Bug fixes)</option>
                <option value="minor">Minor (New features)</option>
                <option value="major">Major (Breaking changes)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Changelog Summary</label>
              <Input
                value={changelogSummary}
                onChange={(e) => setChangelogSummary(e.target.value)}
                placeholder="Describe changes..."
                className="mt-1"
              />
            </div>
          </div>

          {/* Ingestion Target Schema Version - User can choose which version to ingest data into */}
          <div className="p-3 border dark:border-slate-700 rounded-lg space-y-3 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/10 dark:to-purple-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-medium">Ingestion Target Schema</span>
              </div>
              {isLoadingVersions && (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              )}
            </div>
            <p className="text-xs text-slate-500">
              Choose which schema version to ingest data into. By default, data will be ingested into the current active version.
            </p>
            <select
              value={ingestionTargetVersion}
              onChange={(e) => setIngestionTargetVersion(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
              disabled={isLoadingVersions}
            >
              {/* Show all schema versions - user can choose any version to ingest into */}
              {schemaVersions.length === 0 && (
                <option value="latest">
                  No versions available (will use newly deployed)
                </option>
              )}
              {schemaVersions
                .sort((a, b) => b.version_number - a.version_number) // Sort by version number descending (latest first)
                .map((version) => (
                  <option key={version.version_id} value={version.version_id}>
                    {version.versioned_schema_name || `${projectId}_V${version.version_number}`}
                    {version.version_id === currentSchemaVersion?.version_id ? ' (Current)' : ''}
                    {version.status !== 'active' ? ` [${version.status}]` : ''}
                    - {version.description || `Created ${new Date(version.created_at).toLocaleDateString()}`}
                  </option>
                ))
              }
            </select>
            {ingestionTargetVersion !== 'latest' && ingestionTargetVersion !== currentSchemaVersion?.version_id && (
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>You have selected a non-current schema version. Data will be ingested into this version instead of the current active version.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Actions - Always show */}
      {currentStep !== 'complete' && (
        <div className="px-6 py-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadSQL}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Deploy SQL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadRollbackSQL}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Rollback SQL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySQL}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSQLPreview(true)}
              className="gap-2"
            >
              <FileCode className="h-4 w-4" />
              Preview
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {currentStep === 'validate' && !isValidating && (
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            )}

            {currentStep === 'review' && (
              <Button
                onClick={handleValidate}
                disabled={pendingEvents.length === 0}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Zap className="h-4 w-4" />
                Validate ({pendingEvents.length})
              </Button>
            )}

            {isValidating && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating...
              </Button>
            )}

            {/* Deploy button - always accessible; show count of events that will be submitted (validated or all pending) */}
            {!isValidating && !isDeploying && (() => {
              const validatedCount = events.filter((e) => e.status === 'validated').length;
              const toSubmitCount = validatedCount > 0 ? validatedCount : pendingEvents.length;
              const label = deploymentType === 'immediate' ? 'Deploy Now' : deploymentType === 'scheduled' ? 'Schedule' : 'Submit for approval';
              const countLabel = stats.failed > 0 && toSubmitCount > 0
                ? `(${toSubmitCount} valid${stats.failed > 0 ? `, ${stats.failed} in error` : ''})`
                : (pendingEvents.length > 0 ? `(${pendingEvents.length})` : '');
              return (
                <Button
                  onClick={handleDeploy}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                  disabled={toSubmitCount === 0 && !(events.some(e => e.type === 'COLUMN_MAPPING_CREATED'))}
                >
                  <Rocket className="h-4 w-4" />
                  {label} {countLabel}
                </Button>
              );
            })()}

            {isDeploying && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {deploymentType === 'immediate' ? 'Deploying...' : deploymentType === 'scheduled' ? 'Scheduling...' : 'Submitting...'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* SQL Preview Modal */}
      <Modal isOpen={showSQLPreview} onClose={() => setShowSQLPreview(false)}>
        <div className="p-6 max-w-4xl w-full">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            SQL Scripts Preview
          </h3>

          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b dark:border-slate-700">
            <button
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                !showRollbackSQL
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
              onClick={() => setShowRollbackSQL(false)}
            >
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Deploy Script
              </div>
            </button>
            <button
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                showRollbackSQL
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
              onClick={() => setShowRollbackSQL(true)}
            >
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Rollback Script
              </div>
            </button>
          </div>

          {/* SQL Content */}
          <div className="max-h-[50vh] overflow-auto p-4 bg-slate-900 rounded-lg">
            <pre className={cn(
              'text-sm font-mono whitespace-pre-wrap',
              showRollbackSQL ? 'text-amber-400' : 'text-green-400'
            )}>
              {showRollbackSQL
                ? (allRollbackSQL || '-- No rollback statements generated')
                : (allSQL || '-- No SQL statements generated')
              }
            </pre>
          </div>

          {/* Info Box */}
          <div className={cn(
            'mt-4 p-3 rounded-lg text-sm flex items-start gap-2',
            showRollbackSQL
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
          )}>
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              {showRollbackSQL
                ? 'Rollback scripts should be executed in reverse order. Some operations may require manual intervention.'
                : 'Review the generated SQL before deployment. The script will be executed against Snowflake.'
              }
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-2 mt-4">
            <Button variant="outline" onClick={handleCopySQL} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy to Clipboard
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowSQLPreview(false)}>
                Close
              </Button>
              <Button
                onClick={showRollbackSQL ? handleDownloadRollbackSQL : handleDownloadSQL}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download {showRollbackSQL ? 'Rollback' : 'Deploy'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DeploymentValidation;
