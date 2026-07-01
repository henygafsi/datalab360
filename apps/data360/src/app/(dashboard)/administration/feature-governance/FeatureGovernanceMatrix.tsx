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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronsUpDown,
  Gauge,
  Hammer,
  Loader2,
  Lock,
  Minus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';
import { dash } from '@/app/shared/ui/format';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pager, { usePagination } from '@/components/ui/Pager';
import ExportButton from '@/components/ui/ExportButton';
import { type ReportInput } from '@/lib/export-report';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
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

/** Sortable columns of the entitlement table. */
type SortKey = 'module' | 'feature' | 'status';
type SortDir = 'asc' | 'desc';

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
  // Per-module bulk action in flight, keyed by module slug.
  const [bulkPending, setBulkPending] = useState<Record<string, boolean>>({});
  // Pending "Disable all" confirmation — bulk-disable turns a whole module's
  // governance features off account-wide (blast radius), so it confirms first
  // (mirrors the per-role template-apply confirm). Enable-all stays direct.
  const [confirmDisableAll, setConfirmDisableAll] = useState<{
    slug: string;
    feats: EntitlementFeature[];
  } | null>(null);

  // ── Sort ─────────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('module');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      // Status defaults to "enabled-first" feel via desc; others asc.
      setSortDir(key === 'status' ? 'desc' : 'asc');
      return key;
    });
  }, []);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // debounced
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  // When the gaps CTA is active, only disabled features are shown.
  const [gapsOnly, setGapsOnly] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Action-RBAC seam. `can_govern` from the endpoint envelope is the AUTHORITATIVE
  // gate for this exact write; useCanPerform is layered as a SECONDARY signal only.
  // We never let it veto a backend-cleared admin (the hook has no admin bypass and
  // would otherwise lock out an ACCOUNTADMIN whose /my-permissions omits the key),
  // so the effective gate is OR, not AND.
  const govPerm = useCanPerform('gouvernance', 'grant');
  // `!govPerm.error` keeps a my-permissions OUTAGE (which fail-opens to allowed)
  // from handing toggles to a non-govern user — the backend PUT still rejects, but
  // we don't want the UI to imply edit access. The lockout case (my-permissions
  // SUCCEEDS but `can_govern` is wrongly false) is still covered.
  const canEdit = canGovern || (govPerm.allowed && !govPerm.loading && !govPerm.error);

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

  // ── Filter + sort pipeline (memoized ABOVE the early returns so the
  // pagination hook below is never called conditionally). Null-safe when the
  // matrix hasn't loaded yet. `.filter()`/`.sort()` operate on fresh arrays, so
  // this never mutates `matrix`.
  const { filteredModules, filteredSlugs, shownCount } = useMemo(() => {
    const mods = matrix?.modules ?? {};
    const slugs = Object.keys(mods).sort();
    const matches = (f: EntitlementFeature): boolean => {
      if (gapsOnly && f.enabled) return false;
      if (moduleFilter && f.module !== moduleFilter) return false;
      if (search) {
        const hay = `${f.module} ${f.feature_key} ${f.label} ${f.description ?? ''} ${
          f.surface ?? ''
        }`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    };
    const byModule: Record<string, EntitlementFeature[]> = {};
    let shown = 0;
    for (const slug of slugs) {
      const kept = (mods[slug] ?? []).filter(matches);
      if (kept.length) {
        byModule[slug] = kept;
        shown += kept.length;
      }
    }
    // Sorting NEVER breaks grouping: feature/status sorts reorder rows WITHIN
    // each module group; module sort reorders the groups themselves.
    const dirMul = sortDir === 'asc' ? 1 : -1;
    const orderedSlugs = Object.keys(byModule).sort((a, b) => {
      if (sortKey === 'module') return a.localeCompare(b) * dirMul;
      return a.localeCompare(b); // stable group order for feature/status sorts
    });
    for (const slug of orderedSlugs) {
      const rows = byModule[slug];
      if (!rows) continue;
      if (sortKey === 'feature') {
        rows.sort((a, b) => a.label.localeCompare(b.label) * dirMul);
      } else if (sortKey === 'status') {
        rows.sort(
          (a, b) =>
            (Number(a.enabled) - Number(b.enabled)) * dirMul || a.label.localeCompare(b.label),
        );
      } else {
        rows.sort((a, b) => a.label.localeCompare(b.label));
      }
    }
    return { filteredModules: byModule, filteredSlugs: orderedSlugs, shownCount: shown };
  }, [matrix, search, moduleFilter, gapsOnly, sortKey, sortDir]);

  // Paginate by MODULE GROUP so each module's coverage meter + bulk actions stay
  // whole on a page. 6 modules per page → scroll-free.
  const modulePager = usePagination(filteredSlugs, 6);

  /**
   * Apply an enabled-state (and source) to one feature row in the matrix,
   * immutably. `source` is passed explicitly so a rollback restores the row's
   * original provenance — not a stale "override" badge.
   */
  const patchRow = useCallback(
    (module: string, featureKey: string, enabled: boolean, source: EntitlementFeature['source']) => {
      setMatrix((prev) => {
        if (!prev) return prev;
        const rows = prev.modules[module] ?? [];
        const updated = rows.map((r) =>
          r.feature_key === featureKey ? { ...r, enabled, source } : r,
        );
        return { ...prev, modules: { ...prev.modules, [module]: updated } };
      });
    },
    [],
  );

  const handleToggle = useCallback(
    async (feat: EntitlementFeature) => {
      if (!canEdit) return;
      const ck = `${feat.module}:${feat.feature_key}`;
      const prev = feat.enabled;
      const prevSource = feat.source;
      const next = !prev;
      setPending((p) => ({ ...p, [ck]: true }));
      setRowError((r) => {
        const { [ck]: _drop, ...rest } = r;
        return rest;
      });
      // Optimistic: apply immediately (as an admin override), roll back on error.
      patchRow(feat.module, feat.feature_key, next, 'override');
      try {
        await setEntitlement(feat.module, feat.feature_key, { enabled: next });
        toast.success(`${feat.label} ${next ? 'enabled' : 'disabled'}`);
      } catch (e) {
        const msg = getApiErrorMessage(e);
        patchRow(feat.module, feat.feature_key, prev, prevSource); // rollback (incl. source)
        setRowError((r) => ({ ...r, [ck]: msg }));
        toast.error(`Could not ${next ? 'enable' : 'disable'} ${feat.label}: ${msg}`);
      } finally {
        setPending((p) => {
          const { [ck]: _drop, ...rest } = p;
          return rest;
        });
      }
    },
    [canEdit, patchRow],
  );

  /**
   * Bulk enable/disable a set of feature rows (one module group). No bulk
   * endpoint exists, so we fan out per-feature PUTs — but only for rows that
   * actually change state (no re-asserting the current value). Each row is
   * applied optimistically and rolled back INDIVIDUALLY on its own failure, so a
   * partial failure leaves the succeeded rows toggled. One summary toast.
   */
  const handleBulk = useCallback(
    async (module: string, feats: EntitlementFeature[], next: boolean) => {
      if (!canEdit) return;
      const targets = feats.filter((f) => f.enabled !== next);
      if (targets.length === 0) {
        toast(`All shown ${module.replace(/_/g, ' ')} features already ${next ? 'enabled' : 'disabled'}`);
        return;
      }
      setBulkPending((b) => ({ ...b, [module]: true }));
      setPending((p) => {
        const nextP = { ...p };
        targets.forEach((f) => {
          nextP[`${f.module}:${f.feature_key}`] = true;
        });
        return nextP;
      });
      // Optimistic: flip every target now.
      targets.forEach((f) => patchRow(f.module, f.feature_key, next, 'override'));

      const results = await Promise.allSettled(
        targets.map(async (f) => {
          try {
            await setEntitlement(f.module, f.feature_key, { enabled: next });
          } catch (e) {
            // Roll back THIS row only, restoring its original state + source.
            patchRow(f.module, f.feature_key, f.enabled, f.source);
            setRowError((r) => ({ ...r, [`${f.module}:${f.feature_key}`]: getApiErrorMessage(e) }));
            throw e;
          }
        }),
      );

      setPending((p) => {
        const nextP = { ...p };
        targets.forEach((f) => {
          delete nextP[`${f.module}:${f.feature_key}`];
        });
        return nextP;
      });
      setBulkPending((b) => {
        const { [module]: _drop, ...rest } = b;
        return rest;
      });

      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = targets.length - failed;
      const verb = next ? 'enabled' : 'disabled';
      if (failed === 0) {
        toast.success(`${ok} ${module.replace(/_/g, ' ')} feature${ok === 1 ? '' : 's'} ${verb}`);
      } else if (ok === 0) {
        toast.error(`Could not ${next ? 'enable' : 'disable'} ${failed} feature${failed === 1 ? '' : 's'}`);
      } else {
        toast.error(`${ok} ${verb}, ${failed} failed`);
      }
    },
    [canEdit, patchRow],
  );

  // ── States ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading feature governance">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassPanel key={i} depth={1} radius="xl" className="px-3 py-2.5">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
              <div className="mt-2 h-5 w-16 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
              <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-slate-200/50 dark:bg-slate-700/40" />
            </GlassPanel>
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <GlassPanel key={i} depth={1} radius="xl" className="overflow-hidden">
            <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
            </div>
            <div className="space-y-3 px-3 py-3">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-5 w-9 animate-pulse rounded-full bg-slate-200/70 dark:bg-slate-700/50" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
                    <div className="h-2.5 w-2/3 animate-pulse rounded bg-slate-200/50 dark:bg-slate-700/40" />
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        ))}
      </div>
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
  const allFeatures = Object.values(modules).flat();
  const totalFeatures = matrix?.feature_count || allFeatures.length;
  const enabledCount = allFeatures.filter((f) => f.enabled).length;
  // Gaps = governable features currently disabled for this account.
  const gapsCount = allFeatures.filter((f) => !f.enabled).length;
  // Coverage = share of features enabled; "—" when there's nothing to measure.
  const coveragePct =
    totalFeatures > 0 ? Math.round((enabledCount / totalFeatures) * 100) : null;

  if (moduleSlugs.length === 0 || totalFeatures === 0) {
    return (
      <GlassPanel depth={1} radius="xl" className="px-3 py-8">
        <EmptyState
          icon={ShieldCheck}
          compact
          title="No governable features registered"
          description="When modules register governable addons, they will appear here as a per-account enablement matrix."
        />
      </GlassPanel>
    );
  }

  // The filter + sort pipeline (incl. filteredModules / filteredSlugs / shownCount)
  // is memoized above, before the early returns, so the pagination hook is never
  // conditional. Page the module groups via `modulePager`.
  const pagedSlugs = modulePager.slice;
  const filtersActive = Boolean(search || moduleFilter || gapsOnly);
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setModuleFilter(null);
    setGapsOnly(false);
  };

  // Snapshot the CURRENT filtered matrix (full filtered set across ALL module
  // groups, not just the paginated page) to CSV.
  const buildReport = (): ReportInput => {
    const rows: (string | number | null)[][] = [];
    for (const slug of filteredSlugs) {
      for (const f of filteredModules[slug] ?? []) {
        rows.push([
          f.module,
          f.label,
          f.enabled ? 'enabled' : 'disabled',
          f.governed_by || null,
          f.surface || null,
        ]);
      }
    }
    return {
      title: 'Feature Governance',
      meta: [
        { label: 'Generated at', value: new Date().toISOString() },
        { label: 'Search', value: search || null },
        { label: 'Module filter', value: moduleFilter || null },
        { label: 'Gaps only', value: gapsOnly ? 'yes' : null },
        { label: 'Your access', value: canEdit ? 'Govern' : 'Read-only' },
        { label: 'Features shown', value: `${shownCount} of ${totalFeatures}` },
      ],
      kpis: [
        { label: 'Coverage', value: coveragePct != null ? `${coveragePct}%` : null },
        { label: 'Enabled', value: `${enabledCount} / ${totalFeatures}` },
        { label: 'Gaps (disabled)', value: gapsCount },
        {
          label: 'Bound policies',
          value: posture?.policy_bindings?.total_active ?? null,
        },
      ],
      sections: [
        {
          name: 'Module · feature entitlements',
          columns: ['Module', 'Feature', 'Status', 'Governed by', 'Surface'],
          rows,
        },
      ],
    };
  };

  return (
    <div className="space-y-3">
      {/* Governance-posture KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <SummaryCard
          icon={Gauge}
          label="Coverage"
          value={coveragePct != null ? `${coveragePct}%` : '—'}
          sub={`${enabledCount} / ${totalFeatures} features on`}
        />
        <SummaryCard
          icon={gapsCount > 0 ? ShieldOff : CheckCircle2}
          label="Gaps"
          value={gapsCount}
          sub={
            gapsCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setGapsOnly(true);
                  setModuleFilter(null);
                }}
                className="text-[10px] font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-300"
              >
                Drill into disabled features →
              </button>
            ) : (
              'all features enabled'
            )
          }
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Bound policies"
          value={
            posture?.policy_bindings?.total_active != null
              ? posture.policy_bindings.total_active
              : '—'
          }
          sub={
            posture?.policy_bindings?.objects_covered != null
              ? `${posture.policy_bindings.objects_covered} objects covered`
              : 'account-scoped'
          }
        />
        <SummaryCard
          icon={canEdit ? ShieldCheck : Lock}
          label="Your access"
          value={canEdit ? 'Govern' : 'Read-only'}
          sub={canEdit ? 'toggles are live' : 'admin role required to edit'}
        />
      </div>

      {/* Search + module filter chips + count */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search modules & features…"
              aria-label="Search features"
              className="w-full rounded-md border border-slate-200 bg-white/60 py-1.5 pl-8 pr-7 text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:focus:ring-slate-700"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {shownCount} of {totalFeatures}
          </span>
          <ExportButton buildReport={buildReport} disabled={shownCount === 0} />
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="All modules"
            active={!moduleFilter}
            onClick={() => setModuleFilter(null)}
          />
          {moduleSlugs.map((slug) => (
            <FilterChip
              key={slug}
              label={slug.replace(/_/g, ' ')}
              active={moduleFilter === slug}
              onClick={() => setModuleFilter((m) => (m === slug ? null : slug))}
            />
          ))}
          <FilterChip
            label="Gaps only"
            tone="rose"
            active={gapsOnly}
            onClick={() => setGapsOnly((g) => !g)}
          />
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Read-only — only an account admin (ACCOUNTADMIN) can change feature governance. Toggles are
          shown but disabled.
        </div>
      )}

      <p className="px-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        One row per governable feature, grouped by module and sortable by feature or status. Each is
        tagged with the capability it gates (Create · Run · Deploy · Manage · Govern, derived from its
        backend access gate). Enablement is per account; the granted roles, usage and bound-policy
        posture in each module header come from{' '}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">governance-posture</code>.
      </p>

      {/* Filtered-empty state — honest message instead of a blank matrix. */}
      {filteredSlugs.length === 0 && (
        <GlassPanel depth={1} radius="xl" className="px-3 py-6">
          <EmptyState
            icon={Search}
            compact
            title="No features match your filters"
            description={
              gapsOnly
                ? 'Every governable feature is currently enabled for this account.'
                : 'Try a different search term or module.'
            }
            action={
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            }
          />
        </GlassPanel>
      )}

      {/* Module × feature entitlement TABLE — grouped by module, sortable,
          paginated by module group (no scroll). */}
      {filteredSlugs.length > 0 && (
        <GlassPanel depth={1} radius="xl" className="overflow-hidden">
          <div className="overflow-x-auto px-2 pb-1">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <SortHeader
                    label="Module / Feature"
                    col="feature"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    className="min-w-[260px]"
                  />
                  <th
                    scope="col"
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    Surface / scope
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    Governance signal
                  </th>
                  <SortHeader
                    label="Status"
                    col="status"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleSort}
                    align="right"
                    className="w-[120px]"
                  />
                </tr>
              </thead>
              {pagedSlugs.map((slug) => {
                const feats = filteredModules[slug] ?? [];
                const p = postureByModule.get(slug);
                // Coverage meter: count the FULL unfiltered module rows from the
                // live matrix (patched optimistically on every toggle) so the
                // meter stays account-wide AND reflects edits immediately. Fall
                // back to the posture snapshot only if the matrix lacks the
                // module. Honest "—" when nothing to measure.
                const moduleFeats = modules[slug] ?? feats;
                const grpEnabled = moduleFeats.length
                  ? moduleFeats.filter((f) => f.enabled).length
                  : (p?.features_enabled ?? 0);
                const grpTotal = moduleFeats.length || (p?.features_total ?? 0);
                const grpPct = grpTotal > 0 ? Math.round((grpEnabled / grpTotal) * 100) : null;
                const allOn = feats.every((f) => f.enabled);
                const allOff = feats.every((f) => !f.enabled);
                const busy = Boolean(bulkPending[slug]);
                return (
                  <tbody
                    key={slug}
                    className="divide-y divide-slate-100/70 dark:divide-slate-800/60"
                  >
                    {/* Module group header row */}
                    <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40">
                      <th
                        scope="colgroup"
                        colSpan={4}
                        className="px-3 py-2 text-left font-normal"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold capitalize text-slate-800 dark:text-slate-100">
                              {slug.replace(/_/g, ' ')}
                            </span>
                            {/* Inline coverage meter */}
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                                role="img"
                                aria-label={
                                  grpPct != null
                                    ? `${grpEnabled} of ${grpTotal} enabled`
                                    : 'no coverage data'
                                }
                              >
                                <span
                                  className={cn(
                                    'block h-full rounded-full transition-all',
                                    grpPct === 100
                                      ? 'bg-emerald-500'
                                      : grpPct === 0
                                        ? 'bg-slate-300 dark:bg-slate-600'
                                        : 'bg-emerald-400',
                                  )}
                                  style={{ width: `${grpPct ?? 0}%` }}
                                />
                              </span>
                              <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                                {grpPct != null ? `${grpEnabled}/${grpTotal}` : '—'}
                              </span>
                            </span>
                            {p?.granted_roles?.length ? (
                              p.granted_roles.map((role) => (
                                <span
                                  key={role}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
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
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
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
                          {/* Per-module bulk actions — RBAC-gated, operate on shown rows. */}
                          {canEdit && (
                            <div className="flex items-center gap-1.5">
                              {busy && (
                                <Loader2
                                  className="h-3 w-3 animate-spin text-slate-400"
                                  aria-hidden
                                />
                              )}
                              <button
                                type="button"
                                disabled={busy || allOn}
                                onClick={() => void handleBulk(slug, feats, true)}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Enable all
                              </button>
                              <button
                                type="button"
                                disabled={busy || allOff}
                                onClick={() => setConfirmDisableAll({ slug, feats })}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Minus className="h-3 w-3" /> Disable all
                              </button>
                            </div>
                          )}
                        </div>
                      </th>
                    </tr>

                    {/* Feature rows */}
                    {feats.map((feat) => {
                      const ck = `${feat.module}:${feat.feature_key}`;
                      const cap = capabilityOf(feat.module, feat.feature_key);
                      return (
                        <tr
                          key={ck}
                          className="group transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        >
                          {/* Module/Feature — label + capability + description tooltip */}
                          <td className="px-3 py-2 align-top" title={feat.description || undefined}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[12px] font-medium text-slate-800 dark:text-slate-100">
                                {feat.label}
                              </span>
                              <CapBadge cap={cap} />
                              {feat.source === 'override' && (
                                <span
                                  className="text-[10px] text-slate-400"
                                  title={feat.updated_by ?? undefined}
                                >
                                  admin override
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 max-w-prose text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                              {dash(feat.description)}
                            </p>
                            {rowError[ck] && (
                              <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
                                <AlertTriangle className="h-3 w-3" /> {rowError[ck]}
                              </p>
                            )}
                          </td>

                          {/* Surface / scope */}
                          <td className="px-3 py-2 align-top">
                            {feat.surface ? (
                              <code className="rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {feat.surface}
                              </code>
                            ) : (
                              <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>

                          {/* Governance signal — feature-level gate (module rollup is in the header). */}
                          <td className="px-3 py-2 align-top text-[10px] text-slate-500 dark:text-slate-400">
                            {feat.governed_by ? (
                              <span className="inline-flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3 text-slate-400" />
                                <span className="truncate">{feat.governed_by}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>

                          {/* Status — the enable/disable toggle + scannable label. */}
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-center justify-end gap-2">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 text-[10px] font-medium',
                                  feat.enabled
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400 dark:text-slate-500',
                                )}
                              >
                                {feat.enabled ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Minus className="h-3.5 w-3.5" />
                                )}
                                {feat.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                              <Toggle
                                enabled={feat.enabled}
                                pending={Boolean(pending[ck])}
                                disabled={!canEdit}
                                onToggle={() => void handleToggle(feat)}
                                label={`${feat.enabled ? 'Disable' : 'Enable'} ${feat.label}`}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
          <div className="px-3 pb-2">
            <Pager
              page={modulePager.page}
              pageCount={modulePager.pageCount}
              total={modulePager.total}
              from={modulePager.from}
              to={modulePager.to}
              onPage={modulePager.setPage}
              unit="modules"
            />
          </div>
        </GlassPanel>
      )}

      {confirmDisableAll &&
        (() => {
          const { slug, feats } = confirmDisableAll;
          const moduleLabel = slug.replace(/_/g, ' ');
          const count = feats.filter((f) => f.enabled).length;
          return (
            <ConfirmDialog
              open
              title={`Disable all ${moduleLabel} features?`}
              message={`This turns off ${count} enabled ${moduleLabel} feature${
                count === 1 ? '' : 's'
              } for the entire account. Every user loses these capabilities until an admin re-enables them.`}
              confirmLabel="Disable all"
              onConfirm={() => {
                setConfirmDisableAll(null);
                void handleBulk(slug, feats, false);
              }}
              onCancel={() => setConfirmDisableAll(null)}
            />
          );
        })()}
    </div>
  );
}

/** A sortable column header cell. Shows direction arrows on the active column. */
function SortHeader({
  label,
  col,
  activeKey,
  dir,
  onSort,
  align = 'left',
  className,
}: {
  label: string;
  col: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = activeKey === col;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2', className)}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
          align === 'right' && 'flex-row-reverse',
          active
            ? 'text-slate-700 dark:text-slate-200'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
        )}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    </th>
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
  // Accepts a missing value — renders "—" for null/undefined/NaN (R3); a genuine
  // 0 still renders as 0.
  value: string | number | null | undefined;
  sub?: ReactNode;
}) {
  return (
    <GlassPanel depth={1} radius="xl" className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{dash(value)}</div>
      {sub != null && <div className="text-[10px] text-slate-400">{sub}</div>}
    </GlassPanel>
  );
}

/** A single filter chip — neutral by default, rose tone for the "Gaps only" toggle. */
function FilterChip({
  label,
  active,
  onClick,
  tone = 'slate',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'slate' | 'rose';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ring-1 ring-inset transition-colors',
        active && tone === 'rose'
          ? 'bg-rose-500/90 text-white ring-rose-500'
          : active
            ? 'bg-slate-800 text-white ring-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100'
            : tone === 'rose'
              ? 'bg-rose-50 text-rose-600 ring-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30'
              : 'bg-white/60 text-slate-600 ring-slate-200 hover:bg-white dark:bg-slate-900/40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
      )}
    >
      {label}
    </button>
  );
}
