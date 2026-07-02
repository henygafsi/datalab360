'use client';

/**
 * MeteringPanel — Account-overview "Cost & Metering" card.
 *
 * Surfaces the account's REAL commercial terms:
 *   • Contract line-items   → GET /org-accounts/contract
 *   • Per-account rate sheet → GET /org-accounts/rate-sheet
 *
 * The contract + rate-sheet shapes are line-items + rate cards (NOT a
 * per-source/project/module estimate), so they render as a contract table + a
 * rate sheet rather than a per-usage estimate.
 *
 * Honest-gating: contract/rate-sheet are ORGADMIN-gated and may not be present
 * on every deployment — 403 (not permitted) and 404 (endpoint/object missing)
 * render explicit empty/unavailable states, never fabricated numbers.
 */

import { useEffect, useState } from 'react';
import { Coins, FileText, Receipt, Lock, AlertTriangle } from 'lucide-react';
import { getContract, getRateSheet } from '@/app/services/org-accounts/hooks';
import { formatDate, extractApiError } from '@/app/services/org-accounts/utils';
import type {
  ContractItem,
  RateSheetEntry,
} from '@/app/services/org-accounts/types';

export interface MeteringPanelProps {
  /** Optional title override. */
  title?: string;
  /**
   * Retained for backward compatibility with prior callers; no longer used
   * (the panel now reads the real contract/rate-sheet instead of an estimate).
   */
  scope?: unknown;
}

interface SectionState {
  status: 'unavailable' | 'forbidden' | 'error';
  message: string;
}

function formatCurrency(amount: number, currency = 'USD'): string {
  if (!Number.isFinite(amount)) return '—';
  try {
    return amount.toLocaleString('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    // Unknown currency code → fall back to a plain number + code suffix.
    return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

/** Map a thrown API error to the section state (403 vs 404 vs other). */
function classify(err: unknown): SectionState {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    return {
      status: 'forbidden',
      message: 'Requires an organization-admin role.',
    };
  }
  if (status === 404 || status === 405) {
    return {
      status: 'unavailable',
      message: 'Not available on this backend yet.',
    };
  }
  return { status: 'error', message: extractApiError(err, 'Could not load') };
}

export default function MeteringPanel({
  title = 'Cost & Metering',
}: MeteringPanelProps) {
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [rates, setRates] = useState<RateSheetEntry[]>([]);
  const [contractState, setContractState] = useState<SectionState | null>(null);
  const [rateState, setRateState] = useState<SectionState | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.allSettled([getContract(), getRateSheet()]).then(
      ([contractRes, rateRes]) => {
        if (!alive) return;
        if (contractRes.status === 'fulfilled') {
          setContracts(
            Array.isArray(contractRes.value?.contracts)
              ? contractRes.value.contracts
              : [],
          );
          setContractState(null);
        } else {
          setContractState(classify(contractRes.reason));
        }
        if (rateRes.status === 'fulfilled') {
          setRates(
            Array.isArray(rateRes.value?.rates) ? rateRes.value.rates : [],
          );
          setRateState(null);
        } else {
          setRateState(classify(rateRes.reason));
        }
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  // Contract total, grouped by currency (line-items can mix currencies).
  const contractTotals = contracts.reduce<Record<string, number>>((acc, c) => {
    const cur = c.currency || 'USD';
    acc[cur] = (acc[cur] ?? 0) + (Number(c.amount) || 0);
    return acc;
  }, {});

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
              Contract terms and per-account rate sheet for this organization.
            </p>
          </div>
        </div>
        {!loading &&
          Object.keys(contractTotals).length > 0 &&
          contractState === null && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Contract value
              </p>
              <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                {Object.entries(contractTotals)
                  .map(([cur, amt]) => formatCurrency(amt, cur))
                  .join(' · ')}
              </p>
            </div>
          )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3" role="status" aria-label="Loading">
          <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Contract line-items */}
          <Subsection icon={FileText} title="Contract">
            {contractState ? (
              <StateNote state={contractState} />
            ) : contracts.length === 0 ? (
              <EmptyNote label="No contract line-items for this organization." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                      <Th>Item</Th>
                      <Th>Contract</Th>
                      <Th>Period</Th>
                      <Th className="text-right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c, i) => (
                      <tr
                        key={`${c.contract_number}-${c.contract_item}-${i}`}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="py-2 pr-2 font-medium text-slate-800 dark:text-slate-200">
                          {c.contract_item || '—'}
                        </td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400">
                          {c.contract_number || '—'}
                        </td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400">
                          {c.start_date ? formatDate(c.start_date) : '—'}
                          {c.end_date ? ` → ${formatDate(c.end_date)}` : ''}
                        </td>
                        <td className="py-2 pl-2 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(Number(c.amount) || 0, c.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Subsection>

          {/* Rate sheet */}
          <Subsection
            icon={Receipt}
            title="Rate sheet"
            count={rateState === null ? rates.length : undefined}
          >
            {rateState ? (
              <StateNote state={rateState} />
            ) : rates.length === 0 ? (
              <EmptyNote label="No rate-sheet entries for this organization." />
            ) : (
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
                    <tr className="text-left">
                      <Th>Account</Th>
                      <Th>Service</Th>
                      <Th>Usage type</Th>
                      <Th className="text-right">Effective rate</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((r, i) => (
                      <tr
                        key={`${r.account_locator}-${r.service_type}-${r.usage_type}-${i}`}
                        className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                      >
                        <td className="py-2 pr-2 font-medium text-slate-800 dark:text-slate-200">
                          {r.account_name || r.account_locator || '—'}
                        </td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400">
                          {r.service_type || '—'}
                        </td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400">
                          {r.usage_type || '—'}
                        </td>
                        <td className="py-2 pl-2 text-right font-mono text-slate-900 dark:text-white">
                          {Number.isFinite(r.effective_rate)
                            ? `${r.effective_rate} ${r.currency || ''}`.trim()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Subsection>
        </div>
      )}
    </section>
  );
}

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function Subsection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" aria-hidden />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {title}
        </h3>
        {typeof count === 'number' && count > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`py-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 first:pl-0 last:pr-0 ${className}`}
    >
      {children}
    </th>
  );
}

function EmptyNote({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
      {label}
    </p>
  );
}

function StateNote({ state }: { state: SectionState }) {
  if (state.status === 'forbidden') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
        <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        <span>{state.message}</span>
      </div>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        <span>{state.message}</span>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      <span>{state.message}</span>
    </div>
  );
}
