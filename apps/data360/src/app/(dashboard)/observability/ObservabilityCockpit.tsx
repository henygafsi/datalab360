'use client';

/**
 * ObservabilityCockpit — observability as the platform's Perf home.
 *
 * Mounts the unified <AxisCockpit> at the right edge of the landing page plus a
 * <KpiStrip> above the dashboard, both fed from ONE signal store so the strip
 * and the axes never disagree. Everything is docked — zero popups.
 *
 * Loading policy (honest by design — "—" until a real number exists):
 *  - alerts / slo / budgets  → eager (cheap list reads; they feed the KPI strip)
 *  - freshness               → batch probe ONLY when the axis is opened
 *  - perf (platform health)  → ONLY on an explicit "Load platform health" click
 *                              (the audit-backed read can take ~20s); cached in
 *                              state afterwards, refresh is explicit too
 *  - ai (recommendations)    → lazy on axis open (wired /observability/kpis)
 *  - history                 → derived from the already-fetched alert feed
 *
 * Severity contract: open alerts > 0 → blocker · SLO breach / stale freshness →
 * warn · loaded & clean → ok · loading → pending · unknown/not-deployed → idle.
 *
 * The only mutation here is alert acknowledgement — gated by
 * useCanPerform('observability', 'configure-alerts') (the registry key the
 * alerts page uses) and stamped with the REAL session username.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import { Badge, Button, Loader } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiArrowsClockwiseBold,
  PiBellRingingDuotone,
  PiCheckBold,
  PiClockCountdownDuotone,
  PiClockCounterClockwiseDuotone,
  PiPulseDuotone,
  PiSparkleDuotone,
  PiTargetDuotone,
  PiWalletDuotone,
} from 'react-icons/pi';
import AxisCockpit, { type AxisDef, type AxisSeverity } from '@/app/shared/cockpit/AxisCockpit';
import KpiStrip, { type KpiItem } from '@/app/shared/cockpit/KpiStrip';
import {
  acknowledgeObservabilityAlert,
  getCostMonitors,
  getIntelligentKpis,
  getObservabilityAlerts,
  getSloTracking,
  isRouteNotDeployed,
  probePlatformFreshness,
} from '@/app/services/observability';
import type {
  CostMonitor,
  ObservabilityAlert,
  Recommendation,
  SloRecord,
} from '@/app/services/observability/types';
import {
  getPlatformHealth,
  NotDeployedError,
  type HealthKpis,
} from '@/app/services/admin-platform-health';
import { getApiErrorMessage } from '@/lib/api-client';
import { EM_DASH } from '@/app/shared/ui/format';
import { useAuth } from '@/hooks/useAuth';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Async slice — one honest state machine per signal
// ─────────────────────────────────────────────────────────────────────────────

type SliceStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

interface Slice<T> {
  status: SliceStatus;
  data: T | null;
  error: string | null;
}

function idleSlice<T>(): Slice<T> {
  return { status: 'idle', data: null, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting (null → "—", never fake 0s)
// ─────────────────────────────────────────────────────────────────────────────

const fmtMs = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? EM_DASH : `${Math.round(n)} ms`;

const fmtPct = (n: number | null | undefined, digits = 2): string =>
  n == null || Number.isNaN(n) ? EM_DASH : `${n.toFixed(digits)}%`;

const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? EM_DASH : Math.round(n).toLocaleString();

function agoLabel(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return EM_DASH;
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ago`;
}

function fmtTimestamp(ts?: string): string {
  return ts ? ts.replace('T', ' ').split('.')[0] : EM_DASH;
}

function severityBadgeClasses(severity?: string): string {
  const s = (severity || '').toLowerCase();
  if (s === 'critical' || s === 'high')
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  if (s === 'medium') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  if (s === 'low') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain helpers (defensive over Snowflake-loose payloads)
// ─────────────────────────────────────────────────────────────────────────────

/** Backend get_slo_tracking emits breach/OK; older payloads used status strings. */
function isSloBreach(s: SloRecord): boolean {
  if (s.breach === true) return true;
  const st = (s.status ?? '').toLowerCase();
  return st === 'breach' || st === 'breached';
}

interface ProbeSummaryRow {
  name: string;
  seconds_ago: number | null;
  last_modified: string | null;
}

