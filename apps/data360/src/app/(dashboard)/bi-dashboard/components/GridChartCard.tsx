'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Badge, Tooltip } from 'rizzui';
import { Settings, Trash2, Play, Loader2, GripVertical } from 'lucide-react';
import { DynamicChart } from './DynamicChart';
import type { DashboardWidget } from '@/app/services/api/types';

interface WidgetCardProps {
  widget: DashboardWidget;
  executionData?: { data: Record<string, unknown>[]; query?: string };
  executing?: boolean;
  onConfigure: (widget: DashboardWidget) => void;
  onDelete: (widgetId: string) => void;
  onExecuteSingle: (widget: DashboardWidget) => void;
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
  widget,
}: {
  data?: Record<string, unknown>[];
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
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
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
    </div>
  );
}

// ─── Table Content ──────────────────────────────────────────────────

function TableContent({
  data,
  selectedColumns,
}: {
  data?: Record<string, unknown>[];
  selectedColumns?: string[];
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No data
      </div>
    );
  }
  const allColumns = Object.keys(data[0]);
  const columns =
    selectedColumns && selectedColumns.length > 0
      ? selectedColumns.filter((c) => allColumns.includes(c))
      : allColumns;
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white dark:bg-slate-900 z-[1]">
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {columns.map((col) => (
              <th
                key={col}
                className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 200).map((row, i) => (
            <tr
              key={i}
              className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className="px-2 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  {row[col] != null ? String(row[col]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  executing,
  onConfigure,
  onDelete,
  onExecuteSingle,
}: WidgetCardProps) {
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
    <div className="group relative h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
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
          <Tooltip content="Configure">
            <button
              className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors"
              onClick={() => onConfigure(widget)}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="Delete">
            <button
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${widget.title || 'Untitled'}" widget?`
                  )
                ) {
                  onDelete(widget.widget_id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Widget Body */}
      <div className="flex-1 min-h-0 p-2 overflow-hidden">
        {widget.widget_type === 'text' && (
          <TextContent content={widget.text_content} />
        )}

        {widget.widget_type === 'kpi_card' && (
          <KpiCardContent data={executionData?.data} widget={widget} />
        )}

        {widget.widget_type === 'table' && (
          <TableContent
            data={executionData?.data}
            selectedColumns={
              widget.chart_config?.columns || widget.chart_config?.groupBy
            }
          />
        )}

        {widget.widget_type === 'chart' && dynamicConfig && (
          <div className="h-full w-full">
            <DynamicChart config={dynamicConfig} enabled={!executionData} />
          </div>
        )}

        {/* Loading state for data widgets before execution */}
        {isDataWidget && !executionData && widget.widget_type !== 'chart' && (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
