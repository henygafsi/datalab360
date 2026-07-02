'use client';

/**
 * CostGovernancePanel — the Administration hub's COST-LIMIT GOVERNANCE surface.
 *
 * Makes cloud spend visible AND administrable from one super-admin place,
 * reusing the existing `org-accounts` FinOps + warehouse-CRUD endpoints
 * (no new backend routes). It answers the Snowflake power-user question
 * "where is my money going and how do I cap it?" in three honest layers:
 *
 *   1. Spend KPIs            getCredits / getBalance / getTopConsumers (read)
 *   2. Cost-anomaly watch    getAnomalies (read; forecast-band breaches)
 *   3. Spend forecast        getCreditForecast — projected next-30d spend +
 *                            budget-at-risk signal; seeds the monitor quota.
 *   4. Resource monitors     getResourceMonitors (list) + createResourceMonitor
 *                            (via the shared ResourceMonitorCreateRail) — the
 *                            CANONICAL Snowflake spend-cap: a credit quota that
 *                            auto-suspends warehouses at a threshold. Gated by
 *                            useCanPerform('org_accounts','create').
 *   5. Per-account budgets   getCredits().accounts + a LOCAL alert threshold
 *                            (a quick view-side lens; the PERSISTED cap is a
 *                            resource monitor created above).
 *   6. Warehouse cost caps   getAccountWarehouses(connected) + the three real
 *                            ALTER WAREHOUSE mutations:
 *                              - resize        (size cap)
 *                              - auto-suspend  (idle-spend cap)
 *                              - suspend       (stop spend now)
 *                            gated by useCanPerform('org_accounts','update').
 *
 *  - Resource monitors ARE backed by real endpoints (GET/POST
 *    /org-accounts/resource-monitors). There is NO backend DELETE, so we render
 *    create + list only — no fictive drop control.
 *  - Budget thresholds (section 5) stay a view-side lens; the real persisted cap
 *    is the resource monitor.
 *  - Loading / empty ("—") / error (backend message via toast) states throughout.
 *
 * Warehouse mutations are name-only ALTERs scoped to the CONNECTED account's
 * session, so rows are sourced from getAccountWarehouses(connectedAccount)
 * (live SHOW WAREHOUSES) — never from the org-wide usage list, which could hit
 * a same-named warehouse in the wrong account.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Banknote,
  Gauge,
  Loader2,
  PauseCircle,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCanPerform } from '@/hooks/useCanPerform';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import ResourceMonitorCreateRail from '@/app/shared/org-accounts/ResourceMonitorCreateRail';
import {
  getCredits,
  getBalance,
  getTopConsumers,
  getAnomalies,
  getCreditForecast,
  getResourceMonitors,
  getAccountWarehouses,
  resizeWarehouse,
  setWarehouseAutoSuspend,
  suspendWarehouse,
} from '@/app/services/org-accounts/hooks';
import { formatCredits, extractApiError } from '@/app/services/org-accounts/utils';
import type {
  AccountCredit,
  AnomalyEntry,
  Warehouse,
} from '@/app/services/org-accounts/types';

const SUPER_ADMIN_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN', 'ORGADMIN'];

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

function sizeToValue(size?: string | null): string {
  if (!size) return 'XSMALL';
  const norm = size.replace(/[-\s_]/g, '').toUpperCase();
  const direct = WAREHOUSE_SIZES.find((s) => s.value === norm);
  if (direct) return direct.value;
  const byLabel = WAREHOUSE_SIZES.find(
    (s) => s.label.replace(/[-\s]/g, '').toUpperCase() === norm,
  );
  return byLabel ? byLabel.value : 'XSMALL';
}

/* ------------------------------------------------------------------ */
/*  Resource-monitor row (Snowflake returns mixed-case keys)           */
/* ------------------------------------------------------------------ */

