'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ChevronUp, ChevronDown, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBlockByType, ETLBlockDefinition } from './etl-blocks';
import type { ComponentType, PipelineComponent } from '@/app/services/etl/types';
import NodeRuntimeChip, { type RuntimeChipStatus } from './NodeRuntimeChip';
import NodeBigPicturePopover, { type BigPictureUpstream } from './NodeBigPicturePopover';

// Shape of the per-node enrichment injected by ETLPipelineBuilder.enrichedNodes.
// Optional — when absent, the chip falls back to "Never run" and the popover
// gracefully degrades to upstream=[] / downstream=[] / template snippet.
interface NodeRuntimeMeta {
  status?: RuntimeChipStatus;
  duration_ms?: number;
  rows?: number;
}

// Utility: safely coerce a value to an array (handles null, undefined, non-array types)
const toArray = (val: unknown): any[] => Array.isArray(val) ? val : [];

// Utility: resolve a Tailwind color class to a hex value
const resolveHandleColor = (colorClass: string): string => {
  const colorMap: Record<string, string> = {
    'green': '#22c55e', 'amber': '#f59e0b', 'orange': '#f97316',
    'purple': '#a855f7', 'blue': '#3b82f6', 'teal': '#14b8a6',
    'rose': '#f43f5e', 'violet': '#8b5cf6', 'indigo': '#6366f1',
    'cyan': '#06b6d4', 'pink': '#ec4899', 'slate': '#64748b',
    'emerald': '#10b981', 'sky': '#0ea5e9', 'fuchsia': '#d946ef',
    'lime': '#84cc16', 'red': '#ef4444', 'yellow': '#eab308',
  };
  for (const [key, value] of Object.entries(colorMap)) {
    if (colorClass.includes(key)) return value;
  }
  return '#64748b';
};

// Compact parameter badge for node content
const ParamBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-700/50">
    <span className="text-slate-400 dark:text-slate-500">{label}</span>
    <span className="text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{value}</span>
  </span>
);

// Compute node configuration status
const getConfigStatus = (data: any, blockType: string): 'configured' | 'partial' | 'empty' => {
  const config = data?.config || data || {};
  const values = Object.entries(config).filter(([k, v]) =>
    k !== 'name' && v !== null && v !== undefined && v !== '' && k !== 'config'
  );
  if (values.length === 0) return 'empty';
  return values.length >= 2 ? 'configured' : 'partial';
};

// Base ETL Node wrapper component
interface ETLNodeWrapperProps {
  data: any;
  selected?: boolean;
  type: string;
  children?: React.ReactNode;
}

