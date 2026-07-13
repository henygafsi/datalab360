import type { DesignEvent, EventType } from '../../stores/event-store';
import type {
  DDLType,
  IngestionMode,
  CronChoice,
  BackendCronChoice,
} from '@/app/services/api/types';

/**
 * Map the UI's {@link CronChoice} onto the backend's lowercase cron enum.
 * The schedule endpoint rejects the UI values (EVERY_HOUR/DAILY/…) with a 400,
 * and has no native 6-hour cadence — that case degrades to an explicit cron.
 */
export function toBackendCronChoice(
  c: CronChoice,
  customCron?: string,
): { cron_choice: BackendCronChoice; custom_cron?: string } {
  switch (c) {
    case 'EVERY_HOUR':
      return { cron_choice: 'hourly' };
    case 'EVERY_6_HOURS':
      // No native 6h cadence on the backend — express it as a cron.
      return { cron_choice: 'custom', custom_cron: '0 */6 * * *' };
    case 'WEEKLY':
      return { cron_choice: 'weekly' };
    case 'MONTHLY':
      return { cron_choice: 'monthly' };
    case 'CUSTOM':
      return { cron_choice: 'custom', custom_cron: customCron };
    case 'DAILY':
    default:
      return { cron_choice: 'daily' };
  }
}
import type {
  SQLStatement,
  IngestionTableConfig,
  ValidationResult,
  MappedTableOverview,
} from './DeploymentContext';

// ============================================================================
// EVENT ORDERING — Priority for deployment execution order
// ============================================================================
export const EVENT_PRIORITY: Record<EventType, number> = {
  'SCHEMA_SELECTED': 0,
  'TABLE_SELECTED': 0,
  'TABLE_ADDED_TO_MODELING': 0,
  'TABLE_REMOVED_FROM_MODELING': 0,
  'BATCH_OPERATION': 0,
  'SCHEMA_CREATED': 0.5,
  'TABLE_CREATED': 1,
  'DYNAMIC_TABLE_CREATED': 1,
  'STREAM_CREATED': 1,
  'EVENT_TABLE_CREATED': 1,
  'HYBRID_TABLE_CREATED': 1,
  'ALERT_CREATED': 1,
  'ADD_COLUMN': 2,
  'COLUMN_RENAMED': 3,
  'COLUMN_TYPE_CHANGED': 3,
  'REMOVE_COLUMN': 3,
  'PRIMARY_KEY_SET': 4,
  'PRIMARY_KEY_REMOVED': 4,
  'FOREIGN_KEY_ADDED': 5,
  'FOREIGN_KEY_REMOVED': 5,
  'RELATION_CREATED': 5,
  'RELATION_REMOVED': 5,
  'COLUMN_MAPPING_CREATED': 5,
  'COLUMN_MAPPING_REMOVED': 5,
  'MASKING_POLICY_APPLIED': 6,
  'MASKING_POLICY_REMOVED': 6,
  'RLS_POLICY_APPLIED': 6,
  'RLS_POLICY_REMOVED': 6,
  'AGGREGATION_POLICY_APPLIED': 6,
  'AGGREGATION_POLICY_REMOVED': 6,
  'TAG_APPLIED': 7,
  'TAG_REMOVED': 7,
  'COLUMN_EXCLUDED': 7,
  'COLUMN_INCLUDED': 7,
  'TABLE_EXCLUDED': 7,
  'TABLE_DROP_REQUEST': 8,
  'TABLE_INCLUDED': 7,
  'INGESTION_MODE_SET': 8,
  'SCD_CONFIGURED': 8,
  'SCD_CONFIG_SET': 8,
  'WHERE_CLAUSE_SET': 8,
  'QUALITY_GATE_SET': 8,
  'TABLE_RENAMED': 9,
  // AI-assisted events (metadata only, no DDL)
  'AI_CLASSIFICATION_APPLIED': 0,
  'AI_TYPE_CHANGE_APPLIED': 0,
  'AI_RELATION_ACCEPTED': 0,
  'AI_TEMPLATE_APPLIED': 0,
  'AI_COLUMNS_ADDED': 0,
};

