'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from 'rizzui';
import {
  X, Table2, Edit2, Plus, Copy, Key, Link2, Shield, Lock, Eye,
  Tag, Database, ArrowRight, Trash2,
  RefreshCw, Upload, GitMerge, Sigma,
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
  source?: string;
  mergeKeys?: string[];
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

// ─── Action row ────────────────────────────────────────────────────────────
// One consistent row style across all action groups. Tighter than before
// (py-2 instead of py-2.5) and no individual hover-bg fight with the section
// container — only the row itself reacts on hover.
const ActionRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  hint?: string;
  highlight?: boolean;
  danger?: boolean;
}> = ({ icon: Icon, label, onClick, hint, highlight, danger }) => (
  <button
    onClick={onClick}
    className={cn(
      'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
      danger
        ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60',
    )}
  >
    <Icon
      className={cn(
        'h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300',
        highlight && 'text-blue-500 group-hover:text-blue-600',
        danger && 'text-red-500 group-hover:text-red-600',
      )}
    />
    <span className="flex-1">{label}</span>
    {hint && (
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {hint}
      </span>
    )}
  </button>
);

// ─── Group label ───────────────────────────────────────────────────────────
// Lighter than the old collapsible Section. Just a small uppercase header
// with no chevron — the panel is short enough that collapsing buys nothing
// and adds visual noise.
const Group: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div>
    <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {title}
    </div>
    <div className="space-y-0.5">{children}</div>
  </div>
);

// ─── Compact ingestion pill ────────────────────────────────────────────────
// Replaces the 3-row key→value status grid. One line, three pills, fewer
// pixels — same info.
const IngestionPill: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  title?: string;
}> = ({ icon: Icon, label, value, title }) => (
  <span
    className={cn(
      'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
      value
        ? 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
        : 'border-dashed border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500',
    )}
    title={title || (value ? `${label}: ${value}` : `${label}: not configured`)}
  >
    <Icon className="h-3 w-3 shrink-0" />
    <span className="truncate">{value ?? label}</span>
  </span>
);

const TableOptionsSidebar: React.FC<TableOptionsSidebarProps> = ({
  table,
  columns,
  onClose,
  onAction,
  ingestionConfig,
  className,
}) => {
  // Tab between Actions and Columns so they don't fight for vertical space
  // (the old layout had TWO scrollers stacked — actions on top, columns on
  // the bottom — which is what the user reported as cramped).
  const [tab, setTab] = useState<'actions' | 'columns'>('actions');

  if (!table) return null;

  const pkCount = columns.filter((c) => c.isPrimaryKey).length;
  const sensitiveCount = columns.filter((c) => c.isSensitive).length;
  const computedCount = columns.filter(
    (c) => (c as ColumnInfo & { isComputed?: boolean }).isComputed,
  ).length;

  return (
    <div
      className={cn(
        'flex h-full w-80 flex-col overflow-hidden border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Table2 className="h-5 w-5 shrink-0 text-blue-500" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white" title={table.table}>
                {table.table}
              </h3>
              <p className="truncate text-[11px] text-slate-500">
                {table.schema}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats row — column count + PK + sensitive in one strip */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[11px]">
            {columns.length} columns
          </Badge>
          {pkCount > 0 && (
            <Badge className="bg-amber-100 text-[11px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <Key className="mr-0.5 h-3 w-3" />
              {pkCount} PK
            </Badge>
          )}
          {sensitiveCount > 0 && (
            <Badge className="bg-red-100 text-[11px] text-red-800 dark:bg-red-900/30 dark:text-red-300">
              <Shield className="mr-0.5 h-3 w-3" />
              {sensitiveCount}
            </Badge>
          )}
          {computedCount > 0 && (
            <Badge className="bg-violet-100 text-[11px] text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
              <Sigma className="mr-0.5 h-3 w-3" />
              {computedCount}
            </Badge>
          )}
        </div>

        {/* Ingestion pills — was 3 stacked rows, now one wrapping line */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <IngestionPill
            icon={RefreshCw}
            label="Ingestion"
            value={ingestionConfig ? INGESTION_MODE_LABELS[ingestionConfig.mode] : null}
          />
          <IngestionPill
            icon={Upload}
            label="Source"
            value={ingestionConfig?.source ?? null}
          />
          <IngestionPill
            icon={GitMerge}
            label="Merge keys"
            value={
              ingestionConfig?.mergeKeys && ingestionConfig.mergeKeys.length > 0
                ? ingestionConfig.mergeKeys.join(', ')
                : null
            }
          />
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 px-2 dark:border-slate-700">
        {([
          { id: 'actions', label: 'Actions' },
          { id: 'columns', label: `Columns (${columns.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-3 py-2 text-xs font-medium transition-colors',
              tab === t.id
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* ── ONE scroll area ───────────────────────────────────────────── */}
      {/* Critical fix: previously the panel had TWO `flex-1 overflow-auto`
          siblings (actions + columns) so both scrolled separately. Now there
          is exactly one scroller and the user toggles content via tabs. */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {tab === 'actions' && (
          <div className="space-y-4">
            <Group title="Table actions">
              <ActionRow icon={Edit2} label="Rename table" onClick={() => onAction('rename')} />
              <ActionRow icon={Plus} label="Add column" onClick={() => onAction('add_new_column')} highlight />
              <ActionRow icon={Plus} label="Add computed column" onClick={() => onAction('add_computed_column')} highlight />
              <ActionRow icon={Copy} label="Duplicate" onClick={() => onAction('duplicate')} />
            </Group>

            <Group title="Keys & relations">
              <ActionRow icon={Key} label="Set primary key" onClick={() => onAction('pk_config')} highlight />
              <ActionRow icon={Link2} label="Create foreign key" onClick={() => onAction('fk_config')} highlight />
              <ActionRow icon={ArrowRight} label="Create relation" onClick={() => onAction('relation')} />
            </Group>

            <Group title="Security & policies">
              <ActionRow icon={Shield} label="Configure policies" onClick={() => onAction('policies')} />
              <ActionRow icon={Lock} label="Apply masking" onClick={() => onAction('masking')} />
              <ActionRow icon={Eye} label="Row-level security" onClick={() => onAction('rls')} />
              <ActionRow icon={Tag} label="Apply tags" onClick={() => onAction('tags')} />
              <ActionRow icon={Database} label="Apply aggregation" onClick={() => onAction('aggregation')} />
            </Group>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <ActionRow
                icon={Trash2}
                label="Exclude from model"
                onClick={() => onAction('exclude')}
                danger
              />
            </div>
          </div>
        )}

        {tab === 'columns' && (
          <div className="space-y-0.5">
            {columns.length === 0 ? (
              <div className="py-6 text-center text-xs italic text-slate-400">
                No columns loaded
              </div>
            ) : (
              columns.map((col) => (
                <div
                  key={col.name}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    col.isPrimaryKey && 'bg-amber-50/60 dark:bg-amber-900/15',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {col.isPrimaryKey && (
                      <Key className="h-3 w-3 shrink-0 text-amber-500" />
                    )}
                    {col.isSensitive && (
                      <Shield className="h-3 w-3 shrink-0 text-red-400" />
                    )}
                    <span className="truncate text-slate-800 dark:text-slate-200">
                      {col.name}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-slate-400">
                    {(col.dataType || 'unknown').split('(')[0]}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TableOptionsSidebar;
