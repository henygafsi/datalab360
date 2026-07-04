'use client';

/**
 * AccountContextBar
 * =================
 *
 * The docked right-side inspector for the Client Accounts overview. Replaces the
 * old `account-detail-modal.tsx` portal drawer: instead of a `fixed inset-y-0`
 * overlay it is a docked flex-child (via the shared {@link RightTabPanel}) that
 * lives beside the dashboard content and lets the page reflow around it.
 *
 * Two states, one bar:
 *   - No account selected → a single "Overview" section summarising the whole
 *     estate (total / active / managed accounts, org-wide credits + storage).
 *     This is the AUTO-OPEN state. All figures come from data the overview tab
 *     already loaded (`overview` + `usage`); missing feeds render "—", never a
 *     fabricated 0. Credit/storage roll-ups are labelled honestly when the
 *     connection is not org-admin (scope = own account).
 *   - An account selected → Details / Cost / Health sections rendering the
 *     account-360 (fetched once via `getAccountDetail`, exactly as the old
 *     modal did). The Details section keeps the {@link AccountLifecycleMenu}
 *     (drop stays a confirm dialog).
 *
 * No new endpoints, no fake numbers.
 */

import { useEffect, useMemo, useState } from 'react';
import { Text, Badge, Button, Loader } from 'rizzui';
import cn from '@core/utils/class-names';
import toast from 'react-hot-toast';
import { LayoutGrid, Info, Coins, Activity, ArrowLeft } from 'lucide-react';
import {
  PiArrowSquareOut,
  PiCalendarDuotone,
  PiMapPinDuotone,
  PiCloudDuotone,
  PiCoinsDuotone,
  PiDatabaseDuotone,
  PiUsersDuotone,
  PiChartLineDuotone,
  PiHeartbeatDuotone,
  PiWarningDuotone,
  PiLightbulbDuotone,
  PiBuildingsDuotone,
} from 'react-icons/pi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { safeToFixed, safeArray } from '@/lib/format-number';
import { formatCredits } from '@/app/services/org-accounts/utils';
import { getAccountDetail } from '@/app/services/org-accounts/hooks';
import { useAuth } from '@/hooks/useAuth';
import type {
  ClientAccount,
  AccountDetailResponse,
  DashboardOverviewResponse,
  DashboardUsageResponse,
} from '@/app/services/org-accounts/types';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import AccountLifecycleMenu, { normalizeRole } from './AccountLifecycleMenu';

interface AccountContextBarProps {
  /** When false the bar is not rendered (the parent shows a re-open affordance). */
  open: boolean;
  /** Hide the bar entirely (desktop dismiss / mobile sheet close). */
  onClose: () => void;
  /** The row-selected account, or null to show the estate overview. */
  selectedAccount: ClientAccount | null;
  /** Return from a selected account back to the overview state. */
  onClearSelection: () => void;
  /** Estate overview (already loaded by the overview tab). */
  overview: DashboardOverviewResponse['overview'] | null;
  /** Estate usage roll-up (already loaded by the overview tab). */
  usage: DashboardUsageResponse | null;
  /** Refetch parent data after a lifecycle mutation. */
  onAccountChanged?: () => void;
}

function getHealthColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function getHealthBgColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

const WAREHOUSE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

/** Honest number: undefined/null → "—". A real 0 still renders. */
const dash = (v: number | null | undefined): string | number => (v == null ? '—' : v);