// DDL-relevant event types (actual schema changes that generate SQL)
export const DDL_EVENT_TYPES: EventType[] = [
  'SCHEMA_CREATED',
  'TABLE_CREATED', 'TABLE_RENAMED', 'ADD_COLUMN', 'REMOVE_COLUMN',
  'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_SET', 'PRIMARY_KEY_REMOVED',
  'FOREIGN_KEY_ADDED', 'FOREIGN_KEY_REMOVED', 'RELATION_CREATED', 'RELATION_REMOVED',
  'MASKING_POLICY_APPLIED', 'MASKING_POLICY_REMOVED', 'RLS_POLICY_APPLIED', 'RLS_POLICY_REMOVED',
  'AGGREGATION_POLICY_APPLIED', 'AGGREGATION_POLICY_REMOVED',
];

// Schema event types for two-phase deployment
export const SCHEMA_EVENT_TYPES: EventType[] = [
  ...DDL_EVENT_TYPES,
  'TAG_APPLIED', 'TAG_REMOVED',
];

// Ingestion event types
export const INGESTION_EVENT_TYPES: EventType[] = [
  'COLUMN_MAPPING_CREATED', 'COLUMN_MAPPING_REMOVED', 'INGESTION_MODE_SET', 'SCD_CONFIGURED',
];

// Metadata-only types (no SQL execution)
const METADATA_ONLY_TYPES: EventType[] = [
  'SCHEMA_SELECTED', 'TABLE_SELECTED', 'TABLE_ADDED_TO_MODELING',
  'TABLE_REMOVED_FROM_MODELING', 'BATCH_OPERATION',
];

// ============================================================================
// Sort & Filter
// ============================================================================

