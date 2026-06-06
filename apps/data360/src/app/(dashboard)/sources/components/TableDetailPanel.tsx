'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Badge, Button, Loader } from 'rizzui';
import {
  X, Columns3, RefreshCw, GitBranch, ArrowRight, Shield,
  AlertTriangle, ChevronRight, Clock, Package, FolderOpen, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getObject360,
  getObjectActions,
  recomputeObjectScores,
  objectIdFromTable,
  type Object360Response,
  type ObjectAction,
  type ActionsResponse,
} from '@/app/services/catalog';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';

interface TableDetailPanelProps {
  database: string;
  schema: string;
  table: string;
  objectType?: string;
  onClose: () => void;
}

type TabId = 'object' | 'product' | 'project' | 'dependencies';

export default function TableDetailPanel({
  database, schema, table, objectType = 'TABLE', onClose,
}: TableDetailPanelProps) {
  const [tab, setTab] = useState<TabId>('object');
  const [data360, setData360] = useState<Object360Response | null>(null);
  const [actions, setActions] = useState<ActionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<ObjectAction | null>(null);

  const objectId = objectIdFromTable(database, schema, table, objectType);
  const fqn = `${database}.${schema}.${table}`;

  const loadObject = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setActionsError(null);
    setData360(null);
    setActions(null);
    setActionResult(null);
    setRecomputeError(null);

    Promise.allSettled([
      getObject360(objectId),
      getObjectActions(objectId),
    ]).then(([d360, acts]) => {
      if (d360.status === 'fulfilled') setData360(d360.value);
      else setLoadError(getApiErrorMessage(d360.reason));
      if (acts.status === 'fulfilled') setActions(acts.value);
      else setActionsError(getApiErrorMessage(acts.reason));
      setLoading(false);
    });
  }, [objectId]);

  useEffect(() => {
    setTab('object');
    loadObject();
  }, [loadObject]);

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    setRecomputeError(null);
    try {
      await recomputeObjectScores(objectId);
      const fresh = await getObject360(objectId);
      setData360(fresh);
    } catch (err) {
      setRecomputeError(getApiErrorMessage(err));
    }
    setRecomputing(false);
  }, [objectId]);

  const executeAction = useCallback(async (action: ObjectAction) => {
    setExecutingAction(action.action_id);
    setActionResult(null);
    try {
      if (action.http.method === 'GET') {
        await apiClient.get(action.http.path);
      } else {
        await apiClient.post(action.http.path, action.body_hint || {});
      }
      setActionResult({ id: action.action_id, ok: true, message: `${action.label} completed` });
    } catch (err) {
      setActionResult({ id: action.action_id, ok: false, message: getApiErrorMessage(err) });
    }
    setExecutingAction(null);
  }, []);

  const handleAction = useCallback((action: ObjectAction) => {
    if (action.requires_confirm) {
      setPendingAction(action);
      return;
    }
    executeAction(action);
  }, [executeAction]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'object', label: 'Object', icon: <Columns3 className="h-3.5 w-3.5" /> },
    { id: 'product', label: 'Product', icon: <Package className="h-3.5 w-3.5" /> },
    { id: 'project', label: 'Projects', icon: <FolderOpen className="h-3.5 w-3.5" /> },
    { id: 'dependencies', label: 'Lineage', icon: <GitBranch className="h-3.5 w-3.5" /> },
  ];

  const actionGroups = useMemo(() => {
    if (!actions?.actions) return {};
    return actions.actions.reduce<Record<string, ObjectAction[]>>((acc, a) => {
      (acc[a.group] ||= []).push(a);
      return acc;
    }, {});
  }, [actions]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{table}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">{fqn}</p>

        {/* Score chips */}
        {data360?.scores && (
          <div className="flex gap-1.5 mt-2">
            <ScoreChip label="Gov" value={data360.scores.governance_object} />
            <ScoreChip label="Deps" value={data360.scores.governance_dependencies_avg} />
            {data360.persisted_scores?.scores.trust_score != null && (
              <ScoreChip label="Trust" value={data360.persisted_scores.scores.trust_score} />
            )}
            {data360.persisted_scores?.scores.quality_score != null && (
              <ScoreChip label="Quality" value={data360.persisted_scores.scores.quality_score} />
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-2 border-b border-gray-100 dark:border-gray-800 flex gap-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium border-b-2 transition-colors',
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content split: tiers left, actions right (stacked in panel) */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader size="lg" />
          </div>
        ) : !data360 ? (
          <div className="px-4 py-12 text-center" role="alert">
            <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto mb-3" />
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Could not load object details</p>
            {loadError && <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 break-words">{loadError}</p>}
            <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={loadObject}>
              <RefreshCw className="h-3 w-3" />Retry
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {tab === 'object' && <ObjectTier data={data360} onRecompute={handleRecompute} recomputing={recomputing} recomputeError={recomputeError} />}
            {tab === 'product' && <ProductTierCard tier={data360.tiers.product} />}
            {tab === 'project' && <ProjectTierCard tier={data360.tiers.project} />}
            {tab === 'dependencies' && <DependenciesTierCard tier={data360.tiers.dependencies} />}

            {/* Recommendations */}
            {data360.recommendations.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  Recommendations ({data360.recommendations.length})
                </h4>
                <div className="space-y-1.5">
                  {data360.recommendations.slice(0, 5).map((r) => (
                    <div key={r.reco_id} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <SeverityDot severity={r.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{r.title}</p>
                        {(r.rationale ?? r.explanation) && (
                          <p className="text-[10px] text-gray-500 line-clamp-1">{r.rationale ?? r.explanation}</p>
                        )}
                      </div>
                      {(r.feature ?? r.category) && (
                        <Badge size="sm" className="text-[9px] shrink-0">{r.feature ?? r.category}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FinOps — hidden when the slice is the ACCOUNT_USAGE-ungranted
                error variant (no queries_last_30d) instead of showing blanks. */}
            {data360.finops && data360.finops.queries_last_30d != null && (
              <div>
                <h4 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-2">FinOps (30d)</h4>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Queries" value={data360.finops.queries_last_30d} />
                  <MiniStat label="Users" value={data360.finops.distinct_users} />
                  <MiniStat label="Errors" value={data360.finops.errored_queries} alert={data360.finops.errored_queries > 0} />
                  {data360.finops.bytes_scanned_total != null && (
                    <MiniStat label="Scanned" value={fmtBytes(data360.finops.bytes_scanned_total)} />
                  )}
                  {data360.finops.credits_cloud_services != null && (
                    <MiniStat label="Credits" value={data360.finops.credits_cloud_services.toFixed(3)} />
                  )}
                </div>
              </div>
            )}

            {/* Inline Action Confirm Bar */}
            {pendingAction && (
              <div className={cn(
                'rounded-lg p-2 flex items-center gap-2',
                pendingAction.destructive
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : 'bg-amber-50 dark:bg-amber-950/30'
              )}>
                <span className={cn(
                  'text-xs flex-1',
                  pendingAction.destructive ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                )}>
                  {pendingAction.label}? {pendingAction.destructive ? 'This is destructive.' : 'Requires confirmation.'}
                </span>
                <button
                  className={cn(
                    'text-xs font-semibold hover:underline',
                    pendingAction.destructive ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                  )}
                  onClick={() => { const a = pendingAction; setPendingAction(null); executeAction(a); }}
                >
                  Confirm
                </button>
                <button
                  className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:underline"
                  onClick={() => setPendingAction(null)}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Last action result (inline, replaces toast) */}
            {actionResult && (
              <div
                role="status"
                className={cn(
                  'rounded-lg px-3 py-2 text-xs break-words',
                  actionResult.ok
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
                )}
              >
                {actionResult.message}
              </div>
            )}

            {/* Actions failed to load */}
            {actionsError && Object.keys(actionGroups).length === 0 && (
              <p role="alert" className="text-[10px] text-rose-600 dark:text-rose-400 break-words">
                Could not load actions: {actionsError}
              </p>
            )}

            {/* Server-driven Actions */}
            {Object.keys(actionGroups).length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-2">Actions</h4>
                {(actions?.groups || Object.keys(actionGroups)).map((group) => (
                  <div key={group} className="mb-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{group}</p>
                    <div className="space-y-1">
                      {actionGroups[group]?.map((action) => (
                        <button
                          key={action.action_id}
                          onClick={() => handleAction(action)}
                          disabled={!action.enabled || executingAction === action.action_id}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors border',
                            action.destructive
                              ? 'border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10'
                              : 'border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                            !action.enabled && 'opacity-50 cursor-not-allowed'
                          )}
                          title={action.disabled_reason || ''}
                        >
                          {executingAction === action.action_id
                            ? <Loader size="sm" className="h-3 w-3" />
                            : action.destructive
                              ? <AlertTriangle className="h-3 w-3" />
                              : <Zap className="h-3 w-3" />
                          }
                          <span className="flex-1 text-left">{action.label}</span>
                          <ChevronRight className="h-3 w-3 text-gray-300" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier cards
// ---------------------------------------------------------------------------

function ObjectTier({ data, onRecompute, recomputing, recomputeError }: {
  data: Object360Response; onRecompute: () => void; recomputing: boolean; recomputeError: string | null;
}) {
  const { identity, profiling, governance } = data.tiers.object;
  const persisted = data.persisted_scores;
  const sm = data.snowflake_metadata;
  const hasStorageMeta = !!sm && (
    sm.clustering_key != null || sm.retention_time_days != null ||
    sm.active_bytes != null || sm.time_travel_bytes != null || sm.failsafe_bytes != null
  );
  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Badge size="sm" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[9px]">{identity.type}</Badge>
          {identity.owner_role && <span className="text-[10px] text-gray-500">Owner: {identity.owner_role}</span>}
          {identity.is_secure && <Shield className="h-3 w-3 text-emerald-500" />}
        </div>
        {identity.created_at && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />Created {new Date(identity.created_at).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Profiling */}
      {profiling.available && (
        <div>
          <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Profile</h5>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Rows" value={profiling.rows != null ? profiling.rows.toLocaleString() : '—'} />
            <MiniStat label="Columns" value={profiling.columns} />
            <MiniStat label="Nulls" value={`${profiling.columns_with_nulls} / ${profiling.columns}`} alert={profiling.columns_with_nulls > 0} />
          </div>
          {profiling.bytes != null && (
            <p className="text-[10px] text-gray-400 mt-1">Size: {(profiling.bytes / 1024 / 1024).toFixed(1)} MB</p>
          )}
        </div>
      )}

      {/* Columns */}
      {profiling.per_column.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
            Columns ({profiling.per_column.length})
          </h5>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {profiling.per_column.map((col) => (
              <div key={col.column} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-gray-100 dark:border-gray-800">
                <span className="text-xs font-medium text-gray-900 dark:text-white flex-1 truncate">{col.column}</span>
                <span className="text-[9px] font-mono text-gray-400">{col.data_type}</span>
                {col.null_count > 0 && (
                  <span className="text-[9px] text-amber-600">{col.null_count}/{col.sample_total} null</span>
                )}
                {col.distinct_count === profiling.rows && profiling.rows != null && profiling.rows > 0 && (
                  <Badge size="sm" className="bg-amber-100 text-amber-700 text-[8px] px-1">PK?</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Governance */}
      <div>
        <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Governance</h5>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Sensitive" value={`${governance.masked_sensitive_columns} / ${governance.sensitive_columns} masked`} alert={governance.unprotected_sensitive_columns > 0} />
          <MiniStat label="Policies" value={governance.policy_count} />
          <MiniStat label="Tags" value={governance.tag_count} />
          <MiniStat label="RLS" value={governance.has_row_access_policy ? 'Active' : 'None'} />
        </div>
      </div>

      {/* Trust scores (persisted) — all six dimensions the recompute produces;
          the header chips only surface trust + quality. */}
      {persisted && (
        <div>
          <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Trust Scores</h5>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Quality" value={fmtScore(persisted.scores.quality_score)} />
            <MiniStat label="Governance" value={fmtScore(persisted.scores.governance_score)} />
            <MiniStat label="Modeling" value={fmtScore(persisted.scores.modeling_score)} />
            <MiniStat label="FinOps" value={fmtScore(persisted.scores.finops_score)} />
            <MiniStat label="ML-Ready" value={fmtScore(persisted.scores.ml_ready_score)} />
            <MiniStat label="Trust" value={fmtScore(persisted.scores.trust_score)} />
          </div>
        </div>
      )}

      {/* Snowflake storage & metadata (additive — snowflake_metadata block).
          Each field guarded: the live INFORMATION_SCHEMA read (clustering /
          retention) and the ACCOUNT_USAGE storage read (bytes split) populate
          independently and either can be absent. */}
      {hasStorageMeta && sm && (
        <div>
          <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Storage &amp; Metadata</h5>
          <div className="grid grid-cols-2 gap-2">
            {sm.clustering_key != null && (
              <MiniStat label="Clustering" value={sm.clustering_key} />
            )}
            {sm.retention_time_days != null && (
              <MiniStat label="Time Travel" value={`${sm.retention_time_days}d`} />
            )}
            {sm.active_bytes != null && (
              <MiniStat label="Active" value={fmtBytes(sm.active_bytes)} />
            )}
            {sm.time_travel_bytes != null && (
              <MiniStat label="Time-Travel" value={fmtBytes(sm.time_travel_bytes)} />
            )}
            {sm.failsafe_bytes != null && (
              <MiniStat label="Fail-Safe" value={fmtBytes(sm.failsafe_bytes)} />
            )}
          </div>
          {sm.last_ddl_at && (
            <p className="text-[10px] text-gray-400 mt-1">
              Last DDL: {new Date(sm.last_ddl_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Recompute */}
      <div>
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onRecompute} disabled={recomputing}>
          {recomputing ? <Loader size="sm" className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
          Recompute Scores
        </Button>
        {recomputeError && (
          <p role="alert" className="mt-1.5 text-[10px] text-rose-600 dark:text-rose-400 break-words">{recomputeError}</p>
        )}
      </div>
    </div>
  );
}

function ProductTierCard({ tier }: { tier: Object360Response['tiers']['product'] }) {
  if (!tier.matched) {
    return (
      <div className="text-center py-8">
        <Package className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-xs text-gray-500 mb-1">No product match detected</p>
        {tier.hint && <p className="text-[10px] text-gray-400">{tier.hint}</p>}
        {/* Was a no-op button; product creation/curation lives on the Data
            Products surface, so hand off there instead of a dead control. */}
        <Link href="/data-products">
          <Button size="sm" variant="outline" className="mt-3 gap-1.5">
            <Plus className="h-3 w-3" />Create Product
          </Button>
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
        <div className="flex items-center gap-2 mb-1">
          <Package className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{tier.label}</span>
        </div>
        {tier.category && <p className="text-[10px] text-gray-500">{tier.category}</p>}
        <div className="flex gap-2 mt-2">
          <Badge size="sm" className="text-[9px]">Matched by {tier.source}</Badge>
          {tier.catalog_hit && <Badge size="sm" className="bg-emerald-100 text-emerald-700 text-[9px]">In catalog</Badge>}
        </div>
      </div>
    </div>
  );
}

function ProjectTierCard({ tier }: { tier: Object360Response['tiers']['project'] }) {
  if (tier.count === 0) {
    return (
      <div className="text-center py-8">
        <FolderOpen className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-xs text-gray-500">No projects ship this object yet</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">{tier.count} project(s), {tier.deployment_count} deployment(s)</p>
      {tier.projects.map((p) => (
        <a
          key={p.project_id}
          href={`/explore-design?project=${p.project_id}`}
          className="block px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-900 dark:text-white">{p.project_name || p.project_id}</span>
            <div className="flex items-center gap-1.5">
              {p.environment && <Badge size="sm" className="text-[9px]">{p.environment}</Badge>}
              <ChevronRight className="h-3 w-3 text-gray-300" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
            <span>{p.deployment_count} deploys</span>
            {p.last_shipped_at && <span>Last: {new Date(p.last_shipped_at).toLocaleDateString()}</span>}
          </div>
        </a>
      ))}
    </div>
  );
}

function DependenciesTierCard({ tier }: { tier: Object360Response['tiers']['dependencies'] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-4 py-4">
        <div className="text-center">
          <p className="text-lg font-bold text-blue-600">{tier.upstream_count}</p>
          <p className="text-[10px] text-gray-500">Upstream</p>
        </div>
        <div className="flex items-center gap-1 text-gray-300">
          <ArrowRight className="h-4 w-4" />
          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <GitBranch className="h-4 w-4 text-gray-500" />
          </div>
          <ArrowRight className="h-4 w-4" />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-emerald-600">{tier.downstream_count}</p>
          <p className="text-[10px] text-gray-500">Downstream</p>
        </div>
      </div>

      {tier.rollup.governance_score_avg != null && (
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Avg Gov" value={tier.rollup.governance_score_avg} />
          <MiniStat label="Min Gov" value={tier.rollup.governance_score_min ?? '—'} />
          <MiniStat label="Max Gov" value={tier.rollup.governance_score_max ?? '—'} />
        </div>
      )}

      {tier.neighbours.length > 0 && (
        <div>
          <h5 className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Neighbours ({tier.neighbours_sampled})</h5>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {tier.neighbours.map((n) => (
              <div key={n.fqn} className="flex items-center justify-between px-2.5 py-1.5 rounded border border-gray-100 dark:border-gray-800">
                <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400 truncate flex-1">{n.fqn}</span>
                {n.governance_score != null && <ScoreChip label="" value={n.governance_score} compact />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function ScoreChip({ label, value, compact }: { label: string; value: number | null; compact?: boolean }) {
  if (value == null) return null;
  const color = value >= 80 ? 'emerald' : value >= 50 ? 'amber' : 'red';
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-full font-semibold',
      compact ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]',
      `bg-${color}-100 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-400`
    )}>
      {label && <span>{label}</span>}
      {Math.round(value)}
    </span>
  );
}

function fmtBytes(n: number): string {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtScore(n: number | null): string {
  return n == null ? '—' : String(Math.round(n));
}

function MiniStat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
      <p className="text-[9px] text-gray-500">{label}</p>
      <p className={cn('text-xs font-semibold', alert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white')}>
        {value}
      </p>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === 'high' || severity === 'critical' ? 'bg-red-500' : severity === 'medium' ? 'bg-amber-500' : 'bg-blue-400';
  return <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1', color)} />;
}

function Plus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
