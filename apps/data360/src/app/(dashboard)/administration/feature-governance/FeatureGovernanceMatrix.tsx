'use client';

/**
 * FeatureGovernanceMatrix — the G5 admin surface: a module × feature matrix of
 * every governable addon (create / run / deploy / manage / govern capability),
 * reading the per-account entitlement state, with the governance-posture rollup
 * surfaced alongside. Toggles write back via
 * PUT /api/administration/entitlements/{module}/{feature_key} when the envelope
 * reports `can_govern`; otherwise the matrix is rendered read-only and labelled.
 *
 * Backed by app/modules/administration/router.py (ACCOUNTADMIN-gated). All
 * fetches go through apiClient; a not-deployed backend (404/501) degrades to a
 * quiet "not wired yet" state. null → "—".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Hammer,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';
import EmptyState from '@/components/ui/EmptyState';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  capabilityOf,
  CAPABILITY_LABEL,
  getEntitlements,
  getGovernancePosture,
  NotDeployedError,
  setEntitlement,
  type Capability,
  type EntitlementFeature,
  type EntitlementsMatrix,
  type GovernancePosture,
  type PostureRow,
} from '@/app/services/administration/entitlements';

type Phase = 'loading' | 'ready' | 'error' | 'not-deployed';

const CAP_TINT: Record<Capability, string> = {
  create: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30',
  run: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  deploy: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30',
  manage: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  govern: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
};

function CapBadge({ cap }: { cap: Capability }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        CAP_TINT[cap],
      )}
    >
      {CAPABILITY_LABEL[cap]}
    </span>
  );
}

/** Accessible enable/disable toggle. Disabled (read-only) when !canGovern. */
function Toggle({
  enabled,
  pending,
  disabled,
  onToggle,
  label,
}: {
  enabled: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled || pending}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
        (disabled || pending) && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-[18px]' : 'translate-x-1',
        )}
      />
      {pending && (
        <Loader2 className="absolute -right-5 h-3 w-3 animate-spin text-slate-400" aria-hidden />
      )}
    </button>
  );
}

