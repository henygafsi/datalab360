'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import { Loader2, Maximize2, TimerReset, PowerOff, Power } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { PiWarehouseDuotone, PiWarningCircleDuotone, PiGearDuotone } from 'react-icons/pi';
import {
  getWarehouses,
  getAccountWarehouses,
  resizeWarehouse,
  setWarehouseAutoSuspend,
  suspendWarehouse,
  resumeWarehouse,
} from '@/app/services/org-accounts/hooks';
import { ActionRail } from '@/app/shared/action-rail';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCanPerform } from '@/hooks/useCanPerform';
import { formatCredits, extractApiError } from '@/app/services/org-accounts/utils';
import { safeToFixed } from '@/lib/format-number';
import type { Warehouse, DateRange } from '@/app/services/org-accounts/types';

interface WarehousesTabProps {
  refreshKey: number;
}

const COLORS = { compute: '#3b82f6', cloud: '#10b981' };

// Snowflake WAREHOUSE_SIZE keywords. Values are the identifiers sent to the
// backend; labels are the human-readable forms SHOW WAREHOUSES reports.
const WAREHOUSE_SIZES: { value: string; label: string }[] = [
  { value: 'XSMALL', label: 'X-Small' },
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
  { value: 'XLARGE', label: 'X-Large' },
  { value: 'XXLARGE', label: '2X-Large' },
  { value: 'XXXLARGE', label: '3X-Large' },
  { value: 'X4LARGE', label: '4X-Large' },
];

/** Map a SHOW WAREHOUSES size string (e.g. "X-Small") to a dropdown value. */
function sizeToValue(size?: string | null): string {
  if (!size) return 'XSMALL';
  const norm = size.replace(/[-\s_]/g, '').toUpperCase();
  const direct = WAREHOUSE_SIZES.find((s) => s.value === norm);
  if (direct) return direct.value;
  const byLabel = WAREHOUSE_SIZES.find((s) => s.label.replace(/[-\s]/g, '').toUpperCase() === norm);
  return byLabel ? byLabel.value : 'XSMALL';
}

function isWarehouseRunning(state?: string | null): boolean {
  const s = (state ?? '').toUpperCase();
  return s === 'STARTED' || s === 'RESUMING' || s === 'RESUMED';
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
      <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  );
}

