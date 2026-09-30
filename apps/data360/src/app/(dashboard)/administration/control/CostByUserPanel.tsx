'use client';

/**
 * CostByUserPanel — per-user cost transparency for the ACCOUNTADMIN
 * (2026-09 user directive), on the C1 contract:
 * GET /api/administration/costs/by-user?days= (serve="prepare").
 *
 * Contract display rules, enforced here:
 *  - credits_attributed === null ≠ 0 — the user ran queries that carry no
 *    attribution row; render '—' with the explanation, never a zero.
 *  - money.amount === null ⇒ "valuation not configured" (pricing policy is
 *    versioned backend state), never a fabricated amount.
 *  - unattributed_compute_credits is the idle share NO user can claim —
 *    shown apart from the per-user table, never spread across users.
 */

import { useCallback, useEffect, useState } from 'react';
import { Wallet, RefreshCw } from 'lucide-react';
import {
  getCostsByUser,
  isAdminEnvelope,
  type CostsByUserResponse,
} from '@/app/services/administration/control';
import { type AoMeta } from '@/app/shared/command-center/lib/meta';
import FreshnessChip from '@/app/shared/command-center/lib/FreshnessChip';
import PreparingState from '@/app/shared/command-center/lib/PreparingState';
import EmptyState from '@/components/ui/EmptyState';

const WINDOWS = [7, 30, 90] as const;

const fmtCredits = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtInt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString();

function moneyLabel(m?: { amount: number | null; currency: string | null } | null): string {
  if (!m || m.amount == null) return 'not configured';
  return `${m.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.currency ?? ''}`.trim();
}

function Tile({ label, value, hint, tone = 'slate' }: { label: string; value: string; hint?: string; tone?: 'slate' | 'amber' }) {
  return (
    <div
      title={hint}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
    >
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`text-base font-semibold tabular-nums ${
          tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function CostByUserPanel() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<CostsByUserResponse | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(null);
    try {
      const res = await getCostsByUser(days);
      if (isAdminEnvelope(res)) {
        if (res.state === 'preparing') setPreparing(true);
        else setUnavailable(res.reason ?? 'Per-user cost attribution is unavailable on this account.');
        return;
      }
      setPreparing(false);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load per-user costs');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // Preparing: bounded retry so the panel fills without a manual refresh.
  useEffect(() => {
    if (!preparing) return;
    const t = window.setTimeout(() => void load(), 8000);
    return () => window.clearTimeout(t);
  }, [preparing, load]);

  const totals = data?.totals;
  const policyUnconfigured = (data?.policy?.state ?? 'unconfigured') !== 'configured';

  return (
    <section
      role="region"
      aria-label="Costs by user"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Wallet className="h-4 w-4 text-slate-400" aria-hidden />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Costs by user</h3>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          compute credits attributed per user — full transparency for this account&apos;s administrator
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <FreshnessChip meta={(data?.meta as AoMeta | undefined) ?? null} />
          <div
            role="group"
            aria-label="Window"
            className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
          >
            {WINDOWS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={
                  days === d
                    ? 'rounded-md bg-accent-600 px-2 py-0.5 text-[11px] font-medium text-white'
                    : 'rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            title="Refresh"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {preparing && !data ? (
        <PreparingState domainLabel="per-user cost attribution" />
      ) : unavailable ? (
        <EmptyState
          compact
          title="Per-user attribution unavailable on this account"
          description={unavailable}
        />
      ) : error ? (
        <p role="alert" className="py-6 text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : loading && !data ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-3" aria-busy={loading}>
          {/* Totals — the idle share is shown APART, never spread on users. */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile
              label="Attributed to users"
              value={fmtCredits(totals?.attributed_compute_credits)}
              hint="Compute credits with a per-user attribution row"
            />
            <Tile
              label="Idle / unattributable"
              value={fmtCredits(totals?.unattributed_compute_credits)}
              tone="amber"
              hint="Idle warehouse time — no user can claim this share"
            />
            <Tile
              label="Cloud services"
              value={fmtCredits(totals?.cloud_services_credits)}
              hint="Cloud-services credits (account-level, not per-user)"
            />
            <Tile
              label="Billed value"
              value={moneyLabel(totals?.money_attributed)}
              hint={
                policyUnconfigured
                  ? data.policy?.hint ?? 'Set the pricing policy to value credits in currency.'
                  : `Pricing policy ${totals?.money_attributed?.policy_version ?? ''}`
              }
            />
          </div>

          {policyUnconfigured && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              Monetary valuation is not configured — credits are shown without a
              currency amount until the pricing policy is set (versioned,
              account-level; no rate is ever assumed).
            </p>
          )}

          {data.users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="px-2 py-1.5 font-medium">User</th>
                    <th className="px-2 py-1.5 font-medium">Roles</th>
                    <th className="px-2 py-1.5 text-right font-medium">Credits</th>
                    <th className="px-2 py-1.5 text-right font-medium">Value</th>
                    <th className="px-2 py-1.5 text-right font-medium">Attributed / total queries</th>
                    <th className="px-2 py-1.5 text-right font-medium">Failed</th>
                    <th className="px-2 py-1.5 text-right font-medium">Last query</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.users.map((u) => (
                    <tr key={u.username}>
                      <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-200">{u.username}</td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">
                        {u.roles?.length ? u.roles.join(', ') : '—'}
                      </td>
                      <td
                        className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300"
                        title={
                          u.credits_attributed == null
                            ? 'This user ran queries but no attribution rows exist for them — not the same as zero.'
                            : undefined
                        }
                      >
                        {fmtCredits(u.credits_attributed)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {moneyLabel(u.money)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {fmtInt(u.attributed_queries)} / {fmtInt(u.query_count)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          (u.failed_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {fmtInt(u.failed_count)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">
                        {u.last_query_at ? new Date(u.last_query_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              compact
              title="No attributed usage in this window"
              description="No user carries attribution rows over this period."
            />
          )}

          <p className="text-[11px] leading-4 text-slate-400 dark:text-slate-500" title={data.sources?.join('\n')}>
            Attribution method: {data.attribution_method}
          </p>
        </div>
      ) : null}
    </section>
  );
}
