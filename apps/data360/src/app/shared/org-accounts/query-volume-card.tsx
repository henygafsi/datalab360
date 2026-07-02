'use client';

import { Text, Badge } from 'rizzui';
import { PiChartBarDuotone, PiWarningCircleDuotone } from 'react-icons/pi';
import MetricHelp from '@/components/ui/MetricHelp';
import { formatNumber } from '@/app/services/org-accounts/utils';
import type { QueriesResponse } from '@/app/services/org-accounts/types';

interface QueryVolumeCardProps {
  data: QueriesResponse | null;
  loading: boolean;
  error?: string | null;
}

/**
 * Query-volume KPI card — total query count + per-account breakdown for the
 * window. The backend may only have current-account history (no
 * ORGANIZATION_USAGE.QUERY_HISTORY); when so it returns a `note` we surface
 * honestly rather than implying full org-wide coverage.
 */
export default function QueryVolumeCard({ data, loading, error }: QueryVolumeCardProps) {
  const accounts = data?.accounts ?? [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
        <PiChartBarDuotone className="h-5 w-5 text-violet-500" />
        <Text className="font-semibold text-gray-900 dark:text-white">Query Volume</Text>
        <MetricHelp
          title="Query Volume"
          definition="Total queries executed across accounts in the selected window."
          source="Query history"
        />
        {data?.account_count ? (
          <Badge variant="flat" color="secondary" className="ml-auto text-xs">
            {formatNumber(data.account_count)} {data.account_count === 1 ? 'account' : 'accounts'}
          </Badge>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-3 p-6">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Could not load query volume</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      ) : loading ? (
        <div className="space-y-3 p-4">
          <div className="h-10 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      ) : (
        <div className="p-4">
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {data?.total_queries != null ? formatNumber(data.total_queries) : '—'}
            </span>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              queries{data?.period_days ? ` · last ${data.period_days}d` : ''}
            </Text>
          </div>

          {accounts.length === 0 ? (
            <div className="py-6 text-center">
              <PiChartBarDuotone className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
              <Text className="text-sm text-gray-500 dark:text-gray-400">No per-account query data</Text>
            </div>
          ) : (
            <ul className="space-y-2">
              {accounts.map((acc, i) => (
                <li
                  key={`${acc.account_name}-${i}`}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40"
                >
                  <div className="min-w-0">
                    <Text className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {acc.account_name || '—'}
                    </Text>
                    {acc.failed_count != null && acc.failed_count > 0 ? (
                      <Text className="text-xs text-amber-600 dark:text-amber-400">
                        {formatNumber(acc.failed_count)} failed
                      </Text>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatNumber(acc.query_count)}
                    </Text>
                    {acc.avg_elapsed_ms != null ? (
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {formatNumber(Math.round(acc.avg_elapsed_ms))} ms avg
                      </Text>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data?.note ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{data.note}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