/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <Text className="text-xs text-gray-500">{label}</Text>
      </div>
      <Text className="text-lg font-bold text-gray-900 dark:text-white">{value}</Text>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AccountContextBar({
  open,
  onClose,
  selectedAccount,
  onClearSelection,
  overview,
  usage,
  onAccountChanged,
}: AccountContextBarProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AccountDetailResponse | null>(null);
  const [detailSection, setDetailSection] = useState<'details' | 'cost' | 'health'>('details');

  const { role: rawRole, username: currentUsername } = useAuth();
  const userRole = normalizeRole(rawRole, currentUsername);

  const accountName = selectedAccount?.account_name ?? null;

  // Fetch the 360 once per selected account. Clearing the selection drops it.
  useEffect(() => {
    let cancelled = false;
    if (!accountName) {
      setDetail(null);
      return;
    }
    setDetailSection('details');
    setLoading(true);
    getAccountDetail(accountName)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((error) => {
        console.error('Failed to fetch account detail:', error);
        if (!cancelled) toast.error('Failed to load account details');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountName]);

  /* ── Estate overview scope labelling (honest, mirrors overview-cards) ── */
  const ownAccountOnly = overview != null && overview.is_org_admin === false;

  /* ── Section renderers ── */

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<PiBuildingsDuotone className="h-4 w-4 text-blue-500" />}
          label="Total accounts"
          value={dash(overview?.total_client_accounts)}
        />
        <StatTile
          icon={<PiUsersDuotone className="h-4 w-4 text-green-600" />}
          label="Active"
          value={dash(overview?.active_accounts)}
        />
        <StatTile
          icon={<PiUsersDuotone className="h-4 w-4 text-gray-400" />}
          label="Inactive"
          value={dash(overview?.inactive_accounts)}
        />
        <StatTile
          icon={<PiBuildingsDuotone className="h-4 w-4 text-indigo-500" />}
          label="Managed"
          value={dash(overview?.managed_accounts_count)}
        />
        <StatTile
          icon={<PiCoinsDuotone className="h-4 w-4 text-amber-600" />}
          label="Credits (30d)"
          value={usage?.total_credits_30d == null ? '—' : formatCredits(usage.total_credits_30d)}
        />
        <StatTile
          icon={<PiDatabaseDuotone className="h-4 w-4 text-purple-600" />}
          label="Storage"
          value={usage?.total_storage_tb == null ? '—' : `${safeToFixed(usage.total_storage_tb, 2)} TB`}
        />
      </div>

      {ownAccountOnly && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          Credit and storage figures reflect your own account — an
          organization-admin connection is required for an estate-wide roll-up.
        </div>
      )}

      {/* Distribution by cloud — from the same overview payload. */}
      {overview && Object.keys(overview.accounts_by_cloud ?? {}).length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            By cloud
          </Text>
          <div className="space-y-1.5">
            {Object.entries(overview.accounts_by_cloud).map(([cloud, count]) => (
              <div key={cloud} className="flex items-center justify-between text-sm">
                <Text className="text-gray-600 dark:text-gray-300">{cloud}</Text>
                <Text className="font-medium text-gray-900 dark:text-white">{count}</Text>
              </div>
            ))}
          </div>
        </div>
      )}

      <Text className="text-xs text-gray-400">
        Select an account in the table to inspect its details, cost and health.
      </Text>
    </div>
  );

  const renderDetails = () => {
    if (!selectedAccount) return null;
    if (loading) {
      return (
        <div className="flex h-40 items-center justify-center">
          <Loader variant="spinner" size="xl" />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="flat" color={selectedAccount.is_active ? 'success' : 'danger'} size="sm">
            {selectedAccount.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {selectedAccount.edition && (
            <Badge variant="flat" color="primary" size="sm">
              {selectedAccount.edition.replace('_', ' ')}
            </Badge>
          )}
          {selectedAccount.account_url && (
            <a
              href={selectedAccount.account_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-400 hover:text-primary"
              aria-label="Open account console"
            >
              <PiArrowSquareOut className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
            <PiMapPinDuotone className="h-5 w-5 text-gray-500" />
            <div className="min-w-0">
              <Text className="text-xs text-gray-500">Region</Text>
              <Text className="truncate font-medium text-gray-900 dark:text-white">
                {selectedAccount.region || 'N/A'}
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
            <PiCloudDuotone className="h-5 w-5 text-gray-500" />
            <div className="min-w-0">
              <Text className="text-xs text-gray-500">Cloud</Text>
              <Text className="truncate font-medium text-gray-900 dark:text-white">
                {selectedAccount.cloud || 'N/A'}
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
            <PiCalendarDuotone className="h-5 w-5 text-gray-500" />
            <div className="min-w-0">
              <Text className="text-xs text-gray-500">Created</Text>
              <Text className="truncate font-medium text-gray-900 dark:text-white">
                {selectedAccount.created_on
                  ? new Date(selectedAccount.created_on).toLocaleDateString()
                  : 'N/A'}
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
            <div className="flex h-5 w-5 items-center justify-center text-xs font-bold text-gray-500">
              ID
            </div>
            <div className="min-w-0">
              <Text className="text-xs text-gray-500">Locator</Text>
              <Text className="truncate font-medium text-gray-900 dark:text-white">
                {selectedAccount.account_locator || 'N/A'}
              </Text>
            </div>
          </div>
        </div>

        {selectedAccount.comment && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <Text className="text-xs text-gray-500">Comment</Text>
            <Text className="text-sm text-gray-700 dark:text-gray-300">{selectedAccount.comment}</Text>
          </div>
        )}

        <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
          <AccountLifecycleMenu
            account={selectedAccount}
            currentUserRole={userRole}
            currentUsername={currentUsername}
            hideView
            variant="inline"
            onChanged={() => {
              onAccountChanged?.();
              if (accountName) {
                setLoading(true);
                getAccountDetail(accountName)
                  .then(setDetail)
                  .catch(() => undefined)
                  .finally(() => setLoading(false));
              }
            }}
            onDropped={() => {
              onAccountChanged?.();
              onClearSelection();
            }}
          />
        </div>
      </div>
    );
  };

  const renderCost = () => {
    if (loading) {
      return (
        <div className="flex h-40 items-center justify-center">
          <Loader variant="spinner" size="xl" />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            icon={<PiCoinsDuotone className="h-4 w-4 text-amber-600" />}
            label="Credits (30d)"
            value={safeToFixed(detail?.credits?.total_credits, 2)}
          />
          <StatTile
            icon={<PiDatabaseDuotone className="h-4 w-4 text-purple-600" />}
            label="Storage"
            value={detail?.storage?.total_tb != null ? `${safeToFixed(detail.storage.total_tb, 2)} TB` : '—'}
          />
          <StatTile
            icon={<PiUsersDuotone className="h-4 w-4 text-blue-600" />}
            label="Active users"
            value={detail?.logins?.unique_users ?? '—'}
          />
          <StatTile
            icon={<PiChartLineDuotone className="h-4 w-4 text-green-600" />}
            label="Queries (7d)"
            value={detail?.queries?.query_count != null ? detail.queries.query_count.toLocaleString() : '—'}
          />
        </div>

        {detail?.warehouses && detail.warehouses.length > 0 && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <Text className="mb-3 font-semibold text-gray-900 dark:text-white">Warehouse usage</Text>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={detail.warehouses.slice(0, 5)}
                  layout="vertical"
                  margin={{ top: 5, right: 12, left: 60, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal vertical={false} />
                  <XAxis type="number" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="warehouse_name"
                    stroke="#9ca3af"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <RTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                            <Text className="text-xs font-medium text-gray-900 dark:text-white">
                              {d.warehouse_name}
                            </Text>
                            <Text className="text-xs text-gray-600">
                              Credits: {safeToFixed(d.total_credits, 2)}
                            </Text>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="total_credits" radius={[0, 4, 4, 0]}>
                    {detail.warehouses.slice(0, 5).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={WAREHOUSE_COLORS[index % WAREHOUSE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {detail?.logins && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <Text className="mb-3 font-semibold text-gray-900 dark:text-white">Login activity</Text>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Text className="text-xs text-gray-500">Unique users</Text>
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  {detail.logins.unique_users}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-gray-500">Total logins</Text>
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  {detail.logins.total_logins}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-gray-500">Successful</Text>
                <Text className="text-base font-bold text-green-600">
                  {detail.logins.successful_logins}
                </Text>
              </div>
              <div>
                <Text className="text-xs text-gray-500">Failed</Text>
                <Text className="text-base font-bold text-red-600">
                  {detail.logins.failed_logins}
                </Text>
              </div>
            </div>
            {detail.logins.last_login && (
              <Text className="mt-3 text-xs text-gray-500">
                Last login: {new Date(detail.logins.last_login).toLocaleString()}
              </Text>
            )}
          </div>
        )}

        {!loading && !detail?.warehouses?.length && !detail?.logins && (
          <Text className="text-xs text-gray-400">No cost or activity data available for this account.</Text>
        )}
      </div>
    );
  };

  const renderHealth = () => {
    if (loading) {
      return (
        <div className="flex h-40 items-center justify-center">
          <Loader variant="spinner" size="xl" />
        </div>
      );
    }
    if (!detail?.health) {
      return <Text className="text-xs text-gray-400">No health score available for this account.</Text>;
    }
    const h = detail.health;
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiHeartbeatDuotone className="h-5 w-5 text-gray-600" />
              <Text className="font-semibold text-gray-900 dark:text-white">Health score</Text>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn('text-2xl font-bold', getHealthColor(h.overall_score))}>
                {h.overall_score}
              </span>
              <Text className="text-gray-500">/100</Text>
            </div>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={cn('h-full rounded-full transition-all', getHealthBgColor(h.overall_score))}
              style={{ width: `${h.overall_score}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <Text className="mb-1 text-xs text-gray-500">Cost</Text>
              <Text className={cn('font-bold', getHealthColor(h.cost_score))}>{h.cost_score}</Text>
            </div>
            {h.activity_score != null && (
              <div className="text-center">
                <Text className="mb-1 text-xs text-gray-500">Activity</Text>
                <Text className={cn('font-bold', getHealthColor(h.activity_score))}>{h.activity_score}</Text>
              </div>
            )}
            {h.security_score != null && (
              <div className="text-center">
                <Text className="mb-1 text-xs text-gray-500">Security</Text>
                <Text className={cn('font-bold', getHealthColor(h.security_score))}>{h.security_score}</Text>
              </div>
            )}
          </div>
        </div>

        {safeArray(h.issues).length > 0 && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="mb-2 flex items-center gap-2">
              <PiWarningDuotone className="h-4 w-4 text-amber-600" />
              <Text className="text-sm font-medium text-gray-900 dark:text-white">Issues</Text>
            </div>
            <ul className="space-y-1">
              {safeArray(h.issues).map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <span className="mt-1 text-amber-500">•</span>
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {safeArray(h.recommendations).length > 0 && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div className="mb-2 flex items-center gap-2">
              <PiLightbulbDuotone className="h-4 w-4 text-blue-600" />
              <Text className="text-sm font-medium text-gray-900 dark:text-white">Recommendations</Text>
            </div>
            <ul className="space-y-1">
              {safeArray(h.recommendations).map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <span className="mt-1 text-blue-500">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail.alerts && detail.alerts.length > 0 && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <Text className="mb-2 font-semibold text-gray-900 dark:text-white">Recent alerts</Text>
            <div className="space-y-2">
              {detail.alerts.map((alert, index) => (
                <div
                  key={index}
                  className={cn(
                    'rounded-lg p-2.5',
                    alert.alert_type === 'critical' && 'bg-red-50 dark:bg-red-900/20',
                    alert.alert_type === 'warning' && 'bg-amber-50 dark:bg-amber-900/20',
                    alert.alert_type === 'security' && 'bg-purple-50 dark:bg-purple-900/20',
                    alert.alert_type === 'info' && 'bg-blue-50 dark:bg-blue-900/20',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Text className="text-sm font-medium text-gray-900 dark:text-white">{alert.title}</Text>
                    <Badge
                      variant="flat"
                      color={
                        alert.alert_type === 'critical'
                          ? 'danger'
                          : alert.alert_type === 'warning'
                            ? 'warning'
                            : alert.alert_type === 'security'
                              ? 'secondary'
                              : 'info'
                      }
                      size="sm"
                    >
                      {alert.alert_type}
                    </Badge>
                  </div>
                  <Text className="text-sm text-gray-600 dark:text-gray-300">{alert.message}</Text>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const sections: RightTabSection[] = useMemo(() => {
    if (!selectedAccount) {
      return [
        {
          id: 'overview',
          icon: LayoutGrid,
          label: 'Overview',
          description: 'Estate-wide account, credit and storage summary.',
          render: renderOverview,
        },
      ];
    }
    return [
      {
        id: 'details',
        icon: Info,
        label: 'Details',
        description: 'Region, cloud, edition and lifecycle actions.',
        render: renderDetails,
      },
      {
        id: 'cost',
        icon: Coins,
        label: 'Cost',
        description: 'Credits, storage, warehouses and login activity.',
        render: renderCost,
      },
      {
        id: 'health',
        icon: Activity,
        label: 'Health',
        description: 'Health score, issues, recommendations and alerts.',
        render: renderHealth,
      },
    ];
    // renderers close over the latest state; recompute on the drivers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, detail, loading, overview, usage, userRole, currentUsername]);

  if (!open) return null;

  const activeSection = selectedAccount ? detailSection : 'overview';

  return (
    <RightTabPanel
      title={selectedAccount ? selectedAccount.account_name : 'Accounts overview'}
      subtitle={
        selectedAccount
          ? 'Account 360'
          : overview?.organization_name
            ? `Organization: ${overview.organization_name}`
            : 'All client accounts'
      }
      sections={sections}
      activeSection={activeSection}
      onSectionChange={(id) => {
        if (selectedAccount) setDetailSection(id as 'details' | 'cost' | 'health');
      }}
      onClose={onClose}
      storageKey="data360.client-accounts.inspector.section.v1"
      accentClassName="bg-blue-500"
      widthClassName="w-[420px]"
      footer={
        selectedAccount ? (
          <Button variant="outline" size="sm" onClick={onClearSelection}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to overview
          </Button>
        ) : undefined
      }
    />
  );
}
