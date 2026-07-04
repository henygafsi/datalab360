'use client';

import { useState, useEffect, useMemo } from 'react';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  PiCreditCardDuotone,
  PiCalendarDuotone,
  PiCurrencyDollarDuotone,
  PiReceiptDuotone,
  PiChartBarDuotone,
  PiFileTextDuotone,
  PiWarningCircleDuotone,
} from 'react-icons/pi';
import {
  getBalance,
  getContract,
  getRateSheet,
  getOrganizationCosts,
} from '@/app/services/org-accounts/hooks';
import { formatCredits, formatDate, extractApiError } from '@/app/services/org-accounts/utils';
import { safeNum, safeToFixed, safeLocale } from '@/lib/format-number';
import type {
  BalanceResponse,
  ContractItem,
  RateSheetEntry,
  DateRange,
} from '@/app/services/org-accounts/types';

interface BillingTabProps {
  refreshKey: number;
}

/** Aggregated cost per account after client-side grouping */
interface AccountCost {
  account_name: string;
  total_cost: number;
  currency: string;
  service_breakdown: Record<string, number>;
}

const COLORS = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e'];

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

/** Clean empty state for sections with no data */
function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
      <Icon className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <Text className="text-sm text-gray-400 dark:text-gray-500">{label}</Text>
    </div>
  );
}

/** Inline error banner — distinct from EmptyState so a failed fetch never reads as "no data". */
function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
      <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
      <div>
        <Text className="text-sm font-medium text-red-700 dark:text-red-300">Some billing data could not be loaded</Text>
        <Text className="text-xs text-red-600 dark:text-red-400">{message}</Text>
      </div>
    </div>
  );
}

/**
 * Aggregate flat daily cost rows into per-account totals.
 * Backend shape: { costs: [{ACCOUNT_NAME, SERVICE_TYPE, USAGE_IN_CURRENCY, CURRENCY, ...}], total, period_days }
 */
