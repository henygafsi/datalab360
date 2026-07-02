'use client';

/**
 * FeatureRegistryTab — the business-readable FEATURE REGISTRY of the platform.
 *
 * Renders the static `FEATURES_CATALOG` (what each feature does around your
 * data, where it lives, which backend endpoints it calls) grouped by module,
 * and overlays the LIVE per-account activation state from the entitlements API:
 *
 *   GET /api/administration/entitlements                      → activation map
 *   PUT /api/administration/entitlements/{module}/{feature_key} → toggle (admin)
 *
 * A catalog row is governable when its entitlement key (explicit `entitlement`
 * mapping, else `${module}:${featureKey}`) exists in the backend matrix —
 * several rows may share one governing entitlement and toggle together. Rows
 * with no matching entitlement render an honest "—" (role-grant enforced only).
 *
 * Toggles are optimistic (+ toast, revert on error) and admin-gated with the
 * same seam as FeatureGovernanceMatrix: the envelope's `can_govern` OR the
 * Action-RBAC gouvernance:grant permission. Everyone else sees read-only state.
 * The catalog itself always renders — an unreachable backend only degrades the
 * Active column, never blanks the registry.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BookOpenText,
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/config/routes';
import { getModuleDisplayName } from '@/config/modules';
import { GlassPanel } from '@/app/shared/glass';
import EmptyState from '@/components/ui/EmptyState';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import {
  getEntitlements,
  NotDeployedError,
  setEntitlement,
  type EntitlementFeature,
} from '@/app/services/administration/entitlements';
import {
  entitlementKeyOf,
  FEATURES_CATALOG,
  MODULE_ORDER,
  type FeatureDef,
} from '../features-catalog';

/** Load state of the ACTIVATION overlay only — the catalog itself is static. */
type EntPhase = 'loading' | 'ready' | 'error' | 'not-deployed';

/** Module display label — MODULES[].name via getModuleDisplayName; the
 *  administration hub is not a MODULES entry, so it keeps its own label
 *  (same string the hub header already uses). */
function moduleLabel(slug: string): string {
  if (slug === 'administration') return 'Administration';
  return getModuleDisplayName(slug);
}