interface MonitorRow {
  name: string;
  credit_quota: number | null;
  used_credits: number | null;
  used_percent: number | null;
  frequency: string | null;
  level: string | null;
  suspend_at: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function normalizeMonitor(raw: unknown): MonitorRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const quota = num(r.credit_quota ?? r.CREDIT_QUOTA);
  const used = num(r.used_credits ?? r.USED_CREDITS);
  return {
    name: String(r.name ?? r.NAME ?? '—'),
    credit_quota: quota,
    used_credits: used,
    used_percent: quota && used != null ? (used / quota) * 100 : null,
    frequency: (r.frequency ?? r.FREQUENCY ?? null) as string | null,
    level: (r.level ?? r.LEVEL ?? null) as string | null,
    suspend_at: (r.suspend_at ?? r.SUSPEND_AT ?? null) as string | null,
  };
}

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  tone = 'default',
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-lg',
            tone === 'warn'
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-slate-100 text-[hsl(var(--primary))] dark:bg-slate-800',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
        {loading ? <span className="text-slate-300 dark:text-slate-600">—</span> : value}
      </div>
      {sub ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </div>
  );
}

function SectionShell({
  icon: Icon,
  title,
  description,
  right,
  children,
}: {
  icon: typeof Wallet;
  title: string;
  description: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[hsl(var(--primary))] dark:bg-slate-800">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                         */
/* ------------------------------------------------------------------ */

type WhMode = 'resize' | 'auto-suspend';

export default function CostGovernancePanel() {
  const { role } = useAuth();
  const isSuperAdmin = useMemo(
    () => SUPER_ADMIN_ROLES.includes((role || '').toUpperCase()),
    [role],
  );

  const { allowed: canManage, loading: permLoading } = useCanPerform('org_accounts', 'update');
  const manageDenied = !canManage && !permLoading;

  const { allowed: canCreate, loading: createPermLoading } = useCanPerform('org_accounts', 'create');
  const createDenied = !canCreate && !createPermLoading;

  /* ---- Spend KPIs + budget table ---- */
  const [accounts, setAccounts] = useState<AccountCredit[]>([]);
  const [totalCredits, setTotalCredits] = useState<number | null>(null);
  const [balanceRemaining, setBalanceRemaining] = useState<number | null>(null);
  const [balanceCurrency, setBalanceCurrency] = useState<string>('');
  const [topConsumer, setTopConsumer] = useState<string | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  /* ---- Anomalies ---- */
  const [anomalies, setAnomalies] = useState<AnomalyEntry[]>([]);
  const [anomLoading, setAnomLoading] = useState(true);
  const [anomError, setAnomError] = useState<string | null>(null);

  /* ---- Spend forecast (projected next-30d) ---- */
  const [projected30d, setProjected30d] = useState<number | null>(null);
  const [trendDirection, setTrendDirection] = useState<string | null>(null);
  const [budgetAtRisk, setBudgetAtRisk] = useState(false);

  /* ---- Resource monitors (real spend caps) ---- */
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [monLoading, setMonLoading] = useState(true);
  const [monError, setMonError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);

  /* ---- Local budget threshold (view-only lens) ---- */
  const [budgetInput, setBudgetInput] = useState('');
  const budgetThreshold = useMemo(() => {
    const n = Number(budgetInput);
    return budgetInput.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  }, [budgetInput]);

  /* ---- Warehouse caps (connected account) ---- */
  const [account, setAccount] = useState<string | null>(null);
  const [accountResolved, setAccountResolved] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [whLoading, setWhLoading] = useState(true);
  const [whError, setWhError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [whTarget, setWhTarget] = useState<{ wh: Warehouse; mode: WhMode } | null>(null);
  const [sizeValue, setSizeValue] = useState('XSMALL');
  const [secondsValue, setSecondsValue] = useState('60');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Warehouse | null>(null);
  const [suspendBusy, setSuspendBusy] = useState(false);

  /* -- load spend KPIs + budget table -- */
  useEffect(() => {
    let cancelled = false;
    setCreditsLoading(true);
    setCreditsError(null);
    Promise.all([
      getCredits(30).catch((e) => {
        throw e;
      }),
      getBalance().catch(() => null),
      getTopConsumers(30, 1).catch(() => null),
    ])
      .then(([credits, balance, top]) => {
        if (cancelled) return;
        setAccounts(Array.isArray(credits.accounts) ? credits.accounts : []);
        setTotalCredits(typeof credits.total_credits === 'number' ? credits.total_credits : null);
        if (balance) {
          setBalanceRemaining(
            typeof balance.free_credits_remaining === 'number'
              ? balance.free_credits_remaining
              : null,
          );
          setBalanceCurrency(balance.currency || '');
        }
        const t = top?.top_consumers?.[0];
        setTopConsumer(t ? t.account_name : null);
      })
      .catch((e) => {
        if (!cancelled) setCreditsError(extractApiError(e, 'Failed to load credit usage'));
      })
      .finally(() => {
        if (!cancelled) setCreditsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /* -- load anomalies -- */
  useEffect(() => {
    let cancelled = false;
    setAnomLoading(true);
    setAnomError(null);
    getAnomalies(30)
      .then((data) => {
        if (!cancelled) setAnomalies(Array.isArray(data.anomalies) ? data.anomalies : []);
      })
      .catch((e) => {
        if (!cancelled) setAnomError(extractApiError(e, 'Failed to load cost anomalies'));
      })
      .finally(() => {
        if (!cancelled) setAnomLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /* -- load spend forecast (best-effort; seeds the monitor quota) -- */
  useEffect(() => {
    let cancelled = false;
    getCreditForecast(90)
      .then((f: any) => {
        if (cancelled) return;
        setProjected30d(num(f?.projected_30d_total));
        setTrendDirection(typeof f?.trend_direction === 'string' ? f.trend_direction : null);
        setBudgetAtRisk(Boolean(f?.budget_at_risk));
      })
      .catch(() => {
        if (!cancelled) {
          setProjected30d(null);
          setTrendDirection(null);
          setBudgetAtRisk(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /* -- load resource monitors (real spend caps) -- */
  useEffect(() => {
    let cancelled = false;
    setMonLoading(true);
    setMonError(null);
    getResourceMonitors()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.monitors) ? data.monitors : [];
        setMonitors(list.map(normalizeMonitor));
      })
      .catch((e) => {
        if (!cancelled) setMonError(extractApiError(e, 'Failed to load resource monitors'));
      })
      .finally(() => {
        if (!cancelled) setMonLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /* -- resolve connected account -- */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session')
      .then((r) => r.json() as Promise<{ user?: { account_name?: string } }>)
      .then((session) => {
        if (!cancelled) setAccount(session?.user?.account_name || null);
      })
      .catch(() => {
        if (!cancelled) setAccount(null);
      })
      .finally(() => {
        if (!cancelled) setAccountResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* -- load warehouses for connected account -- */
  useEffect(() => {
    if (!accountResolved) return;
    if (!account) {
      setWhLoading(false);
      return;
    }
    let cancelled = false;
    setWhLoading(true);
    setWhError(null);
    // QA P1-7: the warehouses endpoint keys on the BARE account locator (e.g.
    // "HAHA"), not the org-prefixed name ("UCHSFVB-HAHA") → the prefixed value
    // 404s. Mirror the backend's acct_key derivation: last "-"-segment.
    const bareAccount = account.split('.')[0].split('-').pop() || account;
    getAccountWarehouses(bareAccount, 30)
      .then((data) => {
        if (!cancelled) setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []);
      })
      .catch((e) => {
        if (!cancelled) setWhError(extractApiError(e, 'Failed to load warehouses for this account'));
      })
      .finally(() => {
        if (!cancelled) setWhLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, accountResolved, refreshKey]);

  const overBudget = useMemo(() => {
    if (budgetThreshold == null) return [] as AccountCredit[];
    return accounts.filter((a) => (a.total_credits || 0) > budgetThreshold);
  }, [accounts, budgetThreshold]);

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => (b.total_credits || 0) - (a.total_credits || 0)),
    [accounts],
  );

  const openResize = (wh: Warehouse) => {
    if (manageDenied) return;
    setSizeValue(sizeToValue(wh.size));
    setFormError(null);
    setWhTarget({ wh, mode: 'resize' });
  };
  const openAutoSuspend = (wh: Warehouse) => {
    if (manageDenied) return;
    setSecondsValue(wh.auto_suspend != null ? String(wh.auto_suspend) : '60');
    setFormError(null);
    setWhTarget({ wh, mode: 'auto-suspend' });
  };

  const closeForm = useCallback(() => {
    if (formBusy) return;
    setWhTarget(null);
    setFormError(null);
  }, [formBusy]);

  // Escape closes the warehouse-cap modal (unless a mutation is in flight).
  useEffect(() => {
    if (!whTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [whTarget, closeForm]);

  const applyForm = async () => {
    if (!whTarget) return;
    const name = whTarget.wh.warehouse_name;
    setFormBusy(true);
    setFormError(null);
    try {
      if (whTarget.mode === 'resize') {
        await resizeWarehouse(name, sizeValue);
        toast.success(`Warehouse ${name} capped at ${sizeValue}`);
      } else {
        const secs = Number(secondsValue);
        if (!Number.isFinite(secs) || secs < 0) {
          setFormError('Enter a non-negative number of seconds.');
          setFormBusy(false);
          return;
        }
        await setWarehouseAutoSuspend(name, secs);
        toast.success(`Idle auto-suspend for ${name} set to ${secs}s`);
      }
      setWhTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setFormError(extractApiError(e, 'Action failed'));
    } finally {
      setFormBusy(false);
    }
  };

  const confirmSuspend = async () => {
    if (!suspendTarget) return;
    const name = suspendTarget.warehouse_name;
    setSuspendBusy(true);
    try {
      await suspendWarehouse(name);
      toast.success(`Warehouse ${name} suspended — spend stopped`);
      setSuspendTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(extractApiError(e, 'Failed to suspend warehouse'));
    } finally {
      setSuspendBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Super-admin notice when role is not privileged (reads still allowed; mutations gate separately) */}
      {!isSuperAdmin && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Cost-limit governance is a super-admin surface. You can review spend below, but applying
            warehouse caps requires an administrator role.
          </span>
        </div>
      )}

      {/* Refresh */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* 1. Spend KPIs */}
      {creditsError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {creditsError}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Wallet}
            label="Org credits (30d)"
            value={totalCredits != null ? formatCredits(totalCredits) : '—'}
            sub="Total compute + cloud-services consumption"
            loading={creditsLoading}
          />
          <KpiCard
            icon={Banknote}
            label="Free credits remaining"
            value={
              balanceRemaining != null
                ? `${formatCredits(balanceRemaining)}${balanceCurrency ? ` ${balanceCurrency}` : ''}`
                : '—'
            }
            sub="Contract capacity headroom"
            loading={creditsLoading}
          />
          <KpiCard
            icon={budgetAtRisk ? TrendingUp : TrendingDown}
            label="Projected spend (30d)"
            value={projected30d != null ? formatCredits(projected30d) : '—'}
            sub={
              trendDirection
                ? `Forecast trend: ${trendDirection}${budgetAtRisk ? ' — budget at risk' : ''}`
                : 'Forward credit forecast'
            }
            loading={creditsLoading}
            tone={budgetAtRisk ? 'warn' : 'default'}
          />
          <KpiCard
            icon={TrendingUp}
            label="Top consumer (30d)"
            value={topConsumer || '—'}
            sub="Highest-spend account"
            loading={creditsLoading}
          />
        </div>
      )}

      {/* 2. Cost-anomaly watch (forecast-band breaches) */}
      <SectionShell
        icon={AlertTriangle}
        title="Cost-anomaly watch"
        description="Accounts whose daily spend broke the forecast confidence band (last 30 days). A standing FinOps signal to investigate runaway cost."
      >
        {anomError ? (
          <p className="text-[12px] text-rose-600 dark:text-rose-400">{anomError}</p>
        ) : anomLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading anomalies...
          </p>
        ) : anomalies.length === 0 ? (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            No cost anomalies detected in the last 30 days. —
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Account</th>
                  <th className="px-2 py-1.5 text-right">Actual</th>
                  <th className="px-2 py-1.5 text-right">Forecast</th>
                  <th className="px-2 py-1.5 text-right">Upper bound</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.slice(0, 12).map((a: any, i) => {
                  // QA P1-6: backend /org-accounts/anomalies returns
                  // {usage_date, credits, mean_credits, std_credits} — the old
                  // {date, actual_value, forecasted_value, upper_bound} reads were
                  // all undefined → every cell printed '—'. Map to the real shape;
                  // upper bound = mean + 2·std (the anomaly threshold).
                  const date = a.usage_date ?? a.date;
                  const actual = a.credits ?? a.actual_value;
                  const forecast = a.mean_credits ?? a.forecasted_value;
                  const upper = a.upper_bound ?? (a.mean_credits != null && a.std_credits != null
                    ? a.mean_credits + 2 * a.std_credits : undefined);
                  return (
                  <tr
                    key={`${a.account_name}-${date}-${i}`}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{date}</td>
                    <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-100">
                      {a.account_name}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                      {formatCredits(actual)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">
                      {formatCredits(forecast)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">
                      {formatCredits(upper)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      {/* 3. Resource monitors — the canonical persisted spend cap */}
      <SectionShell
        icon={ShieldCheck}
        title="Resource monitors (spend caps)"
        description="The canonical Snowflake cost cap: a credit quota that auto-suspends warehouses when usage crosses a threshold. This is the persisted budget control — set it here, super-admin gated."
        right={
          <button
            type="button"
            disabled={createDenied}
            onClick={() => setRailOpen(true)}
            title={createDenied ? 'org_accounts:create required' : 'Create a resource monitor'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            New monitor
          </button>
        }
      >
        {monError ? (
          <p className="text-[12px] text-rose-600 dark:text-rose-400">{monError}</p>
        ) : monLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading resource monitors...
          </p>
        ) : monitors.length === 0 ? (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            No resource monitors defined. Create one to cap account spend. —
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-2 py-1.5">Monitor</th>
                  <th className="px-2 py-1.5">Level</th>
                  <th className="px-2 py-1.5">Frequency</th>
                  <th className="px-2 py-1.5 text-right">Quota</th>
                  <th className="px-2 py-1.5 text-right">Used</th>
                  <th className="px-2 py-1.5 text-right">Suspend @</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m, i) => {
                  const hot = m.used_percent != null && m.used_percent >= 90;
                  return (
                    <tr
                      key={`${m.name}-${i}`}
                      className={cn(
                        'border-b border-slate-100 dark:border-slate-800',
                        hot && 'bg-rose-50/60 dark:bg-rose-950/20',
                      )}
                    >
                      <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-100">
                        <span className="inline-flex items-center gap-1.5">
                          {hot && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                          {m.name}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">
                        {m.level || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">
                        {m.frequency || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">
                        {m.credit_quota != null ? formatCredits(m.credit_quota) : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1.5 text-right font-semibold',
                          hot
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-800 dark:text-slate-100',
                        )}
                      >
                        {m.used_credits != null ? formatCredits(m.used_credits) : '—'}
                        {m.used_percent != null ? ` (${Math.round(m.used_percent)}%)` : ''}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-500 dark:text-slate-400">
                        {m.suspend_at != null && String(m.suspend_at).trim() !== ''
                          ? `${m.suspend_at}%`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          No backend delete exists for monitors, so this surface is create + review only. Drop a
          monitor from the data warehouse console.
        </p>
      </SectionShell>

      {/* 4. Per-account budget watch (local lens) */}
      <SectionShell
        icon={Gauge}
        title="Per-account budget watch"
        description="Set a credit ceiling to spotlight over-budget accounts. This is a quick view-side lens for triage — the persisted cap is a resource monitor (above), so the threshold here is not written to the account."
        right={
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Ceiling (credits)
            </label>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="e.g. 500"
              className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        }
      >
        {creditsLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading account spend...
          </p>
        ) : sortedAccounts.length === 0 ? (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            No per-account credit data available. —
          </p>
        ) : (
          <>
            {budgetThreshold != null && (
              <p className="mb-2 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                {overBudget.length} of {sortedAccounts.length} account
                {sortedAccounts.length === 1 ? '' : 's'} over {formatCredits(budgetThreshold)}{' '}
                credits.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                    <th className="px-2 py-1.5">Account</th>
                    <th className="px-2 py-1.5">Region</th>
                    <th className="px-2 py-1.5 text-right">Compute</th>
                    <th className="px-2 py-1.5 text-right">Cloud svc</th>
                    <th className="px-2 py-1.5 text-right">Total (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAccounts.map((a) => {
                    const over = budgetThreshold != null && (a.total_credits || 0) > budgetThreshold;
                    return (
                      <tr
                        key={a.account_name}
                        className={cn(
                          'border-b border-slate-100 dark:border-slate-800',
                          over && 'bg-rose-50/60 dark:bg-rose-950/20',
                        )}
                      >
                        <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-100">
                          <span className="inline-flex items-center gap-1.5">
                            {over && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                            {a.account_name}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">
                          {a.region || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">
                          {formatCredits(a.compute_credits)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">
                          {formatCredits(a.cloud_services_credits)}
                        </td>
                        <td
                          className={cn(
                            'px-2 py-1.5 text-right font-semibold',
                            over
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-800 dark:text-slate-100',
                          )}
                        >
                          {formatCredits(a.total_credits)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionShell>

      {/* 5. Warehouse cost caps (connected account, real mutations) */}
      <SectionShell
        icon={Server}
        title="Warehouse cost caps"
        description="Live compute on the connected account. Cap size, set an idle auto-suspend, or suspend a warehouse outright to stop spend. These are the platform's real cost-limit controls in lieu of a resource-monitor API."
      >
        {!accountResolved || whLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading warehouses...
          </p>
        ) : !account ? (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            No connected account on this session. —
          </p>
        ) : whError ? (
          <p className="text-[12px] text-rose-600 dark:text-rose-400">{whError}</p>
        ) : warehouses.length === 0 ? (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            No warehouses found for {account}. —
          </p>
        ) : (
          <>
            {manageDenied && (
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-3.5 w-3.5" />
                You can review caps but not change them (org_accounts:update required).
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                    <th className="px-2 py-1.5">Warehouse</th>
                    <th className="px-2 py-1.5">Size</th>
                    <th className="px-2 py-1.5">State</th>
                    <th className="px-2 py-1.5 text-right">Auto-suspend</th>
                    <th className="px-2 py-1.5 text-right">Credits (30d)</th>
                    <th className="px-2 py-1.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((wh) => {
                    const credits =
                      wh.credits_used != null ? wh.credits_used : wh.total_credits;
                    const running = (wh.state || '').toUpperCase().startsWith('STARTED');
                    return (
                      <tr
                        key={wh.warehouse_name}
                        className="border-b border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-100">
                          {wh.warehouse_name}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">
                          {wh.size || '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                              running
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                            )}
                          >
                            {wh.state || '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">
                          {wh.auto_suspend != null ? `${wh.auto_suspend}s` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">
                          {credits != null ? formatCredits(credits) : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={manageDenied}
                              onClick={() => openResize(wh)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Cap size
                            </button>
                            <button
                              type="button"
                              disabled={manageDenied}
                              onClick={() => openAutoSuspend(wh)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Idle cap
                            </button>
                            <button
                              type="button"
                              disabled={manageDenied || !running}
                              onClick={() => setSuspendTarget(wh)}
                              title={!running ? 'Already suspended' : 'Suspend to stop spend'}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                            >
                              <PauseCircle className="h-3.5 w-3.5" />
                              Suspend
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionShell>

      {/* Resize / auto-suspend form modal */}
      {whTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wh-cap-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <h3 id="wh-cap-title" className="text-sm font-semibold text-slate-900 dark:text-white">
              {whTarget.mode === 'resize' ? 'Cap warehouse size' : 'Set idle auto-suspend'}
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
              {whTarget.wh.warehouse_name} on {account}
            </p>

            {whTarget.mode === 'resize' ? (
              <div className="mt-3">
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Max size
                </label>
                <select
                  value={sizeValue}
                  onChange={(e) => setSizeValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {WAREHOUSE_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mt-3">
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Auto-suspend after (seconds idle)
                </label>
                <input
                  type="number"
                  min={0}
                  value={secondsValue}
                  onChange={(e) => setSecondsValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none focus:border-[hsl(var(--primary))] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Lower = tighter idle-spend cap. 60s is a common floor.
                </p>
              </div>
            )}

            {formError && (
              <p className="mt-2 text-[12px] text-rose-600 dark:text-rose-400">{formError}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={formBusy}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyForm}
                disabled={formBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {formBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend confirm */}
      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(o) => {
          if (!o && !suspendBusy) setSuspendTarget(null);
        }}
        title="Suspend warehouse"
        body={
          <span>
            Suspend{' '}
            <span className="font-semibold">{suspendTarget?.warehouse_name}</span> on {account}?
            Running queries will be cancelled and compute spend stops immediately. It auto-resumes on
            the next query.
          </span>
        }
        confirmLabel="Suspend"
        variant="warning"
        loading={suspendBusy}
        onConfirm={confirmSuspend}
      />

      {/* Resource monitor create rail (shared, presentation-only; parent gates) */}
      <ResourceMonitorCreateRail
        isOpen={railOpen}
        onClose={() => setRailOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
        defaultQuota={projected30d != null && projected30d > 0 ? projected30d : undefined}
        defaultName="MONTHLY_BUDGET"
      />
    </div>
  );
}
