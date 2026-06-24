'use client';

import { useEffect, useMemo, useState } from 'react';
import { Text, Badge } from 'rizzui';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PiSparkleDuotone, PiWarningCircleDuotone, PiInfoDuotone } from 'react-icons/pi';
import { getCortexCosts } from '@/app/services/org-accounts/hooks';
import { formatCredits, extractApiError } from '@/app/services/org-accounts/utils';
import type { CortexCostsResponse } from '@/app/services/org-accounts/types';

interface AiComputeCostPanelProps {
  /** Rolling window in days (already resolved from the parent's date-range pills). */
  days: number;
  /** Bumped by the dashboard shell to force a re-fetch (SSE / manual refresh). */
  refreshKey: number;
}

/**
 * Brand rule (CLAUDE.md): never render vendor names (Cortex / Snowflake / Kimi)
 * in customer-facing copy. The `/cortex-costs` endpoint sources `service_type`
 * straight from the warehouse usage views, so those raw strings can carry vendor
 * terms — map them to neutral labels before they ever reach the UI.
 */
function neutralServiceLabel(raw?: string | null): string {
  if (!raw) return 'AI compute';
  const s = String(raw);
  if (/cortex|snowflake|kimi/i.test(s)) {
    if (/embed/i.test(s)) return 'AI embeddings';
    if (/complete|generat|llm|text|summar/i.test(s)) return 'AI text generation';
    if (/search|retriev/i.test(s)) return 'AI search';
    if (/translat|sentiment|extract|classif/i.test(s)) return 'AI language';
    if (/\bml\b|forecast|anomaly|model/i.test(s)) return 'ML compute';
    return 'AI functions';
  }
  return s.replace(/_/g, ' ');
}

