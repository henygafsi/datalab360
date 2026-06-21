'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Badge, Tooltip } from 'rizzui';
import { Settings, Trash2, Play, Loader2, GripVertical, AlertTriangle, Search } from 'lucide-react';
import DataTable from '@/components/ui/DataTable';
import { DynamicChart } from './DynamicChart';
import { DeltaBadge } from './TimeIntelligenceBar';
import type { DashboardWidget } from '@/app/services/api/types';
import { useCanPerform } from '@/hooks/useCanPerform';

interface WidgetCardProps {
  widget: DashboardWidget;
  executionData?: { data: Record<string, unknown>[]; query?: string };
  previousExecutionData?: { data: Record<string, unknown>[]; query?: string };
  fetchError?: string;
  compareEnabled?: boolean;
  executing?: boolean;
  onConfigure: (widget: DashboardWidget) => void;
  onDelete: (widgetId: string) => void;
  onExecuteSingle: (widget: DashboardWidget) => void;
  crossWidgetFilter?: Record<string, string>;
  onCrossWidgetFilter?: (filterKey: string, filterValue: string) => void;
  onDrillThrough?: (widget: DashboardWidget) => void;
  /**
   * Action-RBAC module this card's edit/delete gates against. Defaults to
   * 'bi_reporting' so the BI dashboard is unaffected. Other surfaces (e.g.
   * Data Quality) pass their own module so the same grid renders under the
   * correct permission set.
   */
  rbacModule?: string;
}

// ─── Number Formatting ──────────────────────────────────────────────

