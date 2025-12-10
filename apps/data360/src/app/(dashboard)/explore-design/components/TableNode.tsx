'use client';

import React, { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import {
  Table2, Key, Shield, Lock, RefreshCw, Clock, History, Layers,
  MoreVertical, Edit2, Trash2, Eye, Link2, Copy, ArrowRight,
  ChevronDown, ChevronRight, Database, AlertTriangle, Check, Plus, Tag, Code
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
  onRename?: (newName: string) => void;
  onDelete?: () => void;
  onColumnClick?: (column: TableNodeColumn) => void;
  onContextMenu?: (e: React.MouseEvent, action: string) => void;
  onExpand?: () => void;
  compact?: boolean;
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

// Context Menu Component with smart positioning
const ContextMenu: React.FC<{
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
}> = ({ x, y, onClose, onAction }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ x, y });

  // Adjust position to stay within viewport
  React.useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = x;
      let newY = y;

      // Check right overflow
      if (x + rect.width > viewportWidth - 20) {
        newX = x - rect.width;
      }
      // Check left overflow
      if (newX < 20) {
        newX = 20;
      }
      // Check bottom overflow
      if (y + rect.height > viewportHeight - 20) {
        newY = y - rect.height;
      }
      // Check top overflow
      if (newY < 20) {
        newY = 20;
      }

      if (newX !== x || newY !== y) {
        setPosition({ x: newX, y: newY });
      }
    }
  }, [x, y]);

  const menuItems = [
    { id: 'rename', label: 'Rename Table', icon: Edit2 },
    { id: 'add_column', label: 'Add Computed Column', icon: Plus, highlight: true },
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
  ];

  return (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 9998 }}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className="fixed bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-2 dark:border-slate-600 py-2 min-w-[260px] max-h-[80vh] overflow-auto"
        style={{
          left: position.x,
          top: position.y,
          zIndex: 9999,
        }}
      >
        <div className="px-4 py-2 border-b dark:border-slate-700 mb-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Table Actions</span>
        </div>
        {menuItems.map((item) =>
          item.id.startsWith('divider') ? (
            <div key={item.id} className="my-1.5 border-t dark:border-slate-700 mx-3" />
          ) : (
            <button
              key={item.id}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors',
                item.danger && 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
                item.highlight && 'text-blue-600 dark:text-blue-400 font-medium bg-blue-50/50 dark:bg-blue-900/10'
              )}
              onClick={() => {
                onAction(item.id);
                onClose();
              }}
            >
              {item.icon && (
                <item.icon className={cn(
                  'h-4 w-4 flex-shrink-0',
                  item.highlight && 'text-blue-500',
                  item.danger && 'text-red-500'
                )} />
              )}
              <span>{item.label}</span>
            </button>
          )
        )}
      </div>
    </>
  );
};

// Table Node Component
const TableNode: React.FC<NodeProps<TableNodeData>> = ({ data, selected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(data.displayName || data.table);

  const displayName = data.displayName || data.table;
  const visibleColumns = isExpanded ? data.columns : data.columns.slice(0, 5);
  const hasMoreColumns = data.columns.length > 5;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleAction = useCallback((action: string) => {
    if (action === 'rename') {
      setIsRenaming(true);
    } else {
      data.onContextMenu?.(new MouseEvent('contextmenu') as any, action);
    }
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

  return (
    <>
      <div
        className={cn(
          'min-w-[220px] rounded-lg border-2 shadow-lg transition-all',
          selected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900' : '',
          statusColors[data.status] || 'border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600',
          data.hasChanges && 'ring-2 ring-amber-400'
        )}
        onContextMenu={handleContextMenu}
      >
        {/* Header */}
        <div className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-t-md border-b dark:border-slate-600">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Table2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
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
                <span className="font-medium text-sm truncate" title={displayName}>
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
                onClick={handleContextMenu}
              >
                <MoreVertical className="h-4 w-4 text-slate-500" />
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            {data.schema}
          </div>
        </div>

        {/* Columns */}
        <div className="px-2 py-1">
          {visibleColumns.map((col, idx) => (
            <div
              key={col.name}
              className={cn(
                'flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer',
                col.isPrimaryKey && 'bg-amber-50 dark:bg-amber-900/20'
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
                <span className="truncate">{col.name}</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
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
          ))}

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
          <span>{data.columns.length} columns</span>
          {data.status === 'configured' && (
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-3 w-3" />
              Configured
            </span>
          )}
        </div>

        {/* Connection Handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAction={handleAction}
        />
      )}
    </>
  );
};

export default memo(TableNode);
