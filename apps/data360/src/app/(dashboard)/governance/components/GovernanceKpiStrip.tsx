'use client';

/**
 * GovernanceKpiStrip — a compact, scope-configurable KPI strip that harmonizes
 * the Governance surface (policies · grants · users · roles) with one coherent
 * header row of real-data tiles.
 *
 * Honesty rules (per CLAUDE.md, no fake 0s):
 *   · Each tile fetches from an EXISTING service getter (no new endpoints).
 *   · loading           → skeleton chip.
 *   · fetch rejected    → "—" (the value is UNDETERMINED, never a fabricated 0).
 *   · fetch resolved []  → a real 0 (an empty list IS zero — honest, not faked).
 *   · a degraded note appears only when ≥1 source genuinely failed.
 *
 * Sources are de-duplicated: a scope's tiles share a single GET per source
 * (e.g. the "users" scope hits /gouvernance/users once and derives total /
 * active / disabled from it). Read-only — the strip never mutates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Cog,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Tag,
  UserCheck,
  Users,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import {
  listPoliciesEnriched,
  getNetworkPolicies,
  getTags,
} from '@/app/services/governance/policies';
import { getUsers } from '@/app/services/governance/fetch_users';
import { getRoles, getD360Roles } from '@/app/services/governance/fetch_roles';
import { getPermissions } from '@/app/services/governance/fetch_grants';

export type GovernanceKpiScope = 'policies' | 'grants' | 'users' | 'roles';

type Tone =
  | 'amber'
  | 'purple'
  | 'cyan'
  | 'green'
  | 'blue'
  | 'emerald'
  | 'orange'
  | 'violet'
  | 'rose';

// Tailwind can't see dynamic class names — enumerate the tones we use.
const TONE: Record<Tone, { bg: string; text: string; ring: string }> = {
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/20' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', ring: 'ring-purple-500/20' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-500/20' },
  green: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', ring: 'ring-green-500/20' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500/20' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/20' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-500/20' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/20' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/20' },
};

/** A named GET that one or more tiles read from (de-duplicated per scope). */
interface Source {
  key: string;
  load: () => Promise<unknown>;
}

interface Tile {
  key: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
  tone: Tone;
  source: string;
  /** Pure: derive the tile's number from the source payload (null = undetermined). */
  select: (data: unknown) => number | null;
}

const len = (data: unknown): number => (Array.isArray(data) ? data.length : 0);

// ── Sources ──────────────────────────────────────────────────────────────────
const SRC = {
  masking: { key: 'masking', load: () => listPoliciesEnriched('MASKING') },
  rls: { key: 'rls', load: () => listPoliciesEnriched('ROW_ACCESS') },
  aggregation: { key: 'aggregation', load: () => listPoliciesEnriched('AGGREGATION') },
  network: { key: 'network', load: () => getNetworkPolicies() },
  tags: { key: 'tags', load: () => getTags() },
  users: { key: 'users', load: () => getUsers() },
  roles: { key: 'roles', load: () => getRoles() },
  d360: { key: 'd360', load: () => getD360Roles() },
  grants: { key: 'grants', load: () => getPermissions() },
} satisfies Record<string, Source>;

type UserRow = { status?: string };

const countStatus = (data: unknown, status: string): number =>
  Array.isArray(data) ? (data as UserRow[]).filter((u) => u?.status === status).length : 0;

