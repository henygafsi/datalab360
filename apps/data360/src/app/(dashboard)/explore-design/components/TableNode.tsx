'use client';

import React, { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import {
  Table2, Key, Shield, Lock, RefreshCw, Clock, History, Layers,
  MoreVertical, Edit2, Trash2, Eye, Link2, Copy, ArrowRight,
  ChevronDown, ChevronRight, Database, AlertTriangle, Check, Plus, Tag,
  BarChart3
} from 'lucide-react';

// Column info for the node
export interface TableNodeColumn {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isSensitive?: boolean;
  maskingPolicy?: string;
}

// Data passed to the node
export interface TableNodeData {
  id: string;
  database: string;
  schema: string;
  table: string;
  displayName?: string; // For renamed tables
  columns: TableNodeColumn[];
  status: 'pending' | 'configured' | 'error';
  ingestionMode?: 'full_refresh' | 'incremental' | 'snapshot' | 'scd_type1' | 'scd_type2' | 'scd_type3';
  hasChanges?: boolean;
  isSelected?: boolean;
  isTargetTable?: boolean; // True if this is a DWH/target table (default tables), false for source tables
  mappedColumns?: Set<string>; // For target tables: columns that have been mapped from source columns
  onRename?: (newName: string) => void;
  onDelete?: () => void;
  onColumnClick?: (column: TableNodeColumn) => void;
  onContextMenu?: (e: React.MouseEvent, action: string) => void;
  onExpand?: () => void;
  compact?: boolean;
  config?: {
    hasRLS?: boolean;
    tags?: string[];
    qualityScore?: number | null;
    rowCount?: number | null;
  };
}

// Ingestion mode icons
const ingestionModeIcons: Record<string, React.ReactNode> = {
  full_refresh: <RefreshCw className="h-3 w-3" />,
  incremental: <Clock className="h-3 w-3" />,
  snapshot: <Layers className="h-3 w-3" />,
  scd_type1: <History className="h-3 w-3" />,
  scd_type2: <History className="h-3 w-3" />,
  scd_type3: <History className="h-3 w-3" />,
};

// Menu items for table actions - used by sidebar panel
export const TABLE_ACTION_ITEMS = [
  { id: 'rename', label: 'Rename Table', icon: Edit2 },
  { id: 'add_new_column', label: 'Add Column', icon: Plus, highlight: true },
  { id: 'add_computed_column', label: 'Add Computed Column', icon: Plus, highlight: true },
  { id: 'duplicate', label: 'Duplicate', icon: Copy },
  { id: 'divider1', label: '' },
  { id: 'pk_config', label: 'Set Primary Key', icon: Key, highlight: true },
  { id: 'fk_config', label: 'Create Foreign Key Link', icon: Link2, highlight: true },
  { id: 'divider2', label: '' },
  { id: 'policies', label: 'Configure Policies...', icon: Shield },
  { id: 'masking', label: 'Apply Masking', icon: Lock },
  { id: 'rls', label: 'Apply Row-Level Security', icon: Eye },
  { id: 'tags', label: 'Apply Tags', icon: Tag },
  { id: 'aggregation', label: 'Apply Aggregation', icon: Database },
  { id: 'divider3', label: '' },
  { id: 'relation', label: 'Create Relation', icon: ArrowRight },
  { id: 'divider4', label: '' },
  { id: 'exclude', label: 'Exclude from Model', icon: Trash2, danger: true },
] as const;

// Table Node Component
const TableNode: React.FC<NodeProps<TableNodeData>> = ({ data, selected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(data.displayName || data.table);

  const displayName = data.displayName || data.table;
  const visibleColumns = isExpanded ? data.columns : data.columns.slice(0, 5);
  const hasMoreColumns = data.columns.length > 5;

  // Calculate unmapped columns count for target tables
  const mappedColumnsSet = data.mappedColumns || new Set<string>();
  const unmappedCount = data.isTargetTable
    ? data.columns.filter(col => !mappedColumnsSet.has(col.name)).length
    : 0;
  const mappedCount = data.isTargetTable
    ? data.columns.filter(col => mappedColumnsSet.has(col.name)).length
    : 0;

  // Handle click on more button - opens sidebar panel in parent
  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Notify parent to open sidebar with 'open_options' action
    data.onContextMenu?.(e, 'open_options');
  }, [data]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== data.table) {
      data.onRename?.(renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, data]);

  const statusColors = {
    pending: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20',
    configured: 'border-green-400 bg-green-50 dark:bg-green-900/20',
    error: 'border-red-400 bg-red-50 dark:bg-red-900/20',
  };

  // Target tables (DWH) get a distinct purple-ish theme
  const targetTableStyles = data.isTargetTable
    ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
    : '';

  return (
    <>
      <div
        className={cn(
          'min-w-[220px] rounded-lg border-2 shadow-lg transition-all hover:shadow-2xl hover:border-blue-400 dark:hover:border-blue-500 hover:-translate-y-0.5',
          selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900' : '',
          data.isTargetTable
            ? targetTableStyles // Target/DWH tables get special styling
            : (statusColors[data.status] || 'border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600'),
          data.hasChanges && 'ring-2 ring-amber-400'
        )}
        onContextMenu={handleMoreClick}
      >
        {/* Header */}
        <div className={cn(
          "px-3 py-2 rounded-t-md border-b dark:border-slate-600 cursor-grab active:cursor-grabbing",
          data.isTargetTable
            ? "bg-indigo-100 dark:bg-indigo-900/40"
            : "bg-slate-100 dark:bg-slate-700"
        )}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Table2 className={cn(
                "h-4 w-4 flex-shrink-0",
                data.isTargetTable ? "text-indigo-600 dark:text-indigo-400" : "text-blue-500"
              )} />
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') setIsRenaming(false);
                  }}
                  className="flex-1 px-1 py-0.5 text-sm font-medium bg-white dark:bg-slate-800 border rounded"
                  autoFocus
                />
              ) : (
                <span className="font-semibold text-sm truncate" title={displayName}>
                  {displayName}
                </span>
              )}
              {data.displayName && data.displayName !== data.table && (
                <span className="text-xs text-slate-400" title={`Original: ${data.table}`}>
                  (renamed)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {data.isTargetTable && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300"
                  title="Data Warehouse Target Table"
                >
                  DWH
                </span>
              )}
              {data.ingestionMode && (
                <span className="p-1 rounded bg-slate-200 dark:bg-slate-600" title={data.ingestionMode.replace('_', ' ')}>
                  {ingestionModeIcons[data.ingestionMode]}
                </span>
              )}
              {data.hasChanges && (
                <span className="p-1 rounded bg-amber-200 dark:bg-amber-800" title="Has pending changes">
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                </span>
              )}
              <button
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                onClick={handleMoreClick}
                title="Table options"
              >
                <MoreVertical className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            {data.schema}
          </div>
          {/* Governance & Metadata Badges */}
          {(data.config?.hasRLS || (data.config?.tags && data.config.tags.length > 0) || data.config?.qualityScore != null || data.config?.rowCount != null) && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {data.config?.hasRLS && (
                <div className="flex items-center gap-0.5 text-[9px] text-purple-600 dark:text-purple-400" title="RLS Policy Applied">
                  <Lock className="h-2.5 w-2.5" />
                  <span>RLS</span>
                </div>
              )}
              {data.config?.tags && data.config.tags.length > 0 && (
                <div className="flex items-center gap-0.5 text-[9px] text-yellow-600 dark:text-yellow-400" title={`${data.config.tags.length} tags`}>
                  <Tag className="h-2.5 w-2.5" />
                  <span>{data.config.tags.length}</span>
                </div>
              )}
              {data.config?.qualityScore != null && (
                <div className={cn("flex items-center gap-0.5 text-[9px]",
                  data.config.qualityScore >= 80 ? "text-green-600 dark:text-green-400" :
                  data.config.qualityScore >= 50 ? "text-amber-600 dark:text-amber-400" :
                  "text-red-600 dark:text-red-400"
                )} title={`Quality: ${data.config.qualityScore}%`}>
                  <BarChart3 className="h-2.5 w-2.5" />
                  <span>{data.config.qualityScore}%</span>
                </div>
              )}
              {data.config?.rowCount != null && (
                <div className="flex items-center gap-0.5 text-[9px] text-gray-500 dark:text-gray-400" title={`${data.config.rowCount.toLocaleString()} rows`}>
                  <Table2 className="h-2.5 w-2.5" />
                  <span>{data.config.rowCount > 1000000 ? `${(data.config.rowCount/1000000).toFixed(1)}M` : data.config.rowCount > 1000 ? `${(data.config.rowCount/1000).toFixed(1)}K` : data.config.rowCount}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Columns */}
        <div className="px-2 py-1">
          {visibleColumns.map((col) => {
            const isMapped = data.isTargetTable && mappedColumnsSet.has(col.name);
            const isUnmapped = data.isTargetTable && !mappedColumnsSet.has(col.name);

            return (
              <div
                key={col.name}
                className={cn(
                  'flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer',
                  col.isPrimaryKey && 'bg-amber-50 dark:bg-amber-900/20',
                  isMapped && 'bg-green-50 dark:bg-green-900/20',
                  isUnmapped && data.isTargetTable && 'bg-orange-50/50 dark:bg-orange-900/10'
                )}
                onClick={() => data.onColumnClick?.(col)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {col.isPrimaryKey && (
                    <span title="Primary Key">
                      <Key className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    </span>
                  )}
                  {col.isForeignKey && (
                    <span title="Foreign Key">
                      <Link2 className="h-3 w-3 text-purple-500 flex-shrink-0" />
                    </span>
                  )}
                  <span className={cn(
                    "truncate",
                    isUnmapped && data.isTargetTable && "text-orange-600 dark:text-orange-400"
                  )}>{col.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Mapped/Unmapped indicator for target tables */}
                  {isMapped && (
                    <span title="Mapped from source">
                      <Check className="h-3 w-3 text-green-500" />
                    </span>
                  )}
                  {isUnmapped && data.isTargetTable && (
                    <span title="Needs mapping">
                      <AlertTriangle className="h-3 w-3 text-orange-400" />
                    </span>
                  )}
                  {col.isSensitive && (
                    <span title="Sensitive Data">
                      <Shield className="h-3 w-3 text-red-400" />
                    </span>
                  )}
                  {col.maskingPolicy && (
                    <span title={`Masked: ${col.maskingPolicy}`}>
                      <Lock className="h-3 w-3 text-green-500" />
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-mono">
                    {(col.dataType || 'unknown').split('(')[0]}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Expand/Collapse for many columns */}
          {hasMoreColumns && (
            <button
              className="w-full flex items-center justify-center gap-1 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" />
                  +{data.columns.length - 5} more columns
                </>
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-b-md border-t dark:border-slate-700 flex items-center justify-between text-xs text-slate-500">
          <span><span className="font-semibold">{data.columns.length}</span> columns</span>
          <div className="flex items-center gap-2">
            {/* Mapping status for target tables */}
            {data.isTargetTable && mappedCount > 0 && (
              <span className="flex items-center gap-1 text-green-600" title={`${mappedCount} columns mapped`}>
                <Check className="h-3 w-3" />
                {mappedCount}
              </span>
            )}
            {data.isTargetTable && unmappedCount > 0 && (
              <span className="flex items-center gap-1 text-orange-500" title={`${unmappedCount} columns need mapping`}>
                <AlertTriangle className="h-3 w-3" />
                {unmappedCount}
              </span>
            )}
            {data.status === 'configured' && !data.isTargetTable && (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="h-3 w-3" />
                Configured
              </span>
            )}
          </div>
        </div>

        {/* Connection Handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-white"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!w-4 !h-4 !bg-green-500 !border-2 !border-white"
        />
      </div>
    </>
  );
};

export default memo(TableNode);
