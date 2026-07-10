'use client';

/**
 * DeployedProduction — the "deployed truth" summary at the top of the Release
 * axis. After a model is tested/deployed the cockpit must show WHAT IS LIVE,
 * not just the pipeline: this card aggregates, per open project,
 *
 *   1. the execution record   — GET /projects/{id}/deployments (status,
 *      environment, version, who approved / deployed and when);
 *   2. the deployed objects   — GET /explore-design/{id}/ddl-actions?status=SUCCESS,
 *      parsed from the executed DDL (view / table / dynamic table … + FQN);
 *   3. the live DE objects    — GET /explore-design/dynamic-tables + /streams
 *      scoped to the project's target db.schema (SHOW-based ⇒ cheap live row
 *      counts + lag/staleness — no per-object queries are added);
 *   4. the schedule state     — GET /explore-design/{id}/schedules.
 *
 * 4-state discipline (release/ui.tsx): skeletons until data lands, honest
 * empty copy when the project has never deployed, '—' for unknown values
 * (a plain VIEW has no cheap live row count — we never fabricate one), and
 * quiet degrade when an endpoint is absent. Refreshes on the same SSE cache
 * keys the release state uses. Advisor hints are derived from the loaded data
 * only — never invented.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Boxes,
  CalendarClock,
  Database,
  Info,
  PackageOpen,
  RefreshCw,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { Tooltip } from 'rizzui';
import { cn } from '@/lib/utils';
import {
  CACHE_KEYS,
  useOnCacheInvalidation,
} from '@/components/providers/CacheInvalidationProvider';
import { useCanPerform } from '@/hooks/useCanPerform';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import { getProject, listDeployments } from '@/app/services/api/projectsApi';
import { listDDLActions, listSchedules } from '@/app/services/api/exploreDesignApi';
import {
  listDynamicTables,
  listStreams,
  refreshDynamicTable,
  resumeDynamicTable,
  suspendDynamicTable,
  type DynamicTableInfo,
  type StreamInfo,
} from '@/app/services/explore-design/de-objects';
import type { Project, ProjectDeployment, Schedule } from '@/app/services/api/types';
import { SkeletonRows, relativeTime } from './ui';

// The unified route returns more than the FE type declares (live-verified on
// proj_8824118e59ad) — extend locally instead of widening the shared type.
type UnifiedDeployment = ProjectDeployment & {
  requested_at?: string | null;
  deployed_by?: string | null;
};

// ── Deployed-object parsing (from executed DDL) ──────────────────────────────

export interface DeployedObject {
  verb: 'created' | 'altered' | 'dropped';
  /** Normalized object type, e.g. 'VIEW' | 'DYNAMIC TABLE' | 'TABLE'. */
  objectType: string;
  /** Full name as written in the DDL (db.schema.name when qualified). */
  fqn: string;
  /** Bare object name (last FQN part, unquoted). */
  name: string;
  database: string | null;
  schema: string | null;
  executedAt: string | null;
  executedBy: string | null;
  sql: string;
}

