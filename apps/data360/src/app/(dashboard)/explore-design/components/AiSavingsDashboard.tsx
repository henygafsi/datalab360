'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Select } from 'rizzui';
import {
  TrendingUp, RefreshCw, DollarSign, BarChart3, Zap, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { aiGetSavings } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { AiSavingsResponse } from '@/app/services/api/types';
import { safeNum, safeToFixed } from '@/lib/format-number';

interface AiSavingsDashboardProps {
  projectId: string;
  className?: string;
}

const PERIOD_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

const AiSavingsDashboard: React.FC<AiSavingsDashboardProps> = ({
  projectId,
  className,
}) => {
  const [period, setPeriod] = useState('30');
  const [data, setData] = useState<AiSavingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSavings = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await aiGetSavings(projectId, { days: Number(period) });
      setData(result);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to load AI savings');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, period]);

  useEffect(() => {
    fetchSavings();
  }, [fetchSavings]);

  const formatCredits = (v: number | string | null | undefined) => {
    const n = safeNum(v);
    return n == null ? '—' : n.toFixed(4);
  };

  // Zero-window collapse: three big zero-cards above the fold are noise — when
  // credits saved, AI cost AND ROI are all zero/absent, the explanatory
  // sentence IS the state.
  const allZero = !!data
    && (safeNum(data.total_credits_saved) ?? 0) === 0
    && (safeNum(data.ai_cost_credits) ?? 0) === 0
    && (safeNum(data.roi_multiplier) ?? 0) === 0;

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <span className="font-medium text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          AI Savings
          {data && data.roi_multiplier > 1 && (
            <Badge size="sm" className="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30">
              {safeToFixed(data.roi_multiplier, 1)}x ROI
            </Badge>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Select
            size="sm"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(opt: any) => setPeriod(opt?.value ?? '30')}
            className="w-36"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSavings}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-8 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Loading savings data...
        </div>
      ) : data && allZero ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">
          No AI savings recorded in this window — apply AI suggestions (optimize, DMF, masking) to build the trail.
        </p>
      ) : data ? (
        <div className="p-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
              <DollarSign className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Credits Saved</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {formatCredits(data.total_credits_saved)}
              </p>
              <p className="text-[10px] text-slate-400">credits · {String(data.period ?? '').replace(/_/g, ' ')}</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
              <BarChart3 className="h-4 w-4 text-blue-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">AI Cost</p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                {formatCredits(data.ai_cost_credits)}
              </p>
              <p className="text-[10px] text-slate-400">credits</p>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
              <Zap className="h-4 w-4 text-purple-500 mx-auto mb-1" />
              <p className="text-xs text-slate-500">ROI Multiplier</p>
              <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                {safeToFixed(data.roi_multiplier, 1)}x
              </p>
              <p className="text-[10px] text-slate-400">return</p>
            </div>
          </div>

          {/* Per-feature breakdown — real contract: breakdown is a map, may be {} */}
          {Object.keys(data.breakdown ?? {}).length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                By Feature
              </h4>
              <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500">
                      <th className="text-left px-3 py-2 font-medium">Feature</th>
                      <th className="text-right px-3 py-2 font-medium">Actions</th>
                      <th className="text-right px-3 py-2 font-medium">Credits saved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-700">
                    {Object.entries(data.breakdown ?? {}).map(([feature, item]) => (
                      <tr key={feature} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-xs font-medium">
                          {feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="px-3 py-2 text-xs text-right text-slate-500">
                          {safeNum(item?.actions) ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-right text-emerald-600">
                          {formatCredits(item?.credits_saved)}
                          {safeNum(item?.credits_saved) != null && safeNum(item.credits_saved)! > 0 && (
                            <ArrowUpRight className="inline h-3 w-3 ml-0.5 text-emerald-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400">
              No per-feature savings recorded in this window — apply AI suggestions (optimize, DMF, masking) to build the trail.
            </p>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <BarChart3 className="h-6 w-6 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No savings data available</p>
          <p className="text-xs mt-1 text-slate-400">Enable AI features and use suggestions to track savings</p>
        </div>
      )}
    </div>
  );
};

export default AiSavingsDashboard;