function formatKpiValue(value: unknown): string {
  if (value == null) return '—';
  // Parse numeric strings (backend may return "186156.000000")
  let num: number;
  if (typeof value === 'number') {
    num = value;
  } else {
    num = parseFloat(String(value));
    if (isNaN(num)) return String(value);
  }
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(num / 1_000).toFixed(1)}K`;
  if (Number.isInteger(num)) return num.toLocaleString();
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ─── Seuil Color Matching ───────────────────────────────────────────

interface Seuil {
  operator: string;
  value: number | [number, number];
  label: string;
  color?: string;
}

function matchSeuil(seuils: Seuil[], numValue: number): Seuil | null {
  for (const s of seuils) {
    const v = s.value;
    switch (s.operator) {
      case '>':
        if (numValue > (v as number)) return s;
        break;
      case '>=':
        if (numValue >= (v as number)) return s;
        break;
      case '<':
        if (numValue < (v as number)) return s;
        break;
      case '<=':
        if (numValue <= (v as number)) return s;
        break;
      case '=':
        if (numValue === (v as number)) return s;
        break;
      case '!=':
        if (numValue !== (v as number)) return s;
        break;
      case 'between':
        if (Array.isArray(v) && numValue >= v[0] && numValue <= v[1]) return s;
        break;
    }
  }
  return null;
}

// ─── KPI Card Content ───────────────────────────────────────────────

function KpiCardContent({
  data,
  previousData,
  compareEnabled,
  widget,
}: {
  data?: Record<string, unknown>[];
  previousData?: Record<string, unknown>[];
  compareEnabled?: boolean;
  widget: DashboardWidget;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(48);

  // Responsive font sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        const w = entry.contentRect.width;
        // Scale font based on container: min(h*0.35, w*0.12, 64)
        setFontSize(Math.max(16, Math.min(h * 0.35, w * 0.12, 64)));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm">
        No data
      </div>
    );
  }

  const row = data[0];
  const keys = Object.keys(row).filter((k) => !k.endsWith('_status'));
  const valueKey = keys[0];
  const rawValue = row[valueKey];
  const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));

  // Seuil matching from chart_config
  const seuils =
    (widget.chart_config?.measures?.[0]?.seuils as Seuil[] | undefined) || [];

  // Backend may return a _status field (e.g. "GOOD") — match seuil by label first
  const statusKey = `${valueKey}_status`;
  const backendStatus = row[statusKey] as string | undefined;

  // 1) Try matching by backend status label (case-insensitive)
  const matchedByLabel = backendStatus
    ? seuils.find((s) => s.label.toLowerCase() === backendStatus.toLowerCase())
    : null;
  // 2) Fallback: try matching by evaluating operator against value
  const matchedByValue = !matchedByLabel && !isNaN(numValue)
    ? matchSeuil(seuils, numValue)
    : null;
  const matched = matchedByLabel || matchedByValue;

  const seuilColor = matched?.color || null;
  const seuilLabel = matched?.label || backendStatus || null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center h-full gap-1 px-2 overflow-hidden"
    >
      <span
        className="font-bold leading-none transition-all truncate max-w-full text-center"
        style={{
          fontSize: `${fontSize}px`,
          color: seuilColor || undefined,
        }}
      >
        {formatKpiValue(rawValue)}
      </span>
      {seuilLabel && (
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full truncate max-w-full"
          style={{
            backgroundColor: seuilColor ? `${seuilColor}20` : undefined,
            color: seuilColor || undefined,
          }}
        >
          {seuilLabel}
        </span>
      )}
      {compareEnabled && previousData && previousData.length > 0 && !isNaN(numValue) && (() => {
        const prevRow = previousData[0];
        const prevKeys = Object.keys(prevRow).filter((k) => !k.endsWith('_status'));
        const prevValueKey = prevKeys[0];
        const prevRaw = prevRow[prevValueKey];
        const prevNum = typeof prevRaw === 'number' ? prevRaw : parseFloat(String(prevRaw));
        if (isNaN(prevNum)) return null;
        return <DeltaBadge currentValue={numValue} previousValue={prevNum} />;
      })()}
    </div>
  );
}

// ─── Table Content ──────────────────────────────────────────────────

function TableContent({
  data,
  selectedColumns,
  onRowClick,
}: {
  data?: Record<string, unknown>[];
  selectedColumns?: string[];
  onRowClick?: (filterKey: string, filterValue: string) => void;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm">
        No data
      </div>
    );
  }
  const allColumns = Object.keys(data[0]);
  const visibleCols =
    selectedColumns && selectedColumns.length > 0
      ? selectedColumns.filter((c) => allColumns.includes(c))
      : allColumns;

  const tableColumns = visibleCols.map((col) => ({
    key: col,
    label: col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    sortable: true,
    filterable: true,
  }));

  return (
    <DataTable
      data={data as Record<string, any>[]}
      columns={tableColumns}
      pageSize={50}
      searchable
      exportable
      onRowClick={onRowClick ? (row) => {
        const firstStringCol = visibleCols.find((c) => typeof row[c] === 'string' && row[c] != null);
        if (firstStringCol) onRowClick(firstStringCol, String(row[firstStringCol]));
      } : undefined}
    />
  );
}

// ─── Text Content ───────────────────────────────────────────────────

function TextContent({ content }: { content?: string | null }) {
  return (
    <div className="flex items-start h-full p-2 prose prose-sm dark:prose-invert max-w-none overflow-auto">
      <div
        dangerouslySetInnerHTML={{ __html: simpleMarkdown(content || '') }}
      />
    </div>
  );
}

function simpleMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

// ─── Widget Type Labels ─────────────────────────────────────────────

const WIDGET_TYPE_LABELS: Record<string, string> = {
  chart: 'Chart',
  kpi_card: 'KPI',
  table: 'Table',
  text: 'Text',
};

// ─── Main Widget Card ───────────────────────────────────────────────

export default function WidgetCard({
  widget,
  executionData,
  previousExecutionData,
  fetchError,
  compareEnabled,
  executing,
  onConfigure,
  onDelete,
  onExecuteSingle,
  crossWidgetFilter,
  onCrossWidgetFilter,
  onDrillThrough,
  rbacModule = 'bi_reporting',
}: WidgetCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Action-RBAC gate (System 2). Configure opens the widget editor (PUT /widgets
  // → require_action 'edit'); Delete hits DELETE /widgets → require_action
  // 'delete'. Fail-open while the allow-set loads; honest disabled + tooltip on
  // a resolved deny (button stays visible, never hidden).
  const editPerm = useCanPerform(rbacModule, 'edit');
  const canEdit = editPerm.allowed || editPerm.loading;
  const deletePerm = useCanPerform(rbacModule, 'delete');
  const canDelete = deletePerm.allowed || deletePerm.loading;

  // Apply cross-widget filter to execution data (client-side)
  const filteredExecutionData = useMemo(() => {
    if (!executionData?.data || !crossWidgetFilter || Object.keys(crossWidgetFilter).length === 0) {
      return executionData;
    }
    const filtered = executionData.data.filter((row) =>
      Object.entries(crossWidgetFilter).every(([col, val]) => {
        const cellVal = row[col];
        return cellVal != null && String(cellVal) === val;
      })
    );
    // Only apply if the filter column exists in this widget's data
    const hasFilterColumn = executionData.data.length > 0 &&
      Object.keys(crossWidgetFilter).some((col) => col in executionData.data[0]);
    if (!hasFilterColumn) return executionData;
    return { ...executionData, data: filtered };
  }, [executionData, crossWidgetFilter]);

  const isDataWidget = ['chart', 'kpi_card', 'table'].includes(
    widget.widget_type
  );
  const typeLabel =
    widget.chart_type ||
    WIDGET_TYPE_LABELS[widget.widget_type] ||
    widget.widget_type;

  // Build DynamicChart config for chart-type widgets
  const dynamicConfig = useMemo(() => {
    if (widget.widget_type !== 'chart' || !widget.chart_config) return null;
    return {
      ...widget.chart_config,
      chartType:
        widget.chart_type || (widget.chart_config.x ? 'bar' : 'card'),
      prefetched: executionData
        ? { data: executionData.data }
        : undefined,
    };
  }, [widget, executionData]);

  return (
    <div className="group relative h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm dark:shadow-gray-900/20 hover:shadow-md dark:hover:shadow-gray-900/30 transition-shadow overflow-hidden flex flex-col">
      {/* Title Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag handle — react-grid-layout uses className "drag-handle" */}
          <span className="drag-handle cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400">
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
            {widget.title || 'Untitled'}
          </span>
          <Badge size="sm" className="text-[10px] px-1.5 py-0 flex-shrink-0">
            {typeLabel}
          </Badge>
        </div>

        {/* Actions on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isDataWidget && (
            <Tooltip content="Load data">
              <button
                className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-slate-400 hover:text-green-600 transition-colors"
                onClick={() => onExecuteSingle(widget)}
                disabled={executing}
              >
                {executing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
            </Tooltip>
          )}
          {isDataWidget && onDrillThrough && widget.chart_config?.table && (
            <Tooltip content="Drill-through">
              <button
                className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-600 transition-colors"
                onClick={() => onDrillThrough(widget)}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
          <Tooltip content={canEdit ? 'Configure' : 'Requires the "edit" permission on Business Reporting.'}>
            <button
              className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
              onClick={() => onConfigure(widget)}
              disabled={!canEdit}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-lg px-2 py-0.5">
              <span className="text-[10px] text-red-700 dark:text-red-400 whitespace-nowrap">Delete?</span>
              <button
                className="text-[10px] font-semibold text-red-700 dark:text-red-400 hover:underline"
                onClick={() => { setConfirmDelete(false); onDelete(widget.widget_id); }}
              >
                Confirm
              </button>
              <button
                className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 hover:underline"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <Tooltip content={canDelete ? 'Delete' : 'Requires the "delete" permission on Business Reporting.'}>
              <button
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                onClick={() => setConfirmDelete(true)}
                disabled={!canDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Widget Body */}
      <div className="flex-1 min-h-0 p-2 overflow-hidden">
        {widget.widget_type === 'text' && (
          <TextContent content={widget.text_content} />
        )}

        {widget.widget_type === 'kpi_card' && (
          <KpiCardContent
            data={filteredExecutionData?.data}
            previousData={previousExecutionData?.data}
            compareEnabled={compareEnabled}
            widget={widget}
          />
        )}

        {widget.widget_type === 'table' && (
          <TableContent
            data={filteredExecutionData?.data}
            selectedColumns={
              widget.chart_config?.columns || widget.chart_config?.groupBy
            }
            onRowClick={onCrossWidgetFilter}
          />
        )}

        {widget.widget_type === 'chart' && dynamicConfig && filteredExecutionData && (
          <div className="h-full w-full">
            <DynamicChart config={{ ...dynamicConfig, prefetched: filteredExecutionData ? { data: filteredExecutionData.data } : undefined }} enabled={!filteredExecutionData} />
          </div>
        )}

        {/* Error state — shown when data fetch failed (e.g. invalid column names in SQL) */}
        {isDataWidget && fetchError && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug line-clamp-3">{fetchError}</p>
            <button
              className="text-xs text-blue-500 hover:underline mt-1"
              onClick={() => onExecuteSingle(widget)}
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state for data widgets before execution (all types including chart) */}
        {isDataWidget && !filteredExecutionData && !fetchError && (
          <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