function SkeletonPanel() {
  return (
    <div className="rounded-xl border border-purple-200 bg-white p-6 dark:border-purple-900/40 dark:bg-gray-800 animate-pulse">
      <div className="mb-4 h-5 w-48 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="mt-4 h-40 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

/**
 * AiComputeCostPanel — surfaces the LIVE server-side AI compute cost breakdown
 * from `GET /org-accounts/cortex-costs` (AI credits + ML compute credits, daily
 * trend, per-service split). Self-fetching with its own loading / empty / error
 * states so an undeployed route (404) degrades to an honest "not available"
 * notice locally without poisoning the rest of the Credits tab.
 *
 * Complements the client-side per-feature AiConsumptionCard: this card is the
 * authoritative per-service spend total; the local card adds per-feature detail
 * the server rollup does not yet expose.
 */
export default function AiComputeCostPanel({ days, refreshKey }: AiComputeCostPanelProps) {
  const [data, setData] = useState<CortexCostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A 404/501 means the route is not on this backend yet — render an honest
  // "not available" notice rather than a red error banner.
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    getCortexCosts(days)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((e: any) => {
        if (cancelled) return;
        const status = e?.response?.status;
        if (status === 404 || status === 501) setUnavailable(true);
        else setError(extractApiError(e, 'Failed to load AI compute cost'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, refreshKey]);

  const summary = data?.summary;
  const aiCredits = summary?.ai_credits ?? 0;
  const mlCredits = summary?.ml_compute_credits ?? 0;
  const totalCredits = summary?.total_credits ?? 0;

  // Daily trend: merge per-service AI credits (daily_costs) and ML compute
  // (ml_compute) into one date-keyed series of AI vs ML credits.
  const trend = useMemo(() => {
    const byDate = new Map<string, { date: string; ai: number; ml: number }>();
    for (const row of data?.daily_costs ?? []) {
      const k = row.date;
      const cur = byDate.get(k) ?? { date: k, ai: 0, ml: 0 };
      cur.ai += Number(row.credits) || 0;
      byDate.set(k, cur);
    }
    for (const row of data?.ml_compute ?? []) {
      const k = row.date;
      const cur = byDate.get(k) ?? { date: k, ai: 0, ml: 0 };
      cur.ml += Number(row.credits) || 0;
      byDate.set(k, cur);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Per-service rollup (credits / tokens / requests) with brand-safe labels.
  const byService = useMemo(() => {
    const acc = new Map<string, { label: string; credits: number; tokens: number; requests: number }>();
    for (const row of data?.daily_costs ?? []) {
      const label = neutralServiceLabel(row.service_type);
      const cur = acc.get(label) ?? { label, credits: 0, tokens: 0, requests: 0 };
      cur.credits += Number(row.credits) || 0;
      cur.tokens += Number(row.tokens) || 0;
      cur.requests += Number(row.requests) || 0;
      acc.set(label, cur);
    }
    return Array.from(acc.values()).sort((a, b) => b.credits - a.credits);
  }, [data]);

  const hasTrend = trend.some((d) => d.ai > 0 || d.ml > 0);

  if (loading) return <SkeletonPanel />;

  return (
    <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/40 to-white p-6 dark:border-purple-900/40 dark:from-purple-900/10 dark:to-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiSparkleDuotone className="h-5 w-5 text-purple-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">AI compute cost</Text>
        </div>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          Last {days} days · live server rollup
        </Text>
      </div>

      {unavailable ? (
        <div className="flex items-start gap-3 rounded-lg border-l-4 border-amber-400 bg-amber-50/70 p-4 dark:bg-amber-900/20">
          <PiInfoDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <Text className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              AI compute cost not available on this backend yet
            </Text>
            <Text className="text-xs text-amber-700 dark:text-amber-200/80">
              The per-service AI spend endpoint is not deployed here. The per-feature
              breakdown below still reflects locally tracked activity.
            </Text>
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-white/70 p-4 dark:bg-gray-800/40">
              <Text className="text-xs uppercase tracking-wider text-gray-500">AI credits</Text>
              <div className="mt-1 text-2xl font-bold text-purple-600">{formatCredits(aiCredits)}</div>
              <Text className="text-xs text-gray-500">AI function spend</Text>
            </div>
            <div className="rounded-lg bg-white/70 p-4 dark:bg-gray-800/40">
              <Text className="text-xs uppercase tracking-wider text-gray-500">ML compute credits</Text>
              <div className="mt-1 text-2xl font-bold text-fuchsia-600">{formatCredits(mlCredits)}</div>
              <Text className="text-xs text-gray-500">Model / forecast compute</Text>
            </div>
            <div className="rounded-lg bg-white/70 p-4 dark:bg-gray-800/40">
              <Text className="text-xs uppercase tracking-wider text-gray-500">Total AI spend</Text>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{formatCredits(totalCredits)}</div>
              <Text className="text-xs text-gray-500">credits over window</Text>
            </div>
          </div>

          {/* Daily AI vs ML trend */}
          <div className="mt-6 rounded-lg bg-white/70 p-4 dark:bg-gray-800/40">
            <Text className="mb-2 text-xs uppercase tracking-wider text-gray-500">Daily AI vs ML credits</Text>
            {hasTrend ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="aiCostAi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="aiCostMl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d946ef" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#d946ef" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      stroke="#9ca3af"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as { date: string; ai: number; ml: number };
                      return (
                        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                          <Text className="text-sm font-medium text-gray-900 dark:text-white">
                            {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                          <Text className="text-sm text-purple-600">AI: {formatCredits(item.ai)}</Text>
                          <Text className="text-sm text-fuchsia-600">ML: {formatCredits(item.ml)}</Text>
                        </div>
                      );
                    }} />
                    <Area type="monotone" dataKey="ai" stroke="#a855f7" strokeWidth={2} fill="url(#aiCostAi)" name="AI" />
                    <Area type="monotone" dataKey="ml" stroke="#d946ef" strokeWidth={2} fill="url(#aiCostMl)" name="ML" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                No AI compute charges in this window
              </div>
            )}
          </div>

          {/* Per-service spend (brand-safe labels) */}
          <div className="mt-6 overflow-x-auto rounded-lg bg-white/70 dark:bg-gray-800/40">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">AI service</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Credits</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Requests</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {byService.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No AI service activity</td></tr>
                ) : byService.map((s) => (
                  <tr key={s.label} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2">
                      <Badge variant="flat" color="secondary" className="text-xs">{s.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{formatCredits(s.credits)}</Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">{s.requests > 0 ? s.requests.toLocaleString() : '—'}</Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">{s.tokens > 0 ? s.tokens.toLocaleString() : '—'}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