const ETLNodeWrapper: React.FC<ETLNodeWrapperProps> = ({ data, selected, type, children }) => {
  const blockDef = getBlockByType(type);
  const [expanded, setExpanded] = useState(true);
  const error = data.error || data.config?.error || data.executionError || '';

  // Execution state from pipeline run results
  const execStatus = data.executionStatus as 'pending' | 'running' | 'completed' | 'failed' | undefined;
  const rowsAffected = data.rowsAffected as number | undefined;
  const durationMs = data.durationMs as number | undefined;

  // Connection counts from data (injected by ReactFlow parent or pipeline state)
  const inputCount = data?._inputCount ?? 0;
  const outputCount = data?._outputCount ?? 0;

  // Per-run runtime metadata + resolved upstream/downstream (set by enrichedNodes)
  const lastRun = (data?._lastRun ?? null) as NodeRuntimeMeta | null;
  const upstream = (Array.isArray(data?._upstream) ? data._upstream : []) as BigPictureUpstream[];
  const downstream = (Array.isArray(data?._downstream) ? data._downstream : []) as BigPictureUpstream[];

  if (!blockDef) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg border-2 border-red-400">
        Unknown block type: {type}
      </div>
    );
  }

  const Icon = blockDef.icon;
  const displayName = data?.name || blockDef.label;
  const status = getConfigStatus(data, type);

  // Determine handle positions for multi-input nodes
  const renderInputHandles = () => {
    if (!blockDef.hasInput) return null;

    if (blockDef.maxInputs === 2) {
      // Join node - 2 input handles with L/R labels
      return (
        <>
          <div className="absolute text-[8px] font-bold text-amber-500/70 pointer-events-none select-none"
               style={{ top: '26%', left: '-14px' }}>L</div>
          <Handle
            type="target"
            position={Position.Left}
            id="input1"
            className="!w-[10px] !h-[10px] !bg-amber-500 !border-2 !border-white dark:!border-slate-900 hover:!w-[14px] hover:!h-[14px] hover:!shadow-[0_0_6px_rgba(59,130,246,0.5)] transition-all duration-150"
            style={{ top: '30%' }}
          />
          <div className="absolute text-[8px] font-bold text-amber-500/70 pointer-events-none select-none"
               style={{ top: '66%', left: '-14px' }}>R</div>
          <Handle
            type="target"
            position={Position.Left}
            id="input2"
            className="!w-[10px] !h-[10px] !bg-amber-500 !border-2 !border-white dark:!border-slate-900 hover:!w-[14px] hover:!h-[14px] hover:!shadow-[0_0_6px_rgba(59,130,246,0.5)] transition-all duration-150"
            style={{ top: '70%' }}
          />
        </>
      );
    }

    if (blockDef.maxInputs > 2) {
      // Union node - multiple input handles with A/B/C/D labels
      const labels = ['A', 'B', 'C', 'D'];
      const handles = [];
      for (let i = 0; i < Math.min(blockDef.maxInputs, 4); i++) {
        const topPercent = 20 + (i * 60) / (Math.min(blockDef.maxInputs, 4) - 1);
        handles.push(
          <React.Fragment key={`input${i + 1}`}>
            <div className="absolute text-[8px] font-bold text-cyan-500/70 pointer-events-none select-none"
                 style={{ top: `${topPercent - 4}%`, left: '-14px' }}>{labels[i]}</div>
            <Handle
              type="target"
              position={Position.Left}
              id={`input${i + 1}`}
              className="!w-[10px] !h-[10px] !bg-cyan-500 !border-2 !border-white dark:!border-slate-900 hover:!w-[14px] hover:!h-[14px] hover:!shadow-[0_0_6px_rgba(59,130,246,0.5)] transition-all duration-150"
              style={{ top: `${topPercent}%` }}
            />
          </React.Fragment>
        );
      }
      return <>{handles}</>;
    }

    // Single input handle
    return (
      <Handle
        type="target"
        position={Position.Left}
        className="!w-[10px] !h-[10px] !border-2 !border-white dark:!border-slate-900 hover:!w-[14px] hover:!h-[14px] hover:!shadow-[0_0_6px_rgba(59,130,246,0.5)] transition-all duration-150"
        style={{ backgroundColor: resolveHandleColor(blockDef.color) }}
      />
    );
  };

  // Border color: execution state > validation error > default
  const borderClass = execStatus === 'failed'
    ? 'border-red-500 shadow-red-200/50 dark:shadow-red-900/30'
    : execStatus === 'completed'
      ? 'border-green-500 shadow-green-200/50 dark:shadow-green-900/30'
      : execStatus === 'running'
        ? 'border-blue-500 shadow-blue-200/50 dark:shadow-blue-900/30 animate-pulse'
        : error
          ? 'border-red-500 shadow-red-100 dark:shadow-red-900/20'
          : blockDef.borderColor;

  // Status dot color: execution state > config status
  const dotClass = execStatus === 'failed' ? 'bg-red-500'
    : execStatus === 'completed' ? 'bg-green-500'
    : execStatus === 'running' ? 'bg-blue-500 animate-pulse'
    : error ? 'bg-red-500'
    : status === 'configured' ? 'bg-green-500'
    : status === 'partial' ? 'bg-amber-500'
    : 'bg-slate-300 dark:bg-slate-600';

  // Format duration
  const fmtDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Unconfigured nodes: dashed border + slight opacity
  const isUnconfigured = status === 'empty' && !execStatus;

  // Drop-target hint set by the parent while another node is dragging out.
  // 'valid'   → green pulsing halo, "drop here" affordance.
  // 'invalid' → red dim + dashed border (saturated input or self-loop).
  const dropHint = (data?._dropHint ?? null) as 'valid' | 'invalid' | null;

  return (
    <div
      className={cn(
        'relative min-w-[240px] max-w-[300px] rounded-xl border-2 shadow-lg transition-all hover:shadow-2xl hover:-translate-y-0.5 bg-white dark:bg-slate-800',
        borderClass,
        isUnconfigured && 'border-dashed opacity-75',
        selected && 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900',
        dropHint === 'valid' && 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900 shadow-[0_0_24px_rgba(16,185,129,0.45)] animate-pulse',
        dropHint === 'invalid' && 'opacity-40 grayscale',
      )}
      title={
        dropHint === 'valid' ? 'Drop here to connect'
          : dropHint === 'invalid' ? 'Cannot connect to this block (saturated input or self-loop)'
          : isUnconfigured ? 'Click to configure this block' : undefined
      }
    >
      {/* Step number badge — color reflects execution state */}
      {(data.config?.step_order || data.step_order || data.stepIndex) && (
        <div
          className={cn(
            'absolute -top-2.5 -left-2.5 min-w-[20px] h-5 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow-sm z-10',
            execStatus === 'failed' ? 'bg-red-500' :
            execStatus === 'completed' ? 'bg-green-500' :
            execStatus === 'running' ? 'bg-blue-500 animate-pulse' :
            error ? 'bg-red-500' : 'bg-blue-500'
          )}
          title={error || `Step ${data.stepIndex || data.config?.step_order || data.step_order}`}
        >
          {execStatus === 'failed' && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
          {execStatus === 'completed' && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
          {data.stepIndex || data.config?.step_order || data.step_order}
        </div>
      )}

      {/* Status indicator dot */}
      <div className={cn(
        'absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 z-10',
        dotClass
      )} />

      {/* Header */}
      <div className={cn('px-3 py-2 rounded-t-lg flex items-center gap-2 relative', error ? 'bg-red-50 dark:bg-red-900/20' : blockDef.bgColor)}>
        <div className={cn('p-1.5 rounded-lg bg-white/80 dark:bg-slate-700/80', error ? 'text-red-500' : blockDef.color)}>
          <Icon className="h-4 w-4" />
        </div>
        {/* Runtime chip — hidden when never run AND the node is a fresh AI-generated draft */}
        {!(lastRun == null && data?.aiGenerated) && (
          <NodeRuntimeChip
            status={lastRun?.status}
            duration_ms={lastRun?.duration_ms}
            rows={lastRun?.rows}
          />
        )}
        <div className="flex-1 min-w-0">
          <span className={cn('font-semibold text-sm truncate block', error ? 'text-red-700 dark:text-red-300' : 'text-slate-800 dark:text-slate-100')} title={displayName}>
            {displayName}
          </span>
          {error && (
            <span className="text-[9px] text-red-500 dark:text-red-400 truncate block" title={error}>
              ⚠ {error.substring(0, 50)}{error.length > 50 ? '...' : ''}
            </span>
          )}
        </div>
        {/* Big-picture popover trigger */}
        <NodeBigPicturePopover
          nodeId={data?.id ?? data?.nodeId ?? ''}
          type={type}
          label={displayName}
          config={(data?.config as Record<string, unknown>) ?? {}}
          upstream={upstream}
          downstream={downstream}
          compiledSnippet={data?._compiledSnippet}
          onOpenConfig={typeof data?._onOpenConfig === 'function' ? data._onOpenConfig : undefined}
        />
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="p-0.5 rounded hover:bg-white/20 transition-colors"
          aria-label={expanded ? 'Collapse block details' : 'Expand block details'}
        >
          {expanded ? <ChevronUp className="h-3 w-3 text-slate-500 dark:text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-500 dark:text-slate-400" />}
        </button>
      </div>

      {/* Content (collapsible) */}
      {expanded && children && (
        <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
          {children}
        </div>
      )}

      {/* Data flow context badge */}
      {expanded && data.config?.table && (
        <div className="mx-3 mb-2 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded text-[10px] text-blue-600 dark:text-blue-400 truncate">
          {data.config.database ? `${data.config.database}.` : ''}{data.config.table}
        </div>
      )}

      {/* Execution result badges — rows affected + duration */}
      {execStatus && execStatus !== 'pending' && (
        <div className={cn(
          'mx-3 mb-2 flex items-center gap-1.5 text-[10px] font-medium',
          execStatus === 'failed' ? 'text-red-600 dark:text-red-400' :
          execStatus === 'completed' ? 'text-green-600 dark:text-green-400' :
          'text-blue-600 dark:text-blue-400'
        )}>
          {execStatus === 'running' && (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running...</span>
          )}
          {execStatus === 'completed' && (
            <>
              <CheckCircle2 className="h-3 w-3" />
              {rowsAffected !== undefined && <span>{rowsAffected.toLocaleString()} rows</span>}
              {durationMs !== undefined && <span className="text-slate-400">| {fmtDuration(durationMs)}</span>}
            </>
          )}
          {execStatus === 'failed' && (
            <>
              <XCircle className="h-3 w-3" />
              <span className="truncate">{(data.executionError || 'Failed').toString().substring(0, 60)}</span>
            </>
          )}
        </div>
      )}

      {/* Input port indicator */}
      {blockDef.hasInput && blockDef.maxInputs <= 1 && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white dark:border-slate-800 pointer-events-none" title="Input" />
      )}

      {/* Output port indicator */}
      {blockDef.hasOutput && (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-400 border border-white dark:border-slate-800 pointer-events-none" title="Output" />
      )}

      {/* Handles */}
      {renderInputHandles()}
      {blockDef.hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            '!w-[10px] !h-[10px] !border-2 !border-white dark:!border-slate-900 hover:!w-[14px] hover:!h-[14px] hover:!shadow-[0_0_6px_rgba(59,130,246,0.5)] transition-all duration-150',
            outputCount === 0 && !execStatus && '!w-[12px] !h-[12px] animate-pulse !shadow-[0_0_8px_rgba(16,185,129,0.6)]'
          )}
          style={{ backgroundColor: resolveHandleColor(blockDef.color) }}
          title={outputCount === 0 ? 'Drag to connect to next block' : undefined}
        />
      )}

      {/* Connected edges count */}
      {(inputCount > 0 || outputCount > 0) && (
        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-600 text-white text-[8px] rounded-full leading-none whitespace-nowrap shadow-sm">
          {inputCount}&rarr;{outputCount}
        </div>
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
export const SourceNode = memo(({ data, selected }: NodeProps) => {
  const colCount = Array.isArray(data.config?.columns || data.columns) ? (data.config?.columns || data.columns).length : null;
  const rowEstimate = data.config?.row_count || data.row_count;
  const lastRefresh = data.config?.last_refresh || data.last_refresh;

  return (
    <ETLNodeWrapper data={data} selected={selected} type="source">
      <div className="flex flex-wrap gap-1">
        <ParamBadge label="DB" value={displayValue(data.config?.database || data.database)} />
        <ParamBadge label="Schema" value={displayValue(data.config?.schema || data.schema)} />
        <ParamBadge label="Table" value={displayValue(data.config?.table || data.table)} />
        {colCount !== null && <ParamBadge label="Cols" value={String(colCount)} />}
      </div>
      {(rowEstimate || lastRefresh) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {rowEstimate && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
              ~{Number(rowEstimate).toLocaleString()} rows
            </span>
          )}
          {lastRefresh && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 truncate max-w-[140px]">
              {lastRefresh}
            </span>
          )}
        </div>
      )}
    </ETLNodeWrapper>
  );
});
SourceNode.displayName = 'SourceNode';

