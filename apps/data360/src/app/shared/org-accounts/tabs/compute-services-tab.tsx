'use client';

import { useState, useEffect } from 'react';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiCpuDuotone,
  PiStackDuotone,
  PiFlowArrowDuotone,
  PiMagnifyingGlassDuotone,
  PiLightningDuotone,
  PiTreeStructureDuotone,
  PiWarningCircleDuotone,
} from 'react-icons/pi';
import {
  getServicesClustering,
  getServicesMaterializedViews,
  getServicesPipes,
  getServicesSearchOptimization,
  getServicesQueryAcceleration,
} from '@/app/services/org-accounts/hooks';
import { formatCredits, formatBytes, extractApiError } from '@/app/services/org-accounts/utils';
import { safeLocale } from '@/lib/format-number';
import type {
  ClusteringEntry,
  MaterializedViewEntry,
  PipeEntry,
  SearchOptimizationEntry,
  QueryAccelerationEntry,
  DateRange,
} from '@/app/services/org-accounts/types';

interface ComputeServicesTabProps {
  refreshKey: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

interface ServiceSectionProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}

function ServiceSection({ title, icon, color, children }: ServiceSectionProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {icon}
          <Text className="font-semibold text-gray-900 dark:text-white">{title}</Text>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ComputeServicesTab({ refreshKey }: ComputeServicesTabProps) {
  const [clustering, setClustering] = useState<ClusteringEntry[]>([]);
  const [materializedViews, setMaterializedViews] = useState<MaterializedViewEntry[]>([]);
  const [pipes, setPipes] = useState<PipeEntry[]>([]);
  const [searchOpt, setSearchOpt] = useState<SearchOptimizationEntry[]>([]);
  const [queryAccel, setQueryAccel] = useState<QueryAccelerationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    let firstError: string | null = null;
    const guard = <T,>(p: Promise<T>): Promise<T | null> =>
      p.catch((e) => { firstError = firstError ?? extractApiError(e, 'Failed to load compute services'); return null; });

    Promise.all([
      guard(getServicesClustering(days)),
      guard(getServicesMaterializedViews(days)),
      guard(getServicesPipes(days)),
      guard(getServicesSearchOptimization(days)),
      guard(getServicesQueryAcceleration(days)),
    ]).then(([clusterData, mvData, pipeData, soData, qaData]) => {
      if (clusterData) setClustering(Array.isArray(clusterData.clustering) ? clusterData.clustering : []);
      if (mvData) setMaterializedViews(Array.isArray(mvData.materialized_views) ? mvData.materialized_views : []);
      if (pipeData) setPipes(Array.isArray(pipeData.pipes) ? pipeData.pipes : []);
      if (soData) setSearchOpt(Array.isArray(soData.search_optimization) ? soData.search_optimization : []);
      if (qaData) setQueryAccel(Array.isArray(qaData.query_acceleration) ? qaData.query_acceleration : []);
      setError(firstError);
    }).finally(() => setLoading(false));
  }, [refreshKey, dateRange]);

  // Summary totals
  const totalClustering = clustering.reduce((s, c) => s + c.total_credits, 0);
  const totalMV = materializedViews.reduce((s, m) => s + m.total_credits, 0);
  const totalPipes = pipes.reduce((s, p) => s + p.total_credits, 0);
  const totalSearchOpt = searchOpt.reduce((s, o) => s + o.total_credits, 0);
  const totalQueryAccel = queryAccel.reduce((s, q) => s + q.total_credits, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Some compute services data could not be loaded</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiCpuDuotone className="h-5 w-5 text-violet-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">Compute Services</Text>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {(['7d', '30d', '90d'] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                dateRange === r
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
              )}
            >
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Clustering', value: totalClustering, count: clustering.length, color: 'text-blue-600' },
          { label: 'MV Refresh', value: totalMV, count: materializedViews.length, color: 'text-purple-600' },
          { label: 'Snowpipe', value: totalPipes, count: pipes.length, color: 'text-green-600' },
          { label: 'Search Opt', value: totalSearchOpt, count: searchOpt.length, color: 'text-amber-600' },
          { label: 'Query Accel', value: totalQueryAccel, count: queryAccel.length, color: 'text-cyan-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <Text className="text-xs text-gray-500 mb-1">{s.label}</Text>
            <Text className={cn('text-xl font-bold', s.color)}>{formatCredits(s.value)}</Text>
            <Text className="text-xs text-gray-400">{s.count} account{s.count !== 1 ? 's' : ''}</Text>
          </div>
        ))}
      </div>

      {/* Auto Clustering */}
      <ServiceSection title="Auto Clustering" icon={<PiTreeStructureDuotone className="h-5 w-5 text-blue-500" />} color="blue">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Bytes Reclustered</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Rows Reclustered</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {clustering.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No clustering data</td></tr>
              ) : clustering.map((c) => (
                <tr key={c.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2"><Text className="text-sm font-medium text-gray-900 dark:text-white">{c.account_name}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-blue-600">{formatCredits(c.total_credits)}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatBytes(c.bytes_reclustered)}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{safeLocale(c.rows_reclustered)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ServiceSection>

      {/* MV + Pipes side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ServiceSection title="Materialized Views" icon={<PiStackDuotone className="h-5 w-5 text-purple-500" />} color="purple">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {materializedViews.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-500">No MV data</td></tr>
                ) : materializedViews.map((m) => (
                  <tr key={m.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{m.account_name}</Text></td>
                    <td className="px-4 py-2 text-right"><Text className="text-sm text-purple-600">{formatCredits(m.total_credits)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ServiceSection>

        <ServiceSection title="Snowpipe" icon={<PiFlowArrowDuotone className="h-5 w-5 text-green-500" />} color="green">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Files</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {pipes.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">No pipe data</td></tr>
                ) : pipes.map((p) => (
                  <tr key={p.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{p.account_name}</Text></td>
                    <td className="px-4 py-2 text-right"><Text className="text-sm text-green-600">{formatCredits(p.total_credits)}</Text></td>
                    <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{safeLocale(p.total_files_inserted)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ServiceSection>
      </div>

      {/* Search Optimization + Query Acceleration */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ServiceSection title="Search Optimization" icon={<PiMagnifyingGlassDuotone className="h-5 w-5 text-amber-500" />} color="amber">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {searchOpt.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-500">No search optimization data</td></tr>
                ) : searchOpt.map((s) => (
                  <tr key={s.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{s.account_name}</Text></td>
                    <td className="px-4 py-2 text-right"><Text className="text-sm text-amber-600">{formatCredits(s.total_credits)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ServiceSection>

        <ServiceSection title="Query Acceleration" icon={<PiLightningDuotone className="h-5 w-5 text-cyan-500" />} color="cyan">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {queryAccel.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-500">No query acceleration data</td></tr>
                ) : queryAccel.map((q) => (
                  <tr key={q.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{q.account_name}</Text></td>
                    <td className="px-4 py-2 text-right"><Text className="text-sm text-cyan-600">{formatCredits(q.total_credits)}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ServiceSection>
      </div>
    </div>
  );
}