export function sortEventsForDeployment(events: DesignEvent[]): DesignEvent[] {
  return [...events].sort((a, b) => {
    const priorityA = EVENT_PRIORITY[a.type] ?? 99;
    const priorityB = EVENT_PRIORITY[b.type] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;

    const tableKeyA = `${a.target.database}.${a.target.schema}.${a.target.table}`;
    const tableKeyB = `${b.target.database}.${b.target.schema}.${b.target.table}`;
    if (tableKeyA !== tableKeyB) return tableKeyA.localeCompare(tableKeyB);

    const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
}

export function filterExecutableEvents(events: DesignEvent[]): DesignEvent[] {
  return events.filter(e => !METADATA_ONLY_TYPES.includes(e.type));
}

// ============================================================================
// SQL Generation
// ============================================================================

export function generateSnowflakeSQL(event: DesignEvent): { sql: string; rollbackSql?: string } {
  const tableRef = `${event.target.database}.${event.target.schema}.${event.target.table}`;

  switch (event.type) {
    case 'SCHEMA_CREATED': {
      const schemaFullRef = `${event.target.database}.${event.target.schema}`;
      return {
        sql: `CREATE SCHEMA IF NOT EXISTS ${schemaFullRef};`,
        rollbackSql: `DROP SCHEMA IF EXISTS ${schemaFullRef} CASCADE;`,
      };
    }

    case 'TABLE_CREATED': {
      const columns = event.payload.columns || [];
      const columnDefs = columns.map((col: any) => {
        let def = `  ${col.name} ${col.dataType}`;
        if (col.computedExpression) {
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
      return { sql: createSql, rollbackSql: `DROP TABLE IF EXISTS ${tableRef};` };
    }

    case 'TABLE_RENAMED':
      return {
        sql: `ALTER TABLE ${tableRef} RENAME TO ${event.payload.newName};`,
        rollbackSql: `ALTER TABLE ${event.target.database}.${event.target.schema}.${event.payload.newName} RENAME TO ${event.target.table};`,
      };

    case 'COLUMN_RENAMED':
      return {
        sql: `ALTER TABLE ${tableRef} RENAME COLUMN ${event.payload.oldName} TO ${event.payload.newName};`,
        rollbackSql: `ALTER TABLE ${tableRef} RENAME COLUMN ${event.payload.newName} TO ${event.payload.oldName};`,
      };

    case 'COLUMN_TYPE_CHANGED':
      return {
        sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET DATA TYPE ${event.payload.newType};`,
        rollbackSql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET DATA TYPE ${event.payload.oldType};`,
      };

    case 'PRIMARY_KEY_SET': {
      const pkColumns = event.payload.columns?.join(', ') || '';
      return {
        sql: `ALTER TABLE ${tableRef} ADD PRIMARY KEY (${pkColumns});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP PRIMARY KEY;`,
      };
    }

    case 'PRIMARY_KEY_REMOVED':
      return {
        sql: `ALTER TABLE ${tableRef} DROP PRIMARY KEY;`,
        rollbackSql: `-- Manual intervention required to restore primary key`,
      };

    case 'FOREIGN_KEY_ADDED': {
      const fkName = `FK_${event.target.table}_${event.payload.columns?.[0]}`;
      const refTable = `${event.payload.referencedTable?.database}.${event.payload.referencedTable?.schema}.${event.payload.referencedTable?.table}`;
      return {
        sql: `ALTER TABLE ${tableRef} ADD CONSTRAINT ${fkName} FOREIGN KEY (${event.payload.columns?.join(', ')}) REFERENCES ${refTable}(${event.payload.referencedColumns?.join(', ')});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP CONSTRAINT ${fkName};`,
      };
    }

    case 'RELATION_CREATED': {
      const relationFkName = `FK_${event.target.table}_${event.payload.sourceColumn}`;
      const targetRef = `${event.payload.targetTable?.database}.${event.payload.targetTable?.schema}.${event.payload.targetTable?.table}`;
      return {
        sql: `ALTER TABLE ${tableRef} ADD CONSTRAINT ${relationFkName} FOREIGN KEY (${event.payload.sourceColumn}) REFERENCES ${targetRef}(${event.payload.targetColumn});`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP CONSTRAINT ${relationFkName};`,
      };
    }

    case 'MASKING_POLICY_APPLIED': {
      const maskColumns = event.payload.columns || [];
      // Fully qualified policy reference: CP_DATA360.GOUVERNANCE.<policy_name>
      const policyDb = event.payload.policyDatabase || 'CP_DATA360';
      const policySchema = event.payload.policySchema || 'GOUVERNANCE';
      const policyFQN = `${policyDb}.${policySchema}.${event.payload.policyName}`;
      return {
        sql: maskColumns.map((col: string) =>
          `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} SET MASKING POLICY ${policyFQN};`
        ).join('\n'),
        rollbackSql: maskColumns.map((col: string) =>
          `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} UNSET MASKING POLICY;`
        ).join('\n'),
      };
    }

    case 'MASKING_POLICY_REMOVED': {
      const unmaskColumns = event.payload.columns || [];
      return {
        sql: unmaskColumns.map((col: string) =>
          `ALTER TABLE ${tableRef} MODIFY COLUMN ${col} UNSET MASKING POLICY;`
        ).join('\n'),
        rollbackSql: `-- Manual intervention required to restore masking policy`,
      };
    }

    case 'INGESTION_MODE_SET': {
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
    }

    case 'SCD_CONFIGURED':
      return {
        sql: `-- SCD Type ${event.payload.scdType || 2} configuration for ${tableRef}\n` +
             `-- Effective date column: ${event.payload.effectiveDateColumn || 'EFF_START_DT'}\n` +
             `-- Expiration date column: ${event.payload.expirationDateColumn || 'EFF_END_DT'}\n` +
             `-- Current flag column: ${event.payload.currentFlagColumn || 'IS_CURRENT'}`,
      };

    case 'TAG_APPLIED': {
      const tagName = event.payload.tagName || event.payload.tag;
      const tagValue = event.payload.tagValue || 'TRUE';
      if (event.target.column) {
        return {
          sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} SET TAG ${tagName} = '${tagValue}';`,
          rollbackSql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} UNSET TAG ${tagName};`,
        };
      }
      return {
        sql: `ALTER TABLE ${tableRef} SET TAG ${tagName} = '${tagValue}';`,
        rollbackSql: `ALTER TABLE ${tableRef} UNSET TAG ${tagName};`,
      };
    }

    case 'TAG_REMOVED': {
      const removedTagName = event.payload.tagName || event.payload.tag;
      if (event.target.column) {
        return { sql: `ALTER TABLE ${tableRef} MODIFY COLUMN ${event.target.column} UNSET TAG ${removedTagName};` };
      }
      return { sql: `ALTER TABLE ${tableRef} UNSET TAG ${removedTagName};` };
    }

    case 'ADD_COLUMN': {
      const colName = event.payload.columnName || event.payload.name;
      const colType = event.payload.dataType || event.payload.columnType || event.payload.type || 'VARCHAR';
      const nullable = event.payload.isNullable !== false ? '' : ' NOT NULL';
      const isComputed = event.payload.isComputed || !!event.payload.computedExpression;
      if (isComputed && event.payload.computedExpression) {
        return {
          sql: `ALTER TABLE ${tableRef} ADD COLUMN ${colName} ${colType} AS (${event.payload.computedExpression});`,
          rollbackSql: `ALTER TABLE ${tableRef} DROP COLUMN ${colName};`,
        };
      }
      return {
        sql: `ALTER TABLE ${tableRef} ADD COLUMN ${colName} ${colType}${nullable};`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP COLUMN ${colName};`,
      };
    }

    case 'REMOVE_COLUMN': {
      const dropColName = event.payload.columnName || event.payload.name;
      return {
        sql: `ALTER TABLE ${tableRef} DROP COLUMN ${dropColName};`,
        rollbackSql: `-- Manual intervention required to restore column ${dropColName}`,
      };
    }

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
        rollbackSql: `ALTER TABLE ${tableRef} DROP ROW ACCESS POLICY ${event.payload.policyName};`,
      };
    case 'RLS_POLICY_REMOVED':
      return { sql: `ALTER TABLE ${tableRef} DROP ROW ACCESS POLICY ${event.payload.policyName};` };
    case 'AGGREGATION_POLICY_APPLIED':
      return {
        sql: `ALTER TABLE ${tableRef} ADD AGGREGATION POLICY ${event.payload.policyName};`,
        rollbackSql: `ALTER TABLE ${tableRef} DROP AGGREGATION POLICY ${event.payload.policyName};`,
      };
    case 'AGGREGATION_POLICY_REMOVED':
      return { sql: `ALTER TABLE ${tableRef} DROP AGGREGATION POLICY ${event.payload.policyName};` };

    default:
      return { sql: `-- ${event.type}: ${JSON.stringify(event.payload)}` };
  }
}

// ============================================================================
// DDL Type Inference
// ============================================================================

export function inferDDLType(eventType: EventType): DDLType {
  switch (eventType) {
    case 'SCHEMA_CREATED': return 'CREATE_TABLE';
    case 'TABLE_CREATED': return 'CREATE_TABLE';
    case 'ADD_COLUMN': return 'ALTER_ADD_COLUMN';
    case 'REMOVE_COLUMN': return 'ALTER_DROP_COLUMN';
    case 'COLUMN_RENAMED': return 'ALTER_RENAME_COLUMN';
    case 'COLUMN_TYPE_CHANGED': return 'ALTER_CHANGE_TYPE';
    case 'TABLE_RENAMED': return 'DROP_TABLE';
    default: return 'ALTER_ADD_COLUMN';
  }
}

// ============================================================================
// Validation
// ============================================================================

export function validateEventLocally(event: DesignEvent, allEvents: DesignEvent[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!event.target.database || !event.target.schema || !event.target.table) {
    errors.push('Invalid target: missing database, schema, or table');
  }

  switch (event.type) {
    case 'TABLE_RENAMED':
      if (!event.payload.newName) errors.push('New table name is required');
      else if (event.payload.newName === event.payload.oldName) errors.push('New name must be different from old name');
      else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.payload.newName)) errors.push('Invalid table name');
      break;
    case 'COLUMN_RENAMED':
      if (!event.payload.newName) errors.push('New column name is required');
      else if (event.payload.newName === event.payload.oldName) errors.push('New name must be different');
      else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.payload.newName)) errors.push('Invalid column name');
      if (allEvents.filter(e => e.id !== event.id && e.type === 'COLUMN_RENAMED' && e.target.table === event.target.table && e.payload.oldName === event.payload.oldName).length > 0) {
        warnings.push('Multiple rename operations on same column detected');
      }
      break;
    case 'PRIMARY_KEY_SET':
      if (!event.payload.columns || event.payload.columns.length === 0) errors.push('At least one column required for primary key');
      break;
    case 'FOREIGN_KEY_ADDED':
    case 'RELATION_CREATED':
      if (!event.payload.sourceColumn && !event.payload.columns?.[0]) errors.push('Source column is required');
      if (!event.payload.targetTable || !event.payload.targetColumn) errors.push('Target table and column are required');
      break;
    case 'MASKING_POLICY_APPLIED':
      if (!event.payload.policyName) errors.push('Policy name is required');
      if (!event.payload.columns || event.payload.columns.length === 0) errors.push('At least one column required');
      break;
    case 'INGESTION_MODE_SET':
      if (!event.payload.mode) errors.push('Ingestion mode is required');
      if (event.payload.mode === 'incremental' && !event.payload.config?.incrementalColumn) warnings.push('Incremental mode should specify an incremental column');
      break;
    case 'ADD_COLUMN':
      if (!(event.payload.columnName || event.payload.name)) errors.push('Column name is required');
      break;
    case 'TAG_APPLIED':
      if (!event.payload.tagName && !event.payload.tag) errors.push('Tag name is required');
      break;
  }

  return { isValid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Extraction helpers
// ============================================================================

export function extractIngestionConfigs(events: DesignEvent[], modeOverrides?: Record<string, IngestionMode>): IngestionTableConfig[] {
  const ingestionConfigs: IngestionTableConfig[] = [];
  const tableColumnMappings: Map<string, {
    sourceDb: string; sourceSchema: string; sourceTable: string;
    targetDb: string; targetSchema: string; targetTable: string;
    columns: Array<{ sourceColumns: string[]; targetColumn: string; transformation?: string | null }>;
  }> = new Map();

  // First pass: collect column mappings
  events.forEach(event => {
    if (event.type === 'COLUMN_MAPPING_CREATED') {
      const src = event.payload.source;
      const tgt = event.payload.target;
      const sourceColumns = src?.columns || [];
      const targetColumn = tgt?.column || '';
      const targetTableKey = `${tgt?.database || ''}.${tgt?.schema || ''}.${tgt?.table || ''}`;

      if (src?.table && sourceColumns.length > 0 && tgt?.table && targetColumn) {
        if (!tableColumnMappings.has(targetTableKey)) {
          tableColumnMappings.set(targetTableKey, {
            sourceDb: src?.database || '', sourceSchema: src?.schema || '', sourceTable: src?.table || '',
            targetDb: tgt?.database || '', targetSchema: tgt?.schema || '', targetTable: tgt?.table || '',
            columns: [],
          });
        }
        tableColumnMappings.get(targetTableKey)!.columns.push({
          sourceColumns, targetColumn, transformation: event.payload.transformation || null,
        });
      }
    }
  });

  const tablesWithIngestionMode = new Set<string>();

  // Second pass: INGESTION_MODE_SET events
  events.forEach(event => {
    if (event.type === 'INGESTION_MODE_SET') {
      const mode = (event.payload.mode || event.payload.ingestionMode || 'full_refresh') as IngestionMode;
      const targetTableKey = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      tablesWithIngestionMode.add(targetTableKey);

      const columnMapping = tableColumnMappings.get(targetTableKey);
      const sourceDb = event.payload.sourceDatabase || event.payload.source_database || columnMapping?.sourceDb || event.target.database;
      const sourceSchema = event.payload.sourceSchema || event.payload.source_schema || columnMapping?.sourceSchema || event.target.schema;
      const sourceTable = event.payload.sourceTable || event.payload.source_table || columnMapping?.sourceTable || event.target.table;
      const effectiveMode = (modeOverrides?.[targetTableKey] || mode) as IngestionMode;

      const config: IngestionTableConfig = {
        source_database: sourceDb, source_schema: sourceSchema, source_table: sourceTable,
        target_database: event.target.database, target_schema: event.target.schema, target_table: event.target.table,
        ingestion_mode: effectiveMode,
        mappings: columnMapping?.columns.map(col => ({ source_columns: col.sourceColumns, target_column: col.targetColumn, transformation: col.transformation || undefined })),
        config: {},
      };

      const eventConfig = event.payload.config || event.payload;
      if (eventConfig.pkColumns || eventConfig.pk_columns) config.config!.pk_columns = eventConfig.pkColumns || eventConfig.pk_columns;
      if (eventConfig.incrementalColumn || eventConfig.incremental_column) config.config!.incremental_column = eventConfig.incrementalColumn || eventConfig.incremental_column;
      if (eventConfig.trackingColumns || eventConfig.tracking_columns) config.config!.tracking_columns = eventConfig.trackingColumns || eventConfig.tracking_columns;
      if (eventConfig.effectiveDateColumn || eventConfig.effective_date_column) config.config!.effective_date_column = eventConfig.effectiveDateColumn || eventConfig.effective_date_column;
      if (eventConfig.expirationDateColumn || eventConfig.expiration_date_column) config.config!.expiration_date_column = eventConfig.expirationDateColumn || eventConfig.expiration_date_column;
      if (eventConfig.currentFlagColumn || eventConfig.current_flag_column) config.config!.current_flag_column = eventConfig.currentFlagColumn || eventConfig.current_flag_column;
      if (eventConfig.snapshotColumn || eventConfig.snapshot_column) config.config!.snapshot_column = eventConfig.snapshotColumn || eventConfig.snapshot_column;

      ingestionConfigs.push(config);
    }
  });

  // Third pass: tables with mappings but no INGESTION_MODE_SET
  tableColumnMappings.forEach((mapping, targetTableKey) => {
    if (!tablesWithIngestionMode.has(targetTableKey) && mapping.columns.length > 0) {
      ingestionConfigs.push({
        source_database: mapping.sourceDb, source_schema: mapping.sourceSchema, source_table: mapping.sourceTable,
        target_database: mapping.targetDb, target_schema: mapping.targetSchema, target_table: mapping.targetTable,
        ingestion_mode: modeOverrides?.[targetTableKey] || 'full_refresh',
        mappings: mapping.columns.map(col => ({ source_columns: col.sourceColumns, target_column: col.targetColumn, transformation: col.transformation || undefined })),
        config: {},
      });
    }
  });

  return ingestionConfigs;
}

export function extractMappedTablesOverview(events: DesignEvent[]): MappedTableOverview[] {
  const mappedTables: Map<string, MappedTableOverview> = new Map();

  events.forEach(event => {
    if (event.type === 'COLUMN_MAPPING_CREATED') {
      const src = event.payload.source;
      const tgt = event.payload.target;
      const sourceColumns = src?.columns || [];
      const targetColumn = tgt?.column || '';
      const targetTableKey = `${tgt?.database || ''}.${tgt?.schema || ''}.${tgt?.table || ''}`;

      if (src?.table && sourceColumns.length > 0 && tgt?.table && targetColumn) {
        if (!mappedTables.has(targetTableKey)) {
          mappedTables.set(targetTableKey, {
            sourceDatabase: src?.database || '', sourceSchema: src?.schema || '', sourceTable: src?.table || '',
            targetDatabase: tgt?.database || '', targetSchema: tgt?.schema || '', targetTable: tgt?.table || '',
            columnMappings: [],
          });
        }
        const mapping = mappedTables.get(targetTableKey)!;
        const sourcesKey = sourceColumns.join(',');
        if (!mapping.columnMappings.find(m => m.sourceColumns.join(',') === sourcesKey && m.targetColumn === targetColumn)) {
          mapping.columnMappings.push({ sourceColumns, targetColumn, transformation: event.payload.transformation || null });
        }
      }
    }
  });

  events.forEach(event => {
    if (event.type === 'INGESTION_MODE_SET') {
      const targetTableKey = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      const mode = event.payload.mode || event.payload.ingestionMode || 'full_refresh';
      if (mappedTables.has(targetTableKey)) {
        mappedTables.get(targetTableKey)!.ingestionMode = mode;
      } else {
        mappedTables.set(targetTableKey, {
          sourceDatabase: event.payload.sourceDatabase || event.payload.source_database || event.target.database,
          sourceSchema: event.payload.sourceSchema || event.payload.source_schema || event.target.schema,
          sourceTable: event.payload.sourceTable || event.payload.source_table || event.target.table,
          targetDatabase: event.target.database, targetSchema: event.target.schema, targetTable: event.target.table,
          ingestionMode: mode, columnMappings: [],
        });
      }
    }
  });

  return Array.from(mappedTables.values());
}

// ============================================================================
// Display helpers
// ============================================================================

export function formatEventType(type: EventType): string {
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
}

export function getEventSummary(event: DesignEvent): string {
  const { type, payload, target } = event;
  switch (type) {
    case 'SCHEMA_CREATED': return `${target.database}.${target.schema}`;
    case 'TABLE_RENAMED': return `${payload.oldName || target.table} → ${payload.newName}`;
    case 'COLUMN_RENAMED': return `${payload.oldName} → ${payload.newName}`;
    case 'INGESTION_MODE_SET': return `Mode: ${payload.mode?.replace(/_/g, ' ')}`;
    case 'MASKING_POLICY_APPLIED': return `Policy: ${payload.policyName}`;
    case 'PRIMARY_KEY_SET': return `Columns: ${payload.columns?.join(', ') || 'N/A'}`;
    case 'RELATION_CREATED': return `${payload.sourceColumn} → ${payload.targetTable?.table}.${payload.targetColumn}`;
    default: return target.column || '';
  }
}

export function generateDeploymentScript(events: DesignEvent[], projectId: string, database?: string): string {
  const header = `-- =============================================\n-- Data Model Changes - Deployment Script\n-- Generated: ${new Date().toISOString()}\n-- Project: ${projectId}\n-- Database: ${database || 'N/A'}\n-- Events: ${events.length}\n-- =============================================\n\n`;
  return header + events.map((e, idx) => {
    const sql = generateSnowflakeSQL(e).sql;
    return `-- [${idx + 1}/${events.length}] ${e.type} on ${e.target.table}\n${sql}`;
  }).join('\n\n');
}

export function generateRollbackScript(events: DesignEvent[], projectId: string): string {
  const header = `-- =============================================\n-- Data Model Changes - ROLLBACK Script\n-- Generated: ${new Date().toISOString()}\n-- Project: ${projectId}\n-- WARNING: Execute in reverse order!\n-- =============================================\n\n`;
  return header + [...events].reverse().map((e, idx) => {
    const sql = generateSnowflakeSQL(e).rollbackSql || '-- No rollback available';
    return `-- [ROLLBACK ${idx + 1}] ${e.type} on ${e.target.table}\n${sql}`;
  }).join('\n\n');
}
