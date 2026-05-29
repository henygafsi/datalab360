'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Code2, Copy, Check, ChevronDown, ChevronRight, Eye,
  RefreshCw, FileCode, AlertTriangle, Download,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useEventStore, DesignEvent, EventType } from '../stores/event-store';
import { ingestionSqlPreview } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { WhereClauseCondition, IngestionMode, SqlPreviewResult } from '@/app/services/api/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TableReference {
  database: string;
  schema: string;
  table: string;
}

interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string;
  transformation?: string;
}

interface SqlPreviewPanelProps {
  table: TableReference | null;
  ingestionMode: string;
  scdConfig?: {
    businessKeyColumn?: string;
    trackingColumns: string[];
    effectiveDateColumn: string;
    expirationDateColumn: string;
    currentFlagColumn: string;
  };
  columnMappings?: ColumnMapping[];
  whereClause?: string;
  /** API-spec WHERE conditions for server-side preview */
  whereClauses?: WhereClauseCondition[];
  /** Source table reference for server-side preview */
  sourceTable?: TableReference | null;
  className?: string;
  projectId?: string | null;
}

// ── SQL Keyword Highlighting (simple) ──────────────────────────────────────────

const SQL_KEYWORDS = new Set([
  'MERGE', 'INTO', 'USING', 'ON', 'WHEN', 'MATCHED', 'THEN', 'UPDATE', 'SET',
  'NOT', 'INSERT', 'VALUES', 'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'AS',
  'CREATE', 'TABLE', 'ALTER', 'DROP', 'IF', 'EXISTS', 'REPLACE', 'VIEW',
  'COPY', 'FILE_FORMAT', 'PATTERN', 'DELETE', 'TRUNCATE', 'BEGIN', 'END',
  'COMMIT', 'ROLLBACK', 'CURRENT_TIMESTAMP', 'TRUE', 'FALSE', 'NULL',
  'LEFT', 'JOIN', 'INNER', 'OUTER', 'GROUP', 'BY', 'ORDER', 'HAVING',
  'CASE', 'WHEN', 'ELSE', 'BETWEEN', 'IN', 'LIKE', 'IS', 'DISTINCT',
]);

function highlightSQL(sql: string): React.ReactNode[] {
  const lines = sql.split('\n');
  return lines.map((line, lineIdx) => {
    const tokens = line.split(/(\s+|[(),;=<>!]+)/g);
    const highlighted = tokens.map((token, tokenIdx) => {
      const upper = token.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        return (
          <span key={tokenIdx} className="text-blue-400 font-semibold">{token}</span>
        );
      }
      if (/^'[^']*'$/.test(token) || /^"[^"]*"$/.test(token)) {
        return (
          <span key={tokenIdx} className="text-green-400">{token}</span>
        );
      }
      if (/^\d+$/.test(token)) {
        return (
          <span key={tokenIdx} className="text-amber-400">{token}</span>
        );
      }
      if (token.startsWith('--')) {
        return (
          <span key={tokenIdx} className="text-slate-500 italic">{token}</span>
        );
      }
      return <span key={tokenIdx}>{token}</span>;
    });
    return (
      <div key={lineIdx} className="flex">
        <span className="select-none text-slate-600 w-8 text-right pr-3 flex-shrink-0">
          {lineIdx + 1}
        </span>
        <span className="flex-1">{highlighted}</span>
      </div>
    );
  });
}

// ── SQL Generators ─────────────────────────────────────────────────────────────