// ============================================
// JOIN NODE
// ============================================
export const JoinNode = memo(({ data, selected }: NodeProps) => {
  const joinType = displayValue(data.config?.join_type || data.join_type, 'INNER');
  const joinBg = joinType === 'LEFT' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
    : joinType === 'FULL' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
    : joinType === 'CROSS' ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400';

  return (
    <ETLNodeWrapper data={data} selected={selected} type="join">
      <div className="flex flex-wrap gap-1">
        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase', joinBg)}>
          {joinType}
        </span>
        <ParamBadge label="L-Key" value={displayValue(data.config?.left_key || data.left_key)} />
        <ParamBadge label="R-Key" value={displayValue(data.config?.right_key || data.right_key)} />
      </div>
    </ETLNodeWrapper>
  );
});
JoinNode.displayName = 'JoinNode';

// ============================================
// FILTER NODE
// ============================================
export const FilterNode = memo(({ data, selected }: NodeProps) => {
  const conditions = toArray(data.config?.conditions || data.conditions);
  const logic = data.config?.logic || data.logic || 'AND';
  const uniqueCols = new Set(conditions.map((c: any) => c?.column).filter(Boolean)).size;

  return (
    <ETLNodeWrapper data={data} selected={selected} type="filter">
      <div className="flex flex-wrap gap-1">
        <ParamBadge label="Logic" value={logic} />
        <ParamBadge label="Rules" value={String(conditions.length)} />
        {uniqueCols > 0 && <ParamBadge label="Cols" value={String(uniqueCols)} />}
      </div>
      {conditions.length > 0 && conditions[0] && (
        <div className="text-slate-500 truncate text-[10px] mt-1">
          {conditions[0].column} {conditions[0].operator} {conditions[0].value}
        </div>
      )}
    </ETLNodeWrapper>
  );
});
FilterNode.displayName = 'FilterNode';

