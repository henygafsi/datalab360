'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from 'rizzui';
import { BarChart3, Hash, AlertCircle, Layers, ArrowDown, ArrowUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { getColumnProfile, type ColumnProfileResponse } from '@/app/services/audit';
import { cn } from '@/lib/utils';
import { safeLocale } from '@/lib/format-number';

interface Props {
  table: string;
  column: string;
  className?: string;
  onClose?: () => void;
}

export default function ColumnProfilePanel({ table, column, className, onClose }: Props) {
  const [profile, setProfile] = useState<ColumnProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getColumnProfile(table, column);
      setProfile(data);
    } catch (err) {
      setError('Failed to load column profile');
      console.error('[ColumnProfilePanel]', err);
    } finally {
      setLoading(false);
    }
  }, [table, column]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4', className)}>
        <div className="space-y-3">
          <div className="h-5 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
          <div className="h-32 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={cn('rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 p-4', className)}>
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error || 'No profile data'}</span>
        </div>
        <button onClick={fetchProfile} className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400">Retry</button>
      </div>
    );
  }

  const { stats, top_values } = profile;
  const maxCount = top_values.length > 0 ? Math.max(...top_values.map((v) => v.count)) : 1;

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Column Profile: <span className="font-mono text-blue-600 dark:text-blue-400">{column}</span>
          </h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">&times;</button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <StatCard icon={<Layers className="h-4 w-4 text-blue-500" />} label="Total Rows" value={stats.total_rows?.toLocaleString() ?? '-'} />
        <StatCard icon={<Hash className="h-4 w-4 text-purple-500" />} label="Distinct" value={stats.distinct_count?.toLocaleString() ?? '-'} />
        <StatCard icon={<AlertCircle className="h-4 w-4 text-amber-500" />} label="Null %" value={stats.null_pct != null ? `${stats.null_pct}%` : '-'}
          color={stats.null_pct > 50 ? 'text-red-600 dark:text-red-400' : stats.null_pct > 10 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'} />
        <StatCard icon={<ArrowDown className="h-4 w-4 text-gray-500" />} label="Min / Max"
          value={`${stats.min_val?.slice(0, 12) ?? '-'} / ${stats.max_val?.slice(0, 12) ?? '-'}`} small />
      </div>

      {/* Null bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Null distribution</span>
          <span>{stats.null_count?.toLocaleString()} nulls / {stats.total_rows?.toLocaleString()} rows</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-400" style={{ width: `${Math.min(stats.null_pct ?? 0, 100)}%` }} />
        </div>
      </div>

      {/* Top values distribution */}
      {top_values.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Top Values (by frequency)</h4>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {top_values.slice(0, 20).map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-gray-700 dark:text-gray-300 font-mono" title={item.value}>{item.value}</span>
                <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                  <div className="h-full rounded bg-blue-500/70 dark:bg-blue-400/50"
                    style={{ width: `${(item.count / maxCount) * 100}%` }} />
                </div>
                <span className="w-14 text-right text-gray-500 dark:text-gray-400">{safeLocale(item.count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table reference */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{table}</span>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, small }: {
  icon: React.ReactNode; label: string; value: string; color?: string; small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span></div>
      <span className={cn('font-semibold text-gray-900 dark:text-white', small ? 'text-xs' : 'text-sm', color)}>{value}</span>
    </div>
  );
}
