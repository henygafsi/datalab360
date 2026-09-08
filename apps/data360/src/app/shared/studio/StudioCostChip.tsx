'use client';

/**
 * StudioCostChip — the REAL cost, on every /studio page (user rule: all
 * pages show cost, and seeing cost is access-managed).
 *
 * Two truths side by side for platform admins:
 *  - the AI free-preview envelope (calls this hour, credits charged);
 *  - the ACCOUNT'S real compute spend — Snowflake WAREHOUSE_METERING_
 *    HISTORY over 7 days in USD — because "0 credits" on the envelope
 *    never meant the account was free: warehouses meter everything the
 *    Studio (and the rest of the platform) executes. Metering lags
 *    Snowflake-side (~1-3 h) and is account-wide, not per-application —
 *    per-app attribution is a backend contract in progress.
 * Everyone else sees nothing: cost governance is an admin surface.
 */

import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { getPreviewUsage, type PreviewUsage } from '@/app/services/studio/studio-api';
import { API } from '@/lib/api-contracts';
import apiClient from '@/lib/api-client';
import { isAdminRole } from '@/config/constants';
import { useAuth } from '@/hooks/useAuth';

interface WarehouseUsage {
  period_days?: number;
  total_credits?: number;
  estimated_cost_usd?: number;
}

export default function StudioCostChip() {
  const { role } = useAuth();
  const [usage, setUsage] = useState<PreviewUsage | null>(null);
  const [spend, setSpend] = useState<WarehouseUsage | null>(null);

  const admin = isAdminRole(role);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    void getPreviewUsage()
      .then((u) => alive && setUsage(u))
      .catch(() => undefined); // the meter is enrichment — never blocks a page
    void apiClient
      .get<WarehouseUsage>(API.observability.warehouseUsage(7), { timeout: 60_000 })
      .then((r) => alive && setSpend(r.data))
      .catch(() => undefined); // '—' stays honest when metering is unreadable
    return () => {
      alive = false;
    };
  }, [admin]);

  if (!admin || (!usage && !spend)) return null;

  const hour = usage?.ai_calls_per_hour;
  const credits = usage?.credits_charged ?? 0;
  const usd = spend?.estimated_cost_usd;

  return (
    <span
      /* No vendor name in customer-facing copy — a tooltip IS customer
         facing, and it escaped the brand check only because innerText
         does not carry title attributes. */
      title={`AI free-preview envelope: calls this hour ${hour?.used ?? '—'}/${hour?.limit ?? '—'} · AI credits charged ${credits}. Account compute (all workloads, warehouse metering over ${spend?.period_days ?? 7} days, lags ~1-3 h): ${spend?.total_credits ?? '—'} credits ≈ $${usd ?? '—'}. Per-application attribution arrives with the metering contract. Visible to platform admins only.`}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-500 dark:border-slate-700 dark:text-slate-400"
    >
      <Coins aria-hidden className="h-3 w-3" />
      AI {hour?.used ?? '—'}/{hour?.limit ?? '—'}
      <span className="text-slate-300 dark:text-slate-600">·</span>
      {usd != null ? (
        <span title="Real account compute over 7 days — not just the Studio">
          ${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}/7d
        </span>
      ) : (
        <span>compute —</span>
      )}
    </span>
  );
}
