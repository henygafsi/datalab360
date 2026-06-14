'use client';

/**
 * MonitoringPanel — per-USER monitoring of all actions + errors.
 *
 * Source spine: EVENT_STORE.USER_REQUESTS (the server-side request-trace log).
 * Surfaces, per user: total requests, success / failed / denied, error_count,
 * last error, last active — plus an org-wide KPI strip.
 *
 * Wired by the orchestrator into the Administration → Usage&Audit tab and the
 * Platform-activity tab. This component does NOT import itself anywhere.
 *
 * Honesty contract (tri-state, mirrors OrgSummaryTab):
 *   - degraded (request failed / spine unprovisioned) → KPIs render "—" and an
 *     explicit "non provisionné" note. Never paints 0/0/0/0.
 *   - 200-with-empty → "aucune activité dans cette fenêtre".
 *   - populated → KPI strip + two paginated audit tables.
 * The activity table and the errors table degrade INDEPENDENTLY: a failing
 * errors feed must not blank the KPI strip + activity table, and vice-versa.
 */

import { useEffect, useMemo, useState } from 'react';
import { Activity, Users, AlertTriangle, ShieldX, Percent, Database } from 'lucide-react';
import AuditTable from './AuditTable';
import EmptyState from '@/components/ui/EmptyState';
import {
  getUserActivityMonitor,
  getUserActivityErrors,
  type UserActivityRow,
  type UserErrorRow,
  type UserMonitorSummary,
} from '@/app/services/command-center/user-monitor';

// Preferred column order for the per-user activity table (intersected with the
// keys actually present in the payload, so unknown/extra columns still appear).
const ACTIVITY_COLS = [
  'username',
  'user',
  'role',
  'requests',
  'success',
  'failed',
  'denied',
  'error_count',
  'last_active',
  'last_error',
];

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Sum a numeric column across rows; null when NO row carried a usable value
 * (so an undetermined metric stays "—" instead of collapsing to 0). */
function sumCol(rows: Record<string, any>[], key: string): number | null {
  let acc = 0;
  let seen = false;
  for (const r of rows) {
    const n = num(r?.[key]);
    if (n !== null) {
      acc += n;
      seen = true;
    }
  }
  return seen ? acc : null;
}

function distinctUsers(rows: Record<string, any>[]): number | null {
  if (!rows.length) return null;
  const set = new Set<string>();
  for (const r of rows) {
    const u = r?.username ?? r?.user ?? r?.USERNAME ?? r?.USER;
    if (u != null && u !== '') set.add(String(u));
  }
  return set.size > 0 ? set.size : rows.length;
}

/** Order columns: preferred keys first (when present), then any leftovers. */
function pickColumns(rows: Record<string, any>[]): string[] | undefined {
  if (!rows.length) return undefined;
  const present = Object.keys(rows[0]);
  const ordered = ACTIVITY_COLS.filter((c) => present.includes(c));
  const rest = present.filter((c) => !ordered.includes(c));
  return [...ordered, ...rest];
}

const fmtInt = (v: number | null): string =>
  v === null ? '—' : v.toLocaleString();

const fmtPct = (v: number | null): string =>
  v === null ? '—' : `${(v * 100).toFixed(1)}%`;

interface KpiCardProps {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: string;
}