/** Stale = no row change for ≥ 24h (mirrors the freshness page's "Stale" band). */
const STALE_SECONDS = 86400;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}

function toStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function probeFields(o: Record<string, unknown>): Omit<ProbeSummaryRow, 'name'> {
  const lower: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) lower[k.toLowerCase()] = val;
  return {
    seconds_ago: toNum(lower['seconds_ago']),
    last_modified: toStr(lower['last_modified']) ?? toStr(lower['last_modified_at']),
  };
}

/**
 * Normalize the platform probe payload (documented `{ probes: { NAME: {…} } }`
 * shape, bare maps, or arrays) into summary rows — same defensive picking the
 * freshness page uses.
 */
function normalizeProbeRows(payload: unknown): ProbeSummaryRow[] {
  const root = asRecord(payload);
  const inner = root['probes'] ?? root['tables'] ?? root['data'] ?? payload;

  if (Array.isArray(inner)) {
    return inner.map((item, i) => {
      const o = asRecord(item);
      const name =
        toStr(o['table_name'] ?? o['TABLE_NAME']) ??
        toStr(o['name'] ?? o['NAME']) ??
        `object ${i + 1}`;
      return { name, ...probeFields(o) };
    });
  }

  const map = asRecord(inner);
  return Object.entries(map)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([name, v]) => ({ name, ...probeFields(asRecord(v)) }));
}

function staleCount(rows: ProbeSummaryRow[]): number {
  return rows.filter((r) => (r.seconds_ago ?? 0) >= STALE_SECONDS).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational atoms (docked panel building blocks)
// ─────────────────────────────────────────────────────────────────────────────

function AxisNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
      {children}
    </p>
  );
}

function AxisError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/40">
      <p className="text-xs text-red-600 dark:text-red-400">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function AxisLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-xs text-slate-500 dark:text-slate-400">
      <Loader variant="spinner" size="sm" />
      <span>{label}</span>
    </div>
  );
}

/** Deep-link row at the bottom of each axis body — docked navigation, no popups. */
function AxisLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {children}
    </Link>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold text-slate-900 dark:text-white',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Axis bodies
// ─────────────────────────────────────────────────────────────────────────────

function PerfAxisBody({
  slice,
  loadedAt,
  onLoad,
}: {
  slice: Slice<HealthKpis>;
  loadedAt: number | null;
  onLoad: () => void;
}) {
  if (slice.status === 'loading') {
    return <AxisLoading label="Analyzing platform query history — this can take ~20s…" />;
  }
  if (slice.status === 'unavailable') {
    return (
      <AxisNote>
        Platform health is not available on the connected backend yet. It will light up here once
        the administration platform-health route is deployed.
      </AxisNote>
    );
  }
  if (slice.status === 'error') {
    return <AxisError message={slice.error ?? 'Failed to load platform health.'} onRetry={onLoad} />;
  }
  if (slice.status === 'ready' && slice.data) {
    const k = slice.data;
    const errTone = (k.error_rate ?? 0) > 5 ? 'bad' : undefined;
    return (
      <div className="space-y-3">
        <div>
          <StatRow label="p50 latency (24h)" value={fmtMs(k.p50)} />
          <StatRow label="p95 latency (24h)" value={fmtMs(k.p95)} />
          <StatRow label="p99 latency (24h)" value={fmtMs(k.p99)} />
          <StatRow label="Error rate" value={fmtPct(k.error_rate)} tone={errTone} />
          <StatRow label="Calls" value={fmtInt(k.calls)} />
          <StatRow label="Active users" value={fmtInt(k.distinct_users)} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Loaded {loadedAt ? new Date(loadedAt).toLocaleTimeString() : EM_DASH}
          </span>
          <Button size="sm" variant="outline" className="gap-1" onClick={onLoad}>
            <PiArrowsClockwiseBold className="h-3 w-3" />
            Reload
          </Button>
        </div>
        <AxisLink href="/administration?tab=health">Full platform health →</AxisLink>
      </div>
    );
  }
  // idle — explicit, honest: nothing fetched until the user asks for it.
  return (
    <div className="space-y-3">
      <AxisNote>
        Latency percentiles and the error rate are computed from the account&apos;s query history.
        This read is heavy and is never run automatically.
      </AxisNote>
      <Button size="sm" className="w-full bg-indigo-600 text-white hover:bg-indigo-700" onClick={onLoad}>
        Load platform health (may take ~20s)
      </Button>
    </div>
  );
}

