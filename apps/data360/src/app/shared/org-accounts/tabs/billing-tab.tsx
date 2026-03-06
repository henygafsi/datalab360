'use client';

import { useState, useEffect } from 'react';
import { Text, Badge } from 'rizzui';
import {
  PiCreditCardDuotone,
  PiCalendarDuotone,
  PiCurrencyDollarDuotone,
  PiReceiptDuotone,
} from 'react-icons/pi';
import {
  getBalance,
  getContract,
  getRateSheet,
} from '@/app/services/org-accounts/hooks';
import { formatCredits, formatDate } from '@/app/services/org-accounts/utils';
import type {
  BalanceResponse,
  ContractItem,
  RateSheetEntry,
} from '@/app/services/org-accounts/types';

interface BillingTabProps {
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

export default function BillingTab({ refreshKey }: BillingTabProps) {
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [rates, setRates] = useState<RateSheetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getBalance().catch(() => null),
      getContract().catch(() => null),
      getRateSheet().catch(() => null),
    ]).then(([balanceData, contractData, rateData]) => {
      if (balanceData) setBalance(balanceData);
      if (contractData) setContracts(Array.isArray(contractData.contracts) ? contractData.contracts : []);
      if (rateData) setRates(Array.isArray(rateData.rates) ? rateData.rates : []);
    }).finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <PiCreditCardDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <Text className="text-gray-500">No balance data available</Text>
        </div>
      )}

      {/* Contract Items */}
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
              {contracts.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No contract data</td></tr>
              ) : contracts.map((c, i) => (
                <tr key={`${c.contract_number}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3"><Text className="font-medium text-gray-900 dark:text-white">{c.contract_number}</Text></td>
                  <td className="px-4 py-3"><Badge variant="flat" color="primary" className="text-xs">{c.contract_item}</Badge></td>
                  <td className="px-4 py-3"><Text className="text-sm text-gray-600 dark:text-gray-300">{formatDate(c.start_date)} - {formatDate(c.end_date)}</Text></td>
                  <td className="px-4 py-3 text-right"><Text className="font-medium text-gray-900 dark:text-white">{c.amount.toLocaleString()}</Text></td>
                  <td className="px-4 py-3"><Text className="text-gray-600 dark:text-gray-300">{c.currency}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rate Sheet */}
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
              {rates.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No rate data</td></tr>
              ) : rates.map((r, i) => (
                <tr key={`${r.account_name}-${r.service_type}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{r.account_name}</Text></td>
                  <td className="px-4 py-2"><Badge variant="flat" color="info" className="text-xs">{r.service_type.replace(/_/g, ' ')}</Badge></td>
                  <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{r.usage_type}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm font-medium text-gray-900 dark:text-white">{r.effective_rate.toFixed(2)}</Text></td>
                  <td className="px-4 py-2"><Text className="text-sm text-gray-600 dark:text-gray-300">{r.currency}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
