'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { drillThrough } from '@/app/services/api/biDashboardApi';
import type { DrillThroughResponse, DashboardWidget } from '@/app/services/api/types';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface DrillThroughPanelProps {
  isOpen: boolean;
  onClose: () => void;
  dashboardId: string;
  widget: DashboardWidget;
  /** Optional: which dimension was clicked, plus its value (chart-click case) */
  initialDimension?: string;
  initialValue?: unknown;
}

export default function DrillThroughPanel({
  isOpen,
  onClose,
  dashboardId,
  widget,
  initialDimension,
  initialValue,
}: DrillThroughPanelProps) {
  const cfg = widget.chart_config || {};
  const candidateDimensions = [
    cfg.x,
    ...(Array.isArray(cfg.groupBy) ? cfg.groupBy : []),
  ].filter((c): c is string => !!c);

  const [dimension, setDimension] = useState<string>(initialDimension || candidateDimensions[0] || '');
  const [value, setValue] = useState<string>(initialValue != null ? String(initialValue) : '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DrillThroughResponse | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDimension(initialDimension || candidateDimensions[0] || '');
    setValue(initialValue != null ? String(initialValue) : '');
    setResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialDimension, initialValue]);

  const runDrill = async () => {
    if (!dimension) {
      toast.error('Pick a dimension column');
      return;
    }
    setLoading(true);
    try {
      const res = await drillThrough(dashboardId, {
        widget_id: widget.widget_id,
        clicked_value: value === '' ? null : value,
        dimension,
        database: cfg.database,
        schema: cfg.schema,
        table: cfg.table,
        limit: 500,
      });
      setResult(res);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-label="Drill-through details"
    >
      <div
        className="flex-1 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close panel"
      />
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Drill-through · {widget.title || 'Widget'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {cfg.database}.{cfg.schema}.{cfg.table}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="px-4 py-3 border-b dark:border-slate-700 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Dimension</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-xs"
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
            >
              {candidateDimensions.length === 0 && (
                <option value="">(no dimension on widget)</option>
              )}
              {candidateDimensions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Value (blank = NULL)
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 py-1 text-xs"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. Paris"
            />
          </div>
          <div className="col-span-2">
            <button
              onClick={runDrill}
              disabled={loading || !dimension}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50',
              )}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Run drill-through
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {!result ? (
            <p className="text-xs text-slate-500 text-center py-12">
              Pick a dimension and value, then run drill-through.
            </p>
          ) : result.rows.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-12">No matching rows.</p>
          ) : (
            <div className="overflow-auto">
              <p className="text-[11px] text-slate-500 mb-2">
                {result.total} row{result.total !== 1 ? 's' : ''}
              </p>
              <table className="min-w-full text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {result.columns.map((c) => (
                      <th
                        key={c}
                        className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300 border-b dark:border-slate-700 sticky top-0 bg-slate-50 dark:bg-slate-800"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      {result.columns.map((c) => (
                        <td key={c} className="px-2 py-1 text-slate-700 dark:text-slate-300 border-b dark:border-slate-800/60">
                          {row[c] == null ? <span className="text-slate-400">—</span> : String(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