export default function WarehousesTab({ refreshKey }: WarehousesTabProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
    getWarehouses(days)
      .then((data) => setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []))
      .catch((e) => setError(extractApiError(e, 'Failed to load warehouses')))
      .finally(() => setLoading(false));
  }, [refreshKey, dateRange]);

  const chartData = useMemo(() => {
    return [...warehouses]
      .sort((a, b) => b.total_credits - a.total_credits)
      .slice(0, 15)
      .map((wh) => ({
        name: wh.account_name ? `${wh.account_name}/${wh.warehouse_name}` : wh.warehouse_name,
        displayName: (() => {
          const full = wh.account_name ? `${wh.account_name}/${wh.warehouse_name}` : wh.warehouse_name;
          return full.length > 20 ? full.substring(0, 17) + '...' : full;
        })(),
        warehouse_name: wh.warehouse_name,
        account_name: wh.account_name || '',
        compute_credits: wh.compute_credits,
        cloud_credits: wh.cloud_credits,
        total_credits: wh.total_credits,
        metering_hours: wh.metering_hours,
      }));
  }, [warehouses]);

  const totals = useMemo(() => {
    return warehouses.reduce(
      (acc, wh) => ({
        total: acc.total + wh.total_credits,
        compute: acc.compute + wh.compute_credits,
        cloud: acc.cloud + wh.cloud_credits,
      }),
      { total: 0, compute: 0, cloud: 0 }
    );
  }, [warehouses]);

  if (loading) {
    return <div className="space-y-6"><SkeletonCard /><SkeletonCard /></div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Warehouse data could not be loaded</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiWarehouseDuotone className="h-5 w-5 text-indigo-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">
            Total: <span className="text-indigo-600">{formatCredits(totals.total)}</span> credits
          </Text>
          <Text className="text-sm text-gray-500 ml-4">{warehouses.length} warehouses</Text>
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

      {/* Warehouse Chart */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.compute }} />
            <Text className="text-xs text-gray-600 dark:text-gray-300">Compute: {formatCredits(totals.compute)}</Text>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.cloud }} />
            <Text className="text-xs text-gray-600 dark:text-gray-300">Cloud Services: {formatCredits(totals.cloud)}</Text>
          </div>
        </div>
        <div className="h-96">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">No warehouse data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal vertical={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="displayName" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={115} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{item.warehouse_name}</Text>
                      {item.account_name && <Text className="text-xs text-gray-500">Account: {item.account_name}</Text>}
                      <Text className="text-sm text-indigo-600">Total: {safeToFixed(item.total_credits, 3)}</Text>
                      <Text className="text-sm text-blue-600">Compute: {safeToFixed(item.compute_credits, 3)}</Text>
                      <Text className="text-sm text-green-600">Cloud: {safeToFixed(item.cloud_credits, 3)}</Text>
                    </div>
                  );
                }} />
                <Bar dataKey="compute_credits" stackId="a" fill={COLORS.compute} name="Compute" />
                <Bar dataKey="cloud_credits" stackId="a" fill={COLORS.cloud} name="Cloud Services" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Warehouse Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Text className="font-semibold text-gray-900 dark:text-white">All Warehouses</Text>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Warehouse</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Total Credits</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Compute</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cloud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {warehouses.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No warehouses</td></tr>
              ) : [...warehouses].sort((a, b) => b.total_credits - a.total_credits).map((wh, i) => (
                <tr key={`${wh.account_name}-${wh.warehouse_name}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2"><Text className="text-sm text-gray-900 dark:text-white">{wh.account_name || '-'}</Text></td>
                  <td className="px-4 py-2"><Text className="text-sm font-medium text-gray-900 dark:text-white">{wh.warehouse_name}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm font-medium text-indigo-600">{safeToFixed(wh.total_credits, 3)}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{safeToFixed(wh.compute_credits, 3)}</Text></td>
                  <td className="px-4 py-2 text-right"><Text className="text-sm text-gray-600 dark:text-gray-300">{safeToFixed(wh.cloud_credits, 3)}</Text></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Connected-account warehouse management (resize / auto-suspend / suspend) */}
      <WarehouseManagementPanel refreshKey={refreshKey} />
    </div>
  );
}

/* ================================================================== */
/*  Warehouse management — CONNECTED ACCOUNT ONLY                      */
/* ================================================================== */
//
// ALTER WAREHOUSE actions (resize / auto-suspend / suspend) run against the
// connected account's session — the backend route carries only the warehouse
// name, not an account. We therefore source rows from getAccountWarehouses(
// connectedAccount), which returns live SHOW WAREHOUSES state (size / state /
// auto_suspend), so every warehouse shown is guaranteed local and safe to
// mutate. The org-wide usage table above is analytics-only (no actions), since
// applying a name-only ALTER to a cross-account warehouse could hit the wrong
// same-named warehouse.

type ManageMode = 'resize' | 'auto-suspend';

function WarehouseManagementPanel({ refreshKey }: { refreshKey: number }) {
  const [account, setAccount] = useState<string | null>(null);
  const [accountResolved, setAccountResolved] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  // Resize / auto-suspend share a single ActionRail; suspend is a confirm modal.
  const [manageTarget, setManageTarget] = useState<{ wh: Warehouse; mode: ManageMode } | null>(null);
  const [sizeValue, setSizeValue] = useState('XSMALL');
  const [secondsValue, setSecondsValue] = useState('60');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Warehouse | null>(null);
  const [suspendBusy, setSuspendBusy] = useState(false);
  // Name of the warehouse currently being resumed (per-row spinner). Resume is
  // idempotent (RESUME IF SUSPENDED) so it runs directly — no confirm modal,
  // unlike suspend which stops in-flight queries.
  const [resumingWh, setResumingWh] = useState<string | null>(null);

  // Action-RBAC: warehouse management is an `org_accounts` update. Fail-open
  // while the allow-set loads (no flash of a disabled control).
  const { allowed: canManage, loading: managePermLoading } = useCanPerform('org_accounts', 'update');
  const manageDenied = !canManage && !managePermLoading;

  // Resolve the connected account from the NextAuth session (carries
  // account_name). The Warehouses are then loaded for that account only.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((session: any) => {
        if (cancelled) return;
        setAccount(session?.user?.account_name || null);
      })
      .catch(() => { if (!cancelled) setAccount(null); })
      .finally(() => { if (!cancelled) setAccountResolved(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!accountResolved) return;
    if (!account) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    getAccountWarehouses(account, 30)
      .then((data) => setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []))
      .catch((e) => setError(extractApiError(e, 'Failed to load warehouses for this account')))
      .finally(() => setLoading(false));
  }, [account, accountResolved, refreshKey, localRefresh]);

  const openResize = (wh: Warehouse) => {
    if (manageDenied) return;
    setSizeValue(sizeToValue(wh.size));
    setFormError(null);
    setManageTarget({ wh, mode: 'resize' });
  };
  const openAutoSuspend = (wh: Warehouse) => {
    if (manageDenied) return;
    setSecondsValue(wh.auto_suspend != null ? String(wh.auto_suspend) : '60');
    setFormError(null);
    setManageTarget({ wh, mode: 'auto-suspend' });
  };

  const closeManage = useCallback(() => {
    if (busy) return;
    setManageTarget(null);
    setFormError(null);
  }, [busy]);

  const handleApplyManage = async () => {
    if (!manageTarget) return;
    const name = manageTarget.wh.warehouse_name;
    setBusy(true);
    setFormError(null);
    try {
      if (manageTarget.mode === 'resize') {
        await resizeWarehouse(name, sizeValue);
        toast.success(`Warehouse ${name} resized`);
      } else {
        const secs = Number(secondsValue);
        await setWarehouseAutoSuspend(name, secs);
        toast.success(`Auto-suspend updated for ${name}`);
      }
      setManageTarget(null);
      setLocalRefresh((v) => v + 1);
    } catch (e) {
      setFormError(extractApiError(e, 'Failed to update warehouse'));
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async () => {
    if (!suspendTarget) return;
    setSuspendBusy(true);
    try {
      await suspendWarehouse(suspendTarget.warehouse_name);
      toast.success(`Warehouse ${suspendTarget.warehouse_name} suspended`);
      setSuspendTarget(null);
      setLocalRefresh((v) => v + 1);
    } catch (e) {
      toast.error(extractApiError(e, 'Failed to suspend warehouse'));
    } finally {
      setSuspendBusy(false);
    }
  };

  const handleResume = async (wh: Warehouse) => {
    if (manageDenied) return;
    setResumingWh(wh.warehouse_name);
    try {
      await resumeWarehouse(wh.warehouse_name);
      toast.success(`Warehouse ${wh.warehouse_name} resumed`);
      setLocalRefresh((v) => v + 1);
    } catch (e) {
      toast.error(extractApiError(e, 'Failed to resume warehouse'));
    } finally {
      setResumingWh(null);
    }
  };

  const secondsValid = secondsValue.trim() !== '' && Number.isInteger(Number(secondsValue)) && Number(secondsValue) >= 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <PiGearDuotone className="h-5 w-5 text-indigo-600" />
          <Text className="font-semibold text-gray-900 dark:text-white">Warehouse Management</Text>
          {account && (
            <Badge variant="flat" color="info" className="text-xs ml-2">{account}</Badge>
          )}
        </div>
        <Text className="text-xs text-gray-500 mt-1">
          Resize, set auto-suspend, or suspend/resume warehouses on the connected account.
        </Text>
      </div>

      {error && (
        <div role="alert" className="m-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <Text className="text-xs text-red-600 dark:text-red-400">{error}</Text>
        </div>
      )}

      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : !account ? (
          <div className="p-8 text-center">
            <PiGearDuotone className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <Text className="text-gray-500 dark:text-gray-400 text-sm">Connected account could not be determined</Text>
            <Text className="text-xs text-gray-400">Warehouse management is scoped to the signed-in account.</Text>
          </div>
        ) : warehouses.length === 0 ? (
          <div className="p-8 text-center">
            <PiWarehouseDuotone className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <Text className="text-gray-500 dark:text-gray-400 text-sm">No warehouses on this account</Text>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Warehouse</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">State</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Auto-suspend</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {warehouses.map((wh) => {
                const running = isWarehouseRunning(wh.state);
                // Tri-state suspend gating — never claim "already suspended" when
                // the live state was not returned (honest states):
                //   known running / unknown → enabled (backend rejects honestly)
                //   known suspended         → disabled, "already suspended"
                const stateUpper = (wh.state ?? '').toUpperCase();
                const knownSuspended = stateUpper === 'SUSPENDED' || stateUpper === 'SUSPENDING';
                return (
                  <tr key={wh.warehouse_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2"><Text className="text-sm font-medium text-gray-900 dark:text-white">{wh.warehouse_name}</Text></td>
                    <td className="px-4 py-2">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">
                        {wh.size || '—'}
                      </Text>
                    </td>
                    <td className="px-4 py-2">
                      {wh.state ? (
                        <Badge variant="flat" color={running ? 'success' : 'secondary'} className="text-xs">{wh.state}</Badge>
                      ) : (
                        <Text className="text-sm text-gray-400">—</Text>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">
                        {wh.auto_suspend != null ? `${wh.auto_suspend}s` : '—'}
                      </Text>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={manageDenied}
                          onClick={() => openResize(wh)}
                          title={manageDenied ? 'You lack the "update" permission on Client Accounts. Ask an administrator to grant it.' : 'Resize warehouse'}
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                        >
                          <Maximize2 className="h-3.5 w-3.5" /> Resize
                        </button>
                        <button
                          type="button"
                          disabled={manageDenied}
                          onClick={() => openAutoSuspend(wh)}
                          title={manageDenied ? 'You lack the "update" permission on Client Accounts. Ask an administrator to grant it.' : 'Set auto-suspend'}
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700/40"
                        >
                          <TimerReset className="h-3.5 w-3.5" /> Auto-suspend
                        </button>
                        <button
                          type="button"
                          disabled={manageDenied || knownSuspended}
                          onClick={() => { if (!manageDenied && !knownSuspended) setSuspendTarget(wh); }}
                          title={
                            manageDenied
                              ? 'You lack the "update" permission on Client Accounts. Ask an administrator to grant it.'
                              : knownSuspended
                                ? 'Warehouse is already suspended'
                                : 'Suspend warehouse'
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                        >
                          <PowerOff className="h-3.5 w-3.5" /> Suspend
                        </button>
                        <button
                          type="button"
                          disabled={manageDenied || running || resumingWh === wh.warehouse_name}
                          onClick={() => handleResume(wh)}
                          title={
                            manageDenied
                              ? 'You lack the "update" permission on Client Accounts. Ask an administrator to grant it.'
                              : running
                                ? 'Warehouse is already running'
                                : 'Resume warehouse'
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                        >
                          {resumingWh === wh.warehouse_name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />} Resume
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Resize / Auto-suspend form (non-blocking ActionRail) */}
      <ActionRail
        isOpen={manageTarget !== null}
        onClose={closeManage}
        title={
          manageTarget?.mode === 'resize'
            ? `Resize ${manageTarget.wh.warehouse_name}`
            : manageTarget
              ? `Auto-suspend ${manageTarget.wh.warehouse_name}`
              : 'Manage warehouse'
        }
        description={
          manageTarget?.mode === 'resize'
            ? 'Change the compute size. Larger sizes cost more credits per hour.'
            : 'Idle seconds before the warehouse auto-suspends to save credits.'
        }
        accentClassName="bg-indigo-500"
        footer={
          <>
            <button
              type="button"
              onClick={closeManage}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyManage}
              disabled={busy || (manageTarget?.mode === 'auto-suspend' && !secondsValid)}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Apply
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {manageTarget?.mode === 'resize' ? (
            <div className="space-y-1.5">
              <label htmlFor="wh-size" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Warehouse size
              </label>
              <select
                id="wh-size"
                value={sizeValue}
                onChange={(e) => setSizeValue(e.target.value)}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {WAREHOUSE_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {manageTarget.wh.size && (
                <Text className="text-xs text-slate-400">Current: {manageTarget.wh.size}</Text>
              )}
            </div>
          ) : manageTarget?.mode === 'auto-suspend' ? (
            <div className="space-y-1.5">
              <label htmlFor="wh-seconds" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Auto-suspend (seconds)
              </label>
              <input
                id="wh-seconds"
                type="number"
                min={0}
                step={1}
                value={secondsValue}
                onChange={(e) => setSecondsValue(e.target.value)}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <Text className="text-xs text-slate-400">
                Lower values save credits but cause more cold starts. Typical: 60s.
              </Text>
            </div>
          ) : null}
          {formError && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>
      </ActionRail>

      {/* Suspend warehouse (warning confirm) */}
      <ConfirmDialog
        open={suspendTarget !== null}
        onOpenChange={(next) => { if (!next && !suspendBusy) setSuspendTarget(null); }}
        variant="warning"
        title={suspendTarget ? `Suspend ${suspendTarget.warehouse_name}?` : 'Suspend warehouse?'}
        body={
          <span>
            Running queries on <strong>{suspendTarget?.warehouse_name}</strong> will be allowed to
            finish, then the warehouse stops consuming credits. It auto-resumes on the next query.
          </span>
        }
        confirmLabel="Suspend"
        loading={suspendBusy}
        onConfirm={handleSuspend}
      />
    </div>
  );
}
