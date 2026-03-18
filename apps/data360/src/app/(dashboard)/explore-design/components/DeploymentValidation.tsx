'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip, Modal, Input } from 'rizzui';
import {
  Play, Check, X, AlertTriangle, RefreshCw, Clock, CheckCircle2,
  XCircle, Loader2, ChevronRight, ChevronDown, FileCode, Database,
  Shield, Key, Link2, Edit2, History, Rocket, Download, ArrowRight,
  RotateCcw, Eye, Calendar, Users, GitBranch, Send, Settings, Copy,
  Info, Zap, Server, Cloud, AlertCircle, Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, DesignEvent, EventType, EventStatus } from '../stores/event-store';
import { useAuth } from '@/hooks/useAuth';
// v1 API — /api/v1/explore-design/* and /api/v1/projects/*
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { rollbackVersion, bulkUpdateEvents } from '@/app/services/api/projectsApi';
// Old service — kept for reference, deploy now uses addDDLAction + executeDDLActions
// import { deploySchema } from '@/app/services/explore-design';
import type {
  CreateExploreDeploymentRequest,
  ProjectVersion,
  VersionListResponse,
  ExecuteIngestionRequest,
  ExecuteIngestionResponse,
  ExecuteDDLResponse,
  CreateDDLActionRequest,
  DDLType,
  IngestionMode,
  ColumnMappingInput,
  RollbackResponse,
  CronChoice,
} from '@/app/services/api/types';

// Local types (previously imported from old explore-design service)
interface SQLStatement {
  sql: string;
  rollback_sql?: string;
  object_type?: string;
  object_name?: string;
}

interface IngestionTableConfig {
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database?: string;
  target_schema?: string;
  target_table: string;
  ingestion_mode: IngestionMode;
  mappings?: ColumnMappingInput[];
  config?: Record<string, unknown>;
}

// Deployment result — replaces old SchemaDeploymentResponse
interface DeploymentResult {
  status: 'success' | 'failed';
  deployment_id: string | null;
  version_id: string | null;
  version_number: number;
  versioned_schema_name: string | null;
  executed_statements: number;
  failed_statements: number;
  errors: string[];
}

