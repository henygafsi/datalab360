'use client';

/**
 * SmartFilterBar — auto-detected, working filters for the BI dashboard.
 *
 * Replaces the manual `FilterBar` (whose filters never reached the render
 * payload) and `TimeIntelligenceBar` (whose time filtering was a no-op). It reads
 * the real columns of the page's tables via `useSmartFilters`, shows date +
 * dimension columns as ready chips, and emits `AppliedFilter[]` that the editor
 * injects per-widget — the path proven to actually filter SQL (row_count drops).
 *
 * No centered popups: chip editors are inline anchored dropdowns (the same pattern
 * the old time bar used), and the whole bar simply hides when no page is active.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Sparkles, Calendar, ChevronDown, X, Loader2, Filter, Search, Clock,
} from 'lucide-react';
import { Tooltip } from 'rizzui';
import {
  useSmartFilters,
  type AppliedFilter,
  type FilterCandidate,
} from '../hooks/useSmartFilters';
import type { DashboardWidget } from '@/app/services/api/types';

interface SelectionEntry {
  from?: string;
  to?: string;
  values?: string[];
}
type Selection = Record<string, SelectionEntry>;

interface SmartFilterBarProps {
  widgets: DashboardWidget[];
  onChange: (filters: AppliedFilter[]) => void;
  /** Manual refresh hook (also driven by the auto-refresh interval). */
  onRefreshNow?: () => void;
  executing?: boolean;
}

const AUTO_OPTS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
];