const DDL_HEAD_RE =
  /^\s*(CREATE(?:\s+OR\s+REPLACE)?|ALTER|DROP)\s+(?:TRANSIENT\s+|SECURE\s+|TEMPORARY\s+|GLOBAL\s+|LOCAL\s+)*(DYNAMIC\s+TABLE|EVENT\s+TABLE|HYBRID\s+TABLE|ICEBERG\s+TABLE|MATERIALIZED\s+VIEW|VIEW|TABLE|STREAM|TASK|ALERT|PIPE|FUNCTION|PROCEDURE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?("?[\w$]+"?(?:\s*\.\s*"?[\w$]+"?){0,2})/i;

/** Parse one executed DDL statement into a deployed-object row. Returns null
 *  for statements that don't target a nameable object (grants, comments…). */
export function parseDeployedObject(
  sql: string,
  executedAt: string | null,
  executedBy: string | null,
): DeployedObject | null {
  const m = DDL_HEAD_RE.exec(sql);
  if (!m) return null;
  const head = m[1].toUpperCase();
  const verb: DeployedObject['verb'] = head.startsWith('CREATE')
    ? 'created'
    : head === 'ALTER'
      ? 'altered'
      : 'dropped';
  const objectType = m[2].toUpperCase().replace(/\s+/g, ' ');
  const fqn = m[3].replace(/\s*\.\s*/g, '.');
  const parts = fqn.split('.').map((p) => p.replace(/^"|"$/g, ''));
  const name = parts[parts.length - 1];
  return {
    verb,
    objectType,
    fqn,
    name,
    database: parts.length === 3 ? parts[0] : null,
    schema: parts.length === 3 ? parts[1] : parts.length === 2 ? parts[0] : null,
    executedAt,
    executedBy,
    sql,
  };
}

// ── Small presentational helpers ─────────────────────────────────────────────

const OBJECT_TYPE_CLASS: Record<string, string> = {
  VIEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'MATERIALIZED VIEW': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  TABLE: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  'DYNAMIC TABLE': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'EVENT TABLE': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'HYBRID TABLE': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  STREAM: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  TASK: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

function fmtRows(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString();
}

/** Section title row with an axis-summary info icon (clear per-block tooltip). */
function SectionTitle({ icon: Icon, title, info, right }: {
  icon: React.ElementType;
  title: string;
  info: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-blue-500" aria-hidden />
      <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</h4>
      <Tooltip content={<span className="block max-w-[260px] text-left">{info}</span>} placement="top">
        <Info
          className="h-3 w-3 cursor-help text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
          aria-label={`About: ${title}`}
        />
      </Tooltip>
      {right && <span className="ml-auto flex items-center gap-1.5">{right}</span>}
    </div>
  );
}

const DEPLOY_STATUS_PILL: Record<string, string> = {
  deployed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  pending_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ── Component ────────────────────────────────────────────────────────────────

/** SSE keys whose invalidation can change the deployed truth. */
const PRODUCTION_CACHE_KEYS: ReadonlySet<string> = new Set([
  CACHE_KEYS.DEPLOYMENTS,
  CACHE_KEYS.DYNAMIC_TABLES,
  CACHE_KEYS.STREAMS,
  CACHE_KEYS.PROJECTS,
]);

export default function DeployedProduction({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<UnifiedDeployment[]>([]);
  const [objects, setObjects] = useState<DeployedObject[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [dynamicTables, setDynamicTables] = useState<DynamicTableInfo[]>([]);
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [scope, setScope] = useState<{ database: string; schema: string } | null>(null);

  const canExecute = useCanPerform('explore_design', 'execute', projectId);
  const capable = canExecute.allowed || canExecute.loading;

  // Out-of-order guard on fast project switches (useReleaseState idiom).
  const requestKeyRef = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    const key = `${projectId}:${Date.now()}`;
    requestKeyRef.current = key;
    setLoading(true);

    const [projectRes, deploymentsRes, ddlRes, schedulesRes] = await Promise.allSettled([
      getProject(projectId),
      listDeployments(projectId),
      listDDLActions(projectId, { status: 'SUCCESS' }),
      listSchedules(projectId),
    ]);
    if (requestKeyRef.current !== key) return; // stale response

    const proj = projectRes.status === 'fulfilled' ? projectRes.value : null;
    setProject(proj);

    const deps =
      deploymentsRes.status === 'fulfilled' && Array.isArray(deploymentsRes.value.deployments)
        ? (deploymentsRes.value.deployments as UnifiedDeployment[])
        : [];
    setDeployments(deps);

    // Executed DDL → deployed objects, deduped to the LATEST statement per FQN
    // (a re-deploy replaces the previous row instead of stacking a duplicate).
    const actions = ddlRes.status === 'fulfilled' ? ddlRes.value.actions ?? [] : [];
    const byFqn = new Map<string, DeployedObject>();
    for (const a of actions) {
      const obj = parseDeployedObject(a.ddl_sql ?? '', a.timestamp ?? null, a.username ?? null);
      if (!obj) continue;
      const prev = byFqn.get(obj.fqn.toUpperCase());
      const prevTs = prev?.executedAt ? Date.parse(prev.executedAt) : -1;
      const curTs = obj.executedAt ? Date.parse(obj.executedAt) : 0;
      if (!prev || curTs >= prevTs) byFqn.set(obj.fqn.toUpperCase(), obj);
    }
    const objs = [...byFqn.values()].filter((o) => o.verb !== 'dropped');
    setObjects(objs);

    setSchedules(
      schedulesRes.status === 'fulfilled' ? (schedulesRes.value.schedules ?? []) as Schedule[] : [],
    );

    // Project scope for the SHOW-based live reads: prefer the deployed objects'
    // own db.schema, else the model's source tables. No scope → skip the live
    // section entirely (never guess a schema).
    const fromObjects = objs.find((o) => o.database && o.schema);
    const src = (proj?.metadata as { source_tables?: Array<{ database?: string; schema?: string }> } | null)
      ?.source_tables?.[0];
    const liveScope = fromObjects
      ? { database: fromObjects.database as string, schema: fromObjects.schema as string }
      : src?.database && src?.schema
        ? { database: src.database, schema: src.schema }
        : null;
    setScope(liveScope);

    if (liveScope) {
      const [dtRes, stRes] = await Promise.allSettled([
        listDynamicTables(liveScope.database, liveScope.schema),
        listStreams(liveScope.database, liveScope.schema),
      ]);
      if (requestKeyRef.current !== key) return;
      const dts = dtRes.status === 'fulfilled'
        ? dtRes.value.dynamic_tables ?? dtRes.value.data ?? dtRes.value.items ?? []
        : [];
      const sts = stRes.status === 'fulfilled'
        ? stRes.value.streams ?? stRes.value.data ?? stRes.value.items ?? []
        : [];
      setDynamicTables(dts);
      setStreams(sts);
    } else {
      setDynamicTables([]);
      setStreams([]);
    }

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useOnCacheInvalidation(PRODUCTION_CACHE_KEYS, () => {
    void fetchAll();
  });

  // Latest deployment (deployed_at, else requested/created) — the execute state.
  const latest = useMemo(() => {
    const ts = (d: UnifiedDeployment) =>
      Date.parse(d.deployed_at ?? d.requested_at ?? d.created_at ?? '') || 0;
    return [...deployments].sort((a, b) => ts(b) - ts(a))[0] ?? null;
  }, [deployments]);

  // Live SHOW rows keyed by bare name — gives cheap row counts for deployed
  // objects that ARE dynamic tables. Plain views have no cheap count → '—'.
  const dtByName = useMemo(() => {
    const m = new Map<string, DynamicTableInfo>();
    for (const dt of dynamicTables) m.set(String(dt.name).toUpperCase(), dt);
    return m;
  }, [dynamicTables]);

  const neverDeployed = !loading && deployments.length === 0 && objects.length === 0;

  // Advisor — honest heuristics from the data in hand (no fabricated AI call).
  const advisorHints = useMemo(() => {
    if (loading) return [];
    const hints: string[] = [];
    if (neverDeployed) {
      hints.push('This model has never been deployed — run the release pipeline below to make it live.');
      return hints;
    }
    if (String(latest?.status ?? '').toLowerCase() === 'failed') {
      hints.push('The last deployment failed — open Recovery to inspect the error and roll back or retry.');
    }
    for (const dt of dynamicTables) {
      if (String(dt.scheduling_state ?? '').toUpperCase() === 'SUSPENDED') {
        hints.push(`Dynamic table ${dt.name} is suspended — its data is no longer refreshing. Resume it to honour the ${dt.target_lag ?? 'configured'} lag.`);
      }
    }
    for (const st of streams) {
      if (String(st.stale) === 'true' || st.stale === true) {
        hints.push(`Stream ${st.name} is stale — consumers stopped reading it; recreate or consume it before its retention expires.`);
      }
    }
    if (schedules.length === 0 && dynamicTables.length === 0 && deployments.length > 0) {
      hints.push('No refresh automation: no deployment schedule and no dynamic table. Production data only changes when you redeploy.');
    }
    return hints.slice(0, 3);
  }, [loading, neverDeployed, latest, dynamicTables, streams, schedules.length, deployments.length]);

  return (
    <section
      aria-label="Deployed production state"
      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60"
    >
      <SectionTitle
        icon={Rocket}
        title="In production"
        info="The deployed truth for this project: the latest execution record, the objects the deploys created in the warehouse, live dynamic tables / streams in the target schema, and the schedule state."
        right={
          <button
            type="button"
            onClick={() => void fetchAll()}
            disabled={loading}
            aria-label="Refresh production state"
            title="Refresh production state"
            className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} aria-hidden />
          </button>
        }
      />

      {loading ? (
        <div className="mt-3">
          <SkeletonRows rows={4} />
        </div>
      ) : neverDeployed ? (
        <div className="mt-3 flex flex-col items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center dark:border-slate-600 dark:bg-slate-800/40">
          <PackageOpen className="h-6 w-6 text-slate-300 dark:text-slate-600" aria-hidden />
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Never deployed
          </p>
          <p className="max-w-[320px] text-[11px] text-slate-400 dark:text-slate-500">
            Nothing from this project is live in the warehouse yet. Prepare and
            ship a release below — the deployed objects will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* ── 1. Execution record ── */}
          {latest && (
            <div className="rounded-md bg-slate-50 p-2.5 dark:bg-slate-800/50">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    DEPLOY_STATUS_PILL[String(latest.status).toLowerCase()] ??
                      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                  )}
                >
                  {String(latest.status)}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {latest.environment ?? '—'}
                  {project?.deployment_version != null && <> · v{project.deployment_version}</>}
                  {latest.deployed_at && <> · {relativeTime(latest.deployed_at)}</>}
                </span>
                <Tooltip
                  content={
                    <span className="block max-w-[240px] text-left">
                      Requested by {latest.requested_by ?? '—'}, approved by{' '}
                      {latest.approved_by ?? '—'}, executed by{' '}
                      {latest.deployed_by ?? latest.requested_by ?? '—'}.{' '}
                      {deployments.length} deployment
                      {deployments.length === 1 ? '' : 's'} recorded on this project.
                    </span>
                  }
                  placement="top"
                >
                  <Info className="h-3 w-3 cursor-help text-slate-300 hover:text-slate-500 dark:text-slate-600" aria-label="Deployment provenance" />
                </Tooltip>
              </div>
            </div>
          )}

          {/* ── 2. Deployed objects (per-product info) ── */}
          <div>
            <SectionTitle
              icon={Boxes}
              title={`Deployed objects (${objects.length})`}
              info="Objects created in the warehouse by this project's executed releases — parsed from the deployed DDL. Live row counts are shown where Snowflake exposes them cheaply (dynamic tables); plain views show '—' rather than an invented number."
            />
            {objects.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                The recorded deployments carry no object-level DDL — nothing to list here.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {objects.map((o) => {
                  const live = dtByName.get(o.name.toUpperCase());
                  const liveRows = o.objectType === 'DYNAMIC TABLE'
                    ? (live?.rows as number | undefined) ?? null
                    : null;
                  return (
                    <li
                      key={o.fqn}
                      className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 dark:border-slate-700/60"
                    >
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                          OBJECT_TYPE_CLASS[o.objectType] ??
                            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                        )}
                      >
                        {o.objectType}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700 dark:text-slate-200"
                        title={o.fqn}
                      >
                        {o.name}
                      </span>
                      {liveRows != null && (
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          {fmtRows(liveRows)} rows
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                        {o.verb} {o.executedAt ? relativeTime(o.executedAt) : ''}
                      </span>
                      <Tooltip
                        content={
                          <span className="block max-w-[280px] text-left">
                            <span className="font-semibold">{o.fqn}</span>
                            <br />
                            {o.verb} by {o.executedBy ?? '—'}
                            {o.executedAt ? ` · ${relativeTime(o.executedAt)}` : ''}.
                            <br />
                            <span className="font-mono text-[10px] opacity-80">
                              {o.sql.length > 220 ? `${o.sql.slice(0, 220)}…` : o.sql}
                            </span>
                          </span>
                        }
                        placement="top"
                      >
                        <Info className="h-3 w-3 shrink-0 cursor-help text-slate-300 hover:text-slate-500 dark:text-slate-600" aria-label={`Details for ${o.name}`} />
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── 3. Live DE objects in the project scope ── */}
          {scope && (
            <div>
              <SectionTitle
                icon={Database}
                title={`Live in ${scope.database}.${scope.schema}`}
                info="Dynamic tables and streams currently live in this project's target schema (from SHOW — cheap metadata, includes real row counts and refresh lag). The schema can also hold objects from other projects."
              />
              {dynamicTables.length === 0 && streams.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  No dynamic tables or streams in this schema.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {dynamicTables.map((dt) => {
                    const suspended = String(dt.scheduling_state ?? '').toUpperCase() === 'SUSPENDED';
                    return (
                      <li
                        key={`dt-${dt.name}`}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-100 px-2 py-1.5 dark:border-slate-700/60"
                      >
                        <span className="shrink-0 rounded bg-cyan-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                          Dynamic
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700 dark:text-slate-200" title={dt.name}>
                          {dt.name}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          {fmtRows(dt.rows as number | undefined)} rows
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                          lag {dt.target_lag ?? '—'}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                            suspended
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                          )}
                        >
                          {suspended ? 'suspended' : 'active'}
                        </span>
                        {/* Contextual selective CTAs — honest gating via the shared
                            InsightActionButton (self-disables on 404/501 & RBAC). */}
                        <span className="flex shrink-0 items-center gap-1">
                          <InsightActionButton
                            label="Refresh"
                            icon={RefreshCw}
                            size="sm"
                            capable={capable}
                            successToast={`Refresh triggered for ${dt.name}`}
                            unavailableHint="Your role cannot trigger refreshes here"
                            onAction={() => refreshDynamicTable(dt.name, scope.database, scope.schema)}
                            onDone={() => void fetchAll()}
                          />
                          <InsightActionButton
                            label={suspended ? 'Resume' : 'Suspend'}
                            icon={Activity}
                            size="sm"
                            capable={capable}
                            successToast={`${dt.name} ${suspended ? 'resumed' : 'suspended'}`}
                            unavailableHint="Your role cannot change refresh state here"
                            confirm={
                              suspended
                                ? undefined
                                : {
                                    title: `Suspend ${dt.name}?`,
                                    body: 'The dynamic table will stop refreshing until resumed — consumers keep reading progressively staler data.',
                                    variant: 'warning',
                                  }
                            }
                            onAction={() =>
                              suspended
                                ? resumeDynamicTable(dt.name, scope.database, scope.schema)
                                : suspendDynamicTable(dt.name, scope.database, scope.schema)
                            }
                            onDone={() => void fetchAll()}
                          />
                        </span>
                      </li>
                    );
                  })}
                  {streams.map((st) => {
                    const stale = String(st.stale) === 'true' || st.stale === true;
                    return (
                      <li
                        key={`st-${st.name}`}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-100 px-2 py-1.5 dark:border-slate-700/60"
                      >
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          Stream
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700 dark:text-slate-200" title={st.name}>
                          {st.name}
                        </span>
                        <span className="min-w-0 max-w-[180px] shrink truncate text-[10px] text-slate-400 dark:text-slate-500" title={String(st.table_name ?? '')}>
                          on {String(st.table_name ?? '—').split('.').pop()}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                            stale
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                          )}
                        >
                          {stale ? 'stale' : 'fresh'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ── 4. Schedule state ── */}
          <div>
            <SectionTitle
              icon={CalendarClock}
              title={`Schedule (${schedules.length})`}
              info="Scheduled deployments registered for this project. When empty, production only changes on a manual deploy (dynamic tables still self-refresh on their target lag)."
            />
            {schedules.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                No deployment schedule — releases ship manually.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {schedules.map((s, i) => (
                  <li
                    key={s.schedule_id ?? i}
                    className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-[11px] text-slate-600 dark:border-slate-700/60 dark:text-slate-300"
                  >
                    <CalendarClock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {s.cron_expression || s.task_name || 'Scheduled deployment'}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-slate-400">
                      {s.status ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Advisor (derived from the loaded data — never invented) ── */}
          {advisorHints.length > 0 && (
            <div className="rounded-md border border-purple-100 bg-purple-50/40 p-2.5 dark:border-purple-900/40 dark:bg-purple-900/10">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-purple-500" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                  Advisor
                </span>
                <Tooltip
                  content={<span className="block max-w-[240px] text-left">Recommendations derived from this project&apos;s live production state — refresh lag, stream staleness and deployment outcomes.</span>}
                  placement="top"
                >
                  <Info className="h-3 w-3 cursor-help text-purple-300 hover:text-purple-500" aria-label="About advisor recommendations" />
                </Tooltip>
              </div>
              <ul className="mt-1 space-y-0.5">
                {advisorHints.map((h) => (
                  <li key={h} className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
