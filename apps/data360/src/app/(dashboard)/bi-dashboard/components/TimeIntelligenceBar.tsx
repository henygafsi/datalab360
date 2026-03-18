'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button, Badge, Tooltip } from 'rizzui';
import {
  Calendar,
  Clock,
  RefreshCw,
  ChevronDown,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────

export type TimePreset = 'today' | '7d' | '30d' | '90d' | 'ytd' | 'custom';
export type AutoRefreshInterval = 0 | 30 | 60 | 300; // seconds, 0 = off

export interface TimeRange {
  preset: TimePreset;
  from: string; // ISO date string YYYY-MM-DD
  to: string;   // ISO date string YYYY-MM-DD
}

export interface TimeIntelligenceState {
  range: TimeRange;
  compareEnabled: boolean;
  previousRange: TimeRange | null; // computed from range when compare is on
  autoRefreshInterval: AutoRefreshInterval;
}

// ── Preset Helpers ───────────────────────────────────────────────────

function computeDateRange(preset: TimePreset): { from: string; to: string } {
  const today = new Date();
  const toStr = today.toISOString().split('T')[0];

  switch (preset) {
    case 'today': {
      return { from: toStr, to: toStr };
    }
    case '7d': {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().split('T')[0], to: toStr };
    }
    case '30d': {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().split('T')[0], to: toStr };
    }
    case '90d': {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      return { from: d.toISOString().split('T')[0], to: toStr };
    }
    case 'ytd': {
      return { from: `${today.getFullYear()}-01-01`, to: toStr };
    }
    default:
      return { from: toStr, to: toStr };
  }
}

function computePreviousRange(range: TimeRange): TimeRange {
  const fromDate = new Date(range.from);
  const toDate = new Date(range.to);
  const diffMs = toDate.getTime() - fromDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - diffDays + 1);

  return {
    preset: 'custom',
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
  };
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const PRESET_LABELS: Record<TimePreset, string> = {
  today: 'Today',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  ytd: 'YTD',
  custom: 'Custom',
};

const AUTO_REFRESH_OPTIONS: { value: AutoRefreshInterval; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
];

// ── Props ────────────────────────────────────────────────────────────