// ============================================
// AGGREGATE NODE
// ============================================
export const AggregateNode = memo(({ data, selected }: NodeProps) => {
  const groupBy = toArray(data.config?.group_by || data.group_by);
  const aggregations = toArray(data.config?.aggregations || data.aggregations);
  const outputCols = groupBy.length + aggregations.length;

  return (
    <ETLNodeWrapper data={data} selected={selected} type="aggregate">
      <div className="flex flex-wrap gap-1">
        <ParamBadge label="Group" value={groupBy.length > 0 ? truncate(groupBy.join(', '), 15) : 'None'} />
        <ParamBadge label="Aggs" value={String(aggregations.length)} />
      </div>
      {aggregations.length > 0 && aggregations[0] && (
        <div className="text-slate-500 truncate text-[10px] mt-1">
          {aggregations[0].function}({aggregations[0].column}) as {aggregations[0].alias}
        </div>
      )}
      {outputCols > 0 && (
        <div className="mt-1 flex gap-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400">
            {outputCols} output cols
          </span>
        </div>
      )}
    </ETLNodeWrapper>
  );
});
AggregateNode.displayName = 'AggregateNode';

// ============================================
// SELECT NODE
// ============================================
export const SelectNode = memo(({ data, selected }: NodeProps) => {
  const rawCols = data.config?.columns || data.columns || [];
  const columns = Array.isArray(rawCols) ? rawCols : [];

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
  const formulas = toArray(data.config?.formulas || data.formulas);

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
  const orderBy = toArray(data.config?.order_by || data.order_by);

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
  const columns = toArray(data.config?.columns || data.columns);

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
  const rules = toArray(data.config?.rules || data.rules);

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
          <span className="font-medium">{toArray(data.config?.feature_columns || data.feature_columns).length}</span>
        </div>
      )}
    </div>
  </ETLNodeWrapper>
));
ClusteringNode.displayName = 'ClusteringNode';

