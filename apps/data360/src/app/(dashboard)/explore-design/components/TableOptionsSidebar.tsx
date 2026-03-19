'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  X, Table2, Edit2, Plus, Copy, Key, Link2, Shield, Lock, Eye,
  Tag, Database, ArrowRight, Trash2, ChevronDown, ChevronRight,
  RefreshCw, Upload, GitMerge
} from 'lucide-react';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';

// Table action types
export type TableOptionAction =
  | 'rename'
  | 'add_new_column'
  | 'add_computed_column'
  | 'duplicate'
  | 'pk_config'
  | 'fk_config'
  | 'policies'
  | 'masking'
  | 'rls'
  | 'tags'
  | 'aggregation'
  | 'relation'
  | 'exclude'
  // Data Engineering actions
  | 'dynamic_table'
  | 'event_table'
  | 'hybrid_table';

// Ingestion configuration
export type IngestionMode =
  | 'full_refresh'
  | 'incremental'
  | 'scd_type1'
  | 'scd_type2'
  | 'scd_type3'
  | 'snapshot';

export interface IngestionConfig {
  mode: IngestionMode;
  source?: string;       // e.g. "Snowpipe (ORDERS_PIPE)"
  mergeKeys?: string[];   // e.g. ["ORDER_ID"]
}

const INGESTION_MODE_LABELS: Record<IngestionMode, string> = {
  full_refresh: 'Full Refresh',
  incremental: 'Incremental',
  scd_type1: 'SCD Type 1',
  scd_type2: 'SCD Type 2',
  scd_type3: 'SCD Type 3',
  snapshot: 'Snapshot',
};

interface TableOptionsSidebarProps {
  table: TableItem | null;
  columns: ColumnInfo[];
  onClose: () => void;
  onAction: (action: TableOptionAction) => void;
  ingestionConfig?: IngestionConfig | null;
  className?: string;
}

// Action button component
const ActionButton: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  highlight?: boolean;
  danger?: boolean;
}> = ({ icon: Icon, label, onClick, highlight, danger }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left rounded-lg transition-colors',
      danger
        ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
        : highlight
          ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
    )}
  >
    <Icon className={cn(
      'h-4 w-4 flex-shrink-0',
      highlight && 'text-blue-500',
      danger && 'text-red-500'
    )} />
    <span>{label}</span>
  </button>
);

// Section divider
const Divider: React.FC = () => (
  <div className="my-2 border-t dark:border-slate-700" />
);

// Collapsible section
const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-800 rounded"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {title}
      </button>
      {isOpen && <div className="mt-1">{children}</div>}
    </div>
  );
};

const TableOptionsSidebar: React.FC<TableOptionsSidebarProps> = ({
  table,
  columns,
  onClose,
  onAction,
  ingestionConfig,
  className,
}) => {
  if (!table) return null;

  // Count columns with primary keys, sensitive data, etc.
  const pkCount = columns.filter(c => c.isPrimaryKey).length;
  const sensitiveCount = columns.filter(c => c.isSensitive).length;

  return (
    <div className={cn(
      'w-72 bg-white dark:bg-slate-800 border-l dark:border-slate-700 flex flex-col h-full overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Table2 className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate" title={table.table}>
                {table.table}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {table.schema}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {columns.length} columns
          </Badge>
          {pkCount > 0 && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
              <Key className="h-3 w-3 mr-1" />
              {pkCount} PK
            </Badge>
          )}
          {sensitiveCount > 0 && (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs">
              <Shield className="h-3 w-3 mr-1" />
              {sensitiveCount}
            </Badge>
          )}
        </div>

        {/* Ingestion stats */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <RefreshCw className="h-3 w-3" />
              Ingestion
            </span>
            {ingestionConfig ? (
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {INGESTION_MODE_LABELS[ingestionConfig.mode]}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 italic">
                Not Configured
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Upload className="h-3 w-3" />
              Source
            </span>
            {ingestionConfig?.source ? (
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate ml-2 max-w-[140px]" title={ingestionConfig.source}>
                {ingestionConfig.source}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 italic">
                Not Configured
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <GitMerge className="h-3 w-3" />
              Merge Keys
            </span>
            {ingestionConfig?.mergeKeys && ingestionConfig.mergeKeys.length > 0 ? (
              <span className="font-medium font-mono text-slate-800 dark:text-slate-200 truncate ml-2 max-w-[140px]" title={ingestionConfig.mergeKeys.join(', ')}>
                {ingestionConfig.mergeKeys.join(', ')}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 italic">
                Not Configured
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-1 overflow-auto p-2">
        <Section title="Table Actions">
          <ActionButton
            icon={Edit2}
            label="Rename Table"
            onClick={() => onAction('rename')}
          />
          <ActionButton
            icon={Plus}
            label="Add Column"
            onClick={() => onAction('add_new_column')}
            highlight
          />
          <ActionButton
            icon={Plus}
            label="Add Computed Column"
            onClick={() => onAction('add_computed_column')}
            highlight
          />
          <ActionButton
            icon={Copy}
            label="Duplicate"
            onClick={() => onAction('duplicate')}
          />
        </Section>

        <Section title="Keys & Relations">
          <ActionButton
            icon={Key}
            label="Set Primary Key"
            onClick={() => onAction('pk_config')}
            highlight
          />
          <ActionButton
            icon={Link2}
            label="Create Foreign Key Link"
            onClick={() => onAction('fk_config')}
            highlight
          />
          <ActionButton
            icon={ArrowRight}
            label="Create Relation"
            onClick={() => onAction('relation')}
          />
        </Section>

        <Section title="Security & Policies">
          <ActionButton
            icon={Shield}
            label="Configure Policies..."
            onClick={() => onAction('policies')}
          />
          <ActionButton
            icon={Lock}
            label="Apply Masking"
            onClick={() => onAction('masking')}
          />
          <ActionButton
            icon={Eye}
            label="Apply Row-Level Security"
            onClick={() => onAction('rls')}
          />
          <ActionButton
            icon={Tag}
            label="Apply Tags"
            onClick={() => onAction('tags')}
          />
          <ActionButton
            icon={Database}
            label="Apply Aggregation"
            onClick={() => onAction('aggregation')}
          />
        </Section>

        <Divider />

        <ActionButton
          icon={Trash2}
          label="Exclude from Model"
          onClick={() => onAction('exclude')}
          danger
        />
      </div>

      {/* Column Preview — expanded, scrollable */}
      <div className="border-t dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50 flex-1 min-h-0 flex flex-col">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center justify-between">
          <span>Columns ({columns.length})</span>
          {columns.length > 0 && (
            <span className="text-[10px] font-normal text-slate-400">{columns.filter(c => c.isPrimaryKey).length} PK</span>
          )}
        </div>
        <div className="flex-1 overflow-auto space-y-0.5 min-h-0">
          {columns.map((col) => (
            <div
              key={col.name}
              className={cn(
                'flex items-center justify-between px-2 py-1 rounded text-xs',
                col.isPrimaryKey && 'bg-amber-50 dark:bg-amber-900/20'
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {col.isPrimaryKey && (
                  <Key className="h-3 w-3 text-amber-500 flex-shrink-0" />
                )}
                {col.isSensitive && (
                  <Shield className="h-3 w-3 text-red-400 flex-shrink-0" />
                )}
                <span className="truncate">{col.name}</span>
              </div>
              <span className="text-slate-400 font-mono ml-2">
                {(col.dataType || 'unknown').split('(')[0]}
              </span>
            </div>
          ))}
          {columns.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-2 italic">
              No columns loaded
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TableOptionsSidebar;