interface TimeIntelligenceBarProps {
  state: TimeIntelligenceState;
  onChange: (state: TimeIntelligenceState) => void;
  onRefreshNow?: () => void;
  executing?: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export default function TimeIntelligenceBar({
  state,
  onChange,
  onRefreshNow,
  executing = false,
}: TimeIntelligenceBarProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAutoRefresh, setShowAutoRefresh] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const autoRefreshRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
      if (autoRefreshRef.current && !autoRefreshRef.current.contains(e.target as Node)) {
        setShowAutoRefresh(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    if (state.autoRefreshInterval === 0 || !onRefreshNow) return;
    const interval = setInterval(() => {
      onRefreshNow();
    }, state.autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [state.autoRefreshInterval, onRefreshNow]);

  const handlePresetClick = useCallback(
    (preset: TimePreset) => {
      if (preset === 'custom') {
        setShowDatePicker(true);
        return;
      }
      const dates = computeDateRange(preset);
      const newRange: TimeRange = { preset, ...dates };
      const previousRange = state.compareEnabled ? computePreviousRange(newRange) : null;
      onChange({ ...state, range: newRange, previousRange });
    },
    [state, onChange]
  );

  const handleCustomDateChange = useCallback(
    (field: 'from' | 'to', value: string) => {
      const newRange: TimeRange = { ...state.range, preset: 'custom', [field]: value };
      const previousRange = state.compareEnabled ? computePreviousRange(newRange) : null;
      onChange({ ...state, range: newRange, previousRange });
    },
    [state, onChange]
  );

  const toggleCompare = useCallback(() => {
    const newCompare = !state.compareEnabled;
    const previousRange = newCompare ? computePreviousRange(state.range) : null;
    onChange({ ...state, compareEnabled: newCompare, previousRange });
  }, [state, onChange]);

  const handleAutoRefreshChange = useCallback(
    (interval: AutoRefreshInterval) => {
      onChange({ ...state, autoRefreshInterval: interval });
      setShowAutoRefresh(false);
    },
    [state, onChange]
  );

  const previousRange = useMemo(() => {
    if (!state.compareEnabled) return null;
    return computePreviousRange(state.range);
  }, [state.compareEnabled, state.range]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Calendar icon */}
      <Calendar className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />

      {/* Preset buttons */}
      <div className="flex items-center gap-1">
        {(Object.keys(PRESET_LABELS) as TimePreset[]).map((preset) => (
          <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            className={`
              px-2.5 py-1 text-xs font-medium rounded-lg transition-colors
              ${
                state.range.preset === preset
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      {/* Date range display / custom picker */}
      <div className="relative" ref={datePickerRef}>
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <span>{formatDateLabel(state.range.from)}</span>
          <ArrowLeftRight className="h-3 w-3 text-gray-400" />
          <span>{formatDateLabel(state.range.to)}</span>
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </button>

        {showDatePicker && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 min-w-[280px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Custom Range</span>
              <button
                onClick={() => setShowDatePicker(false)}
                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                From
                <input
                  type="date"
                  value={state.range.from}
                  max={state.range.to}
                  onChange={(e) => handleCustomDateChange('from', e.target.value)}
                  className="mt-1 block w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </label>
              <label className="text-xs text-gray-500 dark:text-gray-400">
                To
                <input
                  type="date"
                  value={state.range.to}
                  min={state.range.from}
                  onChange={(e) => handleCustomDateChange('to', e.target.value)}
                  className="mt-1 block w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </label>
            </div>
            <button
              onClick={() => setShowDatePicker(false)}
              className="mt-3 w-full px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

      {/* Compare toggle */}
      <Tooltip content={state.compareEnabled ? 'Disable period comparison' : 'Compare vs previous period'}>
        <button
          onClick={toggleCompare}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors
            ${
              state.compareEnabled
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }
          `}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Compare</span>
        </button>
      </Tooltip>

      {/* Show previous range info when compare is active */}
      {state.compareEnabled && previousRange && (
        <Badge
          size="sm"
          className="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 text-[10px]"
        >
          vs {formatDateLabel(previousRange.from)} - {formatDateLabel(previousRange.to)}
        </Badge>
      )}

      {/* Separator */}
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

      {/* Auto-refresh dropdown */}
      <div className="relative" ref={autoRefreshRef}>
        <Tooltip content="Auto-refresh interval">
          <button
            onClick={() => setShowAutoRefresh(!showAutoRefresh)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors
              ${
                state.autoRefreshInterval > 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {state.autoRefreshInterval > 0
                ? AUTO_REFRESH_OPTIONS.find((o) => o.value === state.autoRefreshInterval)?.label
                : 'Auto'}
            </span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </Tooltip>

        {showAutoRefresh && (
          <div className="absolute top-full mt-1 right-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[100px]">
            {AUTO_REFRESH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleAutoRefreshChange(opt.value)}
                className={`
                  w-full px-3 py-1.5 text-xs text-left transition-colors
                  ${
                    state.autoRefreshInterval === opt.value
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Live indicator when auto-refresh is active */}
      {state.autoRefreshInterval > 0 && (
        <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          LIVE
        </span>
      )}
    </div>
  );
}

// ── Exports for use in other components ──────────────────────────────

export { computeDateRange, computePreviousRange };

/** Build default initial state */
export function createDefaultTimeState(): TimeIntelligenceState {
  const dates = computeDateRange('30d');
  return {
    range: { preset: '30d', ...dates },
    compareEnabled: false,
    previousRange: null,
    autoRefreshInterval: 0,
  };
}

// ── Delta Badge Component (for KPI cards) ────────────────────────────

interface DeltaBadgeProps {
  currentValue: number;
  previousValue: number;
  format?: 'percent' | 'absolute';
}

export function DeltaBadge({ currentValue, previousValue, format = 'percent' }: DeltaBadgeProps) {
  if (previousValue === 0 && currentValue === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
        0%
      </span>
    );
  }

  let delta: number;
  let label: string;

  if (format === 'percent') {
    if (previousValue === 0) {
      delta = currentValue > 0 ? 100 : -100;
    } else {
      delta = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    }
    label = `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  } else {
    delta = currentValue - previousValue;
    label = `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
  }

  const isPositive = delta > 0;
  const isNeutral = delta === 0;

  return (
    <span
      className={`
        inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
        ${
          isNeutral
            ? 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
            : isPositive
              ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
              : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
        }
      `}
    >
      {isNeutral ? null : isPositive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}