function generateMergeSQL(
  table: TableReference,
  mode: string,
  mappings: ColumnMapping[],
  scdConfig?: SqlPreviewPanelProps['scdConfig'],
  whereClause?: string,
  sourceTable?: TableReference | null,
): string {
  const fullTarget = `${table.database}.${table.schema}.${table.table}`;
  const fullSource = sourceTable
    ? `${sourceTable.database}.${sourceTable.schema}.${sourceTable.table}`
    : 'source_stage';
  const sourceAlias = 'src';
  const targetAlias = 'tgt';
  const businessKey = scdConfig?.businessKeyColumn || 'ID';

  const cols = mappings.length > 0
    ? mappings
    : [
        { sourceColumn: 'id', targetColumn: 'ID', transformation: undefined },
        { sourceColumn: '*', targetColumn: '*', transformation: undefined },
      ];

  const colList = cols
    .filter((c) => c.sourceColumn !== '*')
    .map((c) => c.targetColumn)
    .join(',\n    ');

  const selectList = cols
    .filter((c) => c.sourceColumn !== '*')
    .map((c) =>
      c.transformation
        ? `${c.transformation} AS ${c.targetColumn}`
        : `${sourceAlias}.${c.sourceColumn} AS ${c.targetColumn}`,
    )
    .join(',\n    ');

  const whereFilter = whereClause ? `\n  WHERE ${whereClause}` : '';

  if (mode === 'full_refresh') {
    return `-- Full Refresh: Truncate + Insert
TRUNCATE TABLE ${fullTarget};

INSERT INTO ${fullTarget} (
    ${colList}
)
SELECT
    ${selectList}
FROM ${fullSource} ${sourceAlias}${whereFilter};`;
  }

  if (mode === 'incremental') {
    return `-- Incremental Merge
MERGE INTO ${fullTarget} AS ${targetAlias}
USING (
    SELECT
        ${selectList}
    FROM ${fullSource} ${sourceAlias}${whereFilter}
) AS ${sourceAlias}
ON ${targetAlias}.${businessKey} = ${sourceAlias}.${businessKey}

WHEN MATCHED THEN UPDATE SET
${cols
  .filter((c) => c.sourceColumn !== '*' && c.targetColumn !== 'ID')
  .map((c) => `    ${targetAlias}.${c.targetColumn} = ${sourceAlias}.${c.targetColumn}`)
  .join(',\n')}

WHEN NOT MATCHED THEN INSERT (
    ${colList}
) VALUES (
    ${cols
      .filter((c) => c.sourceColumn !== '*')
      .map((c) => `${sourceAlias}.${c.targetColumn}`)
      .join(',\n    ')}
);`;
  }

  if (mode === 'scd_type2') {
    const effCol = scdConfig?.effectiveDateColumn || 'EFF_DATE';
    const expCol = scdConfig?.expirationDateColumn || 'EXP_DATE';
    const flagCol = scdConfig?.currentFlagColumn || 'IS_CURRENT';

    return `-- SCD Type 2 Merge
MERGE INTO ${fullTarget} AS ${targetAlias}
USING (
    SELECT
        ${selectList}
    FROM ${fullSource} ${sourceAlias}${whereFilter}
) AS ${sourceAlias}
ON ${targetAlias}.${businessKey} = ${sourceAlias}.${businessKey}
   AND ${targetAlias}.${flagCol} = TRUE

-- Update existing: expire old record
WHEN MATCHED AND (
    ${cols
      .filter((c) => c.sourceColumn !== '*' && c.targetColumn !== 'ID')
      .map((c) => `${targetAlias}.${c.targetColumn} != ${sourceAlias}.${c.targetColumn}`)
      .join('\n    OR ')}
) THEN UPDATE SET
    ${targetAlias}.${expCol} = CURRENT_TIMESTAMP(),
    ${targetAlias}.${flagCol} = FALSE

-- Insert new version
WHEN NOT MATCHED THEN INSERT (
    ${colList},
    ${effCol}, ${expCol}, ${flagCol}
) VALUES (
    ${cols
      .filter((c) => c.sourceColumn !== '*')
      .map((c) => `${sourceAlias}.${c.targetColumn}`)
      .join(',\n    ')},
    CURRENT_TIMESTAMP(), NULL, TRUE
);`;
  }

  if (mode === 'scd_type1') {
    return `-- SCD Type 1 Merge (Overwrite)
MERGE INTO ${fullTarget} AS ${targetAlias}
USING (
    SELECT
        ${selectList}
    FROM ${fullSource} ${sourceAlias}${whereFilter}
) AS ${sourceAlias}
ON ${targetAlias}.${businessKey} = ${sourceAlias}.${businessKey}

WHEN MATCHED THEN UPDATE SET
${cols
  .filter((c) => c.sourceColumn !== '*' && c.targetColumn !== 'ID')
  .map((c) => `    ${targetAlias}.${c.targetColumn} = ${sourceAlias}.${c.targetColumn}`)
  .join(',\n')}

WHEN NOT MATCHED THEN INSERT (
    ${colList}
) VALUES (
    ${cols
      .filter((c) => c.sourceColumn !== '*')
      .map((c) => `${sourceAlias}.${c.targetColumn}`)
      .join(',\n    ')}
);`;
  }

  if (mode === 'scd_type3') {
    const trackingCols = scdConfig?.trackingColumns || cols.filter(c => c.sourceColumn !== '*' && c.targetColumn !== 'ID').map(c => c.targetColumn);
    const prevCols = trackingCols.map(c => `${c}_PREV`);

    return `-- SCD Type 3 Merge (Previous/Current)
MERGE INTO ${fullTarget} AS ${targetAlias}
USING (
    SELECT
        ${selectList}
    FROM ${fullSource} ${sourceAlias}${whereFilter}
) AS ${sourceAlias}
ON ${targetAlias}.${businessKey} = ${sourceAlias}.${businessKey}

WHEN MATCHED THEN UPDATE SET
${trackingCols
  .map((c, i) => `    ${targetAlias}.${prevCols[i]} = ${targetAlias}.${c},\n    ${targetAlias}.${c} = ${sourceAlias}.${c}`)
  .join(',\n')},
    ${targetAlias}.LAST_UPDATED = CURRENT_TIMESTAMP()

WHEN NOT MATCHED THEN INSERT (
    ${colList}${trackingCols.length > 0 ? ',\n    ' + prevCols.join(',\n    ') : ''},
    LAST_UPDATED
) VALUES (
    ${cols.filter(c => c.sourceColumn !== '*').map(c => `${sourceAlias}.${c.targetColumn}`).join(',\n    ')}${trackingCols.length > 0 ? ',\n    ' + trackingCols.map(() => 'NULL').join(',\n    ') : ''},
    CURRENT_TIMESTAMP()
);`;
  }

  if (mode === 'snapshot') {
    return `-- Snapshot Insert (Point-in-time)
INSERT INTO ${fullTarget} (
    ${colList},
    SNAPSHOT_TS
)
SELECT
    ${selectList},
    CURRENT_TIMESTAMP() AS SNAPSHOT_TS
FROM ${fullSource} ${sourceAlias}${whereFilter};`;
  }

  // Default fallback
  return `-- ${mode.replace('_', ' ').toUpperCase()} mode
SELECT
    ${selectList}
FROM ${fullSource} ${sourceAlias}${whereFilter};`;
}