export default function SmartFilterBar({
  widgets,
  onChange,
  onRefreshNow,
  executing = false,
}: SmartFilterBarProps) {
  const { candidates, loading, fetchDistinct } = useSmartFilters(widgets);
  const [selection, setSelection] = useState<Selection>({});
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [autoInterval, setAutoInterval] = useState(0);
  const [showAuto, setShowAuto] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Reset selection when the candidate set changes (page/table switch).
  const candKey = candidates.map((c) => c.column).join('|');
  useEffect(() => {
    setSelection({});
    setOpenCol(null);
  }, [candKey]);

  // Build the applied-filter list from the current selection and emit upstream.
  const applied = useMemo<AppliedFilter[]>(() => {
    const out: AppliedFilter[] = [];
    for (const c of candidates) {
      const sel = selection[c.column];
      if (!sel) continue;
      if (c.kind === 'date') {
        if (sel.from) out.push({ column: c.column, operator: '>=', value: sel.from, tables: c.tables });
        if (sel.to) out.push({ column: c.column, operator: '<=', value: sel.to, tables: c.tables });
      } else if (sel.values && sel.values.length > 0) {
        out.push({
          column: c.column,
          operator: sel.values.length > 1 ? 'IN' : '=',
          value: sel.values.length > 1 ? sel.values : sel.values[0],
          tables: c.tables,
        });
      }
    }
    return out;
  }, [candidates, selection]);

  useEffect(() => {
    onChange(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  // Close inline dropdowns on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenCol(null);
        setShowAuto(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Auto-refresh timer (the one feature worth keeping from the old time bar).
  useEffect(() => {
    if (autoInterval === 0 || !onRefreshNow) return;
    const id = setInterval(() => onRefreshNow(), autoInterval * 1000);
    return () => clearInterval(id);
  }, [autoInterval, onRefreshNow]);

  const activeCount = applied.length;
  const clearAll = useCallback(() => setSelection({}), []);

  // Nothing to show — render nothing rather than a dead empty bar.
  if (!loading && candidates.length === 0) return null;

  return (
    <div
      ref={barRef}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
    >
      <Tooltip content="Filters auto-detected from this page's tables (date & dimension columns). Selections filter every chart that uses the column.">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
          Smart filters
        </span>
      </Tooltip>

      {loading && (
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> detecting…
        </span>
      )}

      {candidates.map((c) => (
        <FilterChip
          key={c.column}
          candidate={c}
          entry={selection[c.column]}
          open={openCol === c.column}
          onToggle={() => setOpenCol((p) => (p === c.column ? null : c.column))}
          onChange={(entry) =>
            setSelection((prev) => ({ ...prev, [c.column]: entry }))
          }
          onClear={() =>
            setSelection((prev) => {
              const next = { ...prev };
              delete next[c.column];
              return next;
            })
          }
          fetchDistinct={fetchDistinct}
        />
      ))}

      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <X className="h-3 w-3" /> Clear all
        </button>
      )}

      {/* Auto-refresh — preserved from the old time bar */}
      <div className="relative ml-auto">
        <button
          onClick={() => setShowAuto((s) => !s)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            autoInterval > 0
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
              : 'text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          {autoInterval > 0 ? AUTO_OPTS.find((o) => o.value === autoInterval)?.label : 'Auto'}
          <ChevronDown className="h-3 w-3" />
        </button>
        {showAuto && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[100px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {AUTO_OPTS.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  setAutoInterval(o.value);
                  setShowAuto(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  autoInterval === o.value
                    ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {autoInterval > 0 && (
        <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          {executing ? 'refreshing' : 'live'}
        </span>
      )}
    </div>
  );
}

// ── Per-column chip ──────────────────────────────────────────────────

function FilterChip({
  candidate,
  entry,
  open,
  onToggle,
  onChange,
  onClear,
  fetchDistinct,
}: {
  candidate: FilterCandidate;
  entry?: SelectionEntry;
  open: boolean;
  onToggle: () => void;
  onChange: (entry: SelectionEntry) => void;
  onClear: () => void;
  fetchDistinct: (c: FilterCandidate) => Promise<string[]>;
}) {
  const isDate = candidate.kind === 'date';
  const active =
    isDate ? Boolean(entry?.from || entry?.to) : Boolean(entry?.values?.length);

  const summary = useMemo(() => {
    if (isDate) {
      if (entry?.from && entry?.to) return `${entry.from} → ${entry.to}`;
      if (entry?.from) return `≥ ${entry.from}`;
      if (entry?.to) return `≤ ${entry.to}`;
      return 'any date';
    }
    const v = entry?.values || [];
    if (v.length === 0) return 'any';
    if (v.length === 1) return v[0];
    return `${v.length} selected`;
  }, [isDate, entry]);

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
          active
            ? 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {isDate ? <Calendar className="h-3 w-3 text-slate-400" /> : <Filter className="h-3 w-3 text-slate-400" />}
        <span className="font-medium">{candidate.column}</span>
        <span className="text-slate-400">·</span>
        <span className="max-w-[120px] truncate text-slate-500 dark:text-slate-400">{summary}</span>
        {active ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="rounded p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown className="h-3 w-3 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {isDate ? (
            <DateEditor entry={entry} onChange={onChange} />
          ) : (
            <CategoryEditor
              candidate={candidate}
              entry={entry}
              onChange={onChange}
              fetchDistinct={fetchDistinct}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DateEditor({
  entry,
  onChange,
}: {
  entry?: SelectionEntry;
  onChange: (e: SelectionEntry) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Date range</span>
      <label className="text-[11px] text-slate-500 dark:text-slate-400">
        From
        <input
          type="date"
          value={entry?.from || ''}
          max={entry?.to || undefined}
          onChange={(e) => onChange({ ...entry, from: e.target.value || undefined })}
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>
      <label className="text-[11px] text-slate-500 dark:text-slate-400">
        To
        <input
          type="date"
          value={entry?.to || ''}
          min={entry?.from || undefined}
          onChange={(e) => onChange({ ...entry, to: e.target.value || undefined })}
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>
    </div>
  );
}

function CategoryEditor({
  candidate,
  entry,
  onChange,
  fetchDistinct,
}: {
  candidate: FilterCandidate;
  entry?: SelectionEntry;
  onChange: (e: SelectionEntry) => void;
  fetchDistinct: (c: FilterCandidate) => Promise<string[]>;
}) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [freeText, setFreeText] = useState('');
  const selected = entry?.values || [];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDistinct(candidate).then((opts) => {
      if (!cancelled) {
        setOptions(opts);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.column]);

  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    onChange({ ...entry, values: next });
  };

  const filtered = (options || []).filter((o) =>
    o.toLowerCase().includes(query.toLowerCase()),
  );
  const hasOptions = (options?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{candidate.column}</span>

      {loading && (
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" /> loading values…
        </span>
      )}

      {!loading && hasOptions && (
        <>
          <div className="flex items-center gap-1 rounded-md border border-slate-200 px-1.5 dark:border-slate-700">
            <Search className="h-3 w-3 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent py-1 text-xs focus:outline-none dark:text-slate-200"
            />
          </div>
          <div className="max-h-40 overflow-auto pr-1">
            {filtered.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <span className="block px-1 py-1 text-[11px] text-slate-400">No match</span>
            )}
          </div>
        </>
      )}

      {/* Free-text fallback — used when distinct values can't be loaded, so the
          chip never dead-ends on an error. */}
      {!loading && !hasOptions && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = freeText.trim();
            if (v && !selected.includes(v)) onChange({ ...entry, values: [...selected, v] });
            setFreeText('');
          }}
          className="flex items-center gap-1"
        >
          <input
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Type a value…"
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          <button
            type="submit"
            className="rounded-md bg-cyan-600 px-2 py-1 text-xs text-white hover:bg-cyan-700"
          >
            Add
          </button>
        </form>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
          {selected.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
            >
              {v}
              <button onClick={() => toggle(v)} className="hover:text-red-500">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
