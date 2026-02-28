'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import { getBlockByType, ETLBlockDefinition } from './etl-blocks';
import type { ComponentType, PipelineComponent } from '@/app/services/etl/types';

// Base ETL Node wrapper component
interface ETLNodeWrapperProps {
  data: any;
  selected?: boolean;
  type: string;
  children?: React.ReactNode;
}

const ETLNodeWrapper: React.FC<ETLNodeWrapperProps> = ({ data, selected, type, children }) => {
  const blockDef = getBlockByType(type);

  if (!blockDef) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg border-2 border-red-400">
        Unknown block type: {type}
      </div>
    );
  }

  const Icon = blockDef.icon;
  const displayName = data?.name || blockDef.label;

  // Determine handle positions for multi-input nodes
  const renderInputHandles = () => {
    if (!blockDef.hasInput) return null;

    if (blockDef.maxInputs === 2) {
      // Join node - 2 input handles
      return (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="input1"
            className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white dark:!border-slate-900"
            style={{ top: '30%' }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="input2"
            className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white dark:!border-slate-900"
            style={{ top: '70%' }}
          />
        </>
      );
    }

    if (blockDef.maxInputs > 2) {
      // Union node - multiple input handles
      const handles = [];
      for (let i = 0; i < Math.min(blockDef.maxInputs, 4); i++) {
        const topPercent = 20 + (i * 60) / (Math.min(blockDef.maxInputs, 4) - 1);
        handles.push(
          <Handle
            key={`input${i + 1}`}
            type="target"
            position={Position.Left}
            id={`input${i + 1}`}
            className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-white dark:!border-slate-900"
            style={{ top: `${topPercent}%` }}
          />
        );
      }
      return <>{handles}</>;
    }

    // Single input handle
    return (
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-white dark:!border-slate-900"
        style={{ backgroundColor: blockDef.color.replace('text-', '').includes('green') ? '#22c55e' :
                 blockDef.color.includes('amber') ? '#f59e0b' :
                 blockDef.color.includes('orange') ? '#f97316' :
                 blockDef.color.includes('purple') ? '#a855f7' :
                 blockDef.color.includes('blue') ? '#3b82f6' :
                 blockDef.color.includes('teal') ? '#14b8a6' :
                 blockDef.color.includes('rose') ? '#f43f5e' :
                 blockDef.color.includes('violet') ? '#8b5cf6' :
                 blockDef.color.includes('indigo') ? '#6366f1' :
                 blockDef.color.includes('cyan') ? '#06b6d4' :
                 blockDef.color.includes('pink') ? '#ec4899' :
                 blockDef.color.includes('slate') ? '#64748b' :
                 blockDef.color.includes('emerald') ? '#10b981' :
                 blockDef.color.includes('sky') ? '#0ea5e9' :
                 blockDef.color.includes('fuchsia') ? '#d946ef' :
                 blockDef.color.includes('lime') ? '#84cc16' :
                 '#64748b' }}
      />
    );
  };

  return (
    <div
      className={cn(
        'min-w-[180px] max-w-[220px] rounded-xl border-2 shadow-lg transition-all bg-white dark:bg-slate-800',
        blockDef.borderColor,
        selected && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900'
      )}
    >
      {/* Header */}
      <div className={cn('px-3 py-2 rounded-t-lg flex items-center gap-2', blockDef.bgColor)}>
        <div className={cn('p-1.5 rounded-lg bg-white/80 dark:bg-slate-700/80', blockDef.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
          {displayName}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        {children}
      </div>

      {/* Handles */}
      {renderInputHandles()}
      {blockDef.hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !border-2 !border-white dark:!border-slate-900"
          style={{ backgroundColor: blockDef.color.replace('text-', '').includes('green') ? '#22c55e' :
                   blockDef.color.includes('amber') ? '#f59e0b' :
                   blockDef.color.includes('orange') ? '#f97316' :
                   blockDef.color.includes('purple') ? '#a855f7' :
                   blockDef.color.includes('blue') ? '#3b82f6' :
                   blockDef.color.includes('teal') ? '#14b8a6' :
                   blockDef.color.includes('rose') ? '#f43f5e' :
                   blockDef.color.includes('violet') ? '#8b5cf6' :
                   blockDef.color.includes('indigo') ? '#6366f1' :
                   blockDef.color.includes('cyan') ? '#06b6d4' :
                   blockDef.color.includes('pink') ? '#ec4899' :
                   blockDef.color.includes('slate') ? '#64748b' :
                   blockDef.color.includes('emerald') ? '#10b981' :
                   blockDef.color.includes('sky') ? '#0ea5e9' :
                   '#64748b' }}
        />
      )}
    </div>
  );
};

// Helper to display values safely
const displayValue = (value: any, defaultText: string = 'Not set'): string => {
  if (value === null || value === undefined || value === '') return defaultText;
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : defaultText;
  return String(value);
};

// Helper to truncate text
const truncate = (text: string, maxLength: number = 20): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// ============================================
// SOURCE NODE
// ============================================
export const SourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="source">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">DB:</span>
        <span className="font-medium truncate">{displayValue(data.config?.database || data.database)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Schema:</span>
        <span className="font-medium truncate">{displayValue(data.config?.schema || data.schema)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Table:</span>
        <span className="font-medium truncate">{displayValue(data.config?.table || data.table)}</span>
      </div>
      {(data.config?.columns || data.columns) && (
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Cols:</span>
          <span className="font-medium">{Array.isArray(data.config?.columns || data.columns) ? (data.config?.columns || data.columns).length : 'All'}</span>
        </div>
      )}
    </div>
  </ETLNodeWrapper>
));
SourceNode.displayName = 'SourceNode';

// ============================================
// JOIN NODE
// ============================================
export const JoinNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="join">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Type:</span>
        <span className="font-medium">{displayValue(data.config?.join_type || data.join_type, 'INNER')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">L-Key:</span>
        <span className="font-medium truncate">{displayValue(data.config?.left_key || data.left_key)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">R-Key:</span>
        <span className="font-medium truncate">{displayValue(data.config?.right_key || data.right_key)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
JoinNode.displayName = 'JoinNode';

// ============================================
// FILTER NODE
// ============================================
export const FilterNode = memo(({ data, selected }: NodeProps) => {
  const conditions = data.config?.conditions || data.conditions || [];
  const logic = data.config?.logic || data.logic || 'AND';

  return (
    <ETLNodeWrapper data={data} selected={selected} type="filter">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Logic:</span>
          <span className="font-medium">{logic}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Conditions:</span>
          <span className="font-medium">{conditions.length}</span>
        </div>
        {conditions.length > 0 && conditions[0] && (
          <div className="text-slate-500 truncate text-[10px]">
            {conditions[0].column} {conditions[0].operator} {conditions[0].value}
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
FilterNode.displayName = 'FilterNode';

// ============================================
// AGGREGATE NODE
// ============================================
export const AggregateNode = memo(({ data, selected }: NodeProps) => {
  const groupBy = data.config?.group_by || data.group_by || [];
  const aggregations = data.config?.aggregations || data.aggregations || [];

  return (
    <ETLNodeWrapper data={data} selected={selected} type="aggregate">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Group By:</span>
          <span className="font-medium truncate">{groupBy.length > 0 ? truncate(groupBy.join(', '), 15) : 'None'}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Aggs:</span>
          <span className="font-medium">{aggregations.length}</span>
        </div>
        {aggregations.length > 0 && aggregations[0] && (
          <div className="text-slate-500 truncate text-[10px]">
            {aggregations[0].function}({aggregations[0].column}) as {aggregations[0].alias}
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
AggregateNode.displayName = 'AggregateNode';

// ============================================
// SELECT NODE
// ============================================
export const SelectNode = memo(({ data, selected }: NodeProps) => {
  const columns = data.config?.columns || data.columns || [];

  return (
    <ETLNodeWrapper data={data} selected={selected} type="select">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Columns:</span>
          <span className="font-medium">{columns.length}</span>
        </div>
        {columns.length > 0 && (
          <div className="text-slate-500 truncate text-[10px]">
            {truncate(columns.join(', '), 25)}
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
SelectNode.displayName = 'SelectNode';

// ============================================
// RENAME NODE
// ============================================
export const RenameNode = memo(({ data, selected }: NodeProps) => {
  const mappings = data.config?.mappings || data.mappings || {};
  const count = Object.keys(mappings).length;

  return (
    <ETLNodeWrapper data={data} selected={selected} type="rename">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Renames:</span>
          <span className="font-medium">{count}</span>
        </div>
        {count > 0 && (
          <div className="text-slate-500 truncate text-[10px]">
            {Object.entries(mappings).slice(0, 1).map(([old, newName]) => `${old} → ${newName}`).join(', ')}
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
RenameNode.displayName = 'RenameNode';

// ============================================
// CAST NODE
// ============================================
export const CastNode = memo(({ data, selected }: NodeProps) => {
  const casts = data.config?.casts || data.casts || {};
  const count = Object.keys(casts).length;

  return (
    <ETLNodeWrapper data={data} selected={selected} type="cast">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Casts:</span>
          <span className="font-medium">{count}</span>
        </div>
        {count > 0 && (
          <div className="text-slate-500 truncate text-[10px]">
            {Object.entries(casts).slice(0, 1).map(([col, type]) => `${col}: ${type}`).join(', ')}
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
CastNode.displayName = 'CastNode';

// ============================================
// FORMULA NODE
// ============================================
export const FormulaNode = memo(({ data, selected }: NodeProps) => {
  const formulas = data.config?.formulas || data.formulas || [];

  return (
    <ETLNodeWrapper data={data} selected={selected} type="formula">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Formulas:</span>
          <span className="font-medium">{formulas.length}</span>
        </div>
        {formulas.length > 0 && formulas[0] && (
          <div className="text-slate-500 truncate text-[10px]">
            {formulas[0].name} = {truncate(formulas[0].expression, 15)}
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
FormulaNode.displayName = 'FormulaNode';

// ============================================
// SORT NODE
// ============================================
export const SortNode = memo(({ data, selected }: NodeProps) => {
  const orderBy = data.config?.order_by || data.order_by || [];

  return (
    <ETLNodeWrapper data={data} selected={selected} type="sort">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Columns:</span>
          <span className="font-medium">{orderBy.length}</span>
        </div>
        {orderBy.length > 0 && orderBy[0] && (
          <div className="text-slate-500 truncate text-[10px]">
            {orderBy[0].column} {orderBy[0].direction}
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
SortNode.displayName = 'SortNode';

// ============================================
// UNION NODE
// ============================================
export const UnionNode = memo(({ data, selected }: NodeProps) => {
  const unionAll = data.config?.union_all ?? data.union_all ?? false;

  return (
    <ETLNodeWrapper data={data} selected={selected} type="union">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Mode:</span>
          <span className="font-medium">{unionAll ? 'UNION ALL' : 'UNION'}</span>
        </div>
      </div>
    </ETLNodeWrapper>
  );
});
UnionNode.displayName = 'UnionNode';

// ============================================
// DISTINCT NODE
// ============================================
export const DistinctNode = memo(({ data, selected }: NodeProps) => {
  const columns = data.config?.columns || data.columns || [];

  return (
    <ETLNodeWrapper data={data} selected={selected} type="distinct">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Columns:</span>
          <span className="font-medium">{columns.length > 0 ? columns.length : 'All'}</span>
        </div>
      </div>
    </ETLNodeWrapper>
  );
});
DistinctNode.displayName = 'DistinctNode';

// ============================================
// LIMIT NODE
// ============================================
export const LimitNode = memo(({ data, selected }: NodeProps) => {
  const limit = data.config?.limit || data.limit || 0;
  const offset = data.config?.offset || data.offset || 0;

  return (
    <ETLNodeWrapper data={data} selected={selected} type="limit">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Limit:</span>
          <span className="font-medium">{limit || 'Not set'}</span>
        </div>
        {offset > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Offset:</span>
            <span className="font-medium">{offset}</span>
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
LimitNode.displayName = 'LimitNode';

// ============================================
// RECOMMENDATION NODE
// ============================================
export const RecommendationNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="recommendation">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Score:</span>
        <span className="font-medium truncate">{displayValue(data.config?.score_column || data.score_column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Model:</span>
        <span className="font-medium">{displayValue(data.config?.model_type || data.model_type, 'cortex')}</span>
      </div>
      {(data.config?.input_id_column || data.input_id_column) && (
        <div className="flex items-center gap-1">
          <span className="text-slate-400">ID Col:</span>
          <span className="font-medium truncate">{data.config?.input_id_column || data.input_id_column}</span>
        </div>
      )}
    </div>
  </ETLNodeWrapper>
));
RecommendationNode.displayName = 'RecommendationNode';

// ============================================
// SEGMENTATION NODE
// ============================================
export const SegmentationNode = memo(({ data, selected }: NodeProps) => {
  const rules = data.config?.rules || data.rules || [];

  return (
    <ETLNodeWrapper data={data} selected={selected} type="segmentation">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Column:</span>
          <span className="font-medium truncate">{displayValue(data.config?.segment_column || data.segment_column)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Method:</span>
          <span className="font-medium">{displayValue(data.config?.method || data.method, 'rules')}</span>
        </div>
        {rules.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Rules:</span>
            <span className="font-medium">{rules.length}</span>
          </div>
        )}
      </div>
    </ETLNodeWrapper>
  );
});
SegmentationNode.displayName = 'SegmentationNode';

// ============================================
// CLUSTERING NODE
// ============================================
export const ClusteringNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="clustering">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{displayValue(data.config?.cluster_column || data.cluster_column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Method:</span>
        <span className="font-medium">{displayValue(data.config?.method || data.method, 'kmeans_sql')}</span>
      </div>
      {(data.config?.n_clusters || data.n_clusters) && (
        <div className="flex items-center gap-1">
          <span className="text-slate-400">K:</span>
          <span className="font-medium">{data.config?.n_clusters || data.n_clusters}</span>
        </div>
      )}
      {(data.config?.feature_columns || data.feature_columns) && (
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Features:</span>
          <span className="font-medium">{(data.config?.feature_columns || data.feature_columns || []).length}</span>
        </div>
      )}
    </div>
  </ETLNodeWrapper>
));
ClusteringNode.displayName = 'ClusteringNode';

// ============================================
// DESTINATION NODE
// ============================================
export const DestinationNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="destination">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">DB:</span>
        <span className="font-medium truncate">{displayValue(data.config?.database || data.database)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Schema:</span>
        <span className="font-medium truncate">{displayValue(data.config?.schema || data.schema)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Table:</span>
        <span className="font-medium truncate">{displayValue(data.config?.table || data.table)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Mode:</span>
        <span className="font-medium">{displayValue(data.config?.write_mode || data.write_mode, 'overwrite')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
DestinationNode.displayName = 'DestinationNode';

// ============================================
// EXPORT FILE NODE
// ============================================
export const ExportFileNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="export_file">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Format:</span>
        <span className="font-medium">{displayValue(data.config?.format || data.format, 'csv').toUpperCase()}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">File:</span>
        <span className="font-medium truncate">{displayValue(data.config?.file_name || data.file_name, 'Auto')}</span>
      </div>
      {(data.config?.compression || data.compression) && (
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Compress:</span>
          <span className="font-medium">{data.config?.compression || data.compression}</span>
        </div>
      )}
    </div>
  </ETLNodeWrapper>
));
ExportFileNode.displayName = 'ExportFileNode';

// ============================================
// LEGACY NODE TYPES (for backward compatibility)
// ============================================

// Legacy Source Node (maps to new Source)
export const LegacySourceNode = memo(({ data, selected }: NodeProps) => (
  <SourceNode data={data} selected={selected} id="" type="source" dragging={false} zIndex={0} isConnectable={true} xPos={0} yPos={0} />
));
LegacySourceNode.displayName = 'LegacySourceNode';

// Legacy Aggregate KPI Node (maps to new Aggregate)
export const LegacyAggregateKPINode = memo(({ data, selected }: NodeProps) => {
  // Convert legacy format to new format
  const convertedData = {
    ...data,
    config: {
      group_by: data.columns || [],
      aggregations: data.kpi_name ? [{
        column: data.agg_column || data.columns?.[0] || '',
        function: data.agg_type || 'SUM',
        alias: data.kpi_name,
      }] : [],
    },
  };
  return (
    <AggregateNode data={convertedData} selected={selected} id="" type="aggregate" dragging={false} zIndex={0} isConnectable={true} xPos={0} yPos={0} />
  );
});
LegacyAggregateKPINode.displayName = 'LegacyAggregateKPINode';

// ============================================
// STREAM CONSUME NODE (merged from data-engineering)
// ============================================
export const StreamConsumeNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="stream_consume">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Stream:</span>
        <span className="font-medium truncate">{displayValue(data.config?.stream_name || data.stream_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Mode:</span>
        <span className="font-medium">{displayValue(data.config?.consume_mode || data.consume_mode, 'DEFAULT')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
StreamConsumeNode.displayName = 'StreamConsumeNode';

// ============================================
// GIT FILE NODE (merged from developer)
// ============================================
export const GitFileNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="git_file">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Repo:</span>
        <span className="font-medium truncate">{displayValue(data.config?.repo_name || data.repo_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Branch:</span>
        <span className="font-medium">{displayValue(data.config?.branch || data.branch, 'main')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">File:</span>
        <span className="font-medium truncate">{displayValue(data.config?.file_path || data.file_path)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
GitFileNode.displayName = 'GitFileNode';

// ============================================
// SQL SCRIPT NODE (code runner)
// ============================================
export const SQLScriptNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="sql_script">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">SQL:</span>
        <span className="font-medium truncate">{truncate(data.config?.sql_code || data.sql_code || 'Not configured', 40)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
SQLScriptNode.displayName = 'SQLScriptNode';

// ============================================
// PYTHON SCRIPT NODE (code runner)
// ============================================
export const PythonScriptNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="python_script">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Python:</span>
        <span className="font-medium truncate">{truncate(data.config?.python_code || data.python_code || 'Not configured', 40)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
PythonScriptNode.displayName = 'PythonScriptNode';

// ============================================
// NOTEBOOK RUN NODE (merged from developer)
// ============================================
export const NotebookRunNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="notebook_run">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Notebook:</span>
        <span className="font-medium truncate">{displayValue(data.config?.notebook_name || data.notebook_name)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
NotebookRunNode.displayName = 'NotebookRunNode';

// ============================================
// DYNAMIC TABLE NODE (merged from data-engineering)
// ============================================
export const DynamicTableNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="dynamic_table">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Name:</span>
        <span className="font-medium truncate">{displayValue(data.config?.table_name || data.table_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Lag:</span>
        <span className="font-medium">{displayValue(data.config?.target_lag || data.target_lag, '20 min')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
DynamicTableNode.displayName = 'DynamicTableNode';

// ============================================
// COMPUTE POOL NODE (merged from developer)
// ============================================
export const ComputePoolNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="compute_pool">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Pool:</span>
        <span className="font-medium truncate">{displayValue(data.config?.pool_name || data.pool_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Family:</span>
        <span className="font-medium">{displayValue(data.config?.instance_family || data.instance_family, 'CPU_X64_XS')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
ComputePoolNode.displayName = 'ComputePoolNode';

// ============================================
// CONTAINER SERVICE NODE (merged from developer)
// ============================================
export const ContainerServiceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="container_service">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Service:</span>
        <span className="font-medium truncate">{displayValue(data.config?.service_name || data.service_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Pool:</span>
        <span className="font-medium truncate">{displayValue(data.config?.compute_pool || data.compute_pool)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
ContainerServiceNode.displayName = 'ContainerServiceNode';

// ============================================
// EXPORT NODE TYPES MAP
// ============================================
export const etlNodeTypes = {
  // New component types
  source: SourceNode,
  join: JoinNode,
  filter: FilterNode,
  aggregate: AggregateNode,
  select: SelectNode,
  rename: RenameNode,
  cast: CastNode,
  formula: FormulaNode,
  sort: SortNode,
  union: UnionNode,
  distinct: DistinctNode,
  limit: LimitNode,
  recommendation: RecommendationNode,
  segmentation: SegmentationNode,
  clustering: ClusteringNode,
  destination: DestinationNode,
  export_file: ExportFileNode,

  // Merged blocks (from data-engineering & developer modules)
  stream_consume: StreamConsumeNode,
  git_file: GitFileNode,
  sql_script: SQLScriptNode,
  python_script: PythonScriptNode,
  notebook_run: NotebookRunNode,
  dynamic_table: DynamicTableNode,
  compute_pool: ComputePoolNode,
  container_service: ContainerServiceNode,

  // Legacy mappings for backward compatibility
  src: SourceNode, // Legacy source
  aggregate_kpi: LegacyAggregateKPINode, // Legacy aggregate
  drop_nulls: FilterNode, // Legacy filter (drop nulls)
  drop_duplicates: DistinctNode, // Legacy distinct
  normalize: FormulaNode, // Legacy normalize (now formula)
  export_excel: ExportFileNode, // Legacy export
};

export default etlNodeTypes;