function AlertsAxisBody({
  slice,
  canAck,
  ackDeniedTitle,
  ackingId,
  onAck,
}: {
  slice: Slice<ObservabilityAlert[]>;
  canAck: boolean;
  ackDeniedTitle: string;
  ackingId: string | null;
  onAck: (alert: ObservabilityAlert) => void;
}) {
  if (slice.status === 'loading' || slice.status === 'idle') {
    return <AxisLoading label="Loading alerts…" />;
  }
  if (slice.status === 'unavailable') {
    return <AxisNote>Alerts are not available on the connected backend yet.</AxisNote>;
  }
  if (slice.status === 'error') {
    return <AxisError message={slice.error ?? 'Failed to load alerts.'} />;
  }
  const alerts = slice.data ?? [];
  if (alerts.length === 0) {
    return (
      <div className="space-y-3">
        <AxisNote>No open alerts in the current window.</AxisNote>
        <AxisLink href="/observability/alerts">Open alerts page →</AxisLink>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-white">{alerts.length}</span> open
        alert{alerts.length === 1 ? '' : 's'} — latest {Math.min(alerts.length, 5)} below.
      </p>
      <ul className="space-y-2">
        {alerts.slice(0, 5).map((a, i) => (
          <li
            key={a.id ?? i}
            className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
          >
            <div className="flex items-center gap-2">
              <Badge size="sm" className={cn(severityBadgeClasses(a.severity))}>
                {a.severity ?? EM_DASH}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900 dark:text-white">
                {a.title ?? a.message ?? EM_DASH}
              </span>
              {a.id && (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={ackingId === a.id}
                  disabled={ackingId !== null || !canAck}
                  title={!canAck ? ackDeniedTitle : 'Acknowledge — records your username as owner'}
                  className="gap-1 border-green-300 px-2 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
                  onClick={() => onAck(a)}
                >
                  <PiCheckBold className="h-3 w-3" />
                  Ack
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {(a.category ?? a.alert_type ?? a.type ?? a.source_module ?? EM_DASH) +
                ' · ' +
                fmtTimestamp(a.detected_at ?? a.timestamp)}
            </p>
          </li>
        ))}
      </ul>
      <AxisLink href="/observability/alerts">All alerts &amp; cross-module view →</AxisLink>
    </div>
  );
}

function SloAxisBody({ slice }: { slice: Slice<SloRecord[]> }) {
  if (slice.status === 'loading' || slice.status === 'idle') {
    return <AxisLoading label="Loading SLO tracking…" />;
  }
  if (slice.status === 'unavailable') {
    return <AxisNote>SLO tracking is not available on the connected backend yet.</AxisNote>;
  }
  if (slice.status === 'error') {
    return <AxisError message={slice.error ?? 'Failed to load SLO tracking.'} />;
  }
  const slos = slice.data ?? [];
  const breaches = slos.filter(isSloBreach).length;
  if (slos.length === 0) {
    return (
      <div className="space-y-3">
        <AxisNote>No SLOs are defined for this account yet.</AxisNote>
        <AxisLink href="/observability/slo">Define SLOs →</AxisLink>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-white">{slos.length}</span> SLO
        {slos.length === 1 ? '' : 's'} tracked ·{' '}
        <span
          className={cn(
            'font-semibold',
            breaches > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {breaches} breached
        </span>
      </p>
      <ul className="space-y-1.5">
        {slos.slice(0, 6).map((s, i) => {
          const breached = isSloBreach(s);
          return (
            <li
              key={s.name ?? i}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-700"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">
                {s.name ?? s.objective ?? EM_DASH}
              </span>
              <Badge
                size="sm"
                className={cn(
                  breached
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                )}
              >
                {breached ? 'Breach' : 'OK'}
              </Badge>
            </li>
          );
        })}
      </ul>
      <AxisLink href="/observability/slo">SLO tracking page →</AxisLink>
    </div>
  );
}

function BudgetsAxisBody({ slice }: { slice: Slice<CostMonitor[]> }) {
  if (slice.status === 'loading' || slice.status === 'idle') {
    return <AxisLoading label="Loading cost monitors…" />;
  }
  if (slice.status === 'unavailable') {
    return <AxisNote>Cost monitors are not available on the connected backend yet.</AxisNote>;
  }
  if (slice.status === 'error') {
    return <AxisError message={slice.error ?? 'Failed to load cost monitors.'} />;
  }
  const monitors = slice.data ?? [];
  if (monitors.length === 0) {
    return (
      <div className="space-y-3">
        <AxisNote>No resource monitors exist yet — create one to cap compute spend.</AxisNote>
        <AxisLink href="/observability/budget">Create a budget →</AxisLink>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-white">{monitors.length}</span>{' '}
        resource monitor{monitors.length === 1 ? '' : 's'} guarding compute spend.
      </p>
      <ul className="space-y-1.5">
        {monitors.slice(0, 5).map((m, i) => {
          const used = toNum(m.used_credits);
          const quota = toNum(m.credit_quota);
          return (
            <li
              key={m.name ?? i}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-700"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                {m.name ?? EM_DASH}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {used == null ? EM_DASH : used.toFixed(1)} / {quota == null ? EM_DASH : quota.toFixed(0)}{' '}
                credits
              </span>
            </li>
          );
        })}
      </ul>
      {/* Edit (ALTER quota/frequency) and Assign warehouse live in the budget
          page's docked manage inspector — deep-link instead of duplicating the
          gated write forms here. */}
      <div className="flex flex-col gap-1">
        <AxisLink href="/observability/budget">Edit budgets (quota, triggers) →</AxisLink>
        <AxisLink href="/observability/budget">Assign a warehouse to a monitor →</AxisLink>
      </div>
    </div>
  );
}

function FreshnessAxisBody({
  slice,
  onRecheck,
}: {
  slice: Slice<ProbeSummaryRow[]>;
  onRecheck: () => void;
}) {
  if (slice.status === 'idle') {
    return (
      <div className="space-y-3">
        <AxisNote>Freshness has not been checked in this session yet.</AxisNote>
        <Button size="sm" className="w-full bg-indigo-600 text-white hover:bg-indigo-700" onClick={onRecheck}>
          Run freshness check
        </Button>
      </div>
    );
  }
  if (slice.status === 'loading') {
    return <AxisLoading label="Probing platform tables for row freshness…" />;
  }
  if (slice.status === 'unavailable') {
    return <AxisNote>Freshness probes are not available on the connected backend yet.</AxisNote>;
  }
  if (slice.status === 'error') {
    return <AxisError message={slice.error ?? 'Freshness probe failed.'} onRetry={onRecheck} />;
  }
  const rows = slice.data ?? [];
  const stale = staleCount(rows);
  const sorted = [...rows].sort((a, b) => (b.seconds_ago ?? -1) - (a.seconds_ago ?? -1));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <span
            className={cn(
              'font-semibold',
              stale > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {stale} stale
          </span>{' '}
          of {rows.length} probed object{rows.length === 1 ? '' : 's'} (&ge;24h without changes).
        </p>
        <Button size="sm" variant="outline" className="gap-1" onClick={onRecheck}>
          <PiArrowsClockwiseBold className="h-3 w-3" />
          Re-check
        </Button>
      </div>
      {rows.length === 0 ? (
        <AxisNote>The probe returned no objects.</AxisNote>
      ) : (
        <ul className="space-y-1.5">
          {sorted.slice(0, 5).map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-700"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                {r.name}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[11px]',
                  (r.seconds_ago ?? 0) >= STALE_SECONDS
                    ? 'font-semibold text-amber-600 dark:text-amber-400'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {agoLabel(r.seconds_ago)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <AxisLink href="/observability/freshness">Freshness probes (table / schema / changes) →</AxisLink>
    </div>
  );
}

function HistoryAxisBody({ slice }: { slice: Slice<ObservabilityAlert[]> }) {
  if (slice.status === 'loading' || slice.status === 'idle') {
    return <AxisLoading label="Loading recent activity…" />;
  }
  if (slice.status === 'unavailable' || slice.status === 'error') {
    return <AxisNote>Alert history is not available on the connected backend yet.</AxisNote>;
  }
  const items = [...(slice.data ?? [])].sort((a, b) =>
    (b.detected_at ?? b.timestamp ?? '').localeCompare(a.detected_at ?? a.timestamp ?? ''),
  );
  if (items.length === 0) {
    return <AxisNote>No alert activity in the current window.</AxisNote>;
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {items.slice(0, 8).map((a, i) => (
          <li key={a.id ?? i} className="flex items-start gap-2 py-1">
            <span
              className={cn(
                'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                (a.severity ?? '').toLowerCase() === 'critical' || (a.severity ?? '').toLowerCase() === 'high'
                  ? 'bg-red-500'
                  : 'bg-slate-300 dark:bg-slate-600',
              )}
            />
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-700 dark:text-slate-200">
                {a.title ?? a.message ?? EM_DASH}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {fmtTimestamp(a.detected_at ?? a.timestamp)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <AxisNote>
        Task-run history is not exposed by the connected backend yet — this feed shows alert
        activity from the current window.
      </AxisNote>
    </div>
  );
}

function AiAxisBody({ slice, onLoad }: { slice: Slice<Recommendation[]>; onLoad: () => void }) {
  if (slice.status === 'idle') {
    return (
      <div className="space-y-3">
        <AxisNote>Recommendations are computed from the account&apos;s health signals.</AxisNote>
        <Button size="sm" className="w-full bg-indigo-600 text-white hover:bg-indigo-700" onClick={onLoad}>
          Get recommendations
        </Button>
      </div>
    );
  }
  if (slice.status === 'loading') {
    return <AxisLoading label="Scoring health signals…" />;
  }
  if (slice.status === 'unavailable') {
    return <AxisNote>Recommendations are not available on the connected backend yet.</AxisNote>;
  }
  if (slice.status === 'error') {
    return <AxisError message={slice.error ?? 'Failed to load recommendations.'} onRetry={onLoad} />;
  }
  const recs = slice.data ?? [];
  if (recs.length === 0) {
    return <AxisNote>No recommendations right now — nothing flagged across health signals.</AxisNote>;
  }
  return (
    <ul className="space-y-2">
      {recs.slice(0, 6).map((r, i) => (
        <li key={`${r.title}-${i}`} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Badge
              size="sm"
              className={cn(
                r.priority === 'high'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  : r.priority === 'medium'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
              )}
            >
              {r.priority}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900 dark:text-white">
              {r.title}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 text-[11px] text-slate-500 dark:text-slate-400">{r.description}</p>
          {r.impact && (
            <p className="mt-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">{r.impact}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell — KPI strip + content + docked cockpit, one signal store
// ─────────────────────────────────────────────────────────────────────────────

export default function ObservabilityCockpitShell({ children }: { children: ReactNode }) {
  const { trackFeatureClick } = useTrackEvent();
  // Real session identity for alert acknowledgement — the backend records who
  // acknowledged; never a placeholder literal.
  const { username } = useAuth();

  const [open, setOpen] = useState(false);
  const [activeAxis, setActiveAxis] = useState<string | null>(null);

  // ── Signal slices ──────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<Slice<ObservabilityAlert[]>>(idleSlice);
  const [slo, setSlo] = useState<Slice<SloRecord[]>>(idleSlice);
  const [budgets, setBudgets] = useState<Slice<CostMonitor[]>>(idleSlice);
  const [freshness, setFreshness] = useState<Slice<ProbeSummaryRow[]>>(idleSlice);
  const [perf, setPerf] = useState<Slice<HealthKpis>>(idleSlice);
  const [perfLoadedAt, setPerfLoadedAt] = useState<number | null>(null);
  const [ai, setAi] = useState<Slice<Recommendation[]>>(idleSlice);
  const [ackingId, setAckingId] = useState<string | null>(null);

  // ── Gating (registry keys grep'd from the existing observability pages) ────
  const ackPerm = useCanPerform('observability', 'configure-alerts');
  const canAck = ackPerm.allowed || ackPerm.loading; // fail-open while loading
  const ackDeniedTitle =
    'You lack the "configure-alerts" permission on observability. Ask an administrator to grant it.';

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadAlerts = useCallback(async () => {
    setAlerts((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await getObservabilityAlerts(7);
      const r = res as unknown as Record<string, unknown>;
      const raw = r.alerts ?? r.data ?? (Array.isArray(res) ? res : []);
      setAlerts({ status: 'ready', data: Array.isArray(raw) ? (raw as ObservabilityAlert[]) : [], error: null });
    } catch (err) {
      setAlerts({
        status: isRouteNotDeployed(err) ? 'unavailable' : 'error',
        data: null,
        error: getApiErrorMessage(err),
      });
    }
  }, []);

  const loadSlo = useCallback(async () => {
    setSlo((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await getSloTracking();
      const r = res as unknown as Record<string, unknown>;
      const raw = r.slos ?? r.data ?? (Array.isArray(res) ? res : []);
      setSlo({ status: 'ready', data: Array.isArray(raw) ? (raw as SloRecord[]) : [], error: null });
    } catch (err) {
      setSlo({
        status: isRouteNotDeployed(err) ? 'unavailable' : 'error',
        data: null,
        error: getApiErrorMessage(err),
      });
    }
  }, []);

  const loadBudgets = useCallback(async () => {
    setBudgets((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await getCostMonitors();
      setBudgets({ status: 'ready', data: Array.isArray(res.monitors) ? res.monitors : [], error: null });
    } catch (err) {
      setBudgets({
        status: isRouteNotDeployed(err) ? 'unavailable' : 'error',
        data: null,
        error: getApiErrorMessage(err),
      });
    }
  }, []);

  /** Batch probe — deliberately NOT run on mount; only on axis open / re-check. */
  const loadFreshness = useCallback(async () => {
    setFreshness((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await probePlatformFreshness();
      setFreshness({ status: 'ready', data: normalizeProbeRows(res), error: null });
    } catch (err) {
      setFreshness({
        status: isRouteNotDeployed(err) ? 'unavailable' : 'error',
        data: null,
        error: getApiErrorMessage(err),
      });
    }
  }, []);

  /** Heavy audit-backed read (~20s) — explicit click only, cached afterwards. */
  const loadPerf = useCallback(async () => {
    trackFeatureClick('obs_cockpit_load_platform_health');
    setPerf((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await getPlatformHealth({ hours: 24 });
      setPerf({ status: 'ready', data: res.kpis, error: null });
      setPerfLoadedAt(Date.now());
    } catch (err) {
      if (err instanceof NotDeployedError) {
        setPerf({ status: 'unavailable', data: null, error: null });
      } else {
        const msg = getApiErrorMessage(err);
        setPerf({ status: 'error', data: null, error: msg });
        toast.error(msg);
      }
    }
  }, [trackFeatureClick]);

  const loadAi = useCallback(async () => {
    setAi((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const res = await getIntelligentKpis();
      setAi({
        status: 'ready',
        data: Array.isArray(res.recommendations) ? res.recommendations : [],
        error: null,
      });
    } catch (err) {
      setAi({
        status: isRouteNotDeployed(err) ? 'unavailable' : 'error',
        data: null,
        error: getApiErrorMessage(err),
      });
    }
  }, []);

  // Eager: the cheap list reads that feed the KPI strip. Perf/freshness/ai stay lazy.
  useEffect(() => {
    loadAlerts();
    loadSlo();
    loadBudgets();
  }, [loadAlerts, loadSlo, loadBudgets]);

  // Real-time: re-pull the cheap feeds when the backend invalidates observability
  // surfaces (batch probe checks, monitor edits, new alerts). One shared SSE atom.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevant = lastInvalidation.keys.some(
      (k: string) => k === CACHE_KEYS.OBSERVABILITY_DASHBOARD || k === CACHE_KEYS.ALERTS,
    );
    if (relevant) {
      loadAlerts();
      loadSlo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const acknowledge = useCallback(
    async (alert: ObservabilityAlert) => {
      const alertId = alert.id;
      if (!alertId) {
        toast.error('This alert has no ID and cannot be acknowledged');
        return;
      }
      setAckingId(alertId);
      try {
        await acknowledgeObservabilityAlert(alertId, username || 'current_user');
        toast.success('Alert acknowledged');
        loadAlerts();
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      } finally {
        setAckingId(null);
      }
    },
    [username, loadAlerts],
  );

  const openAxis = useCallback(
    (id: string) => {
      setActiveAxis(id);
      setOpen(true);
      trackFeatureClick(`obs_cockpit_axis_${id}`);
      // Lazy signals fire on FIRST open only (their axis bodies offer explicit
      // retry/re-check afterwards). Perf stays behind its explicit load button.
      // loadX flips the slice to 'loading' synchronously, so re-entry is safe.
      if (id === 'freshness' && freshness.status === 'idle') loadFreshness();
      if (id === 'ai' && ai.status === 'idle') loadAi();
    },
    [trackFeatureClick, freshness.status, ai.status, loadFreshness, loadAi],
  );

  const closePanel = useCallback(() => setOpen(false), []);

  // ── Derived severities (mission contract) ──────────────────────────────────
  const openAlertCount = alerts.status === 'ready' ? (alerts.data ?? []).length : null;
  const sloBreachCount = slo.status === 'ready' ? (slo.data ?? []).filter(isSloBreach).length : null;
  const budgetCount = budgets.status === 'ready' ? (budgets.data ?? []).length : null;
  const freshViolations = freshness.status === 'ready' ? staleCount(freshness.data ?? []) : null;

  const sev = (slice: SliceStatus, loaded: AxisSeverity): AxisSeverity => {
    if (slice === 'ready') return loaded;
    if (slice === 'loading') return 'pending';
    return 'idle'; // idle / error / unavailable — no green-washing
  };

  const alertsSeverity = sev(alerts.status, (openAlertCount ?? 0) > 0 ? 'blocker' : 'ok');
  const sloSeverity = sev(slo.status, (sloBreachCount ?? 0) > 0 ? 'warn' : 'ok');
  const budgetsSeverity = sev(budgets.status, 'ok');
  const freshSeverity = sev(freshness.status, (freshViolations ?? 0) > 0 ? 'warn' : 'ok');
  const perfSeverity = sev(perf.status, (perf.data?.error_rate ?? 0) > 5 ? 'warn' : 'ok');
  const aiSeverity = sev(ai.status, (ai.data ?? []).length > 0 ? 'pending' : 'ok');

  // ── Axes ───────────────────────────────────────────────────────────────────
  const axes: AxisDef[] = useMemo(
    () => [
      {
        id: 'perf',
        label: 'Performance',
        railLabel: 'Perf',
        icon: PiPulseDuotone,
        severity: perfSeverity,
        badge: perf.status === 'ready' ? `p95 ${fmtMs(perf.data?.p95)}` : undefined,
        render: () => <PerfAxisBody slice={perf} loadedAt={perfLoadedAt} onLoad={loadPerf} />,
      },
      {
        id: 'alerts',
        label: 'Alerts',
        railLabel: 'Alerts',
        icon: PiBellRingingDuotone,
        severity: alertsSeverity,
        badge: openAlertCount != null ? `${openAlertCount} open` : undefined,
        render: () => (
          <AlertsAxisBody
            slice={alerts}
            canAck={canAck}
            ackDeniedTitle={ackDeniedTitle}
            ackingId={ackingId}
            onAck={acknowledge}
          />
        ),
      },
      {
        id: 'slo',
        label: 'SLOs',
        railLabel: 'SLO',
        icon: PiTargetDuotone,
        severity: sloSeverity,
        badge: sloBreachCount != null ? `${sloBreachCount} breached` : undefined,
        render: () => <SloAxisBody slice={slo} />,
      },
      {
        id: 'budgets',
        label: 'Budgets',
        railLabel: 'Budget',
        icon: PiWalletDuotone,
        severity: budgetsSeverity,
        badge: budgetCount != null ? `${budgetCount} monitors` : undefined,
        render: () => <BudgetsAxisBody slice={budgets} />,
      },
      {
        id: 'freshness',
        label: 'Freshness',
        railLabel: 'Fresh',
        icon: PiClockCountdownDuotone,
        severity: freshSeverity,
        badge: freshViolations != null ? `${freshViolations} stale` : undefined,
        render: () => <FreshnessAxisBody slice={freshness} onRecheck={loadFreshness} />,
      },
      {
        id: 'history',
        label: 'History',
        railLabel: 'History',
        icon: PiClockCounterClockwiseDuotone,
        severity: 'idle',
        render: () => <HistoryAxisBody slice={alerts} />,
      },
      {
        id: 'ai',
        label: 'Recommendations',
        railLabel: 'AI',
        icon: PiSparkleDuotone,
        severity: aiSeverity,
        badge: ai.status === 'ready' ? `${(ai.data ?? []).length}` : undefined,
        render: () => <AiAxisBody slice={ai} onLoad={loadAi} />,
      },
    ],
    [
      perf, perfLoadedAt, perfSeverity, loadPerf,
      alerts, alertsSeverity, openAlertCount, canAck, ackDeniedTitle, ackingId, acknowledge,
      slo, sloSeverity, sloBreachCount,
      budgets, budgetsSeverity, budgetCount,
      freshness, freshSeverity, freshViolations, loadFreshness,
      ai, aiSeverity, loadAi,
    ],
  );

  // ── KPI strip (honest "—" until a real number exists) ──────────────────────
  const kpiItems: KpiItem[] = useMemo(
    () => [
      {
        label: 'Open alerts',
        value: openAlertCount,
        dot:
          alerts.status === 'ready'
            ? (openAlertCount ?? 0) > 0
              ? 'blocker'
              : 'ok'
            : alerts.status === 'loading'
              ? 'pending'
              : 'idle',
        sub:
          alerts.status === 'unavailable'
            ? 'not available yet'
            : alerts.status === 'error'
              ? 'failed to load'
              : undefined,
        onClick: () => openAxis('alerts'),
        title: 'Open the alerts axis',
      },
      {
        label: 'SLO breaches',
        value: sloBreachCount,
        dot:
          slo.status === 'ready'
            ? (sloBreachCount ?? 0) > 0
              ? 'warn'
              : 'ok'
            : slo.status === 'loading'
              ? 'pending'
              : 'idle',
        sub:
          slo.status === 'ready'
            ? `of ${(slo.data ?? []).length} tracked`
            : slo.status === 'unavailable'
              ? 'not available yet'
              : slo.status === 'error'
                ? 'failed to load'
                : undefined,
        onClick: () => openAxis('slo'),
        title: 'Open the SLO axis',
      },
      {
        label: 'Budget monitors',
        value: budgetCount,
        dot: budgets.status === 'ready' ? 'ok' : budgets.status === 'loading' ? 'pending' : 'idle',
        sub:
          budgets.status === 'unavailable'
            ? 'not available yet'
            : budgets.status === 'error'
              ? 'failed to load'
              : undefined,
        onClick: () => openAxis('budgets'),
        title: 'Open the budgets axis',
      },
      {
        label: 'Freshness violations',
        value: freshViolations,
        dot:
          freshness.status === 'ready'
            ? (freshViolations ?? 0) > 0
              ? 'warn'
              : 'ok'
            : freshness.status === 'loading'
              ? 'pending'
              : 'idle',
        sub:
          freshness.status === 'idle'
            ? 'open to check'
            : freshness.status === 'unavailable'
              ? 'not available yet'
              : freshness.status === 'error'
                ? 'probe failed'
                : undefined,
        onClick: () => openAxis('freshness'),
        title: 'Run the batch freshness probe',
      },
      {
        label: 'p95 latency (24h)',
        value: perf.status === 'ready' ? fmtMs(perf.data?.p95) : null,
        dot:
          perf.status === 'ready'
            ? (perf.data?.error_rate ?? 0) > 5
              ? 'warn'
              : 'ok'
            : perf.status === 'loading'
              ? 'pending'
              : 'idle',
        sub:
          perf.status === 'ready'
            ? `error rate ${fmtPct(perf.data?.error_rate)}`
            : perf.status === 'loading'
              ? 'loading (~20s)…'
              : perf.status === 'unavailable'
                ? 'not available yet'
                : 'click to load (~20s)',
        onClick: () => openAxis('perf'),
        title: 'Open the performance axis — loading is explicit (may take ~20s)',
      },
    ],
    [
      alerts.status, openAlertCount,
      slo.status, slo.data, sloBreachCount,
      budgets.status, budgetCount,
      freshness.status, freshViolations,
      perf.status, perf.data,
      openAxis,
    ],
  );

  // ── Layout: KPI strip + content on the left, docked cockpit on the right ───
  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1 md:pr-4">
        <KpiStrip
          items={kpiItems}
          className="mb-5 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
        />
        {children}
      </div>
      <AxisCockpit
        axes={axes}
        open={open}
        activeAxis={activeAxis}
        onOpenAxis={openAxis}
        onClose={closePanel}
        className="hidden md:flex sticky top-16 h-[calc(100dvh-64px)] self-start"
      />
    </div>
  );
}