function aggregateCosts(raw: any[]): AccountCost[] {
  const map = new Map<string, AccountCost>();
  for (const row of raw) {
    const name = row.ACCOUNT_NAME || row.account_name || 'Unknown';
    const amount = Number(row.USAGE_IN_CURRENCY ?? row.usage_in_currency ?? 0);
    const currency = row.CURRENCY || row.currency || 'USD';
    const service = row.SERVICE_TYPE || row.service_type || 'OTHER';

    const existing = map.get(name);
    if (existing) {
      existing.total_cost += amount;
      existing.service_breakdown[service] = (existing.service_breakdown[service] || 0) + amount;
    } else {
      map.set(name, {
        account_name: name,
        total_cost: amount,
        currency,
        service_breakdown: { [service]: amount },
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total_cost - a.total_cost);
}

function formatCurrency(amount: number | string | null | undefined, currency = 'USD'): string {
  const n = safeNum(amount);
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillingTab({ refreshKey }: BillingTabProps) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [rates, setRates] = useState<RateSheetEntry[]>([]);
  const [costsRaw, setCostsRaw] = useState<any[]>([]);
  const [costsCurrency, setCostsCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;

  useEffect(() => {
    setLoading(true);
    setError(null);
    let firstError: string | null = null;
    const guard = <T,>(p: Promise<T>): Promise<T | null> =>
      p.catch((e) => { firstError = firstError ?? extractApiError(e, 'Failed to load billing'); return null; });

    Promise.all([
      guard(getBalance()),
      guard(getContract()),
      guard(getRateSheet()),
      guard(getOrganizationCosts(days)),
    ]).then(([balanceData, contractData, rateData, costsData]) => {
      if (balanceData) setBalance(balanceData);
      if (contractData) setContracts(Array.isArray(contractData.contracts) ? contractData.contracts : []);
      if (rateData) setRates(Array.isArray(rateData.rates) ? rateData.rates : []);
      if (costsData && Array.isArray(costsData.costs)) {
        setCostsRaw(costsData.costs);
        // Extract currency from first row
        const firstRow = costsData.costs[0];
        if (firstRow) {
          setCostsCurrency(firstRow.CURRENCY || firstRow.currency || 'USD');
        }
      } else {
        setCostsRaw([]);
      }
      setError(firstError);
    }).finally(() => setLoading(false));
  }, [refreshKey, days]);

  const accountCosts = useMemo(() => aggregateCosts(costsRaw), [costsRaw]);
  const totalCost = useMemo(() => accountCosts.reduce((s, a) => s + a.total_cost, 0), [accountCosts]);
  const chartData = useMemo(() => accountCosts.slice(0, 10), [accountCosts]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}
      {/* Date Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiCurrencyDollarDuotone className="h-5 w-5 text-green-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            Total Cost: <span className="text-green-600">{formatCurrency(totalCost, costsCurrency)}</span>
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 ml-1">({days}d)</Text>
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

      {/* Balance Cards */}
      {balance && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-start justify-between">
              <div>
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">Capacity Balance</Text>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white">{formatCredits(balance.capacity_balance)}</Text>
                <Text className="text-xs text-gray-500">{balance.currency}</Text>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/20">
                <PiCreditCardDuotone className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-start justify-between">
              <div>
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">Free Credits</Text>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white">{formatCredits(balance.free_credits_remaining)}</Text>
                <Text className="text-xs text-gray-500">Remaining</Text>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <PiCurrencyDollarDuotone className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-start justify-between">
              <div>
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">On-Demand</Text>
                <Text className="text-2xl font-bold text-amber-600">{formatCredits(balance.on_demand_consumption)}</Text>
                <Text className="text-xs text-gray-500">Consumption</Text>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <PiReceiptDuotone className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-start justify-between">
              <div>
                <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">Rollover Balance</Text>
                <Text className="text-2xl font-bold text-gray-900 dark:text-white">{formatCredits(balance.rollover_balance)}</Text>
                <Text className="text-xs text-gray-500">Contract: {balance.contract_number}</Text>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
                <PiCalendarDuotone className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {!balance && (
        <EmptyState icon={PiCreditCardDuotone} label="No balance data available" />
      )}

      {/* Cost by Account — Chart + Table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bar Chart */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PiChartBarDuotone className="h-5 w-5 text-green-600" />
            <Text className="font-semibold text-gray-900 dark:text-white">Cost Distribution by Account</Text>
          </div>
          <div className="h-64">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">No cost data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal vertical={false} />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCurrency(v, costsCurrency)} />
                  <YAxis type="category" dataKey="account_name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} width={75} tickFormatter={(v: string) => v.length > 12 ? v.substring(0, 10) + '...' : v} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as AccountCost;
                    return (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">{item.account_name}</Text>
                        <Text className="text-sm text-gray-600">Cost: <span className="font-semibold text-green-600">{formatCurrency(item.total_cost, item.currency)}</span></Text>
                        {Object.entries(item.service_breakdown ?? {}).slice(0, 4).map(([svc, amt]) => (
                          <Text key={svc} className="text-xs text-gray-500">{svc.replace(/_/g, ' ')}: {formatCurrency(amt, item.currency)}</Text>
                        ))}
                      </div>
                    );
                  }} />
                  <Bar dataKey="total_cost" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Cost by Account Table */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <PiCurrencyDollarDuotone className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              <Text className="font-semibold text-gray-900 dark:text-white">Cost by Account</Text>
              <Badge variant="flat" color="success" className="text-xs ml-auto">{accountCosts.length} accounts</Badge>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">% of Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Currency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {accountCosts.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No cost data available</td></tr>
                ) : accountCosts.map((acc) => (
                  <tr key={acc.account_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{acc.account_name}</Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(acc.total_cost, acc.currency)}</Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">{totalCost > 0 ? `${((acc.total_cost / totalCost) * 100).toFixed(1)}%` : '—'}</Text>
                    </td>
                    <td className="px-4 py-2">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">{acc.currency}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Contract Items — empty state if no data */}
      {contracts.length > 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <PiCalendarDuotone className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              <Text className="font-semibold text-gray-900 dark:text-white">Contract Items</Text>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Contract #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Period</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Currency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {contracts.map((c, i) => (
                  <tr key={`${c.contract_number}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3"><Text className="font-medium text-gray-900 dark:text-white">{c.contract_number}</Text></td>
                    <td className="px-4 py-3"><Badge variant="flat" color="primary" className="text-xs">{c.contract_item}</Badge></td>
                    <td className="px-4 py-3"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatDate(c.start_date)} - {formatDate(c.end_date)}</Text></td>
                    <td className="px-4 py-3 text-right"><Text className="font-medium text-gray-900 dark:text-white">{safeLocale(c.amount)}</Text></td>
                    <td className="px-4 py-3"><Text className="text-gray-600 dark:text-gray-300">{c.currency}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState icon={PiFileTextDuotone} label="No contract data available" />
      )}

      {/* Rate Sheet — empty state if no data */}
      {rates.length > 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <PiReceiptDuotone className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              <Text className="font-semibold text-gray-900 dark:text-white">Rate Sheet</Text>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Service Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Usage Type</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Currency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rates.map((r, i) => (
                  <tr key={`${r.account_name}-${r.service_type}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{r.account_name}</Text></td>
                    <td className="px-4 py-2"><Badge variant="flat" color="info" className="text-xs">{r.service_type.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{r.usage_type}</Text></td>
                    <td className="px-4 py-2 text-right"><Text className="text-sm font-medium text-gray-900 dark:text-white">{safeToFixed(r.effective_rate, 2)}</Text></td>
                    <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{r.currency}</Text></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState icon={PiReceiptDuotone} label="No rate sheet data available" />
      )}
    </div>
  );
}