function KpiCard({ icon: Icon, label, value, tone }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export default function MonitoringPanel({ days = 30 }: { days?: number }) {
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<UserActivityRow[]>([]);
  const [errors, setErrors] = useState<UserErrorRow[]>([]);
  const [activityDegraded, setActivityDegraded] = useState(false);
  const [errorsDegraded, setErrorsDegraded] = useState(false);
  const [summary, setSummary] = useState<UserMonitorSummary | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      getUserActivityMonitor(days),
      getUserActivityErrors(days),
    ]).then(([act, err]) => {
      if (!alive) return;
      setActivity(act.data);
      setActivityDegraded(act.degraded);
      setSummary(act.summary ?? null);
      setErrors(err.data);
      setErrorsDegraded(err.degraded);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [days]);

  // KPI strip — prefer a server summary block; otherwise aggregate the activity
  // rows client-side (correct: the endpoint returns the FULL aggregate and
  // AuditTable paginates client-side, so we're not summing a server page).
  const kpis = useMemo(() => {
    if (summary) {
      const actions = num(summary.total_actions);
      const errCount = num(summary.error_count);
      const rate =
        num(summary.error_rate) ??
        (actions && actions > 0 && errCount !== null ? errCount / actions : null);
      return {
        users: num(summary.users_active),
        actions,
        denied: num(summary.denied),
        errorRate: rate,
      };
    }
    const actions = sumCol(activity, 'requests');
    const errCount = sumCol(activity, 'error_count');
    return {
      users: distinctUsers(activity),
      actions,
      denied: sumCol(activity, 'denied'),
      // error rate = Σerror_count / Σrequests (error_count is its own metric,
      // distinct from failed/denied). Undetermined → "—", never 0.
      errorRate:
        actions && actions > 0 && errCount !== null ? errCount / actions : null,
    };
  }, [summary, activity]);

  const activityCols = useMemo(() => pickColumns(activity), [activity]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[68px] animate-pulse rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
      </div>
    );
  }

  // Fully degraded (both feeds) → unprovisioned / not-live state. Suppress the
  // KPI strip entirely rather than render four "—" cards with no data behind them.
  const fullyDegraded = activityDegraded && errorsDegraded;
  const noActivity = !activityDegraded && activity.length === 0;

  return (
    <div className="space-y-3">
      {/* KPI strip — only when the activity feed actually resolved (not degraded). */}
      {!activityDegraded && activity.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={Users}
            label="Utilisateurs actifs"
            value={fmtInt(kpis.users)}
            tone="text-blue-500"
          />
          <KpiCard
            icon={Activity}
            label="Actions totales"
            value={fmtInt(kpis.actions)}
            tone="text-indigo-500"
          />
          <KpiCard
            icon={Percent}
            label="Taux d'erreur"
            value={fmtPct(kpis.errorRate)}
            tone="text-amber-500"
          />
          <KpiCard
            icon={ShieldX}
            label="Refusés"
            value={fmtInt(kpis.denied)}
            tone="text-rose-500"
          />
        </div>
      )}

      {/* Per-user activity table (or its own honest empty/degraded state). */}
      {activityDegraded ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <EmptyState
            icon={Database}
            title="Suivi par utilisateur non provisionné"
            description="La source de traces (EVENT_STORE.USER_REQUESTS) n'est pas encore provisionnée ou la route de monitoring n'est pas active sur cet environnement. La vue se remplira automatiquement une fois la source installée — aucune donnée n'est fabriquée d'ici là."
            compact
          />
        </div>
      ) : noActivity ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <EmptyState
            icon={Activity}
            title="Aucune activité dans cette fenêtre"
            description={`Aucune requête utilisateur enregistrée sur les ${days} derniers jours. Élargissez la fenêtre temporelle.`}
            compact
          />
        </div>
      ) : (
        <AuditTable
          rows={activity}
          columns={activityCols}
          title="Activité par utilisateur"
          subtitle="EVENT_STORE.USER_REQUESTS"
          pageSize={10}
        />
      )}

      {/* Recent per-user errors — degrades independently of the activity feed. */}
      {errorsDegraded ? (
        // Don't double up the "non provisionné" note when both feeds are down.
        fullyDegraded ? null : (
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <EmptyState
              icon={AlertTriangle}
              title="Erreurs par utilisateur indisponibles"
              description="Le flux d'erreurs récentes n'a pas pu être chargé."
              compact
            />
          </div>
        )
      ) : errors.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <EmptyState
            icon={AlertTriangle}
            title="Aucune erreur récente"
            description={`Aucune erreur utilisateur sur les ${days} derniers jours.`}
            compact
          />
        </div>
      ) : (
        <AuditTable
          rows={errors}
          title="Erreurs récentes par utilisateur"
          subtitle="EVENT_STORE.USER_REQUESTS · STATUS ≥ 400"
          pageSize={10}
        />
      )}
    </div>
  );
}