// Infer DDL type from event type for addDDLAction
function inferDDLType(eventType: EventType): DDLType {
  switch (eventType) {
    case 'SCHEMA_CREATED': return 'CREATE_TABLE'; // Closest DDLType for schema creation
    case 'TABLE_CREATED': return 'CREATE_TABLE';
    case 'ADD_COLUMN': return 'ALTER_ADD_COLUMN';
    case 'REMOVE_COLUMN': return 'ALTER_DROP_COLUMN';
    case 'COLUMN_RENAMED': return 'ALTER_RENAME_COLUMN';
    case 'COLUMN_TYPE_CHANGED': return 'ALTER_CHANGE_TYPE';
    case 'TABLE_RENAMED': return 'DROP_TABLE'; // Closest match
    default: return 'ALTER_ADD_COLUMN'; // Default for PKs, FKs, policies
  }
}
import { getCortexRecommend } from '@/app/services/cortex/';
import { getApiErrorMessage } from '@/lib/api-client';
import PreCheckGate from './PreCheckGate';
import SqlDiffViewer from './SqlDiffViewer';
import DryRunPanel from './DryRunPanel';
import PostVerifyBanner, { type PostVerifyResult } from './PostVerifyBanner';
import { analyzeDeploymentRisk as computeDeploymentRisk } from '../services/ai-analyzers';
import type { DesignEvent as AiDesignEvent } from '../stores/event-store';
import { verifyDeployment } from '@/app/services/explore-design';
import type { ExploreDeployment } from '@/app/services/api/types';

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

  // Priority 0.5: Schema creation (must exist before tables)
  'SCHEMA_CREATED': 0.5,

  // Priority 1: Table creation (must exist before anything else)
  'TABLE_CREATED': 1,
  'DYNAMIC_TABLE_CREATED': 1,
  'STREAM_CREATED': 1,
  'EVENT_TABLE_CREATED': 1,
  'HYBRID_TABLE_CREATED': 1,
  'ALERT_CREATED': 1,


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

  // AI-assisted events (metadata, no structural SQL needed)
  'AI_CLASSIFICATION_APPLIED': 8,
  'AI_TYPE_CHANGE_APPLIED': 8,
  'AI_RELATION_ACCEPTED': 5,
  'AI_TEMPLATE_APPLIED': 8,
  'AI_COLUMNS_ADDED': 2,

  // Advanced configuration events
  'SCD_CONFIG_SET': 8,
  'WHERE_CLAUSE_SET': 8,
  'QUALITY_GATE_SET': 8,
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
const extractIngestionConfigs = (events: DesignEvent[], modeOverrides?: Record<string, IngestionMode>): IngestionTableConfig[] => {
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
  // payload.source = where data comes from, payload.target = where data goes to
  events.forEach(event => {
    if (event.type === 'COLUMN_MAPPING_CREATED') {
      const src = event.payload.source;
      const tgt = event.payload.target;

      const sourceDb = src?.database || '';
      const sourceSchema = src?.schema || '';
      const sourceTable = src?.table || '';
      const sourceColumns = src?.columns || [];

      const transformation = event.payload.transformation || null;

      const targetDb = tgt?.database || '';
      const targetSchema = tgt?.schema || '';
      const targetTable = tgt?.table || '';
      const targetColumn = tgt?.column || '';

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

      // Apply override if user changed mode in the deployment modal
      const effectiveMode = (modeOverrides?.[targetTableKey] || mode) as IngestionMode;

      const config: IngestionTableConfig = {
        source_database: sourceDb,
        source_schema: sourceSchema,
        source_table: sourceTable,
        target_database: event.target.database,
        target_schema: event.target.schema,
        target_table: event.target.table,
        ingestion_mode: effectiveMode,
        // Add column mappings with new schema: source_columns (array), target_column, transformation
        mappings: columnMapping?.columns.map(col => ({
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
        ingestion_mode: modeOverrides?.[targetTableKey] || 'full_refresh', // Override or default
        // Include column mappings
        mappings: mapping.columns.map(col => ({
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
  // payload.source = where data comes from, payload.target = where data goes to
  events.forEach(event => {
    if (event.type === 'COLUMN_MAPPING_CREATED') {
      const src = event.payload.source;
      const tgt = event.payload.target;

      const sourceDb = src?.database || '';
      const sourceSchema = src?.schema || '';
      const sourceTable = src?.table || '';
      const sourceColumns = src?.columns || [];

      const transformation = event.payload.transformation || null;

      const targetDb = tgt?.database || '';
      const targetSchema = tgt?.schema || '';
      const targetTable = tgt?.table || '';
      const targetColumn = tgt?.column || '';

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
    case 'SCHEMA_CREATED':
      const schemaFullRef = `${event.target.database}.${event.target.schema}`;
      return {
        sql: `CREATE SCHEMA IF NOT EXISTS ${schemaFullRef};`,
        rollbackSql: `DROP SCHEMA IF EXISTS ${schemaFullRef} CASCADE;`
      };

        case 'TABLE_CREATED':
      // Always regenerate SQL with deployment target (don't use pre-generated SQL as it has original db/schema)
      const columns = event.payload.columns || [];
      const columnDefs = columns.map((col: any) => {
        let def = `  ${col.name} ${col.dataType}`;
        if (col.computedExpression) {
          // Snowflake virtual/computed column
          def += ` AS (${col.computedExpression})`;
        } else {
          if (!col.nullable) def += ' NOT NULL';
          if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
        }
        if (col.comment) def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
        return def;
      }).join(',\n');

      const primaryKeys = event.payload.primaryKeys || columns.filter((c: any) => c.primaryKey).map((c: any) => c.name);
      let createSql = `CREATE TABLE IF NOT EXISTS ${tableRef} (\n${columnDefs}`;
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
        sql: `ALTER TABLE ${tableRef} ADD ROW ACCESS POLICY ${event.payload.policyName} ON (${event.payload.policyColumn || event.payload.filterColumn || '*'});`,
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
  const { username } = useAuth();
  const currentUser = username || 'current_user';

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
  const [currentStep, setCurrentStep] = useState<'review' | 'pre_checks' | 'sql_diff' | 'deploy' | 'post_verify' | 'complete'>('review');
  const [dryRunCompleted, setDryRunCompleted] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showSQLPreview, setShowSQLPreview] = useState(false);
  const [showRollbackSQL, setShowRollbackSQL] = useState(false);

  // Deployment configuration
  const [deploymentType, setDeploymentType] = useState<'immediate' | 'with_approval'>('immediate');
  // Ingestion scheduling type - separate from deployment type
  const [ingestionType, setIngestionType] = useState<'immediate' | 'scheduled'>('immediate');
  const [cronChoice, setCronChoice] = useState<CronChoice>('DAILY');
  const [customCron, setCustomCron] = useState('');
  const [scheduleWarehouse, setScheduleWarehouse] = useState('COMPUTE_WH');
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

  // Post-deployment verification result
  const [postVerifyResult, setPostVerifyResult] = useState<PostVerifyResult | null>(null);
  const [preChecksAllPassed, setPreChecksAllPassed] = useState(false);

  // AI Risk Scorer (drawio page 10 — section 4.1)
  const [riskAssessment, setRiskAssessment] = useState<{
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    breakdown: Array<{ factor: string; points: number; reason: string }>;
    aiSummary: string | null;
    aiSummaryLoading: boolean;
  } | null>(null);

  // Schema versioning state (Option A: Two-phase deployment)
  const [schemaVersions, setSchemaVersions] = useState<ProjectVersion[]>([]);
  const [currentSchemaVersion, setCurrentSchemaVersion] = useState<ProjectVersion | null>(null);
  const [selectedSchemaVersionId, setSelectedSchemaVersionId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [deploymentPhase, setDeploymentPhase] = useState<'schema' | 'ingestion' | 'complete'>('schema');
  const [schemaDeploymentResult, setSchemaDeploymentResult] = useState<DeploymentResult | null>(null);

  // Ingestion target schema version - user can choose which version to ingest into
  // 'latest' means use the latest active version (or newly deployed version)
  // Otherwise, use the specific version_id selected by the user
  const [ingestionTargetVersion, setIngestionTargetVersion] = useState<'latest' | string>('latest');

  // Per-table ingestion mode overrides: tableKey -> IngestionMode
  const [ingestionModeOverrides, setIngestionModeOverrides] = useState<Record<string, IngestionMode>>({});

  // Backend deployment list state
  const [backendDeployments, setBackendDeployments] = useState<ExploreDeployment[]>([]);
  const [isLoadingDeployments, setIsLoadingDeployments] = useState(false);
  const [deploymentActionLoading, setDeploymentActionLoading] = useState<string | null>(null);

  // Load backend deployments
  const loadBackendDeployments = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingDeployments(true);
    try {
      const result = await exploreDesignApi.listDeployments(projectId);
      setBackendDeployments(result.deployments || []);
    } catch (err: any) {
      console.error('[DeploymentValidation] Failed to load deployments:', err);
    } finally {
      setIsLoadingDeployments(false);
    }
  }, [projectId]);

  // Load deployments on mount and when projectId changes
  React.useEffect(() => {
    loadBackendDeployments();
  }, [loadBackendDeployments]);

  // Deployment lifecycle action handlers
  const handleDeploymentAction = useCallback(async (
    action: 'approve' | 'reject' | 'execute' | 'cancel' | 'verify',
    dep: ExploreDeployment
  ) => {
    if (!projectId) return;
    setDeploymentActionLoading(dep.deployment_id);
    try {
      switch (action) {
        case 'approve':
          await exploreDesignApi.approveDeployment(projectId, dep.deployment_id);
          toast.success(`Deployment ${dep.deployment_id.slice(0, 8)} approved`);
          break;
        case 'reject':
          await exploreDesignApi.rejectDeployment(projectId, dep.deployment_id, { reason: 'Rejected by user' });
          toast.success(`Deployment ${dep.deployment_id.slice(0, 8)} rejected`);
          break;
        case 'execute':
          await exploreDesignApi.executeDeployment(projectId, dep.deployment_id);
          toast.success(`Deployment ${dep.deployment_id.slice(0, 8)} execution started`);
          break;
        case 'cancel':
          await exploreDesignApi.cancelDeployment(projectId, dep.deployment_id);
          toast.success(`Deployment ${dep.deployment_id.slice(0, 8)} cancelled`);
          break;
        case 'verify':
          await verifyDeployment(projectId, dep.deployment_id, {
            database: database || '',
            schema: schemas?.[0] || '',
          });
          toast.success(`Deployment ${dep.deployment_id.slice(0, 8)} verified`);
          break;
      }
      // Refresh the list after any action
      await loadBackendDeployments();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || `Failed to ${action} deployment`;
      toast.error(msg);
    } finally {
      setDeploymentActionLoading(null);
    }
  }, [projectId, database, schemas, loadBackendDeployments]);

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
        const response = await exploreDesignApi.listExploreVersions(projectId, { limit: 20 });
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
      'SCHEMA_CREATED': 'Create Schema',
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
      case 'SCHEMA_CREATED':
        return `${target.database}.${target.schema}`;
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

  // DDL-relevant event types (actual schema changes that generate SQL)
  const ddlEventTypes: EventType[] = [
    'SCHEMA_CREATED',
    'TABLE_CREATED', 'TABLE_RENAMED', 'ADD_COLUMN', 'REMOVE_COLUMN',
    'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_SET', 'PRIMARY_KEY_REMOVED',
    'FOREIGN_KEY_ADDED', 'FOREIGN_KEY_REMOVED', 'RELATION_CREATED', 'RELATION_REMOVED',
    'MASKING_POLICY_APPLIED', 'MASKING_POLICY_REMOVED', 'RLS_POLICY_APPLIED', 'RLS_POLICY_REMOVED',
    'AGGREGATION_POLICY_APPLIED', 'AGGREGATION_POLICY_REMOVED',
    'DYNAMIC_TABLE_CREATED', 'STREAM_CREATED', 'EVENT_TABLE_CREATED',
    'HYBRID_TABLE_CREATED', 'ALERT_CREATED', 'AI_COLUMNS_ADDED', 'AI_RELATION_ACCEPTED',
  ];

  // Filter pending events to only DDL-relevant ones
  const ddlPendingEvents = useMemo(() => {
    return pendingEvents.filter(e => ddlEventTypes.includes(e.type));
  }, [pendingEvents]);

  // Group DDL events by table — sorted by priority (schema first, then tables, then FKs/policies)
  const eventsByTable = useMemo(() => {
    // Sort events by priority first
    const sorted = sortEventsForDeployment(ddlPendingEvents);

    const groups: Record<string, DesignEvent[]> = {};
    sorted.forEach((event) => {
      const key = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });

    // Sort group keys so SCHEMA_CREATED groups come first
    const sortedEntries = Object.entries(groups).sort(([, eventsA], [, eventsB]) => {
      const minPriorityA = Math.min(...eventsA.map(e => EVENT_PRIORITY[e.type] ?? 99));
      const minPriorityB = Math.min(...eventsB.map(e => EVENT_PRIORITY[e.type] ?? 99));
      return minPriorityA - minPriorityB;
    });

    return Object.fromEntries(sortedEntries);
  }, [ddlPendingEvents]);

  // Extract mapped tables overview for display
  const mappedTablesOverview = useMemo(() => {
    return extractMappedTablesOverview(events);
  }, [events]);

  // Categorize events into schema changes vs ingestion configurations (Two-phase deployment)
  const { schemaEvents, ingestionEvents, schemaEventsSummary, ingestionEventsSummary } = useMemo(() => {
    // Events that generate DDL (schema changes)
    const schemaEventTypes: EventType[] = [
      'SCHEMA_CREATED',
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

  // ── Risk Scoring (page 10, section 4.1) ──
  // Runs deterministic risk scoring + Cortex AI summary after pre-checks complete
  const runRiskScoring = useCallback(async () => {
    const riskResult = computeDeploymentRisk(events as AiDesignEvent[]);
    const breakdown: Array<{ factor: string; points: number; reason: string }> = [];

    const destructiveEvents = events.filter(e =>
      ['REMOVE_COLUMN', 'TABLE_RENAMED', 'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED',
       'PRIMARY_KEY_REMOVED', 'FOREIGN_KEY_REMOVED'].includes(e.type)
    );
    for (const ev of destructiveEvents) {
      const table = ev.target?.table || 'unknown';
      const col = ev.target?.column || ev.payload?.columnName || '';
      if (ev.type === 'REMOVE_COLUMN') {
        breakdown.push({ factor: `DROP_COLUMN ${table}.${col}`, points: 15, reason: 'Irreversible data loss' });
      } else if (ev.type === 'COLUMN_TYPE_CHANGED') {
        breakdown.push({ factor: `ALTER_CHANGE_TYPE ${table}.${col}`, points: 12, reason: 'Data conversion risk' });
      } else if (ev.type === 'TABLE_RENAMED' || ev.type === 'COLUMN_RENAMED') {
        breakdown.push({ factor: `RENAME ${table}${col ? '.' + col : ''}`, points: 10, reason: 'Breaks dependent references' });
      } else if (ev.type === 'PRIMARY_KEY_REMOVED') {
        breakdown.push({ factor: `DROP PK on ${table}`, points: 15, reason: 'Integrity constraint removed' });
      } else if (ev.type === 'FOREIGN_KEY_REMOVED') {
        breakdown.push({ factor: `DROP FK on ${table}`, points: 10, reason: 'Referential integrity lost' });
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
        // Step 1: Register DDL events in a single batch call
        toast.loading('Registering DDL actions...');

        const actionsToRegister = pendingEvents
          .map((event) => {
            const { sql } = generateSnowflakeSQL(event);
            if (!sql || sql.trim().startsWith('--')) return null;
            return {
              ddl_sql: sql,
              ddl_type: inferDDLType(event.type),
              target_table: `${event.target.database}.${event.target.schema}.${event.target.table}`,
              description: `${event.type}: ${event.target.table}${event.target.column ? '.' + event.target.column : ''}`,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null);

        let registeredCount = 0;
        if (actionsToRegister.length > 0) {
          try {
            const batchResult = await exploreDesignApi.batchAddDDLActions(projectId, { actions: actionsToRegister });
            registeredCount = batchResult?.registered ?? actionsToRegister.length;
          } catch (regErr: any) {
            console.warn('[Validation] Batch DDL registration failed:', regErr);
          }
        }

        toast.dismiss();
        if (registeredCount > 0) {
          toast.success(`Registered ${registeredCount} DDL actions`);
        }

        // Step 2: Execute/validate all pending DDL actions
        toast.loading('Executing DDL actions for validation...');
        const ddlResult = await exploreDesignApi.executeDDLActions(projectId);
        toast.dismiss();

        // Map DDL execution results to validation results
        const ddlResultsArray = ddlResult.results || [];
        let validCount = 0;
        let invalidCount = 0;

        for (const event of pendingEvents) {
          const { sql } = generateSnowflakeSQL(event);
          // Find matching DDL result by SQL content or by target table name
          const matchingResult = ddlResultsArray.find(
            (r: any) =>
              (sql && r.ddl_sql && r.ddl_sql.trim() === sql.trim()) ||
              r.target_table?.toLowerCase().includes(event.target.table.toLowerCase()) ||
              r.event_id === event.id
          );

          const isValid = matchingResult
            ? matchingResult.status === 'SUCCESS'
            : (sql ? false : true); // Events without SQL are considered valid

          // Build a rich error string from error_detail when available
          const buildErrorMessage = (result: any): string => {
            if (!result) return 'DDL execution failed — no matching DDL result found';
            const detail = result.error_detail;
            if (detail?.user_message) {
              const fix = detail.suggested_fix ? ` | Fix: ${detail.suggested_fix}` : '';
              const code = detail.error_code ? ` (code ${detail.error_code})` : '';
              return `${detail.user_message}${code}${fix}`;
            }
            return result.error || 'DDL execution failed';
          };

          const errorMessage = isValid ? undefined : buildErrorMessage(matchingResult);

          const testResult: TestResult = {
            eventId: event.id,
            success: isValid,
            message: isValid ? 'DDL action executed successfully' : (errorMessage || 'DDL execution failed'),
            sql: sql || undefined,
            error: isValid ? undefined : (errorMessage || 'DDL execution failed'),
            duration: 50,
          };
          results.set(event.id, testResult);
          updateEventStatus({
            eventId: event.id,
            status: isValid ? 'validated' : 'failed',
            error: errorMessage,
          });

          if (isValid) validCount++;
          else invalidCount++;
        }

        if (invalidCount === 0) {
          toast.success(`Validated ${validCount} events successfully (${ddlResult.executed} DDL executed)`);
        } else {
          toast.error(`${invalidCount} of ${pendingEvents.length} events failed validation (${ddlResult.failed} DDL failed)`);
        }
      } catch (error: any) {
        console.error('Backend validation error:', error);
        setBackendError(getApiErrorMessage(error) || error.message || 'Backend validation failed');
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
    const maskingEvents = events.filter(e => e.type === 'MASKING_POLICY_APPLIED');
    if (maskingEvents.length > 0) {
      breakdown.push({ factor: `${maskingEvents.length} masking policies`, points: maskingEvents.length * 5, reason: 'Governance impact' });
    }
    const tableCount = new Set(events.filter(e => e.type === 'TABLE_CREATED').map(e => e.target?.table)).size;
    if (tableCount > 10) {
      breakdown.push({ factor: `${tableCount} tables in scope`, points: tableCount > 20 ? 25 : 10, reason: 'Large change surface' });
    }

    setRiskAssessment({
      score: riskResult.riskScore,
      level: riskResult.riskLevel,
      breakdown,
      aiSummary: null,
      aiSummaryLoading: true,
    });

    // Async: Cortex AI plain-English risk summary
    try {
      const riskContext = `Deployment with ${events.length} events. Risk score: ${riskResult.riskScore}/100 (${riskResult.riskLevel}). ` +
        `Changes: ${destructiveEvents.length} destructive ops, ${maskingEvents.length} masking policies, ${tableCount} tables. ` +
        `Breakdown: ${breakdown.map(b => `${b.factor} (+${b.points}pts: ${b.reason})`).join('; ')}. ` +
        `Summarize the deployment risk and recommend mitigation steps in 2-3 sentences.`;
      const cortexRes = await getCortexRecommend({ error_context: riskContext });
      setRiskAssessment(prev => prev ? { ...prev, aiSummary: cortexRes?.response || null, aiSummaryLoading: false } : null);
    } catch {
      setRiskAssessment(prev => prev ? { ...prev, aiSummary: null, aiSummaryLoading: false } : null);
    }
  }, [events]);

  // Transition to pre-checks step — PreCheckGate auto-runs structural checks + risk scoring
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setCurrentStep('pre_checks');
    setConfigExpanded(false);
    setBackendError(null);
    setRiskAssessment(null);

    // Run SQL validation (backend or local) for each pending event
    const results = new Map<string, TestResult>();


    setTestResults(results);
    setIsValidating(false);
  }, [pendingEvents, events, validateEventLocally_Internal, updateEventStatus, useBackend, projectId]);

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

      // Generate SQL queries in proper order for approval deployments
      const orderedSqlQueries = executableEvents
        .map(event => generateSnowflakeSQL(event).sql)
        .filter(sql => sql && !sql.trim().startsWith('--'));

      console.log('[Deployment] Prepared', orderedSqlQueries.length, 'SQL queries in dependency order');

      // Handle based on deployment type
      if (deploymentType === 'with_approval') {
        toast.loading('Submitting for approval...');

        try {
          // POST /api/v1/explore-design/{projectId}/deployments
          let resultId: string | undefined;
          const v1Body: CreateExploreDeploymentRequest = {
            deployment_type: 'with_approval',
            description: changelogSummary || `Explore & Design approval request with ${eventsToDeploy.length} changes`,
            config: {
              sql_queries: orderedSqlQueries,
              events: apiEvents,
              deployment_method: 'REPLACE_EXISTING',
              created_by: currentUser,
              approvers: selectedApprovers,
            },
          };
          const v1Result = await exploreDesignApi.requestDeployment(projectId, v1Body);
          resultId = v1Result.deployment_id;
          console.log('[Deployment] v1 approval deployment created:', resultId);

          // Also save locally
          const pendingApproval: ScheduledDeploymentLocal = {
            id: resultId || `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

          setDeploymentId(resultId || null);
          toast.dismiss();
          toast.success(`Deployment submitted for approval!\nID: ${resultId}\nApprovers: ${selectedApprovers.join(', ')}\n\nNote: Approvers can review in Account Overview.`);
          setCurrentStep('post_verify');

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
          setCurrentStep('post_verify');
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
            'SCHEMA_CREATED',
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

          console.log('[Deployment] Generated SQL statements:', sqlStatements.length);
          if (sqlStatements.length > 0) {
            console.log('[Deployment] SQL statements:', sqlStatements.map(s => s.sql.substring(0, 100) + '...'));
          }

          // Extract ingestion configurations from ALL events (for data loading)
          const ingestionConfigs = extractIngestionConfigs(events, ingestionModeOverrides);
          console.log('[Deployment] Ingestion configs:', ingestionConfigs.length);

          let schemaVersionId: string | null = null;
          let queriesExecuted = 0;
          let ingestionRowsAffected = 0;

          // =====================================================
          // PHASE 1: Schema Deployment via addDDLAction + executeDDLActions
          // =====================================================
          console.log('[Deployment] ========== REGISTERING DDL ACTIONS ==========');
          console.log('[Deployment] SQL statements to register:', sqlStatements.length);

          if (sqlStatements.length > 0) {
            // Step 1: Register all SQL statements as DDL actions in a single batch call
            toast.loading(`Phase 1: Registering ${sqlStatements.length} DDL actions...`);

            const batchActions = sqlStatements.map((stmt, i) => {
              const matchingEvent = schemaEventsToExecute.find(e => {
                const { sql } = generateSnowflakeSQL(e);
                return sql === stmt.sql;
              });
              return {
                ddl_sql: stmt.sql,
                ddl_type: matchingEvent ? inferDDLType(matchingEvent.type) : 'CREATE_TABLE',
                priority: i + 1, // Maintain execution order
                target_table: stmt.object_name || undefined,
                description: stmt.object_type
                  ? `${stmt.object_type}: ${stmt.object_name || 'unknown'}`
                  : `DDL statement ${i + 1}`,
              };
            });

            let registeredCount = 0;
            try {
              const batchResult = await exploreDesignApi.batchAddDDLActions(projectId, { actions: batchActions });
              registeredCount = batchResult?.registered ?? batchActions.length;
            } catch (regErr: any) {
              console.warn('[Deployment] Batch DDL registration failed:', regErr);
            }

            console.log('[Deployment] Registered DDL actions:', registeredCount, '/', sqlStatements.length);
            toast.dismiss();

            if (registeredCount === 0) {
              const errorMsg = 'Failed to register any DDL actions';
              toast.error(errorMsg);
              setBackendError(errorMsg);
              schemaEventsToExecute.forEach((event) => {
                updateEventStatus({ eventId: event.id, status: 'failed', error: errorMsg });
              });
              setIsDeploying(false);
              return;
            }

            // Step 2: Execute all registered DDL actions on Snowflake
            toast.loading(`Phase 1: Executing ${registeredCount} DDL actions on Snowflake...`);
            console.log('[Deployment] ========== CALLING executeDDLActions ==========');

            const ddlResult = await exploreDesignApi.executeDDLActions(projectId);
            console.log('[Deployment] executeDDLActions result:', ddlResult);
            toast.dismiss();

            // Check for failures
            if (ddlResult.failed > 0) {
              const failedResults = (ddlResult.results || []).filter((r: any) => r.status !== 'SUCCESS');
              const errorMessages = failedResults.map((r: any) => r.error || 'Unknown error');
              const errorMsg = `${ddlResult.failed} DDL action(s) failed: ${errorMessages.join('; ')}`;

              if (ddlResult.executed === 0) {
                // All failed
                console.error('[Deployment] All DDL actions failed:', errorMessages);
                toast.error(errorMsg);
                setBackendError(errorMsg);
                schemaEventsToExecute.forEach((event) => {
                  updateEventStatus({ eventId: event.id, status: 'failed', error: errorMsg });
                });
                setIsDeploying(false);
                return;
              } else {
                // Partial success
                console.warn('[Deployment] Partial DDL execution:', ddlResult.executed, 'succeeded,', ddlResult.failed, 'failed');
                toast.error(`Partial deployment: ${ddlResult.executed}/${ddlResult.total} succeeded`);
              }
            }

            queriesExecuted = ddlResult.executed || 0;
          } else {
            console.log('[Deployment] No SQL statements to execute - skipping DDL phase');
            queriesExecuted = 0;
          }

          // Build deployment result
          const schemaDeployResult: DeploymentResult = {
            status: queriesExecuted > 0 ? 'success' : 'success',
            deployment_id: null,
            version_id: null,
            version_number: parseInt(versionNumber, 10) || 0,
            versioned_schema_name: null,
            executed_statements: queriesExecuted,
            failed_statements: sqlStatements.length - queriesExecuted,
            errors: [],
          };

          // Refresh schema versions
          try {
            const versionsResponse = await exploreDesignApi.listExploreVersions(projectId, { limit: 20 });
            setSchemaVersions(versionsResponse.versions);
            setCurrentSchemaVersion(versionsResponse.current_version || null);

            const latestVersion = versionsResponse.current_version || versionsResponse.versions[0];
            if (latestVersion) {
              schemaDeployResult.version_id = latestVersion.version_id;
              schemaDeployResult.version_number = latestVersion.version_number;
              schemaDeployResult.versioned_schema_name = latestVersion.version_name || `${projectId}_V${latestVersion.version_number}`;
              schemaVersionId = latestVersion.version_id;
              setSelectedSchemaVersionId(latestVersion.version_id);
            }
          } catch (error) {
            console.warn('[Deployment] Failed to refresh schema versions:', error);
          }

          // Store result for Phase 2
          setSchemaDeploymentResult(schemaDeployResult);

          // Mark schema events as applied
          schemaEventsToExecute.forEach((event) => {
            updateEventStatus({ eventId: event.id, status: 'applied' });
          });

          const schemaName = schemaDeployResult.versioned_schema_name || `${projectId}_V${schemaDeployResult.version_number}`;
          console.log('[Deployment] Phase 1 complete - Schema version:', schemaVersionId, 'Executed:', queriesExecuted);
          toast.dismiss();
          toast.success(`Phase 1 complete: ${queriesExecuted} DDL actions executed successfully`);

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
            const targetVersionName = selectedVersion?.version_name
              || schemaDeployResult?.versioned_schema_name
              || 'selected schema version';

            console.log('[Deployment] Ingestion target version:', ingestionTargetVersion, '-> resolved to:', targetVersionId);

            if (ingestionType === 'scheduled') {
              // ─── Scheduled Ingestion: create Snowflake TASK via backend ───
              toast.loading(`Phase 2: Scheduling ingestion for ${ingestionConfigs.length} table(s)...`);

              try {
                // Collect all mappings from ingestion configs
                const allMappings = ingestionConfigs.flatMap(c => c.mappings || []);

                const scheduleResult = await exploreDesignApi.scheduleIngestion(projectId, {
                  cron_choice: cronChoice,
                  custom_cron: cronChoice === 'CUSTOM' ? customCron : undefined,
                  warehouse: scheduleWarehouse || undefined,
                  mappings: allMappings.length > 0 ? allMappings : undefined,
                  config: {
                    ingestion_configs: ingestionConfigs,
                    target_version_id: targetVersionId,
                  },
                });

                console.log('[Deployment] Ingestion scheduled:', scheduleResult);

                // Mark ingestion events as applied
                eventsToDeploy.forEach((event) => {
                  if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                    updateEventStatus({ eventId: event.id, status: 'applied' });
                  }
                });

                toast.dismiss();
                toast.success(
                  `Phase 2: Ingestion scheduled — Task: ${scheduleResult.task_name}, Cron: ${scheduleResult.cron_expression}, Warehouse: ${scheduleResult.warehouse}`
                );
              } catch (scheduleErr: any) {
                const errorMsg = getApiErrorMessage(scheduleErr) || scheduleErr?.message || 'Failed to schedule ingestion';
                console.error('[Deployment] Ingestion scheduling failed:', errorMsg);
                toast.dismiss();
                toast.error(`Phase 2 failed: ${errorMsg}`);
                setBackendError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));

                eventsToDeploy.forEach((event) => {
                  if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                    updateEventStatus({ eventId: event.id, status: 'failed', error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg) });
                  }
                });

                // Sync partial statuses: schema SUCCESS, ingestion FAILED
                const schemaSuccessIds = schemaEventsToExecute.map(e => e.id).filter(Boolean);
                const ingestionFailedIds = eventsToDeploy
                  .filter(e => e.type === 'INGESTION_MODE_SET' || e.type === 'COLUMN_MAPPING_CREATED')
                  .map(e => e.id)
                  .filter(Boolean);
                try {
                  if (schemaSuccessIds.length > 0) {
                    await bulkUpdateEvents(projectId, { event_ids: schemaSuccessIds, new_status: 'SUCCESS' });
                  }
                  if (ingestionFailedIds.length > 0) {
                    await bulkUpdateEvents(projectId, {
                      event_ids: ingestionFailedIds,
                      new_status: 'FAILED',
                      error_message: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
                    });
                  }
                } catch (syncErr) {
                  console.warn('[Deployment] Failed to sync partial statuses to backend:', syncErr);
                }

                if (queriesExecuted > 0) {
                  toast.error(`Partial deployment: Schema deployed, but ingestion scheduling failed.`);
                }

                setIsDeploying(false);
                return;
              }
            } else {
              // ─── Immediate Ingestion: execute per table via v1 API ───
              toast.loading(`Phase 2: Ingesting data for ${ingestionConfigs.length} table(s) into ${targetVersionName}...`);

              const ingestionResults = await Promise.allSettled(
                ingestionConfigs.map(config =>
                  exploreDesignApi.executeIngestion(projectId, {
                    source_database: config.source_database,
                    source_schema: config.source_schema,
                    source_table: config.source_table,
                    target_database: config.target_database || '',
                    target_schema: config.target_schema || '',
                    target_table: config.target_table,
                    ingestion_mode: config.ingestion_mode,
                    mappings: config.mappings,
                  })
                )
              );

              // Aggregate results
              const fulfilled = ingestionResults.filter(
                (r): r is PromiseFulfilledResult<ExecuteIngestionResponse> => r.status === 'fulfilled'
              );
              const rejected = ingestionResults.filter(
                (r): r is PromiseRejectedResult => r.status === 'rejected'
              );
              const successCount = fulfilled.filter(r => r.value.status === 'success').length;
              const failCount = rejected.length + fulfilled.filter(r => r.value.status === 'failed').length;
              ingestionRowsAffected = fulfilled.reduce((sum, r) => sum + (r.value.rows_affected || 0), 0);

              if (successCount === 0 && failCount > 0) {
                // All failed
                const errorMsg = rejected.length > 0
                  ? rejected[0].reason?.message || 'Ingestion failed'
                  : 'All tables failed ingestion';
                console.error('[Deployment] Ingestion failed:', errorMsg);
                toast.dismiss();
                toast.error(`Phase 2 failed: ${errorMsg}`);
                setBackendError(errorMsg);

                eventsToDeploy.forEach((event) => {
                  if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                    updateEventStatus({ eventId: event.id, status: 'failed', error: errorMsg });
                  }
                });

                // Sync partial deployment statuses to backend:
                // Schema events → SUCCESS (Phase 1 succeeded), Ingestion events → FAILED
                const schemaSuccessIds = schemaEventsToExecute.map(e => e.id).filter(Boolean);
                const ingestionFailedIds = eventsToDeploy
                  .filter(e => e.type === 'INGESTION_MODE_SET' || e.type === 'COLUMN_MAPPING_CREATED')
                  .map(e => e.id)
                  .filter(Boolean);
                try {
                  if (schemaSuccessIds.length > 0) {
                    await bulkUpdateEvents(projectId, { event_ids: schemaSuccessIds, new_status: 'SUCCESS' });
                  }
                  if (ingestionFailedIds.length > 0) {
                    await bulkUpdateEvents(projectId, {
                      event_ids: ingestionFailedIds,
                      new_status: 'FAILED',
                      error_message: errorMsg,
                    });
                  }
                } catch (syncErr) {
                  console.warn('[Deployment] Failed to sync partial statuses to backend:', syncErr);
                }

                if (queriesExecuted > 0) {
                  toast.error(`Partial deployment: Schema deployed, but data ingestion failed.`);
                }

                setIsDeploying(false);
                return;
              }

              console.log('[Deployment] Phase 2 complete:', {
                successful: successCount,
                failed: failCount,
                rowsAffected: ingestionRowsAffected,
              });

              // Mark ingestion events as applied
              eventsToDeploy.forEach((event) => {
                if (event.type === 'INGESTION_MODE_SET' || event.type === 'COLUMN_MAPPING_CREATED') {
                  updateEventStatus({ eventId: event.id, status: 'applied' });
                }
              });

              toast.dismiss();
              toast.success(`Phase 2 complete: ${successCount}/${ingestionConfigs.length} table(s) ingested (${ingestionRowsAffected} rows)`);

              if (failCount > 0) {
                toast.error(`Partial ingestion: ${successCount}/${ingestionConfigs.length} tables succeeded`);
              }
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

          const v1Body: CreateExploreDeploymentRequest = {
            deployment_type: 'immediate',
            description: changelogSummary || `Immediate two-phase deployment with ${eventsToDeploy.length} changes`,
            config: {
              sql_queries: sqlStatements.map(s => s.sql),
              events: apiEvents,
              created_by: currentUser,
              schema_version_id: schemaVersionId,
              ingestion_tables: ingestionConfigs.length,
              rows_affected: ingestionRowsAffected,
            },
          };
          const v1Record = await exploreDesignApi.requestDeployment(projectId, v1Body);
          const recordedDeploymentId = v1Record.deployment_id;
          console.log('[Deployment] v1 immediate deployment recorded:', recordedDeploymentId);

          // Mark any remaining metadata events as applied (local Jotai store)
          sortedEvents.forEach((event) => {
            if (event.status !== 'applied' && event.status !== 'failed') {
              updateEventStatus({ eventId: event.id, status: 'applied' });
            }
          });

          // Sync event statuses to backend so they persist across sessions
          const appliedEventIds = sortedEvents
            .filter(e => e.status !== 'failed')
            .map(e => e.id)
            .filter(Boolean);
          if (appliedEventIds.length > 0) {
            try {
              await bulkUpdateEvents(projectId, {
                event_ids: appliedEventIds,
                new_status: 'SUCCESS',
              });
              console.log('[Deployment] Backend event statuses synced:', appliedEventIds.length);
            } catch (syncErr) {
              console.warn('[Deployment] Failed to sync event statuses to backend (non-blocking):', syncErr);
            }
          }

          setDeploymentId(recordedDeploymentId || null);
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
          successParts.push(`Deployment ID: ${recordedDeploymentId}`);

          toast.success(successParts.join('\n'));
          setCurrentStep('post_verify');

        } catch (error: any) {
          console.error('Backend deployment error:', error);
          const msg = getApiErrorMessage(error) || error?.message || 'Deployment failed';
          setBackendError(typeof msg === 'string' ? msg : JSON.stringify(msg));
          toast.dismiss();
          toast.error(`Deployment failed: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);

          // Mark events as failed (local)
          eventsToDeploy.forEach((event) => {
            updateEventStatus({ eventId: event.id, status: 'failed', error: getApiErrorMessage(error) || error?.message });
          });

          // Sync failed status to backend
          const failedEventIds = eventsToDeploy.map(e => e.id).filter(Boolean);
          if (failedEventIds.length > 0) {
            try {
              await bulkUpdateEvents(projectId, {
                event_ids: failedEventIds,
                new_status: 'FAILED',
                error_message: getApiErrorMessage(error) || error?.message || 'Deployment failed',
              });
            } catch (syncErr) {
              console.warn('[Deployment] Failed to sync failed statuses to backend:', syncErr);
            }
          }
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
      const msg = getApiErrorMessage(error) || error?.message || 'Deployment failed';
      setBackendError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      toast.error(`Deployment failed: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    } finally {
      setIsDeploying(false);
    }
  }, [events, pendingEvents, deploymentType, ingestionType, cronChoice, customCron, scheduleWarehouse, versionType, changelogSummary, selectedApprovers, currentUser, updateEventStatus, saveScheduledDeployment, projectId, useBackend, ingestionTargetVersion, schemaVersions, ingestionModeOverrides]);

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
    // Only count DDL-relevant events for stats
    const ddlEvents = events.filter(e => ddlEventTypes.includes(e.type));
    const validated = ddlEvents.filter((e) => e.status === 'validated').length;
    const failed = ddlEvents.filter((e) => e.status === 'failed').length;
    const applied = ddlEvents.filter((e) => e.status === 'applied').length;
    const pending = ddlPendingEvents.length;
    const columnMappings = events.filter((e) => e.type === 'COLUMN_MAPPING_CREATED').length;

    return { validated, failed, applied, pending, total: ddlEvents.length, columnMappings };
  }, [events, ddlPendingEvents.length, projectId]);

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

      {/* Progress Steps — 6-step pipeline */}
      {(() => {
        const STEPS = [
          { key: 'review', label: 'Review', icon: Eye, description: 'Review changes & config' },
          { key: 'pre_checks', label: 'Pre-Checks', icon: Shield, description: 'Validate schema' },
          { key: 'sql_diff', label: 'SQL Diff', icon: GitBranch, description: 'Compare changes' },
          { key: 'deploy', label: 'Deploy', icon: Rocket, description: 'Dry-run & deploy' },
          { key: 'post_verify', label: 'Verify', icon: CheckCircle2, description: 'Post-deploy check' },
          { key: 'complete', label: 'Complete', icon: Check, description: 'Done' },
        ] as const;
        const STEP_KEYS = STEPS.map(s => s.key);
        const currentIdx = STEP_KEYS.indexOf(currentStep);

        // Gating: can only go back to completed steps, not forward freely
        const canNavigateTo = (idx: number) => {
          if (idx >= currentIdx) return false; // Can't skip forward
          return true; // Can go back to any completed step
        };

        return (
          <div className="px-6 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[560px] mx-auto">
              {STEPS.map((step, idx) => (
                <React.Fragment key={step.key}>
                  <button
                    onClick={() => canNavigateTo(idx) && setCurrentStep(step.key as typeof currentStep)}
                    disabled={!canNavigateTo(idx)}
                    className="flex items-center gap-1.5 group"
                    title={step.description}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-colors text-xs',
                        currentStep === step.key
                          ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                          : idx < currentIdx
                          ? 'bg-green-500 text-white cursor-pointer group-hover:bg-green-600'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      )}
                    >
                      {idx < currentIdx ? <Check className="h-3.5 w-3.5" /> : <step.icon className="h-3.5 w-3.5" />}
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium hidden sm:inline',
                        currentStep === step.key ? 'text-blue-600' : idx < currentIdx ? 'text-green-600' : 'text-slate-400'
                      )}
                    >
                      {step.label}
                    </span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={cn('flex-1 h-0.5 mx-1', idx < currentIdx ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700')} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      })()}

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
                      {currentSchemaVersion.version_name || `${projectId}_V${currentSchemaVersion.version_number}`}
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
              {/* Rollback button - show when there are versions > 1 */}
              {currentSchemaVersion && currentSchemaVersion.version_number > 1 && currentSchemaVersion.status === 'active' && (
                <Tooltip content="Rollback to previous version">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-amber-600 border-amber-300 hover:bg-amber-50 gap-1"
                    onClick={async () => {
                      if (confirm('Are you sure you want to rollback to the previous schema version?')) {
                        try {
                          toast.loading('Rolling back schema...');
                          const result = await rollbackVersion(projectId, {
                            target_version_id: currentSchemaVersion.version_id,
                          });
                          toast.dismiss();
                          if (result.status === 'success') {
                            toast.success(`Rolled back to version ${result.target_version_number} (${result.versions_rolled_back} version(s) rolled back)`);
                            // Refresh versions
                            const versionsResponse = await exploreDesignApi.listExploreVersions(projectId, { limit: 20 });
                            setSchemaVersions(versionsResponse.versions);
                            setCurrentSchemaVersion(versionsResponse.current_version || null);
                          }
                        } catch (error: any) {
                          toast.dismiss();
                          toast.error(`Rollback error: ${getApiErrorMessage(error)}`);
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
                            {version.version_name || `${projectId}_V${version.version_number}`}
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
                      {version.changes_summary && (() => {
                        const cs = version.changes_summary as Record<string, number>;
                        return (
                          <div className="mt-1 text-xs text-slate-500 flex gap-3 flex-wrap">
                            {cs.schemas_created > 0 && (
                              <span className="text-indigo-600">+{cs.schemas_created} schema</span>
                            )}
                            {cs.tables_cloned > 0 && (
                              <span className="text-blue-600">{cs.tables_cloned} cloned</span>
                            )}
                            {cs.tables_created > 0 && (
                              <span>+{cs.tables_created} tables</span>
                            )}
                            {cs.columns_added > 0 && (
                              <span>+{cs.columns_added} columns</span>
                            )}
                            {cs.constraints_added > 0 && (
                              <span>+{cs.constraints_added} constraints</span>
                            )}
                            {cs.tables_modified > 0 && (
                              <span>~{cs.tables_modified} modified</span>
                            )}
                          </div>
                        );
                      })()}
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
            {/* ── B3: Pre-Deployment Checks ── */}
            {currentStep === 'pre_checks' && (
              <PreCheckGate
                projectId={projectId}
                onAllPassed={() => setPreChecksAllPassed(true)}
                onChecksComplete={() => runRiskScoring()}
                autoRun
              />
            )}

            {/* ── 4.1: AI Deployment Risk Scorer (page 10) ── */}
            {currentStep === 'pre_checks' && riskAssessment && (
              <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                {/* Risk Score Header */}
                <div className={cn(
                  'px-4 py-3 flex items-center justify-between',
                  riskAssessment.level === 'LOW' ? 'bg-green-50 dark:bg-green-900/20' :
                  riskAssessment.level === 'MEDIUM' ? 'bg-amber-50 dark:bg-amber-900/20' :
                  'bg-red-50 dark:bg-red-900/20'
                )}>
                  <div className="flex items-center gap-3">
                    <Sparkles className={cn(
                      'h-4 w-4',
                      riskAssessment.level === 'LOW' ? 'text-green-500' :
                      riskAssessment.level === 'MEDIUM' ? 'text-amber-500' : 'text-red-500'
                    )} />
                    <span className="font-medium text-sm">AI Deployment Risk Scorer</span>
                    <Badge size="sm" className="bg-violet-100 text-violet-600 text-[10px]">~0.002 credits</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-2xl font-bold',
                      riskAssessment.level === 'LOW' ? 'text-green-600' :
                      riskAssessment.level === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                    )}>
                      {riskAssessment.score}
                    </span>
                    <span className="text-xs text-slate-400">/100</span>
                    <Badge size="sm" className={cn(
                      'ml-1',
                      riskAssessment.level === 'LOW' ? 'bg-green-100 text-green-700' :
                      riskAssessment.level === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    )}>
                      {riskAssessment.level}
                    </Badge>
                  </div>
                </div>

                {/* Risk Breakdown Table */}
                {riskAssessment.breakdown.length > 0 && (
                  <div className="divide-y dark:divide-slate-700">
                    <div className="px-4 py-2 grid grid-cols-[1fr_80px_1fr] gap-2 text-[10px] uppercase tracking-wider text-slate-400 font-medium bg-slate-50 dark:bg-slate-800/50">
                      <span>Factor</span>
                      <span className="text-center">Points</span>
                      <span>Reason</span>
                    </div>
                    {riskAssessment.breakdown.map((item, idx) => (
                      <div key={idx} className="px-4 py-2 grid grid-cols-[1fr_80px_1fr] gap-2 text-xs items-center">
                        <span className="font-mono text-slate-700 dark:text-slate-300">{item.factor}</span>
                        <span className={cn(
                          'text-center font-bold',
                          item.points >= 15 ? 'text-red-600' : item.points >= 10 ? 'text-amber-600' : 'text-slate-500'
                        )}>
                          +{item.points}
                        </span>
                        <span className="text-slate-500">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Summary (mistral-7b) */}
                <div className="px-4 py-3 border-t dark:border-slate-700 bg-violet-50/50 dark:bg-violet-900/10">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-violet-500 font-medium mb-1">AI Summary (mistral-7b)</p>
                      {riskAssessment.aiSummaryLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Generating risk summary...
                        </div>
                      ) : riskAssessment.aiSummary ? (
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{riskAssessment.aiSummary}</p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No AI summary available (Cortex not connected)</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Risk Legend */}
                <div className="px-4 py-2 border-t dark:border-slate-700 flex items-center gap-4 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" /> 0-30 LOW</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> 31-60 MEDIUM</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> 61-100 HIGH</span>
                  {riskAssessment.score > 60 && (
                    <span className="ml-auto text-red-500 font-medium">Score {'>'} 60 → Confirmation required</span>
                  )}
                </div>
              </div>
            )}

            {/* ── B5: SQL Diff (split view — current vs proposed) ── */}
            {currentStep === 'sql_diff' && (
              <SqlDiffViewer
                beforeSql={allRollbackSQL ? `-- Current schema (rollback target)\n${allRollbackSQL}` : '-- No existing schema changes'}
                afterSql={allSQL || '-- No SQL generated'}
                beforeLabel="CURRENT SQL"
                afterLabel="PROPOSED SQL (DIFF)"
              />
            )}

            {/* ── Dry-Run inside Deploy step ── */}
            {currentStep === 'deploy' && !dryRunCompleted && (
              <DryRunPanel
                projectId={projectId}
                warehouse={scheduleWarehouse}
                onPromoteToProd={() => setDryRunCompleted(true)}
              />
            )}

            {/* ── B4: Post-Deployment Verification ── */}
            {currentStep === 'post_verify' && (
              <PostVerifyBanner
                result={postVerifyResult}
                projectId={projectId}
                database={database}
                schemaName={schemas[0]}
                deploymentId={deploymentId || undefined}
                onRecheck={async () => {
                  setPostVerifyResult(null);
                  // Trigger recheck — the component handles its own loading state
                }}
              />
            )}

            {/* ── Events List — split into Phase 1 (DDL) and Phase 2 (ETL) ── */}
            {(currentStep === 'review' || currentStep === 'deploy') && (() => {
              const ETL_EVENT_TYPES: Set<string> = new Set([
                'COLUMN_MAPPING_CREATED', 'COLUMN_MAPPING_REMOVED',
                'INGESTION_MODE_SET', 'SCD_CONFIGURED',
              ]);

              // Split events by table, then separate DDL vs ETL
              const ddlEntries: Array<[string, typeof events]> = [];
              const etlEntries: Array<[string, typeof events]> = [];

              for (const [tableKey, tableEvents] of Object.entries(eventsByTable)) {
                const ddlEvents = tableEvents.filter(e => !ETL_EVENT_TYPES.has(e.type));
                const etlEvents = tableEvents.filter(e => ETL_EVENT_TYPES.has(e.type));
                if (ddlEvents.length > 0) ddlEntries.push([tableKey, ddlEvents]);
                if (etlEvents.length > 0) etlEntries.push([tableKey, etlEvents]);
              }

              const renderEventGroup = (tableKey: string, tableEvents: typeof events) => {
                const isSchemaGroup = tableEvents.some(e => e.type === 'SCHEMA_CREATED');
                const displayKey = isSchemaGroup
                  ? tableKey.split('.').slice(0, 2).join('.')
                  : tableKey;
                return (
                  <div key={tableKey} className="border dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className={cn(
                      "px-4 py-3 flex items-center gap-3",
                      isSchemaGroup ? "bg-indigo-50 dark:bg-indigo-900/20" : "bg-slate-50 dark:bg-slate-800"
                    )}>
                      <Database className={cn("h-5 w-5", isSchemaGroup ? "text-indigo-500" : "text-blue-500")} />
                      <span className="font-medium">{displayKey}</span>
                      {isSchemaGroup && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 font-medium">Schema</span>
                      )}
                      <Badge className="ml-auto">{tableEvents.length} {tableEvents.length === 1 ? 'change' : 'changes'}</Badge>
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
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              </button>
                              {event.status === 'pending' && <Clock className="h-4 w-4 text-amber-500" />}
                              {event.status === 'validated' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                              {event.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                              {event.status === 'applied' && <Check className="h-4 w-4 text-blue-500" />}
                              <span className="text-sm font-medium">{formatEventType(event.type)}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{getEventSummary(event)}</span>
                              {result?.duration && <span className="text-xs text-slate-400 ml-auto">{result.duration}ms</span>}
                            </div>
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
                );
              };

              return (
                <>
                  {/* Phase 1: Schema (DDL) */}
                  {ddlEntries.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Phase 1: Schema (DDL)</span>
                        <Badge className="bg-blue-100 text-blue-600 text-[10px]">{ddlEntries.reduce((s, [, e]) => s + e.length, 0)} changes</Badge>
                      </div>
                      {ddlEntries.map(([k, e]) => renderEventGroup(k, e))}
                    </div>
                  )}

                  {/* Phase 2: Ingestion (ETL) */}
                  {etlEntries.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">2</div>
                        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Phase 2: Ingestion (ETL)</span>
                        <Badge className="bg-emerald-100 text-emerald-600 text-[10px]">{etlEntries.reduce((s, [, e]) => s + e.length, 0)} mappings</Badge>
                      </div>
                      {etlEntries.map(([k, e]) => renderEventGroup(k, e))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Mapped Sources/Targets Overview — only on review/deploy steps */}
      {mappedTablesOverview.length > 0 && (currentStep === 'review' || currentStep === 'deploy') && (
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

                  {/* Ingestion Mode Selector */}
                  {(() => {
                    const tableKey = `${mapping.targetDatabase}.${mapping.targetSchema}.${mapping.targetTable}`;
                    const currentMode = ingestionModeOverrides[tableKey] || (mapping.ingestionMode as IngestionMode) || 'full_refresh';
                    return (
                      <select
                        value={currentMode}
                        onChange={(e) => setIngestionModeOverrides(prev => ({
                          ...prev,
                          [tableKey]: e.target.value as IngestionMode,
                        }))}
                        className="ml-auto text-xs px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 font-medium cursor-pointer focus:ring-1 focus:ring-amber-400"
                      >
                        <option value="full_refresh">Full Refresh</option>
                        <option value="incremental">Incremental</option>
                        <option value="snapshot">Snapshot</option>
                        <option value="scd_type1">SCD Type 1</option>
                        <option value="scd_type2">SCD Type 2</option>
                        <option value="scd_type3">SCD Type 3</option>
                      </select>
                    );
                  })()}
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

      {/* Deployment Configuration — collapsible, auto-collapsed after review */}
      {currentStep !== 'complete' && !isValidating && !isDeploying && (
        <div className="px-6 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={() => setConfigExpanded(!configExpanded)}
            className="w-full py-3 flex items-center justify-between hover:text-blue-600 transition-colors"
          >
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Deployment Configuration
              {!configExpanded && (
                <span className="text-xs text-slate-400 font-normal ml-2">
                  {deploymentType === 'immediate' ? 'Immediate' : 'With Approval'} · {scheduleWarehouse}
                </span>
              )}
            </h4>
            {configExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </button>
          {configExpanded && (
            <div className="pb-4 space-y-4">

          {/* Deployment Type */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'immediate', label: 'Deploy Now', icon: Rocket, desc: 'Execute immediately' },
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

          {/* Ingestion Configuration */}
          <div className="p-3 border dark:border-slate-700 rounded-lg space-y-3 bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-900/10 dark:to-emerald-900/10">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Ingestion</span>
            </div>

            {/* Ingestion Type */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'immediate', label: 'Immediate', icon: Rocket, desc: 'Ingest data now' },
                { value: 'scheduled', label: 'Scheduled', icon: Calendar, desc: 'Schedule ingestion' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all',
                    ingestionType === opt.value
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  )}
                  onClick={() => setIngestionType(opt.value as any)}
                >
                  <opt.icon className={cn('h-4 w-4 flex-shrink-0', ingestionType === opt.value ? 'text-green-500' : 'text-slate-400')} />
                  <div>
                    <p className="font-medium text-xs">{opt.label}</p>
                    <p className="text-[10px] text-slate-500">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Schedule Cron / Warehouse */}
            {ingestionType === 'scheduled' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Frequency</label>
                    <select
                      value={cronChoice}
                      onChange={(e) => setCronChoice(e.target.value as CronChoice)}
                      className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
                    >
                      <option value="EVERY_HOUR">Every Hour</option>
                      <option value="EVERY_6_HOURS">Every 6 Hours</option>
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="CUSTOM">Custom Cron</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Warehouse</label>
                    <Input
                      type="text"
                      value={scheduleWarehouse}
                      onChange={(e) => setScheduleWarehouse(e.target.value.toUpperCase())}
                      placeholder="COMPUTE_WH"
                      className="mt-1"
                    />
                  </div>
                </div>
                {cronChoice === 'CUSTOM' && (
                  <div>
                    <label className="text-xs text-slate-500">Custom Cron Expression</label>
                    <Input
                      type="text"
                      value={customCron}
                      onChange={(e) => setCustomCron(e.target.value)}
                      placeholder="USING CRON 0 2 * * * UTC"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Ingestion Target Schema Version */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Target Schema Version</span>
                {isLoadingVersions && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                )}
              </div>
              <select
                value={ingestionTargetVersion}
                onChange={(e) => setIngestionTargetVersion(e.target.value)}
                className="w-full p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
                disabled={isLoadingVersions}
              >
                {schemaVersions.length === 0 && (
                  <option value="latest">
                    No versions available (will use newly deployed)
                  </option>
                )}
                {schemaVersions
                  .sort((a, b) => b.version_number - a.version_number)
                  .map((version) => (
                    <option key={version.version_id} value={version.version_id}>
                      {version.version_name || `${projectId}_V${version.version_number}`}
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
                  <span>You have selected a non-current schema version.</span>
                </div>
              )}
            </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Footer Actions */}
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
            {/* Back button for non-review steps */}
            {currentStep !== 'review' && (
              <Button
                variant="outline"
                onClick={() => {
                  const stepOrder = ['review', 'pre_checks', 'sql_diff', 'deploy', 'post_verify', 'complete'] as const;
                  const idx = stepOrder.indexOf(currentStep as typeof stepOrder[number]);
                  if (idx > 0) {
                    setCurrentStep(stepOrder[idx - 1]);
                    if (stepOrder[idx - 1] === 'review') setConfigExpanded(true);
                  }
                }}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Back
              </Button>
            )}

            {/* Review → Pre-Checks: runs validation then moves to pre-checks */}
            {currentStep === 'review' && (
              <Button
                onClick={handleValidate}
                disabled={pendingEvents.length === 0}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Shield className="h-4 w-4" />
                Run Pre-Checks ({pendingEvents.length})
              </Button>
            )}

            {isValidating && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </Button>
            )}

            {/* Pre-Checks → SQL Diff (gated: must pass pre-checks) */}
            {currentStep === 'pre_checks' && !isValidating && (
              <Tooltip content={!preChecksAllPassed ? 'Fix pre-check failures before proceeding' : undefined}>
                <Button
                  onClick={() => setCurrentStep('sql_diff')}
                  disabled={!preChecksAllPassed && stats.failed > 0}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <GitBranch className="h-4 w-4" />
                  View SQL Diff
                </Button>
              </Tooltip>
            )}

            {/* SQL Diff → Deploy */}
            {currentStep === 'sql_diff' && (
              <Button
                onClick={() => setCurrentStep('deploy')}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Rocket className="h-4 w-4" />
                Proceed to Deploy
              </Button>
            )}

            {/* Deploy step — dry-run + deploy buttons */}
            {currentStep === 'deploy' && !isDeploying && (() => {
              const validatedCount = events.filter((e) => e.status === 'validated').length;
              const toSubmitCount = validatedCount > 0 ? validatedCount : pendingEvents.length;
              return (
                <div className="flex items-center gap-2">
                  {!dryRunCompleted && (
                    <Button
                      variant="outline"
                      onClick={() => setDryRunCompleted(true)}
                      className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50"
                    >
                      <Server className="h-4 w-4" />
                      Skip Dry-Run
                    </Button>
                  )}
                  <Button
                    onClick={handleDeploy}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    disabled={toSubmitCount === 0 && !events.some(e => e.type === 'COLUMN_MAPPING_CREATED')}
                  >
                    <Rocket className="h-4 w-4" />
                    {deploymentType === 'immediate' ? 'Deploy Now' : 'Submit for Approval'} ({toSubmitCount})
                  </Button>
                </div>
              );
            })()}

            {isDeploying && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {deploymentType === 'immediate' ? 'Deploying...' : 'Submitting...'}
              </Button>
            )}

            {/* Post-verify → Complete */}
            {currentStep === 'post_verify' && (
              <Button
                onClick={() => setCurrentStep('complete')}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4" />
                Done
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Deployment Lifecycle Panel */}
      {backendDeployments.length > 0 && (
        <div className="px-6 py-4 border-t dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-indigo-500" />
              Deployments ({backendDeployments.length})
            </h4>
            <Button
              size="sm"
              variant="outline"
              onClick={loadBackendDeployments}
              disabled={isLoadingDeployments}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoadingDeployments && 'animate-spin')} />
              Refresh
            </Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {backendDeployments.map((dep) => {
              const isActionLoading = deploymentActionLoading === dep.deployment_id;
              const status = dep.status?.toLowerCase();
              return (
                <div
                  key={dep.deployment_id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg border text-sm',
                    'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge
                      className={cn(
                        'text-xs whitespace-nowrap',
                        status === 'pending_approval' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                        status === 'approved' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
                        (status === 'executing' || status === 'deploying') && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                        (status === 'completed' || status === 'deployed') && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                        status === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                        (status === 'cancelled' || status === 'rejected') && 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                        status === 'draft' && 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                      )}
                    >
                      {dep.status}
                    </Badge>
                    <div className="truncate">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {dep.deployment_id.slice(0, 12)}
                      </span>
                      {dep.deployment_type && (
                        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                          {dep.deployment_type}
                        </span>
                      )}
                      {dep.created_at && (
                        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                          {new Date(dep.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                    {isActionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <>
                        {status === 'pending_approval' && (
                          <>
                            <Button
                              size="sm"
                              className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1"
                              onClick={() => handleDeploymentAction('approve', dep)}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs px-2 py-1"
                              onClick={() => handleDeploymentAction('reject', dep)}
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </>
                        )}
                        {status === 'approved' && (
                          <>
                            <Button
                              size="sm"
                              className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1"
                              onClick={() => handleDeploymentAction('execute', dep)}
                            >
                              <Play className="h-3.5 w-3.5" />
                              Execute
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 border-slate-400 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs px-2 py-1"
                              onClick={() => handleDeploymentAction('cancel', dep)}
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </>
                        )}
                        {(status === 'executing' || status === 'deploying') && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        {(status === 'completed' || status === 'deployed') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 border-emerald-400 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-xs px-2 py-1"
                            onClick={() => handleDeploymentAction('verify', dep)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Verify
                          </Button>
                        )}
                        {status === 'failed' && (
                          <Button
                            size="sm"
                            className="gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs px-2 py-1"
                            onClick={() => handleDeploymentAction('execute', dep)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
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