// ============================================
// DESTINATION NODE
// ============================================
export const DestinationNode = memo(({ data, selected }: NodeProps) => {
  const writeMode = displayValue(data.config?.write_mode || data.write_mode, 'overwrite');
  const modeBg = writeMode === 'append' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
    : writeMode === 'merge' ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400';

  return (
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
        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase', modeBg)}>
          {writeMode}
        </span>
      </div>
    </ETLNodeWrapper>
  );
});
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
// CDC MERGE NODE (stream MERGE INTO target)
// ============================================
export const CdcMergeNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="cdc_merge">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Stream:</span>
        <span className="font-medium truncate">{displayValue(data.config?.stream_name || data.stream_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Target:</span>
        <span className="font-medium truncate">{displayValue(data.config?.target_table || data.target_table)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
CdcMergeNode.displayName = 'CdcMergeNode';

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
// WINDOW RANK NODE
// ============================================
export const WindowRankNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="window_rank">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Function:</span>
        <span className="font-medium">{displayValue(data.config?.function || data.function, 'RANK')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Partition:</span>
        <span className="font-medium truncate">{displayValue(data.config?.partition_by || data.partition_by)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Output:</span>
        <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
WindowRankNode.displayName = 'WindowRankNode';

// ============================================
// WINDOW LAG/LEAD NODE
// ============================================
export const WindowLagLeadNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="window_lag_lead">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Function:</span>
        <span className="font-medium">{displayValue(data.config?.function || data.function, 'LAG')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{displayValue(data.config?.column || data.column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Offset:</span>
        <span className="font-medium">{displayValue(data.config?.offset || data.offset, '1')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Output:</span>
        <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
WindowLagLeadNode.displayName = 'WindowLagLeadNode';

// ============================================
// WINDOW AGGREGATE NODE
// ============================================
export const WindowAggregateNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="window_aggregate">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Agg:</span>
        <span className="font-medium">{displayValue(data.config?.agg_function || data.agg_function, 'SUM')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{displayValue(data.config?.column || data.column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Output:</span>
        <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
WindowAggregateNode.displayName = 'WindowAggregateNode';

// ============================================
// WINDOW NTILE NODE
// ============================================
export const WindowNtileNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="window_ntile">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Buckets:</span>
        <span className="font-medium">{displayValue(data.config?.buckets || data.buckets)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Partition:</span>
        <span className="font-medium truncate">{displayValue(data.config?.partition_by || data.partition_by)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Output:</span>
        <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
WindowNtileNode.displayName = 'WindowNtileNode';

// ============================================
// JSON FLATTEN NODE
// ============================================
export const JsonFlattenNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="json_flatten">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Input:</span>
        <span className="font-medium truncate">{displayValue(data.config?.input_column || data.input_column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Path:</span>
        <span className="font-medium truncate">{displayValue(data.config?.json_path || data.json_path)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Mode:</span>
        <span className="font-medium">{displayValue(data.config?.flatten_mode || data.flatten_mode, 'OUTER')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
JsonFlattenNode.displayName = 'JsonFlattenNode';

// ============================================
// JSON EXTRACT NODE
// ============================================
export const JsonExtractNode = memo(({ data, selected }: NodeProps) => {
  const paths = toArray(data.config?.extract_paths || data.extract_paths);

  return (
    <ETLNodeWrapper data={data} selected={selected} type="json_extract">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Input:</span>
          <span className="font-medium truncate">{displayValue(data.config?.input_column || data.input_column)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Paths:</span>
          <span className="font-medium">{paths.length}</span>
        </div>
      </div>
    </ETLNodeWrapper>
  );
});
JsonExtractNode.displayName = 'JsonExtractNode';

// ============================================
// JSON CONSTRUCT NODE
// ============================================
export const JsonConstructNode = memo(({ data, selected }: NodeProps) => {
  const columns = toArray(data.config?.columns || data.columns);

  return (
    <ETLNodeWrapper data={data} selected={selected} type="json_construct">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Columns:</span>
          <span className="font-medium">{Array.isArray(columns) ? columns.length : 0}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Output:</span>
          <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
        </div>
      </div>
    </ETLNodeWrapper>
  );
});
JsonConstructNode.displayName = 'JsonConstructNode';

// ============================================
// PIVOT NODE
// ============================================
export const PivotNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="pivot">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Pivot:</span>
        <span className="font-medium truncate">{displayValue(data.config?.pivot_column || data.pivot_column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Value:</span>
        <span className="font-medium truncate">{displayValue(data.config?.value_column || data.value_column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Agg:</span>
        <span className="font-medium">{displayValue(data.config?.agg_function || data.agg_function, 'SUM')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
PivotNode.displayName = 'PivotNode';

// ============================================
// UNPIVOT NODE
// ============================================
export const UnpivotNode = memo(({ data, selected }: NodeProps) => {
  const columns = toArray(data.config?.columns || data.columns);

  return (
    <ETLNodeWrapper data={data} selected={selected} type="unpivot">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Value Col:</span>
          <span className="font-medium truncate">{displayValue(data.config?.value_column_name || data.value_column_name)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Name Col:</span>
          <span className="font-medium truncate">{displayValue(data.config?.name_column_name || data.name_column_name)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Columns:</span>
          <span className="font-medium">{Array.isArray(columns) ? columns.length : 0}</span>
        </div>
      </div>
    </ETLNodeWrapper>
  );
});
UnpivotNode.displayName = 'UnpivotNode';

// ============================================
// DATE TRANSFORM NODE
// ============================================
export const DateTransformNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="date_transform">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Op:</span>
        <span className="font-medium">{displayValue(data.config?.operation || data.operation, 'DATEADD')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{displayValue(data.config?.column || data.column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Output:</span>
        <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
DateTransformNode.displayName = 'DateTransformNode';

// ============================================
// TIME SLICE NODE
// ============================================
export const TimeSliceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="time_slice">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{displayValue(data.config?.column || data.column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Slice:</span>
        <span className="font-medium">{displayValue(data.config?.slice_length || data.slice_length, '1')} {displayValue(data.config?.slice_unit || data.slice_unit, 'HOUR')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Output:</span>
        <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
TimeSliceNode.displayName = 'TimeSliceNode';

// ============================================
// FILL NULLS NODE
// ============================================
export const FillNullsNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="fill_nulls">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Column:</span>
        <span className="font-medium truncate">{displayValue(data.config?.column || data.column)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Strategy:</span>
        <span className="font-medium">{displayValue(data.config?.strategy || data.strategy, 'VALUE')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
FillNullsNode.displayName = 'FillNullsNode';

// ============================================
// CASE WHEN NODE
// ============================================
export const CaseWhenNode = memo(({ data, selected }: NodeProps) => {
  const conditions = toArray(data.config?.conditions || data.conditions);

  return (
    <ETLNodeWrapper data={data} selected={selected} type="case_when">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Conditions:</span>
          <span className="font-medium">{conditions.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Output:</span>
          <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
        </div>
      </div>
    </ETLNodeWrapper>
  );
});
CaseWhenNode.displayName = 'CaseWhenNode';

// ============================================
// SPLIT COLUMN NODE
// ============================================
export const SplitColumnNode = memo(({ data, selected }: NodeProps) => {
  const outputColumns = toArray(data.config?.output_columns || data.output_columns);

  return (
    <ETLNodeWrapper data={data} selected={selected} type="split_column">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Column:</span>
          <span className="font-medium truncate">{displayValue(data.config?.column || data.column)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Delimiter:</span>
          <span className="font-medium">{displayValue(data.config?.delimiter || data.delimiter, ',')}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Outputs:</span>
          <span className="font-medium">{Array.isArray(outputColumns) ? outputColumns.length : 0}</span>
        </div>
      </div>
    </ETLNodeWrapper>
  );
});
SplitColumnNode.displayName = 'SplitColumnNode';

// ============================================
// S3 SOURCE NODE
// ============================================
export const S3SourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="s3_source">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Stage:</span>
        <span className="font-medium truncate">{displayValue(data.config?.stage_name || data.stage_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Format:</span>
        <span className="font-medium">{displayValue(data.config?.file_format || data.file_format, 'CSV')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
S3SourceNode.displayName = 'S3SourceNode';

// ============================================
// AZURE SOURCE NODE
// ============================================
export const AzureSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="azure_source">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Stage:</span>
        <span className="font-medium truncate">{displayValue(data.config?.stage_name || data.stage_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Format:</span>
        <span className="font-medium">{displayValue(data.config?.file_format || data.file_format, 'CSV')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
AzureSourceNode.displayName = 'AzureSourceNode';

// ============================================
// GCS SOURCE NODE
// ============================================
export const GcsSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="gcs_source">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Stage:</span>
        <span className="font-medium truncate">{displayValue(data.config?.stage_name || data.stage_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Format:</span>
        <span className="font-medium">{displayValue(data.config?.file_format || data.file_format, 'CSV')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
GcsSourceNode.displayName = 'GcsSourceNode';

// ============================================
// POSTGRES SOURCE NODE
// ============================================
export const PostgresSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="postgres_source">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Connection:</span>
        <span className="font-medium truncate">{displayValue(data.config?.connection_name || data.connection_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Table:</span>
        <span className="font-medium truncate">{displayValue(data.config?.source_table || data.source_table)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
PostgresSourceNode.displayName = 'PostgresSourceNode';

// ============================================
// MYSQL SOURCE NODE
// ============================================
export const MysqlSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="mysql_source">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Connection:</span>
        <span className="font-medium truncate">{displayValue(data.config?.connection_name || data.connection_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Table:</span>
        <span className="font-medium truncate">{displayValue(data.config?.source_table || data.source_table)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
MysqlSourceNode.displayName = 'MysqlSourceNode';

// ============================================
// EXTERNAL TABLE SOURCE NODE
// ============================================
export const ExternalTableSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="external_table_source">
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
        <span className="font-medium truncate">{displayValue(data.config?.table_name || data.table_name)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
ExternalTableSourceNode.displayName = 'ExternalTableSourceNode';

// ============================================
// DYNAMIC TABLE SOURCE NODE
// ============================================
export const DynamicTableSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="dynamic_table_source">
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
        <span className="font-medium truncate">{displayValue(data.config?.table_name || data.table_name)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
DynamicTableSourceNode.displayName = 'DynamicTableSourceNode';

// ============================================
// SHARED DATA SOURCE NODE
// ============================================
export const SharedDataSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="shared_data_source">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Share DB:</span>
        <span className="font-medium truncate">{displayValue(data.config?.share_database || data.share_database)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Schema:</span>
        <span className="font-medium truncate">{displayValue(data.config?.schema || data.schema)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Table:</span>
        <span className="font-medium truncate">{displayValue(data.config?.table_name || data.table_name)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
SharedDataSourceNode.displayName = 'SharedDataSourceNode';

// ============================================
// SALESFORCE SOURCE NODE
// ============================================
export const SalesforceSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="salesforce_source">
    <div className="flex flex-wrap gap-1">
      <ParamBadge label="DB" value={displayValue(data.config?.target_database || data.target_database)} />
      <ParamBadge label="Object" value={displayValue(data.config?.object_name || data.object_name)} />
    </div>
  </ETLNodeWrapper>
));
SalesforceSourceNode.displayName = 'SalesforceSourceNode';

// ============================================
// SAP SOURCE NODE
// ============================================
export const SapSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="sap_source">
    <div className="flex flex-wrap gap-1">
      <ParamBadge label="DB" value={displayValue(data.config?.target_database || data.target_database)} />
      <ParamBadge label="Table" value={displayValue(data.config?.table_name || data.table_name)} />
    </div>
  </ETLNodeWrapper>
));
SapSourceNode.displayName = 'SapSourceNode';

// ============================================
// ORACLE SOURCE NODE
// ============================================
export const OracleSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="oracle_source">
    <div className="flex flex-wrap gap-1">
      <ParamBadge label="DB" value={displayValue(data.config?.target_database || data.target_database)} />
      <ParamBadge label="Table" value={displayValue(data.config?.table_name || data.table_name)} />
    </div>
  </ETLNodeWrapper>
));
OracleSourceNode.displayName = 'OracleSourceNode';

// ============================================
// HUBSPOT SOURCE NODE
// ============================================
export const HubspotSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="hubspot_source">
    <div className="flex flex-wrap gap-1">
      <ParamBadge label="DB" value={displayValue(data.config?.target_database || data.target_database)} />
      <ParamBadge label="Object" value={displayValue(data.config?.object_name || data.object_name)} />
    </div>
  </ETLNodeWrapper>
));
HubspotSourceNode.displayName = 'HubspotSourceNode';

// ============================================
// SERVICENOW SOURCE NODE
// ============================================
export const ServicenowSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="servicenow_source">
    <div className="flex flex-wrap gap-1">
      <ParamBadge label="DB" value={displayValue(data.config?.target_database || data.target_database)} />
      <ParamBadge label="Table" value={displayValue(data.config?.table_name || data.table_name)} />
    </div>
  </ETLNodeWrapper>
));
ServicenowSourceNode.displayName = 'ServicenowSourceNode';

// ============================================
// REST API SOURCE NODE
// ============================================
export const ApiSourceNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="api_source">
    <div className="flex flex-wrap gap-1">
      <ParamBadge label="DB" value={displayValue(data.config?.target_database || data.target_database)} />
      <ParamBadge label="Schema" value={displayValue(data.config?.schema_name || data.schema_name)} />
      <ParamBadge label="Table" value={displayValue(data.config?.table_name || data.table_name)} />
    </div>
  </ETLNodeWrapper>
));
ApiSourceNode.displayName = 'ApiSourceNode';

// ============================================
// CREATE UDF NODE
// ============================================
export const CreateUdfNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="create_udf">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Function:</span>
        <span className="font-medium truncate">{displayValue(data.config?.function_name || data.function_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Language:</span>
        <span className="font-medium">{displayValue(data.config?.language || data.language, 'PYTHON')}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Returns:</span>
        <span className="font-medium">{displayValue(data.config?.return_type || data.return_type, 'VARCHAR')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
CreateUdfNode.displayName = 'CreateUdfNode';

// ============================================
// CREATE PROCEDURE NODE
// ============================================
export const CreateProcedureNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="create_procedure">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Procedure:</span>
        <span className="font-medium truncate">{displayValue(data.config?.procedure_name || data.procedure_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Returns:</span>
        <span className="font-medium">{displayValue(data.config?.return_type || data.return_type, 'VARCHAR')}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
CreateProcedureNode.displayName = 'CreateProcedureNode';

// ============================================
// APPLY UDF NODE
// ============================================
export const ApplyUdfNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="apply_udf">
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Function:</span>
        <span className="font-medium truncate">{displayValue(data.config?.function_name || data.function_name)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">Output:</span>
        <span className="font-medium truncate">{displayValue(data.config?.output_column || data.output_column)}</span>
      </div>
    </div>
  </ETLNodeWrapper>
));
ApplyUdfNode.displayName = 'ApplyUdfNode';

// ============================================
// AI FUNCTION NODES
// ============================================
export const AiClassifyNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="ai_classify">
    <div className="space-y-1">
      <ParamBadge label="Model" value={displayValue(data.config?.model || data.model, 'llama3.1-8b')} />
      <ParamBadge label="Input" value={displayValue(data.config?.input_column || data.input_column)} />
      <ParamBadge label="Categories" value={displayValue(toArray(data.config?.categories || data.categories).length + ' labels')} />
    </div>
    <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
      ~0.01 cr/1K rows
    </span>
  </ETLNodeWrapper>
));
AiClassifyNode.displayName = 'AiClassifyNode';

export const AiSentimentNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="ai_sentiment">
    <div className="space-y-1">
      <ParamBadge label="Input" value={displayValue(data.config?.input_column || data.input_column)} />
      <ParamBadge label="Output" value={displayValue(data.config?.output_column || data.output_column, 'SENTIMENT')} />
    </div>
  </ETLNodeWrapper>
));
AiSentimentNode.displayName = 'AiSentimentNode';

export const AiTranslateNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="ai_translate">
    <div className="space-y-1">
      <ParamBadge label="Input" value={displayValue(data.config?.input_column || data.input_column)} />
      <ParamBadge label="From" value={displayValue(data.config?.source_language || data.source_language, 'auto')} />
      <ParamBadge label="To" value={displayValue(data.config?.target_language || data.target_language, 'en')} />
    </div>
  </ETLNodeWrapper>
));
AiTranslateNode.displayName = 'AiTranslateNode';

export const AiExtractNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="ai_extract">
    <div className="space-y-1">
      <ParamBadge label="Input" value={displayValue(data.config?.input_column || data.input_column)} />
      <ParamBadge label="Extract" value={displayValue(toArray(data.config?.extract_keys || data.extract_keys).join(', '))} />
    </div>
  </ETLNodeWrapper>
));
AiExtractNode.displayName = 'AiExtractNode';

export const AiCompleteNode = memo(({ data, selected }: NodeProps) => {
  const model = displayValue(data.config?.model || data.model, 'llama3.1-70b');
  const costEstimate = model.includes('70b') ? '~0.06' : model.includes('405b') ? '~0.20' : '~0.01';

  return (
    <ETLNodeWrapper data={data} selected={selected} type="ai_complete">
      <div className="space-y-1">
        <ParamBadge label="Model" value={model} />
        <ParamBadge label="Input" value={displayValue(data.config?.input_column || data.input_column)} />
        <ParamBadge label="Prompt" value={displayValue(data.config?.prompt_template || data.prompt_template, 'Not set')} />
      </div>
      <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
        {costEstimate} cr/1K rows
      </span>
    </ETLNodeWrapper>
  );
});
AiCompleteNode.displayName = 'AiCompleteNode';

// ============================================
// ML TRAINING NODES
// ============================================
export const FinetuneNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="finetune">
    <div className="space-y-1">
      <ParamBadge label="Base" value={displayValue(data.config?.base_model || data.base_model, 'llama3.1-8b')} />
      <ParamBadge label="Train" value={displayValue(data.config?.training_table || data.training_table)} />
    </div>
  </ETLNodeWrapper>
));
FinetuneNode.displayName = 'FinetuneNode';

export const ClassificationTrainNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="classification_train">
    <div className="space-y-1">
      <ParamBadge label="Target" value={displayValue(data.config?.target_column || data.target_column)} />
      <ParamBadge label="Features" value={displayValue(toArray(data.config?.feature_columns || data.feature_columns).length + ' cols')} />
    </div>
  </ETLNodeWrapper>
));
ClassificationTrainNode.displayName = 'ClassificationTrainNode';

export const AnomalyDetectNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="anomaly_detect">
    <div className="space-y-1">
      <ParamBadge label="Input" value={displayValue(data.config?.input_columns || data.input_columns, 'Not set')} />
      <ParamBadge label="Output" value={displayValue(data.config?.output_column || data.output_column, 'IS_ANOMALY')} />
    </div>
  </ETLNodeWrapper>
));
AnomalyDetectNode.displayName = 'AnomalyDetectNode';

export const ForecastNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="forecast">
    <div className="space-y-1">
      <ParamBadge label="Target" value={displayValue(data.config?.target_column || data.target_column)} />
      <ParamBadge label="Horizon" value={displayValue(data.config?.forecast_horizon || data.forecast_horizon, '30')} />
      <ParamBadge label="Time" value={displayValue(data.config?.timestamp_column || data.timestamp_column)} />
    </div>
  </ETLNodeWrapper>
));
ForecastNode.displayName = 'ForecastNode';

export const DocumentAiNode = memo(({ data, selected }: NodeProps) => (
  <ETLNodeWrapper data={data} selected={selected} type="document_ai">
    <div className="space-y-1">
      <ParamBadge label="Model" value={displayValue(data.config?.model || data.model)} />
      <ParamBadge label="Input" value={displayValue(data.config?.input_column || data.input_column)} />
    </div>
  </ETLNodeWrapper>
));
DocumentAiNode.displayName = 'DocumentAiNode';

// ============================================
// GENERIC NODE — fallback for blocks without a dedicated component
// ============================================
// Factory to create typed generic nodes — shows config params automatically
const makeGenericNode = (blockType: string) => {
  const Node = memo(({ data, selected }: NodeProps) => {
    const config = data.config || data;
    const displayKeys = Object.entries(config)
      .filter(([k, v]) => v && k !== 'config' && k !== 'name' && k !== 'nodeId' && k !== 'position' && k !== 'inputs' && k !== 'cte_alias' && typeof v !== 'object')
      .slice(0, 4);

    return (
      <ETLNodeWrapper data={data} selected={selected} type={blockType}>
        <div className="space-y-1">
          {displayKeys.length > 0 ? (
            displayKeys.map(([k, v]) => (
              <ParamBadge key={k} label={k.replace(/_/g, ' ')} value={displayValue(String(v))} />
            ))
          ) : (
            <span className="text-[10px] text-slate-400 italic">Click to configure</span>
          )}
        </div>
      </ETLNodeWrapper>
    );
  });
  Node.displayName = `${blockType.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}Node`;
  return Node;
};

// Missing AI blocks
const AiFilterNode = makeGenericNode('ai_filter');
const AiAggNode = makeGenericNode('ai_agg');
const AiEmbedNode = makeGenericNode('ai_embed');
const AiRedactNode = makeGenericNode('ai_redact');
const AiCountTokensNode = makeGenericNode('ai_count_tokens');
const AiParseDocumentNode = makeGenericNode('ai_parse_document');
const AiTranscribeNode = makeGenericNode('ai_transcribe');

// Missing ML blocks
const MlForecastNode = makeGenericNode('ml_forecast');
const MlAnomalyNode = makeGenericNode('ml_anomaly');

// Missing Advanced SQL blocks
const RecursiveCteNode = makeGenericNode('recursive_cte');
const CopyIntoNode = makeGenericNode('copy_into');
const MergeNode = makeGenericNode('merge');
const FlattenNode = makeGenericNode('flatten');
const QualifyNode = makeGenericNode('qualify');
const FuzzyMatchNode = makeGenericNode('fuzzy_match');
const JsonPathExtractNode = makeGenericNode('json_path_extract');
const QualifyFilterNode = makeGenericNode('qualify_filter');
const CorrelationNode = makeGenericNode('correlation');
const HistogramNode = makeGenericNode('histogram');

// Missing other blocks
const IcebergSourceNode = makeGenericNode('iceberg_source');
const SetColValueNode = makeGenericNode('set_col_value');
const NormalizeColNode = makeGenericNode('normalize_col');

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
  cdc_merge: CdcMergeNode,
  git_file: GitFileNode,
  sql_script: SQLScriptNode,
  python_script: PythonScriptNode,
  notebook_run: NotebookRunNode,
  dynamic_table: DynamicTableNode,
  compute_pool: ComputePoolNode,
  container_service: ContainerServiceNode,

  // Window function blocks
  window_rank: WindowRankNode,
  window_lag_lead: WindowLagLeadNode,
  window_aggregate: WindowAggregateNode,
  window_ntile: WindowNtileNode,

  // JSON blocks
  json_flatten: JsonFlattenNode,
  json_extract: JsonExtractNode,
  json_construct: JsonConstructNode,

  // Pivot/Unpivot blocks
  pivot: PivotNode,
  unpivot: UnpivotNode,

  // Date/Time blocks
  date_transform: DateTransformNode,
  time_slice: TimeSliceNode,

  // Data cleaning blocks
  fill_nulls: FillNullsNode,
  case_when: CaseWhenNode,
  split_column: SplitColumnNode,

  // Cloud source blocks
  s3_source: S3SourceNode,
  azure_source: AzureSourceNode,
  gcs_source: GcsSourceNode,

  // DB source blocks
  postgres_source: PostgresSourceNode,
  mysql_source: MysqlSourceNode,

  // Other source blocks
  external_table_source: ExternalTableSourceNode,
  dynamic_table_source: DynamicTableSourceNode,
  shared_data_source: SharedDataSourceNode,

  // CRM/ERP/SaaS source blocks
  salesforce_source: SalesforceSourceNode,
  sap_source: SapSourceNode,
  oracle_source: OracleSourceNode,
  hubspot_source: HubspotSourceNode,
  servicenow_source: ServicenowSourceNode,
  api_source: ApiSourceNode,

  // Python blocks
  create_udf: CreateUdfNode,
  create_procedure: CreateProcedureNode,
  apply_udf: ApplyUdfNode,

  // AI Function blocks
  ai_classify: AiClassifyNode,
  ai_sentiment: AiSentimentNode,
  ai_translate: AiTranslateNode,
  ai_extract: AiExtractNode,
  ai_complete: AiCompleteNode,
  ai_filter: AiFilterNode,
  ai_agg: AiAggNode,
  ai_embed: AiEmbedNode,
  ai_redact: AiRedactNode,
  ai_count_tokens: AiCountTokensNode,
  ai_parse_document: AiParseDocumentNode,
  ai_transcribe: AiTranscribeNode,

  // ML Training blocks
  finetune: FinetuneNode,
  classification_train: ClassificationTrainNode,
  anomaly_detect: AnomalyDetectNode,
  forecast: ForecastNode,
  document_ai: DocumentAiNode,
  ml_forecast: MlForecastNode,
  ml_anomaly: MlAnomalyNode,

  // Advanced SQL blocks
  recursive_cte: RecursiveCteNode,
  copy_into: CopyIntoNode,
  merge: MergeNode,
  flatten: FlattenNode,
  qualify: QualifyNode,
  fuzzy_match: FuzzyMatchNode,
  json_path_extract: JsonPathExtractNode,
  qualify_filter: QualifyFilterNode,
  correlation: CorrelationNode,
  histogram: HistogramNode,

  // Other blocks
  iceberg_source: IcebergSourceNode,
  set_col_value: SetColValueNode,
  normalize_col: NormalizeColNode,

  // Legacy mappings for backward compatibility
  src: SourceNode,
  aggregate_kpi: LegacyAggregateKPINode,
  drop_nulls: FilterNode,
  drop_duplicates: DistinctNode,
  normalize: FormulaNode,
  export_excel: ExportFileNode,
};

export default etlNodeTypes;
