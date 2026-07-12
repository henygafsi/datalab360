'use client';

/**
 * ConnectCockpit — the Connect Data module presented as the UNIFIED cockpit
 * (shared `AxisCockpit` + `KpiStrip` primitives, 2026-07-02 redesign).
 *
 * One data fetch feeds both surfaces:
 *   - `useConnectCockpitData()` — GET /connect/connectors/health +
 *     GET /connect/connectors (the exact same sources the ConnectorHealthStrip
 *     consumes; the strip stays as the in-page detail + Test/Sync surface).
 *   - `<ConnectKpiStrip>`  — top KPI row under the page header. Honest by
 *     design: unknown values render "—", never fabricated zeros.
 *   - `<ConnectCockpit>`   — right-edge axis rail + docked panel. Actions are
 *     rich CTAs (shared InsightActionButton + a why-this-action line derived
 *     from real state), grouped by intent inside their owning axis:
 *       sources     Connect: Add connection (RBAC-gated) + inventory/health
 *       ingestion   Ingest: per-connector force-sync · Verify: per-connector
 *                   reachability test (POST /connect/connectors/{id}/sync|test)
 *                   + the 7-day load roll-up
 *       governance  Govern: re-check stage grants (lazy GET
 *                   /connect/stages/{name}/grants for the first 3 stages,
 *                   fetched on first axis open) + honest PII empty
 *       cost        ingestion compute credits (7d) when reported — the only
 *                   wired cost signal in this module; otherwise honest empty
 *       history     recent stage/pipe activity derived from the health items'
 *                   timestamps (no extra endpoint; honest empty when silent)
 *       ai          entry point that focuses the existing docked
 *                   ConnectorAiHelper (no new AI calls, no popup)
 *
 * Severity contract: real load/task failures → 'blocker'; paused pipes →
 * 'warn'; live data → 'ok'; unknown / not wired → 'idle' (grey, honest).
 * Zero popups: everything docked. RBAC: reads follow the page's
 * useCanPerform('connect', 'view') fail-open-while-loading policy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import toast from 'react-hot-toast';
import {
  Activity,
  Coins,
  Database,
  History,
  Plus,
  RefreshCw,
  ShieldCheck,
  SignalHigh,
  Sparkles,
} from 'lucide-react';
import AxisCockpit, { type AxisDef, type AxisSeverity } from '@/app/shared/cockpit/AxisCockpit';
import KpiStrip, { type KpiItem, type KpiDotTone } from '@/app/shared/cockpit/KpiStrip';
import InsightActionButton, {
  type InsightActionButtonProps,
} from '@/app/shared/insights/InsightActionButton';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  getConnectorsHealth,
  getStageGrants,
  listConnectors,
  syncConnector,
  testConnector,
  type ConnectorHealthItem,
  type ConnectorInfo,
  type ConnectorsHealthSummary,
} from './connectionServices';

// ---------------------------------------------------------------------------
// Shared data fetch (one GET pair for the KPI strip + every axis)
// ---------------------------------------------------------------------------

export interface ConnectCockpitData {
  health: ConnectorsHealthSummary | null;
  /** null = not loaded / failed (render "—"); [] = a real empty list. */
  connectors: ConnectorInfo[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches the connector-health roll-up + registered-connector list once and
 * keeps them fresh via SSE cache-invalidation events (same keys the
 * ConnectorHealthStrip listens to). `enabled` should be
 * `status === 'authenticated' && canView` — the page's existing read gate.
 */
export function useConnectCockpitData(enabled: boolean): ConnectCockpitData {
  const [health, setHealth] = useState<ConnectorsHealthSummary | null>(null);
  const [connectors, setConnectors] = useState<ConnectorInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [h, c] = await Promise.allSettled([getConnectorsHealth(), listConnectors()]);
    if (h.status === 'fulfilled') {
      setHealth(h.value);
    } else {
      setError(h.reason instanceof Error ? h.reason.message : 'Failed to load connector health');
    }
    if (c.status === 'fulfilled') {
      setConnectors(Array.isArray(c.value.connectors) ? c.value.connectors : []);
    }
    // On connector-list failure keep the previous value (or null → honest "—").
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  // Real-time refresh (SSE): stage/connector mutations invalidate these keys.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!enabled || !lastInvalidation) return;
    const touched = lastInvalidation.keys.some(
      (k: string) =>
        k === CACHE_KEYS.CONNECTORS ||
        k === CACHE_KEYS.STAGES ||
        k === CACHE_KEYS.CONNECTIONS ||
        k === CACHE_KEYS.INTEGRATIONS,
    );
    if (touched) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  return { health, connectors, loading, error, refresh: () => void load() };
}

// ---------------------------------------------------------------------------
// Honest formatters (mirror the ConnectorHealthStrip's semantics: the backend
// roll-up coerces absent fields to 0, so a non-positive value means "not
// reported", not a real zero — render "—").
// ---------------------------------------------------------------------------

function formatCount(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Most recent activity across all health items (stage last_altered / pipe last_loaded). */
function latestActivity(health: ConnectorsHealthSummary | null): { item: ConnectorHealthItem; ts: number } | null {
  if (!health) return null;
  let best: { item: ConnectorHealthItem; ts: number } | null = null;
  for (const item of health.items) {
    const ts = item.last_checked ? Date.parse(item.last_checked) : NaN;
    if (Number.isFinite(ts) && (!best || ts > best.ts)) best = { item, ts };
  }
  return best;
}

const OVERALL_TONE: Record<ConnectorsHealthSummary['overall'], KpiDotTone> = {
  healthy: 'ok',
  degraded: 'warn',
  down: 'blocker',
  unknown: 'idle',
};

// ---------------------------------------------------------------------------
// KPI strip (mount under the page header)
// ---------------------------------------------------------------------------

export function ConnectKpiStrip({
  data,
  stagesFallback,
  onOpenAxis,
  className = '',
}: {
  data: ConnectCockpitData;
  /** Stage count from the page's own stage list, used until the health roll-up answers. */
  stagesFallback: number | null;
  onOpenAxis: (axisId: string) => void;
  className?: string;
}) {
  const { health, connectors } = data;
  const m = health?.metrics;
  const healthyPct =
    health && health.total > 0 ? `${Math.round((health.healthy / health.total) * 100)}%` : null;
  const last = latestActivity(health);

  const items: KpiItem[] = [
    {
      label: 'Connectors',
      value: connectors === null ? null : connectors.length,
      sub: 'registered',
      onClick: () => onOpenAxis('sources'),
      title: 'Open the Sources axis',
    },
    {
      label: 'Stages',
      value: health ? health.total_stages : stagesFallback,
      sub: health ? `${health.total_pipes} pipe${health.total_pipes === 1 ? '' : 's'}` : undefined,
      onClick: () => onOpenAxis('sources'),
      title: 'Open the Sources axis',
    },
    {
      label: 'Files (7d)',
      value: formatCount(m?.files_inserted_7d),
      sub: formatBytes(m?.bytes_inserted_7d) ? `${formatBytes(m?.bytes_inserted_7d)} ingested` : undefined,
      onClick: () => onOpenAxis('ingestion'),
      title: 'Open the Ingestion axis',
    },
    {
      label: 'Healthy',
      value: healthyPct,
      dot: health ? OVERALL_TONE[health.overall] : 'idle',
      sub: health && health.total > 0 ? `${health.healthy}/${health.total} sources` : undefined,
      onClick: () => onOpenAxis('sources'),
      title: 'Open the Sources axis',
    },
    {
      label: 'Last load',
      value: last ? relativeTime(last.item.last_checked) : null,
      sub: last ? last.item.name : undefined,
      onClick: () => onOpenAxis('history'),
      title: 'Open the History axis',
    },
  ];

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800 ${className}`}
    >
      <KpiStrip items={items} className="!border-b-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers for axis bodies
// ---------------------------------------------------------------------------

function AxisRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`font-semibold ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3 dark:border-slate-600">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{detail}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0 dark:text-slate-500">
      {children}
    </p>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2" aria-hidden>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function FetchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs dark:border-amber-900/40 dark:bg-amber-900/20">
      <span className="text-amber-700 dark:text-amber-300">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="ml-2 font-semibold text-amber-700 hover:underline dark:text-amber-300"
      >
        Retry
      </button>
    </div>
  );
}

/**
 * CockpitAction — an InsightActionButton with its "why this action" line.
 * The why-text is always derived from REAL state (health roll-up, counts,
 * last-load timestamps) so every CTA explains itself; gating stays honest
 * via `capable` + `unavailableHint` (disabled chip with the true reason).
 */
function CockpitAction({ why, ...btn }: InsightActionButtonProps & { why: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 dark:border-slate-700 dark:bg-slate-800/40">
      <InsightActionButton size="md" {...btn} />
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{why}</p>
    </div>
  );
}

const ITEM_DOT: Record<ConnectorHealthItem['status'], string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
  stale: 'bg-amber-400',
  unknown: 'bg-slate-400',
};