// ── Component ──────────────────────────────────────────────────────────────────

const SqlPreviewPanel: React.FC<SqlPreviewPanelProps> = ({
  table,
  ingestionMode,
  scdConfig,
  columnMappings = [],
  whereClause,
  whereClauses,
  sourceTable,
  className,
  projectId,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [serverSql, setServerSql] = useState<SqlPreviewResult | null>(null);
  const [isFetchingServer, setIsFetchingServer] = useState(false);
  const [isServerMode, setIsServerMode] = useState(false);

  // Reset server SQL when mode/mappings/where changes so preview stays in sync
  React.useEffect(() => {
    setServerSql(null);
    setIsServerMode(false);
  }, [ingestionMode, columnMappings, whereClause, whereClauses]);

  // Generate SQL client-side as fallback
  const clientSql = useMemo(() => {
    if (!table) return '';
    return generateMergeSQL(table, ingestionMode, columnMappings, scdConfig, whereClause, sourceTable);
  }, [table, ingestionMode, columnMappings, scdConfig, whereClause, sourceTable]);

  const generatedSql = isServerMode && serverSql ? serverSql.sql : clientSql;

  const lineCount = useMemo(() => generatedSql.split('\n').length, [generatedSql]);

  // Fetch SQL from server
  const fetchServerPreview = useCallback(async () => {
    if (!projectId || !table) return;
    setIsFetchingServer(true);
    try {
      const src = sourceTable || table;
      const result = await ingestionSqlPreview(projectId, {
        source_database: src.database,
        source_schema: src.schema,
        source_table: src.table,
        target_database: table.database,
        target_schema: table.schema,
        target_table: table.table,
        ingestion_mode: ingestionMode as IngestionMode,
        mappings: columnMappings.length > 0
          ? columnMappings.map((m) => ({
              source_columns: [m.sourceColumn],
              target_column: m.targetColumn,
            }))
          : undefined,
        where_clauses: whereClauses,
      });
      setServerSql(result);
      setIsServerMode(true);
      toast.success('Server-generated SQL loaded');
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to fetch SQL preview');
    } finally {
      setIsFetchingServer(false);
    }
  }, [projectId, table, sourceTable, ingestionMode, columnMappings, whereClauses]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedSql);
      setCopied(true);
      toast.success('SQL copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [generatedSql]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([generatedSql], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table?.table || 'query'}_${ingestionMode}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('SQL file downloaded');
  }, [generatedSql, table, ingestionMode]);

  if (!table) return null;

  const modeLabel = ingestionMode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header — always visible */}
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <Code2 className="h-4 w-4 text-blue-500" />
          SQL Preview
          <Badge size="sm" className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            {modeLabel}
          </Badge>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{lineCount} lines</span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* SQL Code Block */}
      {isExpanded && (
        <div className="relative">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <FileCode className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">
                {table.database}.{table.schema}.{table.table}
              </span>
              {isServerMode && serverSql && (
                <Badge size="sm" className="bg-green-900/40 text-green-400 text-[10px]">
                  Server-generated
                  {serverSql.has_where_filter && ' • Filtered'}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {projectId && (
                <Tooltip content={isServerMode ? 'Switch to client preview' : 'Fetch from server'}>
                  <button
                    onClick={isServerMode ? () => setIsServerMode(false) : fetchServerPreview}
                    disabled={isFetchingServer}
                    className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  >
                    {isFetchingServer ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </Tooltip>
              )}
              <Tooltip content="Copy SQL">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </Tooltip>
              <Tooltip content="Download .sql">
                <button
                  onClick={handleDownload}
                  className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Code */}
          <div className="bg-slate-900 p-4 overflow-auto max-h-[400px]">
            <pre className="text-sm font-mono text-slate-300 leading-relaxed">
              {highlightSQL(generatedSql)}
            </pre>
          </div>

          {/* Footer info */}
          <div className="px-3 py-2 bg-slate-800 border-t border-slate-700 flex items-center gap-3 text-xs text-slate-400">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <span>
              {isServerMode && serverSql
                ? `Server-generated SQL • ${serverSql.estimated_columns} columns${serverSql.has_where_filter ? ' • WHERE filter applied' : ''}`
                : 'Preview only — actual SQL may differ based on backend execution engine'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SqlPreviewPanel;