/** Accessible enable/disable switch (same affordance as FeatureGovernanceMatrix). */
function Toggle({
  enabled,
  pending,
  disabled,
  onToggle,
  label,
  title,
}: {
  enabled: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={title}
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

/** Collapsible endpoint code-chip list for one feature row. */
function EndpointChips({
  endpoints,
  expanded,
  onToggle,
}: {
  endpoints: string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {endpoints.length} endpoint{endpoints.length === 1 ? '' : 's'}
      </button>
      {expanded && (
        <ul className="mt-1 space-y-1">
          {endpoints.map((ep) => (
            <li key={ep}>
              <code className="block w-fit max-w-full break-all rounded bg-slate-100 px-1.5 py-0.5 text-[10px] leading-snug text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {ep}
              </code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A single module filter chip. */
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors',
        active
          ? 'bg-slate-800 text-white ring-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100'
          : 'bg-white/60 text-slate-600 ring-slate-200 hover:bg-white dark:bg-slate-900/40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800',
      )}
    >
      {label}
    </button>
  );
}

export default function FeatureRegistryTab() {
  const { trackFeatureClick } = useTrackEvent();

  // ── Activation overlay (entitlements API) ──────────────────────────────────
  const [entPhase, setEntPhase] = useState<EntPhase>('loading');
  const [entError, setEntError] = useState<string | null>(null);
  /** `${module}:${feature_key}` → live entitlement row. */
  const [entMap, setEntMap] = useState<Record<string, EntitlementFeature>>({});
  const [canGovern, setCanGovern] = useState(false);
  /** In-flight PUTs, keyed by entitlement key (shared rows spin together). */
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Same gate seam as FeatureGovernanceMatrix: the envelope's `can_govern` is
  // authoritative; Action-RBAC is a secondary OR (never lets an outage imply
  // edit access, never vetoes a backend-cleared admin).
  const govPerm = useCanPerform('gouvernance', 'grant');
  const canEdit = canGovern || (govPerm.allowed && !govPerm.loading && !govPerm.error);

  const loadEntitlements = useCallback(async () => {
    setEntPhase('loading');
    setEntError(null);
    try {
      const { matrix, canGovern: cg } = await getEntitlements();
      const map: Record<string, EntitlementFeature> = {};
      Object.values(matrix.modules ?? {}).forEach((rows) => {
        rows.forEach((r) => {
          map[`${r.module}:${r.feature_key}`] = r;
        });
      });
      setEntMap(map);
      setCanGovern(cg);
      setEntPhase('ready');
    } catch (e) {
      if (e instanceof NotDeployedError) {
        setEntPhase('not-deployed');
      } else {
        setEntError(getApiErrorMessage(e));
        setEntPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    void loadEntitlements();
  }, [loadEntitlements]);

  // ── Filters (client-side) ──────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // debounced
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  /** Expanded endpoint lists, keyed by `${module}:${featureKey}`. */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpanded = useCallback((key: string) => {
    setExpanded((m) => ({ ...m, [key]: !m[key] }));
  }, []);

  // Modules present in the catalog, in journey order (catalog is static → stable).
  const moduleSlugs = useMemo(() => {
    const present = new Set(FEATURES_CATALOG.map((f) => f.module));
    const ordered = MODULE_ORDER.filter((m) => present.has(m));
    // Defensive: keep any module not covered by MODULE_ORDER visible at the end.
    FEATURES_CATALOG.forEach((f) => {
      if (!ordered.includes(f.module)) ordered.push(f.module);
    });
    return ordered;
  }, []);

  const { grouped, shownCount } = useMemo(() => {
    const matches = (f: FeatureDef): boolean => {
      if (moduleFilter && f.module !== moduleFilter) return false;
      if (!search) return true;
      const hay = `${moduleLabel(f.module)} ${f.module} ${f.featureKey} ${f.name} ${f.description} ${f.surface} ${f.endpoints.join(' ')}`.toLowerCase();
      return hay.includes(search);
    };
    const byModule: Record<string, FeatureDef[]> = {};
    let shown = 0;
    for (const slug of moduleSlugs) {
      const kept = FEATURES_CATALOG.filter((f) => f.module === slug && matches(f));
      if (kept.length) {
        byModule[slug] = kept;
        shown += kept.length;
      }
    }
    return { grouped: byModule, shownCount: shown };
  }, [moduleSlugs, moduleFilter, search]);

  const shownSlugs = moduleSlugs.filter((s) => (grouped[s] ?? []).length > 0);
  const totalCount = FEATURES_CATALOG.length;
  const governableCount = useMemo(
    () => FEATURES_CATALOG.filter((f) => Boolean(entMap[entitlementKeyOf(f)])).length,
    [entMap],
  );
  const filtersActive = Boolean(search || moduleFilter);
  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setModuleFilter(null);
  }, []);

  // ── Toggle one row's governing entitlement (optimistic + revert) ──────────
  const handleToggle = useCallback(
    async (feat: FeatureDef) => {
      const key = entitlementKeyOf(feat);
      const ent = entMap[key];
      if (!ent || !canEdit || pending[key]) return;
      const prev = ent;
      const next = !ent.enabled;
      setPending((p) => ({ ...p, [key]: true }));
      // Optimistic — every catalog row sharing this entitlement reflects it.
      setEntMap((m) => ({ ...m, [key]: { ...ent, enabled: next, source: 'override' } }));
      trackFeatureClick('feature_registry_toggle', {
        module: feat.module,
        feature: feat.featureKey,
        entitlement: key,
        enabled: next,
      });
      try {
        await setEntitlement(ent.module, ent.feature_key, { enabled: next });
        toast.success(`${feat.name} ${next ? 'activated' : 'deactivated'} for this account`);
      } catch (e) {
        setEntMap((m) => ({ ...m, [key]: prev })); // revert
        toast.error(
          `Could not ${next ? 'activate' : 'deactivate'} ${feat.name}: ${getApiErrorMessage(e)}`,
        );
      } finally {
        setPending((p) => {
          const { [key]: _drop, ...rest } = p;
          return rest;
        });
      }
    },
    [entMap, canEdit, pending, trackFeatureClick],
  );

  return (
    <div className="space-y-3">
      {/* Header — what this registry is + the grant-model line (required copy). */}
      <GlassPanel depth={1} radius="xl" className="px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[hsl(var(--primary))] dark:bg-slate-800">
            <BookOpenText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Feature Registry
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Every platform feature in business terms — what it does around your data, where it
              lives, and the backend endpoints behind it.
            </p>
            <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              Features are activated per account and enforced by role grants — manage role
              permissions in{' '}
              <Link
                href={routes.governance.grants}
                className="text-[hsl(var(--primary))] underline-offset-2 hover:underline"
                onClick={() => trackFeatureClick('open_governance_grants', { from: 'features' })}
              >
                Governance
              </Link>
              .
            </p>
            <p className="mt-1 text-[11px] tabular-nums text-slate-400">
              {totalCount} features · {moduleSlugs.length} modules ·{' '}
              {entPhase === 'ready' ? `${governableCount} account-governable` : 'activation state —'}
              {' · your access: '}
              <span className={canEdit ? 'text-emerald-600 dark:text-emerald-400' : undefined}>
                {canEdit ? 'Govern' : 'Read-only'}
              </span>
            </p>
          </div>
        </div>
      </GlassPanel>

      {/* Activation-overlay degradation notices — the registry still renders. */}
      {entPhase === 'not-deployed' && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Per-account activation is not wired on this backend yet — the registry stays
          informational and the Active column shows “—”.
        </div>
      )}
      {entPhase === 'error' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            Could not load the activation state{entError ? ` — ${entError}` : ''}. The registry
            below stays informational.
          </span>
          <button
            type="button"
            onClick={() => void loadEntitlements()}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-0.5 text-[11px] font-medium hover:bg-amber-100 dark:border-amber-500/40 dark:hover:bg-amber-500/20"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}
      {entPhase === 'ready' && !canEdit && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Read-only — only an account admin can change per-account activation. Toggles show the
          live state but stay disabled.
        </div>
      )}

      {/* Search + module filter chips */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search features, endpoints, surfaces…"
              aria-label="Search the feature registry"
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
            {shownCount} of {totalCount}
          </span>
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
              label={moduleLabel(slug)}
              active={moduleFilter === slug}
              onClick={() => setModuleFilter((m) => (m === slug ? null : slug))}
            />
          ))}
        </div>
      </div>

      {/* Filtered-empty state — honest message instead of a blank table. */}
      {shownSlugs.length === 0 && (
        <GlassPanel depth={1} radius="xl" className="px-3 py-6">
          <EmptyState
            icon={Search}
            compact
            title="No features match your filters"
            description="Try a different search term or module."
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

      {/* Registry table — grouped by module. */}
      {shownSlugs.length > 0 && (
        <GlassPanel depth={1} radius="xl" className="overflow-hidden">
          <div className="overflow-x-auto px-2 pb-1">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th
                    scope="col"
                    className="min-w-[180px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    Feature
                  </th>
                  <th
                    scope="col"
                    className="min-w-[260px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    What it does
                  </th>
                  <th
                    scope="col"
                    className="min-w-[150px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    Where
                  </th>
                  <th
                    scope="col"
                    className="min-w-[130px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    Endpoints
                  </th>
                  <th
                    scope="col"
                    className="w-[110px] px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    Active
                  </th>
                </tr>
              </thead>
              {shownSlugs.map((slug) => {
                const feats = grouped[slug] ?? [];
                return (
                  <tbody key={slug} className="divide-y divide-slate-100/70 dark:divide-slate-800/60">
                    {/* Module group header */}
                    <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40">
                      <th scope="colgroup" colSpan={5} className="px-3 py-2 text-left font-normal">
                        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                          {moduleLabel(slug)}
                        </span>
                        <span className="ml-2 text-[10px] tabular-nums text-slate-400">
                          {feats.length} feature{feats.length === 1 ? '' : 's'}
                        </span>
                      </th>
                    </tr>

                    {feats.map((feat) => {
                      const rowKey = `${feat.module}:${feat.featureKey}`;
                      const entKey = entitlementKeyOf(feat);
                      const ent = entMap[entKey] as EntitlementFeature | undefined;
                      const isPending = Boolean(pending[entKey]);
                      return (
                        <tr
                          key={rowKey}
                          className="group align-top transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                        >
                          {/* Feature name + key */}
                          <td className="px-3 py-2 align-top">
                            <div className="text-[12px] font-medium text-slate-800 dark:text-slate-100">
                              {feat.name}
                            </div>
                            <code className="mt-0.5 block w-fit rounded bg-slate-100 px-1 text-[9px] text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                              {feat.featureKey}
                            </code>
                          </td>

                          {/* Business description */}
                          <td className="px-3 py-2 align-top">
                            <p className="max-w-prose text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                              {feat.description}
                            </p>
                          </td>

                          {/* Surface */}
                          <td className="px-3 py-2 align-top text-[11px] text-slate-500 dark:text-slate-400">
                            {feat.surface}
                          </td>

                          {/* Endpoints — collapsible code chips */}
                          <td className="px-3 py-2 align-top">
                            <EndpointChips
                              endpoints={feat.endpoints}
                              expanded={Boolean(expanded[rowKey])}
                              onToggle={() => toggleExpanded(rowKey)}
                            />
                          </td>

                          {/* Active — live toggle when governable, honest "—" otherwise */}
                          <td className="px-3 py-2 align-top">
                            {ent ? (
                              <div className="flex items-center justify-end gap-2">
                                <span
                                  className={cn(
                                    'text-[10px] font-medium',
                                    ent.enabled
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-slate-400 dark:text-slate-500',
                                  )}
                                >
                                  {ent.enabled ? 'On' : 'Off'}
                                </span>
                                <Toggle
                                  enabled={ent.enabled}
                                  pending={isPending}
                                  disabled={!canEdit}
                                  onToggle={() => void handleToggle(feat)}
                                  label={`${ent.enabled ? 'Deactivate' : 'Activate'} ${feat.name} for this account`}
                                  title={
                                    entKey !== rowKey
                                      ? `Governed by the ${entKey} entitlement — related features switch together`
                                      : `Governed by ${entKey}`
                                  }
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-end">
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500"
                                  title="Not account-governable — access is enforced by role grants only"
                                >
                                  {entPhase === 'loading' ? (
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                  ) : (
                                    <>
                                      <ShieldCheck className="h-3 w-3" aria-hidden />—
                                    </>
                                  )}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