const ITEM_LABEL: Record<ConnectorHealthItem['status'], string> = {
  healthy: 'Healthy',
  degraded: 'Paused',
  down: 'Down',
  stale: 'Stale',
  unknown: 'Unknown',
};

// ---------------------------------------------------------------------------
// The cockpit itself (mount at the right edge of the page)
// ---------------------------------------------------------------------------

type StageGrantState = { count: number | null; error?: string };

export default function ConnectCockpit({
  data,
  open,
  activeAxis,
  onOpenAxis,
  onClose,
  onOpenAiHelper,
  onAddConnection,
  canCreate,
  createDeniedReason,
  className = '',
}: {
  data: ConnectCockpitData;
  open: boolean;
  activeAxis: string | null;
  onOpenAxis: (id: string) => void;
  onClose: () => void;
  /** Focuses the existing docked ConnectorAiHelper (no new AI surface). */
  onOpenAiHelper: () => void;
  /** Jumps to the connector picker in add-connection mode (create flow entry). */
  onAddConnection: () => void;
  canCreate: boolean;
  createDeniedReason: string;
  className?: string;
}) {
  const { health, connectors, loading, error, refresh } = data;
  const m = health?.metrics ?? null;
  const last = latestActivity(health);

  // Reads follow the page's fail-open-while-loading policy; an explicit deny
  // renders an honest gated note instead of firing the grants calls.
  const viewPerm = useCanPerform('connect', 'view');
  const canView = viewPerm.allowed || viewPerm.loading;
  const viewDenied = !viewPerm.allowed && !viewPerm.loading;
  const viewDeniedReason =
    'You lack the "view" permission on connect. Ask an administrator to grant it.';
  // Forcing a connector sync triggers ingestion → connect:ingest (same action
  // the page gates its ingest CTAs on); re-testing is a non-mutating probe.
  const ingestPerm = useCanPerform('connect', 'ingest');
  const canIngest = ingestPerm.allowed || ingestPerm.loading;
  const ingestDeniedReason =
    'You lack the "ingest" permission on connect. Ask an administrator to grant it.';

  // Governance axis: lazy stage-grants fetch (first 3 stages, on first open).
  const stageNames = useMemo(
    () =>
      (health?.items ?? [])
        .filter((i) => i.kind === 'stage')
        .map((i) => i.name)
        .slice(0, 3),
    [health],
  );
  const [grants, setGrants] = useState<Record<string, StageGrantState>>({});
  const grantsFetched = useRef(false);
  const loadGrants = useCallback(async () => {
    await Promise.all(
      stageNames.map(async (name) => {
        try {
          const res = await getStageGrants(name);
          const count =
            typeof res.count === 'number'
              ? res.count
              : Array.isArray(res.grants)
                ? res.grants.length
                : null;
          setGrants((prev) => ({ ...prev, [name]: { count } }));
        } catch (err) {
          setGrants((prev) => ({
            ...prev,
            [name]: { count: null, error: err instanceof Error ? err.message : 'Failed to load grants' },
          }));
        }
      }),
    );
  }, [stageNames]);
  useEffect(() => {
    if (!(open && activeAxis === 'governance')) return;
    if (grantsFetched.current || !canView || stageNames.length === 0) return;
    grantsFetched.current = true;
    void loadGrants();
  }, [open, activeAxis, canView, stageNames, loadGrants]);

  // The Test/Sync CTAs live in the ConnectorHealthStrip (kept from the prior
  // wave) — the ingestion axis links/scrolls to it instead of duplicating them.
  const scrollToHealthStrip = useCallback(() => {
    const el = document.getElementById('connector-health-strip');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      toast('Return to the source overview to run Test / Sync on a connector.');
    }
  }, []);

  // --- Severities (blocker on real failures; grey when nothing is wired/run) ---
  const hasFailures =
    !!m && (m.failed_loads_7d > 0 || m.row_errors_7d > 0 || m.tasks_failed_1d > 0);
  const sourcesSeverity: AxisSeverity = !health
    ? 'idle'
    : health.overall === 'down'
      ? 'blocker'
      : health.overall === 'degraded'
        ? 'warn'
        : health.overall === 'healthy'
          ? 'ok'
          : 'idle';
  const ingestionSeverity: AxisSeverity = !m
    ? 'idle'
    : hasFailures
      ? 'blocker'
      : m.files_inserted_7d > 0 || m.active_pipes > 0
        ? 'ok'
        : 'idle';
  const governanceSeverity: AxisSeverity = Object.values(grants).some((g) => (g.count ?? 0) > 0)
    ? 'ok'
    : 'idle';
  const costSeverity: AxisSeverity = m && m.credits_used_7d > 0 ? 'ok' : 'idle';

  const historyEvents = useMemo(() => {
    return (health?.items ?? [])
      .map((item) => ({ item, ts: item.last_checked ? Date.parse(item.last_checked) : NaN }))
      .filter((e) => Number.isFinite(e.ts))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }, [health]);
  const historySeverity: AxisSeverity = historyEvents.length > 0 ? 'ok' : 'idle';

  const shownItems = useMemo(() => {
    const order: Record<ConnectorHealthItem['status'], number> = {
      down: 0,
      degraded: 1,
      stale: 2,
      unknown: 3,
      healthy: 4,
    };
    return [...(health?.items ?? [])].sort((a, b) => order[a.status] - order[b.status]).slice(0, 6);
  }, [health]);

  const axes: AxisDef[] = [
    {
      id: 'sources',
      label: 'Sources',
      railLabel: 'Sources',
      icon: Database,
      severity: sourcesSeverity,
      badge: health ? `${health.total_stages} stage${health.total_stages === 1 ? '' : 's'}` : undefined,
      render: () => (
        <div>
          {error && <FetchError message={error} onRetry={refresh} />}
          <SectionTitle>Connect</SectionTitle>
          <CockpitAction
            label="Add connection"
            icon={Plus}
            variant="primary"
            capable={canCreate}
            unavailableHint={createDeniedReason}
            onAction={async () => onAddConnection()}
            why={
              !health
                ? 'Source inventory has not answered yet — you can still start a new connection.'
                : health.total_stages === 0
                  ? 'No ingestion stages exist yet — connect your first data source to start loading.'
                  : `${health.total_stages} stage${health.total_stages === 1 ? '' : 's'} and ${
                      connectors === null ? '—' : connectors.length
                    } registered connector${connectors !== null && connectors.length === 1 ? '' : 's'} already live — add another source.`
            }
          />
          {loading && !health ? (
            <LoadingRows />
          ) : health ? (
            <>
              <SectionTitle>Inventory</SectionTitle>
              <AxisRow label="Stages" value={health.total_stages} />
              <AxisRow label="Pipes" value={health.total_pipes} />
              <AxisRow label="Registered connectors" value={connectors === null ? '—' : connectors.length} />
              <SectionTitle>Health</SectionTitle>
              <AxisRow label="Healthy" value={health.healthy} />
              {health.degraded > 0 && <AxisRow label="Paused pipes" value={health.degraded} danger />}
              {health.stale > 0 && <AxisRow label="Stale stages" value={health.stale} />}
              {shownItems.length > 0 && (
                <>
                  <SectionTitle>Status</SectionTitle>
                  <ul className="space-y-1.5">
                    {shownItems.map(({ id, name, kind, status, detail }) => (
                      <li key={id} className="flex items-center gap-2 text-sm" title={detail}>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${ITEM_DOT[status]}`} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{name}</span>
                        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                          {kind === 'pipe' ? 'Pipe' : 'Stage'} · {ITEM_LABEL[status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : !error ? (
            <EmptyNote
              title="No source inventory yet"
              detail="Connect a data source to see stages, pipes and connector health here."
            />
          ) : null}
        </div>
      ),
    },
    {
      id: 'ingestion',
      label: 'Ingestion',
      railLabel: 'Ingest',
      icon: Activity,
      severity: ingestionSeverity,
      badge: hasFailures ? 'failures' : undefined,
      render: () => (
        <div>
          <SectionTitle>Ingest</SectionTitle>
          {connectors === null ? (
            <LoadingRows />
          ) : connectors.length === 0 ? (
            <EmptyNote
              title="No registered connectors"
              detail="Force-sync appears here once a connector (Postgres, MySQL, Databricks…) is registered."
            />
          ) : (
            <div className="space-y-2">
              {connectors.slice(0, 2).map((c) => (
                <CockpitAction
                  key={c.id}
                  label={`Sync ${c.name}`}
                  icon={RefreshCw}
                  capable={canIngest}
                  unavailableHint={ingestDeniedReason}
                  successToast={`Sync started for ${c.name}`}
                  pingBell
                  onAction={() => syncConnector(c.id)}
                  onDone={refresh}
                  why={
                    hasFailures
                      ? `Failures reported in the last 7 days (${formatCount(m?.failed_loads_7d) ?? '0'} failed loads) — a forced sync re-runs the load now.`
                      : last
                        ? `Last load activity ${relativeTime(last.item.last_checked) ?? '—'} (${last.item.name}) — force a sync to pull fresher data.`
                        : 'No load activity reported in the current health window — trigger the first sync.'
                  }
                />
              ))}
            </div>
          )}
          <SectionTitle>Verify</SectionTitle>
          {connectors === null ? (
            <LoadingRows />
          ) : connectors.length === 0 ? (
            <EmptyNote
              title="Nothing to probe"
              detail="Connection tests appear here once a connector is registered."
            />
          ) : (
            <div className="space-y-2">
              {connectors.slice(0, 2).map((c) => (
                <CockpitAction
                  key={c.id}
                  label={`Test ${c.name}`}
                  icon={SignalHigh}
                  capable={canView}
                  unavailableHint={viewDeniedReason}
                  successToast={`${c.name} connection is reachable`}
                  onAction={async () => {
                    const res = await testConnector(c.id);
                    if (res.ok === false) {
                      throw new Error(res.message || `${c.name} connection test failed.`);
                    }
                    return res;
                  }}
                  why={
                    health && health.overall !== 'healthy' && health.overall !== 'unknown'
                      ? `Overall connector health is ${health.overall} — re-probe to confirm this source is reachable.`
                      : 'Non-mutating reachability probe — verify credentials before the next scheduled load.'
                  }
                />
              ))}
            </div>
          )}
          {connectors !== null && connectors.length > 2 && (
            <button
              type="button"
              onClick={scrollToHealthStrip}
              className="mt-2 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              +{connectors.length - 2} more connector{connectors.length - 2 === 1 ? '' : 's'} in the health strip
            </button>
          )}
          {loading && !m ? (
            <LoadingRows />
          ) : m ? (
            <>
              <SectionTitle>Loads — last 7 days</SectionTitle>
              <AxisRow label="Files ingested" value={formatCount(m.files_inserted_7d) ?? '—'} />
              <AxisRow label="Data ingested" value={formatBytes(m.bytes_inserted_7d) ?? '—'} />
              <AxisRow label="Active pipes" value={formatCount(m.active_pipes) ?? '—'} />
              <SectionTitle>Failures</SectionTitle>
              <AxisRow
                label="Failed loads (7d)"
                value={formatCount(m.failed_loads_7d) ?? '—'}
                danger={m.failed_loads_7d > 0}
              />
              <AxisRow
                label="Row errors (7d)"
                value={formatCount(m.row_errors_7d) ?? '—'}
                danger={m.row_errors_7d > 0}
              />
              <AxisRow
                label="Task failures (24h)"
                value={formatCount(m.tasks_failed_1d) ?? '—'}
                danger={m.tasks_failed_1d > 0}
              />
            </>
          ) : (
            <EmptyNote
              title="No ingestion activity reported"
              detail="The 7-day load roll-up is empty — ingest data or check connector health."
            />
          )}
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            The in-page Connector Health strip carries the full per-connector list; the roll-up
            above comes from the same health feed.
          </p>
        </div>
      ),
    },
    {
      id: 'governance',
      label: 'Governance',
      railLabel: 'Gov',
      icon: ShieldCheck,
      severity: governanceSeverity,
      render: () => (
        <div>
          <SectionTitle>Govern</SectionTitle>
          <CockpitAction
            label="Re-check stage grants"
            icon={ShieldCheck}
            capable={!viewDenied && stageNames.length > 0}
            unavailableHint={
              viewDenied
                ? viewDeniedReason
                : 'No ingestion stages yet — grants can be audited once a stage exists.'
            }
            successToast="Stage grant summaries refreshed"
            onAction={loadGrants}
            why={(() => {
              const loaded = stageNames.filter((n) => grants[n] && !grants[n].error).length;
              const total = stageNames.reduce((acc, n) => acc + (grants[n]?.count ?? 0), 0);
              return loaded > 0
                ? `${total} grant${total === 1 ? '' : 's'} across ${loaded} audited stage${loaded === 1 ? '' : 's'} — re-run the audit after any GRANT/REVOKE.`
                : 'Pull the live GRANT list for the first stages so access is verified, not assumed.';
            })()}
          />
          <SectionTitle>Stage grants</SectionTitle>
          {viewDenied ? (
            <EmptyNote
              title="Insufficient permission"
              detail='You lack the "view" permission on connect, so stage grants cannot be listed.'
            />
          ) : stageNames.length === 0 ? (
            <EmptyNote
              title="No stages to inspect"
              detail="Grant summaries appear here once at least one ingestion stage exists."
            />
          ) : (
            <ul className="space-y-1.5">
              {stageNames.map((name) => {
                const g = grants[name];
                return (
                  <li key={name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{name}</span>
                    {!g ? (
                      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">loading…</span>
                    ) : g.error ? (
                      <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400" title={g.error}>
                        unavailable
                      </span>
                    ) : (
                      <span className="shrink-0 font-semibold text-slate-900 dark:text-white">
                        {g.count === null ? '—' : `${g.count} grant${g.count === 1 ? '' : 's'}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {stageNames.length > 0 && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Showing the first {stageNames.length} stage{stageNames.length === 1 ? '' : 's'}.
            </p>
          )}
          <SectionTitle>PII</SectionTitle>
          <EmptyNote
            title="No PII scan has run"
            detail="PII classification is not wired for stage data yet — nothing to report."
          />
        </div>
      ),
    },
    {
      id: 'cost',
      label: 'Cost',
      railLabel: 'Cost',
      icon: Coins,
      severity: costSeverity,
      render: () => (
        <div>
          {m && m.credits_used_7d > 0 ? (
            <>
              <SectionTitle>Ingestion compute</SectionTitle>
              <AxisRow label="Credits used (7d)" value={m.credits_used_7d.toFixed(2)} />
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                From the data warehouse load-activity roll-up. Storage cost is not reported by this
                module.
              </p>
            </>
          ) : (
            <EmptyNote
              title="No cost feed for this module"
              detail="Connect Data does not report storage or compute cost yet. Ingestion credits appear here once loads run."
            />
          )}
        </div>
      ),
    },
    {
      id: 'history',
      label: 'History',
      railLabel: 'History',
      icon: History,
      severity: historySeverity,
      badge: historyEvents.length > 0 ? `${historyEvents.length} recent` : undefined,
      render: () => (
        <div>
          <SectionTitle>Recent activity</SectionTitle>
          {loading && !health ? (
            <LoadingRows />
          ) : historyEvents.length > 0 ? (
            <ul className="space-y-2">
              {historyEvents.map(({ item }) => (
                <li key={item.id} className="flex items-center gap-2 text-sm" title={item.detail}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ITEM_DOT[item.status]}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                    {item.kind === 'pipe' ? 'loaded' : 'updated'} {relativeTime(item.last_checked) ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote
              title="No recent activity"
              detail="No stage updates or pipe loads were reported in the current health window."
            />
          )}
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Timestamps come from the connector-health feed (stage updates and pipe loads).
          </p>
        </div>
      ),
    },
    {
      id: 'ai',
      label: 'AI helper',
      railLabel: 'AI',
      icon: Sparkles,
      severity: 'idle',
      render: () => (
        <div>
          <SectionTitle>Connect</SectionTitle>
          <CockpitAction
            label="Open the AI connector helper"
            icon={Sparkles}
            variant="primary"
            onAction={async () => onOpenAiHelper()}
            why={
              connectors !== null && connectors.length === 0
                ? 'No connector is registered yet — paste a connection string and the assistant identifies the right connector and pre-fills its form.'
                : 'Paste a connection string, a config blob or a plain-language description — the assistant matches the connector and pre-fills its configuration form (docked, not a popup).'
            }
          />
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Matching runs against the built-in connector catalog first; AI refinement is used only
            when it is reachable. Secrets you paste are never stored in the form for you.
          </p>
        </div>
      ),
    },
  ];

  return (
    <AxisCockpit
      axes={axes}
      open={open}
      activeAxis={activeAxis}
      onOpenAxis={onOpenAxis}
      onClose={onClose}
      widthClassName="w-[340px]"
      className={`h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    />
  );
}
