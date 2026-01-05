'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import { getBlockByType } from './etl-blocks';
import {
  Database,
  GitMerge,
  BarChart3,
  ArrowUpDown,
  Filter,
  Copy,
  Scale,
  MapPin,
  FileSpreadsheet,
} from 'lucide-react';

// Base ETL Node wrapper component
interface ETLNodeProps {
  data: any;
  selected?: boolean;
  type: string;
  children?: React.ReactNode;
}

const ETLNodeWrapper: React.FC<ETLNodeProps> = ({ data, selected, type, children }) => {
  const blockDef = getBlockByType(type);

  if (!blockDef) {
    return <div className="p-4 bg-red-100 text-red-600">Unknown block type: {type}</div>;
  }

  const Icon = blockDef.icon;

  return (
    <div
      className={cn(
        'min-w-[160px] rounded-xl border-2 shadow-lg transition-all bg-white dark:bg-slate-800',
        blockDef.borderColor,
        selected && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900'
      )}
    >
      {/* Header */}
      <div className={cn('px-3 py-2 rounded-t-lg flex items-center gap-2', blockDef.bgColor)}>
        <div className={cn('p-1.5 rounded-lg bg-white/80 dark:bg-slate-700/80', blockDef.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
          {blockDef.label}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        {children}
      </div>

      {/* Handles */}
      {blockDef.hasInput && blockDef.inputCount === 2 ? (
        // Join node has 2 input handles
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="input1"
            className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
            style={{ top: '30%' }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="input2"
            className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
            style={{ top: '70%' }}
          />
        </>
      ) : blockDef.hasInput ? (
        <Handle
          type="target"
          position={Position.Left}
          className={cn('!w-3 !h-3 !border-2 !border-white', `!${blockDef.bgColor.replace('bg-', 'bg-').split(' ')[0].replace('50', '500')}`)}
        />
      ) : null}

      {blockDef.hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn('!w-3 !h-3 !border-2 !border-white', `!${blockDef.bgColor.replace('bg-', 'bg-').split(' ')[0].replace('50', '500')}`)}
        />
      )}
    </div>
  );
};

// Helper to get column count safely
const getColumnCount = (columns: any): number => {
  if (!columns) return 0;
  if (Array.isArray(columns)) return columns.length;
  if (typeof columns === 'string') return columns.split(',').filter(Boolean).length;
  return 0;
};

// Helper to display columns safely (handles objects with {name} keys)
const displayColumns = (columns: unknown): string => {
  if (!columns) return '';
  if (Array.isArray(columns)) {
    return columns.map(c => {
      if (typeof c === 'string') return c;
      if (c && typeof c === 'object' && 'name' in c) return String((c as { name: string }).name);
      return String(c);
    }).join(', ');
  }
  if (typeof columns === 'string') return columns;
  return String(columns);
};

// Source Node
export const SourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="src">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">DB:</span>
        <span className="font-medium truncate">{data.database || 'Not set'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Schema:</span>
        <span className="font-medium truncate">{data.schema || 'Not set'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Table:</span>
        <span className="font-medium truncate">{data.table || 'Not set'}</span>
      </div>
      {data.columns && (
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Cols:</span>
          <span className="font-medium truncate">
            {getColumnCount(data.columns)}
          </span>
        </div>
      )}
    </div>
    <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
SourceNode.displayName = 'SourceNode';

// Join Node
export const JoinNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="join">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Type:</span>
        <span className="font-medium">{data.join_type || 'INNER'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">L-Key:</span>
        <span className="font-medium truncate">{data.left_key || 'Not set'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">R-Key:</span>
        <span className="font-medium truncate">{data.right_key || 'Not set'}</span>
      </div>
    </div>
    <Handle type="target" position={Position.Left} id="input1" className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white" style={{ top: '30%' }} />
    <Handle type="target" position={Position.Left} id="input2" className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white" style={{ top: '70%' }} />
    <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
JoinNode.displayName = 'JoinNode';

// Aggregate Node
export const AggregateNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="aggregate_kpi">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">KPI:</span>
        <span className="font-medium truncate">{data.kpi_name || 'Not set'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Agg:</span>
        <span className="font-medium">{data.agg_type || 'SUM'}</span>
      </div>
      {data.columns && (
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Cols:</span>
          <span className="font-medium truncate">
            {displayColumns(data.columns)}
          </span>
        </div>
      )}
    </div>
    <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white" />
    <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
AggregateNode.displayName = 'AggregateNode';

// Sort Node
export const SortNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="sort">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{data.sort_column || 'Not set'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Order:</span>
        <span className="font-medium">{data.sort_order || 'ASC'}</span>
      </div>
    </div>
    <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
    <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
SortNode.displayName = 'SortNode';

// Drop Nulls Node
export const DropNullsNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="drop_nulls">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{data.null_column || 'Not set'}</span>
      </div>
    </div>
    <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white" />
    <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
DropNullsNode.displayName = 'DropNullsNode';

// Drop Duplicates Node
export const DropDuplicatesNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="drop_duplicates">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Dedup:</span>
        <span className="font-medium truncate">
          {data.dedup_columns
            ? displayColumns(data.dedup_columns)
            : 'Not set'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Order:</span>
        <span className="font-medium truncate">{data.order_column || 'Not set'}</span>
      </div>
    </div>
    <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-pink-500 !border-2 !border-white" />
    <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-pink-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
DropDuplicatesNode.displayName = 'DropDuplicatesNode';

// Normalize Node
export const NormalizeNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="normalize">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Type:</span>
        <span className="font-medium">{data.normalize_type === 'zscore' ? 'Z-Score' : 'Min-Max'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Target:</span>
        <span className="font-medium truncate">
          {data.normalize_type === 'zscore' ? data.zscore_column : data.minmax_column || 'Not set'}
        </span>
      </div>
    </div>
    <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-white" />
    <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
NormalizeNode.displayName = 'NormalizeNode';

// Destination Node
export const DestinationNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="destination">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">DB:</span>
        <span className="font-medium truncate">{data.database || 'Not set'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Table:</span>
        <span className="font-medium truncate">{data.destination_table || 'Not set'}</span>
      </div>
    </div>
    <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-green-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
DestinationNode.displayName = 'DestinationNode';

// Export Excel Node
export const ExportExcelNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="export_excel">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">File:</span>
        <span className="font-medium truncate">{data.filename || 'output.xlsx'}</span>
      </div>
    </div>
    <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white" />
  </ETLNodeWrapper>
));
ExportExcelNode.displayName = 'ExportExcelNode';

// Export all node types for ReactFlow
export const etlNodeTypes = {
  src: SourceNode,
  join: JoinNode,
  aggregate_kpi: AggregateNode,
  sort: SortNode,
  drop_nulls: DropNullsNode,
  drop_duplicates: DropDuplicatesNode,
  normalize: NormalizeNode,
  destination: DestinationNode,
  export_excel: ExportExcelNode,
};

export default etlNodeTypes;