export default function FeatureGovernanceMatrix() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<EntitlementsMatrix | null>(null);
  const [posture, setPosture] = useState<GovernancePosture | null>(null);
  const [canGovern, setCanGovern] = useState(false);
  // Per-cell pending + optimistic enabled overlay, keyed by `${module}:${key}`.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const [ent, post] = await Promise.all([getEntitlements(), getGovernancePosture()]);
      setMatrix(ent.matrix);
      setPosture(post.posture);
      setCanGovern(ent.canGovern || post.canGovern);
      setPhase('ready');
    } catch (e) {
      if (e instanceof NotDeployedError) {
        setPhase('not-deployed');
      } else {
        setError(getApiErrorMessage(e));
        setPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postureByModule = useMemo(() => {
    const m = new Map<string, PostureRow>();
    (posture?.posture ?? []).forEach((p) => m.set(p.module, p));
    return m;
  }, [posture]);

  const handleToggle = useCallback(
    async (feat: EntitlementFeature) => {
      if (!canGovern) return;
      const ck = `${feat.module}:${feat.feature_key}`;
      const next = !feat.enabled;
      setPending((p) => ({ ...p, [ck]: true }));
      setRowError((r) => {
        const { [ck]: _drop, ...rest } = r;
        return rest;
      });
      try {
        await setEntitlement(feat.module, feat.feature_key, { enabled: next });
        // Optimistic local apply (avoids a full reload flicker per cell).
        setMatrix((prev) => {
          if (!prev) return prev;
          const rows = prev.modules[feat.module] ?? [];
          const updated = rows.map((r) =>
            r.feature_key === feat.feature_key
              ? { ...r, enabled: next, source: 'override' as const }
              : r,
          );
          return { ...prev, modules: { ...prev.modules, [feat.module]: updated } };
        });
      } catch (e) {
        setRowError((r) => ({ ...r, [ck]: getApiErrorMessage(e) }));
      } finally {
        setPending((p) => {
          const { [ck]: _drop, ...rest } = p;
          return rest;
        });
      }
    },
    [canGovern],
  );

  // ── States ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <GlassPanel depth={1} radius="xl" className="flex items-center justify-center px-3 py-16">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading" />
      </GlassPanel>
    );
  }

  if (phase === 'not-deployed') {
    return (
      <GlassPanel depth={1} radius="xl" className="px-3 py-6 text-[12px] text-slate-400">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Feature governance is not wired yet for this account — the administration backend route is
          coming online.
        </span>
      </GlassPanel>
    );
  }

  if (phase === 'error') {
    return (
      <GlassPanel depth={1} radius="xl" className="px-3 py-8">
        <EmptyState
          icon={AlertTriangle}
          compact
          title="Could not load feature governance"
          description={error ?? 'Unexpected error.'}
          action={
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          }
        />
      </GlassPanel>
    );
  }

  const modules = matrix?.modules ?? {};
  const moduleSlugs = Object.keys(modules).sort();
  const totalFeatures = matrix?.feature_count ?? 0;
  const enabledCount = Object.values(modules)
    .flat()
    .filter((f) => f.enabled).length;

  if (moduleSlugs.length === 0) {
    return (
      <GlassPanel depth={1} radius="xl" className="px-3 py-8">
        <EmptyState icon={ShieldCheck} compact title="No governable features registered" />
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-3">
      {/* Posture summary row */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <SummaryCard
          icon={Hammer}
          label="Governable features"
          value={String(totalFeatures || enabledCount)}
          sub={`${moduleSlugs.length} modules`}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Enabled"
          value={`${enabledCount} / ${totalFeatures || enabledCount}`}
          sub="account-wide addons on"
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Bound policies"
          value={
            posture?.policy_bindings?.total_active != null
              ? String(posture.policy_bindings.total_active)
              : '—'
          }
          sub={
            posture?.policy_bindings?.objects_covered != null
              ? `${posture.policy_bindings.objects_covered} objects covered`
              : 'account-scoped'
          }
        />
        <SummaryCard
          icon={canGovern ? ShieldCheck : Lock}
          label="Your access"
          value={canGovern ? 'Govern' : 'Read-only'}
          sub={canGovern ? 'toggles are live' : 'admin role required to edit'}
        />
      </div>

      {!canGovern && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Read-only — only an account admin (ACCOUNTADMIN) can change feature governance. Toggles are
          shown but disabled.
        </div>
      )}

      <p className="px-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        Each row is a governable feature, tagged with the capability it gates (Create · Run · Deploy ·
        Manage · Govern, derived from its backend access gate). Enablement is per account; the
        granted roles, usage and bound-policy posture come from{' '}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">governance-posture</code>.
      </p>

      {/* Module × feature matrix */}
      <div className="space-y-3">
        {moduleSlugs.map((slug) => {
          const feats = modules[slug] ?? [];
          const p = postureByModule.get(slug);
          return (
            <GlassPanel key={slug} depth={1} radius="xl" className="overflow-hidden">
              {/* Module header with posture rollup */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold capitalize text-slate-800 dark:text-slate-100">
                    {slug.replace(/_/g, ' ')}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {p ? `${p.features_enabled}/${p.features_total} enabled` : `${feats.length} features`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {p?.granted_roles?.length ? (
                    p.granted_roles.map((role) => (
                      <span
                        key={role}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] italic text-slate-400">no role grants</span>
                  )}
                  {p?.usage ? (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        p.usage.error_rate > 0.05
                          ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                      )}
                      title={`${p.usage.requests} requests · ${p.usage.distinct_users} users`}
                    >
                      {p.usage.requests} req · {(p.usage.error_rate * 100).toFixed(1)}% err
                    </span>
                  ) : null}
                  {typeof p?.bound_policies === 'number' && (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                      {p.bound_policies} policies bound
                    </span>
                  )}
                </div>
              </div>

              {/* Feature rows */}
              <ul className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {feats.map((feat) => {
                  const ck = `${feat.module}:${feat.feature_key}`;
                  const cap = capabilityOf(feat.module, feat.feature_key);
                  return (
                    <li key={ck} className="flex items-start gap-3 px-3 py-2.5">
                      <div className="mt-0.5">
                        <Toggle
                          enabled={feat.enabled}
                          pending={Boolean(pending[ck])}
                          disabled={!canGovern}
                          onToggle={() => void handleToggle(feat)}
                          label={`${feat.enabled ? 'Disable' : 'Enable'} ${feat.label}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-medium text-slate-800 dark:text-slate-100">
                            {feat.label}
                          </span>
                          <CapBadge cap={cap} />
                          {feat.source === 'override' && (
                            <span className="text-[10px] text-slate-400" title={feat.updated_by ?? undefined}>
                              admin override
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                          {feat.description}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                          {feat.surface && (
                            <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                              {feat.surface}
                            </code>
                          )}
                          {feat.governed_by && <span>gate: {feat.governed_by}</span>}
                        </div>
                        {rowError[ck] && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" /> {rowError[ck]}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Hammer;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <GlassPanel depth={1} radius="xl" className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </GlassPanel>
  );
}
