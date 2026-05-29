'use client';

/**
 * MeteringPanel — Account-overview "Cost & Metering" card.
 *
 * Surfaces the data360 cost model across its priced dimensions:
 *   • account base
 *   • per connected source
 *   • per active project
 *   • per module activation
 *   • cost of modules
 *
 * The numbers come from `useMeteringEstimate`, which tries
 * `GET /billing/estimate` first and falls back to the local
 * `pricing-reference.json` table. Until the real billing endpoint lands,
 * every `reference_price` is 0 — so every price cell carries an explicit
 * "(reference)" tag and a violet Backend-gap note names the missing
 * endpoints. NO fabricated prices.
 *
 * Personas served:
 *   Superadmin — total cost broken down by source / project / module / account.
 *   Admin      — "does this cost credits?" + free-discovery allowance.
 *   QA         — free-discovery cap clearly delineated from paid usage.
 */

import { Coins, Lock } from 'lucide-react';
import {
  useMeteringEstimate,
  type MeteringInput,
  type MeteringBreakdownRow,
} from '@/hooks/useMeteringEstimate';
import VolumeLockBadge from './VolumeLockBadge';

export interface MeteringPanelProps {
  /**
   * Account scope used to compute the estimate. Until the real account
   * shell wires live counts, callers may pass 0s — the panel renders the
   * model structure honestly with reference prices.
   */
  scope?: MeteringInput;
  /** Optional title override. */
  title?: string;
}

const DEFAULT_SCOPE: MeteringInput = {
  sources: 0,
  projects: 0,
  modulesActive: [],
};

function formatCredits(value: number): string {
  if (value === 0) return '0';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function MeteringPanel({
  scope = DEFAULT_SCOPE,
  title = 'Cost & Metering',
}: MeteringPanelProps) {
  const estimate = useMeteringEstimate(scope);
  const isReference = estimate.source === 'reference';

  return (
    <section
      aria-labelledby="metering-panel-heading"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-500" aria-hidden />
          <div>
            <h2
              id="metering-panel-heading"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              {title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cost broken down per source, project, module and account base.
            </p>
          </div>
        </div>
        <span
          className={
            isReference
              ? 'shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
              : 'shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          }
        >
          {isReference ? 'Reference pricing' : 'Live pricing'}
        </span>
      </div>

      {/* Free-discovery line — prominent, at the top. */}
      <div className="mt-3">
        <VolumeLockBadge
          variant="full"
          used={estimate.freeDiscovery.used}
          cap={estimate.freeDiscovery.rowCap}
        />
      </div>

      {/* Breakdown table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Cost breakdown per priced dimension
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-left dark:border-slate-700">
              <th
                scope="col"
                className="py-2 pr-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Dimension
              </th>
              <th
                scope="col"
                className="py-2 px-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Count
              </th>
              <th
                scope="col"
                className="py-2 px-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Unit price
              </th>
              <th
                scope="col"
                className="py-2 pl-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {estimate.breakdown.map((row) => (
              <BreakdownRowView key={row.dimension} row={row} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600">
              <th
                scope="row"
                className="py-2 pr-2 text-left text-sm font-bold text-slate-900 dark:text-white"
              >
                Total
              </th>
              <td />
              <td />
              <td className="py-2 pl-2 text-right font-mono text-sm font-bold text-slate-900 dark:text-white">
                {formatCredits(estimate.total)} credits
                {isReference && (
                  <span className="ml-1 text-[10px] font-normal text-violet-600 dark:text-violet-400">
                    (reference)
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Backend gap — names the endpoints that must land. */}
      <div className="mt-4">
        <BackendGapNote />
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-renderers
// ───────────────────────────────────────────────────────────────────────────

function BreakdownRowView({ row }: { row: MeteringBreakdownRow }) {
  const isReference = row.source === 'reference';
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <th
        scope="row"
        className="py-2 pr-2 text-left font-normal text-slate-800 dark:text-slate-200"
      >
        <span className="font-medium">{row.label}</span>
        <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          per {row.unit}
        </span>
      </th>
      <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
        {row.count.toLocaleString()}
      </td>
      <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
        {formatCredits(row.unit_price)}
        {isReference && (
          <span className="ml-1 text-[10px] text-violet-600 dark:text-violet-400">
            (reference)
          </span>
        )}
      </td>
      <td className="py-2 pl-2 text-right font-mono font-semibold text-slate-900 dark:text-white">
        {formatCredits(row.subtotal)}
        {isReference && (
          <span className="ml-1 text-[10px] font-normal text-violet-600 dark:text-violet-400">
            (reference)
          </span>
        )}
      </td>
    </tr>
  );
}

interface GapEndpoint {
  method: string;
  path: string;
  purpose: string;
}

const GAP_ENDPOINTS: GapEndpoint[] = [
  {
    method: 'GET',
    path: '/billing/pricing',
    purpose: 'The real per-dimension prices (per source / project / module / account base).',
  },
  {
    method: 'GET',
    path: '/billing/estimate?account_id=',
    purpose: 'Returns { sources, projects, modules[], total, period } for the account.',
  },
  {
    method: 'GET',
    path: '/account/{id}/usage',
    purpose: 'Free-discovery rows consumed against the 1000-row allowance.',
  },
];

/**
 * BackendGapNote — replicates the violet "Backend gap" callout style from
 * workflow/components/WizardPreflightPanel.tsx. Names every endpoint the
 * backend must expose before the panel can show real numbers.
 */
function BackendGapNote() {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 text-violet-500" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Backend gap — UX target
        </p>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-700 dark:text-slate-300">
        No billing endpoint is exposed today. Every price above is a{' '}
        <span className="font-semibold text-violet-700 dark:text-violet-300">
          reference placeholder (0)
        </span>{' '}
        from <code className="font-mono">pricing-reference.json</code>. The
        following endpoints unlock real metering:
      </p>
      <dl className="mt-2 space-y-1.5 text-[11px]">
        {GAP_ENDPOINTS.map((ep) => (
          <div key={ep.path} className="grid grid-cols-[auto_1fr] gap-2">
            <dt className="font-mono font-semibold text-violet-700 dark:text-violet-300">
              {ep.method} {ep.path}
            </dt>
            <dd className="text-slate-700 dark:text-slate-300">{ep.purpose}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
        <span className="text-[10px] text-violet-800 dark:text-violet-200">
          Until these land, the panel renders the cost-model structure with
          reference prices — no figure here is a real bill.
        </span>
      </div>
    </div>
  );
}