// ── Scope → tiles ────────────────────────────────────────────────────────────
const SCOPES: Record<GovernanceKpiScope, { sources: Source[]; tiles: Tile[] }> = {
  policies: {
    sources: [SRC.masking, SRC.rls, SRC.aggregation, SRC.network, SRC.tags],
    tiles: [
      { key: 'masking', label: 'Masking', hint: 'Column-masking policies', Icon: EyeOff, tone: 'amber', source: 'masking', select: len },
      { key: 'rls', label: 'Row Access', hint: 'Row-level security policies', Icon: Lock, tone: 'purple', source: 'rls', select: len },
      { key: 'aggregation', label: 'Aggregation', hint: 'Aggregation-constraint policies', Icon: BarChart3, tone: 'cyan', source: 'aggregation', select: len },
      { key: 'network', label: 'Network', hint: 'Account network policies', Icon: Globe, tone: 'blue', source: 'network', select: len },
      { key: 'tags', label: 'Gov Tags', hint: 'Classification / governance tags', Icon: Tag, tone: 'green', source: 'tags', select: len },
    ],
  },
  grants: {
    sources: [SRC.grants, SRC.roles, SRC.d360, SRC.users],
    tiles: [
      { key: 'grants', label: 'Module Grants', hint: 'Role→module access rows', Icon: KeyRound, tone: 'violet', source: 'grants', select: len },
      { key: 'roles', label: 'Roles', hint: 'Warehouse roles', Icon: ShieldCheck, tone: 'emerald', source: 'roles', select: len },
      { key: 'd360', label: 'D360 Roles', hint: 'Granular page-level roles', Icon: Cog, tone: 'orange', source: 'd360', select: len },
      { key: 'users', label: 'Users', hint: 'Provisioned users', Icon: Users, tone: 'blue', source: 'users', select: len },
    ],
  },
  users: {
    sources: [SRC.users, SRC.roles],
    tiles: [
      { key: 'total', label: 'Users', hint: 'Total provisioned users', Icon: Users, tone: 'blue', source: 'users', select: len },
      { key: 'active', label: 'Active', hint: 'Enabled users', Icon: UserCheck, tone: 'emerald', source: 'users', select: (d) => countStatus(d, 'Active') },
      { key: 'disabled', label: 'Disabled', hint: 'Disabled users', Icon: UserX, tone: 'rose', source: 'users', select: (d) => countStatus(d, 'Disabled') },
      { key: 'roles', label: 'Roles', hint: 'Warehouse roles', Icon: ShieldCheck, tone: 'violet', source: 'roles', select: len },
    ],
  },
  roles: {
    sources: [SRC.roles, SRC.d360, SRC.users],
    tiles: [
      { key: 'roles', label: 'Roles', hint: 'Warehouse roles', Icon: ShieldCheck, tone: 'emerald', source: 'roles', select: len },
      { key: 'd360', label: 'D360 Roles', hint: 'Granular page-level roles', Icon: Cog, tone: 'orange', source: 'd360', select: len },
      { key: 'users', label: 'Users', hint: 'Users that can be assigned roles', Icon: Users, tone: 'blue', source: 'users', select: len },
    ],
  },
};

type SourceState = Record<string, { ok: boolean; data: unknown }>;

function fmt(n: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

export default function GovernanceKpiStrip({
  scope,
  className = '',
}: {
  scope: GovernanceKpiScope;
  className?: string;
}) {
  const { sources, tiles } = SCOPES[scope];
  const [state, setState] = useState<SourceState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled(sources.map((s) => s.load()));
    const next: SourceState = {};
    sources.forEach((s, i) => {
      const r = results[i];
      next[s.key] = r.status === 'fulfilled' ? { ok: true, data: r.value } : { ok: false, data: null };
    });
    setState(next);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const degraded = useMemo(
    () => (state ? Object.values(state).some((s) => !s.ok) : false),
    [state],
  );

  return (
    <div
      className={`rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-900 ${className}`}
      role="group"
      aria-label="Governance key metrics"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Governance at a glance
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          title="Refresh metrics"
          aria-label="Refresh metrics"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-50 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const src = state?.[t.source];
          const value = !state ? null : src?.ok ? t.select(src.data) : null;
          const c = TONE[t.tone];
          return (
            <div
              key={t.key}
              title={t.hint}
              className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800"
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${c.bg} ${c.ring}`}>
                <t.Icon className={`h-4 w-4 ${c.text}`} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {t.label}
                </div>
                {loading ? (
                  <div className="mt-1 h-4 w-8 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                ) : (
                  <div className="text-lg font-bold leading-tight text-slate-900 dark:text-white">
                    {fmt(value)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {degraded && !loading && (
        <p className="mt-2 px-1 text-[10px] text-slate-400">
          Some metrics are temporarily unavailable (shown as “—”). Try Refresh.
        </p>
      )}
    </div>
  );
}
