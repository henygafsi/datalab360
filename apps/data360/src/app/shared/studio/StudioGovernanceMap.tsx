'use client';

/**
 * StudioGovernanceMap — data-access IAM as a master-detail, not a wall of blocks.
 *
 * The layering never changes: data permissions live ONCE on the application's
 * access role, and the five Data360 roles (view · edit · operate · approve ·
 * admin) reuse it. Nobody is granted a table directly — so "who can do what"
 * is answered by ASSOCIATING a person or a warehouse role with a Data360 role.
 *
 * The surface used to stack four full-width blocks down the page. Now it is a
 * small tab bar over ONE panel at a time, and access is edited the way the
 * question is actually asked: you SELECT a person or role, and a detail panel
 * opens where you pick the Data360 role from cards that say — in business
 * words — what that role lets them do. Row policies and column masking are
 * their own panels; the prepared change and its dry-run / apply / test live
 * under « Review & apply ».
 *
 * Honesty: nothing here executes, and this panel composes NEW access. A
 * person's already-standing app grant is NOT served per person, so an unset
 * row means "no new grant chosen" — never a verified "has no access". The
 * proof of who can really read is « Test the reads », under Review.
 */

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import {
  simulateRlsPlan,
  type RlsPlanSimulation,
} from '@/app/services/studio/studio-api';
import type { AccessView, RlsSuggestion } from '@/app/services/studio/studio-api';

export interface Principal {
  name: string;
  kind: 'user' | 'role';
  /** warehouse roles this person already holds, when known */
  holds?: string[];
  disabled?: boolean;
}

/** name → Data360 grant type, or '' for "not mapped". */
export type RoleMapping = Record<string, string>;
/** column → grant type → allowed values ('*' = every value). */
export type PolicyMapping = Record<string, Record<string, string[] | '*'>>;

/** The grant type as the parent actually serves it — label + business
 *  description + the concrete actions it allows, so the picker reads as cards
 *  and not as an enum. */
export interface GrantTypeInfo {
  id: string;
  label?: string;
  description?: string;
  actions?: string[];
  product_level?: string;
}

type SubTab = 'people' | 'rows' | 'masking' | 'review';

export default function StudioGovernanceMap({
  draftId,
  view,
  gov,
  grantTypes,
  principals,
  principalsNote,
  mapping,
  onMap,
  policy,
  onPolicy,
  masking,
  onToggleMask,
  onToggleUnmask,
  onPrepare,
  onTest,
  busy,
  canPrepare,
  footer,
}: {
  draftId: string;
  view: AccessView;
  gov: RlsSuggestion | null;
  grantTypes: GrantTypeInfo[];
  principals: Principal[] | null;
  /** why the list is short or empty — never leave that unexplained */
  principalsNote?: string;
  mapping: RoleMapping;
  onMap: (name: string, grantType: string) => void;
  policy: PolicyMapping;
  onPolicy: (column: string, grantType: string, values: string[] | '*') => void;
  /** column-level security: which columns are hidden, and which Data360
   *  roles still see them in clear (defaults to admin + approve). */
  masking: { columns: string[]; unmasked: string[] };
  onToggleMask: (column: string) => void;
  onToggleUnmask: (grantType: string) => void;
  /** stage / verify actions, so a policy tab is self-sufficient — the full
   *  checkboxed apply still lives under « Review & apply ». */
  onPrepare?: () => void;
  onTest?: () => void;
  busy?: string | null;
  canPrepare?: boolean;
  footer?: React.ReactNode;
}) {
  const [subTab, setSubTab] = useState<SubTab>('people');
  /** the principal whose access is being edited — SHARED across every tab:
   *  pick a person on « People & roles » and the policy tabs edit what THAT
   *  person sees (resolved to their Data360 role, since row/column policies
   *  live on the role, never on the individual). */
  const [selected, setSelected] = useState<string | null>(null);
  const [maskInput, setMaskInput] = useState('');
  const [q, setQ] = useState('');
  /** plan-level RLS simulation per column: who WOULD see what, pre-apply */
  const [sims, setSims] = useState<Record<string, RlsPlanSimulation | 'running' | { error: string }>>({});
  const simulate = async (column: string, fqn: string) => {
    /* mirror the plan EXACTLY: a role narrowed to values keeps them, every
       other functional role gets `*` (sees everything). Sending only the
       narrowed role would simulate the others as FALSE and misreport who sees
       what. */
    const narrowed = Object.values(policy[column] ?? {}).some((v) => Array.isArray(v) && v.length > 0);
    if (!narrowed) return;
    const byGrant: Record<string, string[] | '*'> = {};
    for (const g of grantTypes) {
      const v = policy[column]?.[g.id];
      byGrant[g.id] = Array.isArray(v) && v.length > 0 ? v : '*';
    }
    setSims((m) => ({ ...m, [column]: 'running' }));
    try {
      const r = await simulateRlsPlan(draftId, {
        fqn,
        column,
        allowed_values_by_grant_type: byGrant,
        rows: 3,
      });
      setSims((m) => ({ ...m, [column]: r }));
    } catch (e) {
      setSims((m) => ({
        ...m,
        [column]: { error: e instanceof Error ? e.message : 'The simulation failed.' },
      }));
    }
  };
  const roles = gov?.roles ?? view.diff?.roles ?? {};
  const functional = roles.functional ?? {};
  const objects = view.me?.objects ?? [];

  const shown = useMemo(() => {
    const list = principals ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list;
  }, [principals, q]);

  /* one candidate per column — the same column on two tables is one policy,
   * and showing it twice invites granting the values of the wrong table */
  const columns = useMemo(() => {
    const byCol = new Map<string, { column: string; tables: string[]; fqns: string[]; values: string[] }>();
    for (const c of gov?.candidates ?? []) {
      const col = c.column ?? '';
      if (!col) continue;
      const cur = byCol.get(col) ?? { column: col, tables: [], fqns: [], values: [] };
      if (c.fqn) {
        cur.tables.push(c.fqn.split('.').slice(-1)[0]);
        cur.fqns.push(c.fqn);
      }
      for (const v of c.observed_values ?? []) {
        const s = String(v.value ?? '');
        if (s && !cur.values.includes(s)) cur.values.push(s);
      }
      byCol.set(col, cur);
    }
    return [...byCol.values()];
  }, [gov]);

  const grantLabel = (id: string): string => grantTypes.find((g) => g.id === id)?.label ?? id;
  const grantInfo = (id: string): GrantTypeInfo | undefined => grantTypes.find((g) => g.id === id);
  const mapped = Object.values(mapping).filter(Boolean).length;
  /* a rule is a role NARROWED to specific values — `*`/unset means "sees
   * every row", the default, which is not a restriction. */
  const ruleCount = columns.filter((c) =>
    grantTypes.some((g) => {
      const v = policy[c.column]?.[g.id];
      return Array.isArray(v) && v.length > 0;
    }),
  ).length;

  const selectedPrincipal = selected ? (principals ?? []).find((p) => p.name === selected) ?? null : null;
  const selectedGrant = selected ? mapping[selected] ?? '' : '';
  /** the role a policy tab edits — the selected principal's Data360 role.
   *  Row/column policies live on the ROLE, not the person, so "edit what X
   *  sees" edits X's role and affects everyone else who holds it. */
  const anchorRole = selectedGrant;
  const sharers = anchorRole
    ? Object.entries(mapping)
        .filter(([n, gt]) => gt === anchorRole && n !== selected)
        .map(([n]) => n)
    : [];

  /* one compact picker, shared by the policy tabs — the SAME `selected` the
     People & roles master list drives, so the anchor never diverges. */
  const principalPicker = (
    <label className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Whose access
      </span>
      <select
        value={selected ?? ''}
        onChange={(e) => setSelected(e.target.value || null)}
        className="h-8 min-w-[14rem] rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <option value="">Pick a person or group…</option>
        {(principals ?? []).map((p) => (
          <option key={`${p.kind}:${p.name}`} value={p.name}>
            {p.name} · {p.kind}
          </option>
        ))}
      </select>
    </label>
  );

  /* the role a principal will get — an inline picker for the policy tabs, so
     restricting what someone sees also grants them the role it lives on. */
  const rolePicker = selected && (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500 dark:text-slate-400">via role</span>
      {grantTypes.map((g) => {
        const on = anchorRole === g.id;
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            onClick={() => onMap(selected, g.id)}
            className={`rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              on
                ? 'border-accent-500 bg-accent-600 text-white'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            {g.label ?? g.id}
          </button>
        );
      })}
    </div>
  );

  /* Prepare / Test on the policy tab itself — the full checkboxed apply
     stays under « Review & apply », one click away. */
  const actionBar = (onPrepare || onTest) && (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      {onPrepare && (
        <button
          type="button"
          disabled={busy != null || canPrepare === false}
          onClick={onPrepare}
          title={
            canPrepare === false
              ? 'Map a person/role, paint a row rule, or mask a column first'
              : 'Stage this change — nothing runs yet'
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {busy === 'plan' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          Prepare the change
        </button>
      )}
      {onTest && (
        <button
          type="button"
          disabled={busy != null}
          onClick={onTest}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        >
          {busy === 'test' ? (
            <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play aria-hidden className="h-3.5 w-3.5" />
          )}
          Test the reads
        </button>
      )}
      <button
        type="button"
        onClick={() => setSubTab('review')}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
      >
        Review &amp; apply
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const TABS: Array<{ id: SubTab; label: string; icon: typeof Users; count?: number }> = [
    { id: 'people', label: 'People & roles', icon: Users, count: mapped || undefined },
    { id: 'rows', label: 'Row policies', icon: KeyRound, count: ruleCount || undefined },
    { id: 'masking', label: 'Column masking', icon: EyeOff, count: masking.columns.length || undefined },
    { id: 'review', label: 'Review & apply', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-3">
      {/* ── what already exists, stated once, compactly ──────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            The roles this application already has
          </p>
          {roles.access_role && (
            <span
              className="rounded-lg border border-slate-200 px-2 py-0.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300"
              title="Data permissions live here once — and are reused by every functional role"
            >
              {roles.access_role}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1">
            {Object.keys(functional).length > 0
              ? Object.entries(functional).map(([k, name]) => (
                  <span
                    key={k}
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    title={String(name)}
                  >
                    {k}
                  </span>
                ))
              : grantTypes.map((g) => (
                  <span key={g.id} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {g.label ?? g.id}
                  </span>
                ))}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          People → Data360 roles → the access role and its policies. A person is never granted a
          table directly. <span className="font-medium">Access to the application means READING it —
          the Viewer default;</span> the higher roles add what someone may DO. This panel composes{' '}
          <span className="font-medium">new</span> access — a person&rsquo;s standing grant is verified by{' '}
          <span className="font-medium">Test the reads</span>, not assumed here.
        </p>
      </section>

      {/* ── the sub-tab bar: one panel opens at a time ───────────────── */}
      <div role="tablist" aria-label="Governance surface" className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const on = subTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                on
                  ? 'bg-accent-600 font-medium text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {t.label}
              {t.count != null && (
                <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ PEOPLE & ROLES — master-detail ═══════════════════════════ */}
      {subTab === 'people' && (
        <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,340px),1fr]">
          {/* master: who exists */}
          <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Users aria-hidden className="h-3.5 w-3.5" />
                People and roles
              </p>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{mapped} to grant</span>
            </div>

            {principals == null ? (
              <div className="mt-2 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
            ) : principals.length === 0 ? (
              <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
                {principalsNote ?? 'No user or role could be read from the account.'}
              </p>
            ) : (
              <>
                <label className="mt-2 block">
                  <span className="sr-only">Search people and roles</span>
                  <span className="relative block">
                    <Search aria-hidden className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search a person or a role"
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </span>
                </label>

                <ul className="mt-2 max-h-[26rem] space-y-0.5 overflow-auto pr-0.5">
                  {shown.slice(0, 200).map((p) => {
                    const gt = mapping[p.name] ?? '';
                    const on = selected === p.name;
                    return (
                      <li key={`${p.kind}:${p.name}`}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`Select ${p.name}`}
                          onClick={() => setSelected(p.name)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                            on
                              ? 'bg-accent-50 ring-1 ring-accent-500 dark:bg-accent-900/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {p.kind === 'role' ? (
                            <Layers aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          ) : (
                            <UserRound aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800 dark:text-slate-200">
                            {p.name}
                            <span className="ml-1.5 text-xs text-slate-400">{p.kind}</span>
                            {p.disabled && (
                              <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">disabled</span>
                            )}
                          </span>
                          {gt ? (
                            <span className="shrink-0 rounded-full bg-accent-600/10 px-2 py-0.5 text-xs font-medium text-accent-700 dark:bg-accent-900/30 dark:text-accent-200">
                              {grantLabel(gt)}
                            </span>
                          ) : (
                            <span className="shrink-0 text-xs text-slate-300 dark:text-slate-600">not set</span>
                          )}
                          <ChevronRight aria-hidden className={`h-3.5 w-3.5 shrink-0 ${on ? 'text-accent-500' : 'text-slate-300 dark:text-slate-600'}`} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {shown.length > 200 && (
                  <p className="mt-1 text-xs text-slate-400">
                    {shown.length - 200} more — narrow the search to see them.
                  </p>
                )}
              </>
            )}
          </section>

          {/* detail: the SELECTED principal's access, as role cards */}
          <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            {!selectedPrincipal ? (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center">
                <UserRound aria-hidden className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Select a person or role on the left to set its access.
                </p>
                <p className="max-w-xs text-xs text-slate-400 dark:text-slate-500">
                  Access grants a Data360 role, whose data permission is reused from the application&rsquo;s
                  access role — never a table granted directly.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedPrincipal.kind === 'role' ? (
                    <Layers aria-hidden className="h-4 w-4 text-accent-500" />
                  ) : (
                    <UserRound aria-hidden className="h-4 w-4 text-accent-500" />
                  )}
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedPrincipal.name}</h4>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{selectedPrincipal.kind}</span>
                  {selectedGrant ? (
                    <span className="ml-auto rounded-full bg-accent-600/10 px-2 py-0.5 text-xs font-medium text-accent-700 dark:bg-accent-900/30 dark:text-accent-200">
                      will get {grantLabel(selectedGrant)}
                    </span>
                  ) : (
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">no new grant chosen</span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pick what {selectedPrincipal.name} may do. Each card is a Data360 role — the data it can read
                  is the same for all of them; the role decides what it may DO.
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {/* No-access card first — explicit, not a hidden default */}
                  <button
                    type="button"
                    aria-pressed={!selectedGrant}
                    onClick={() => onMap(selectedPrincipal.name, '')}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                      !selectedGrant
                        ? 'border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800/60'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${!selectedGrant ? 'border-slate-500 bg-slate-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {!selectedGrant && <Check aria-hidden className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200">No new grant</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        Leaves this principal as it already is — nothing is added.
                      </span>
                    </span>
                  </button>

                  {grantTypes.map((g) => {
                    const on = selectedGrant === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={on}
                        aria-label={`Grant ${g.label ?? g.id} to ${selectedPrincipal.name}`}
                        onClick={() => onMap(selectedPrincipal.name, g.id)}
                        className={`flex items-start gap-2 rounded-lg border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                          on
                            ? 'border-accent-500 bg-accent-50 dark:border-accent-500 dark:bg-accent-900/20'
                            : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                        }`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                          {on && <Check aria-hidden className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-baseline gap-1.5">
                            <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                              {g.label ?? g.id}
                            </span>
                            {g.id === 'view' && <span className="text-xs text-slate-400">default</span>}
                          </span>
                          {g.description && (
                            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{g.description}</span>
                          )}
                          {g.actions && g.actions.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {g.actions.slice(0, 4).map((a) => (
                                <span key={a} className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  {a.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* what this application exposes — context for the grant */}
                <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <Database aria-hidden className="h-3.5 w-3.5" />
                    Data {selectedPrincipal.name} would read
                  </p>
                  {objects.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No object has been read yet.</p>
                  ) : (
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {objects.map((o, i) => {
                        const fqn = String((o as { fqn?: string }).fqn ?? '');
                        const read = String((o as { read?: string }).read ?? '');
                        const allowed = read === 'allowed' || read === 'predicted_allowed';
                        return (
                          <span
                            key={`${fqn}-${i}`}
                            title={read.startsWith('predicted') ? 'Predicted — no query ran under that role' : 'Verified by a real read'}
                            className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
                              allowed
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {fqn.split('.').slice(-1)[0] || fqn}
                          </span>
                        );
                      })}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Restrict which rows and mask which columns under the other tabs — they apply per Data360 role.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
        {actionBar}
        </div>
      )}

      {/* ══ ROW POLICIES — pick a person, edit the rows their role sees ══ */}
      {subTab === 'rows' && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <KeyRound aria-hidden className="h-3.5 w-3.5" />
            Row policies — which rows a person or group may see
          </p>
          {columns.length === 0 ? (
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
              No column in this application carries a small set of repeated values, so there is
              nothing to restrict rows by.
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                {principalPicker}
                {selected && rolePicker}
              </div>

              {!selected ? (
                <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">
                  Pick a person or group above to choose which rows they may see. A row rule is
                  written on the Data360 role they hold, so the same rule covers everyone with that
                  role.
                </p>
              ) : !anchorRole ? (
                <p className="mt-3 text-[13px] text-amber-700 dark:text-amber-400">
                  {selected} has no Data360 role yet — pick one above. A row rule lives on the role,
                  so {selected} needs one before their rows can be restricted.
                </p>
              ) : (
                <>
                  <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    Editing what <span className="font-medium">{selected}</span> sees, through the{' '}
                    <span className="font-medium">{grantLabel(anchorRole)}</span> role.{' '}
                    {sharers.length
                      ? `This rule also applies to ${sharers.length} other principal(s) with ${grantLabel(anchorRole)}: ${sharers.slice(0, 3).join(', ')}${sharers.length > 3 ? '…' : ''}.`
                      : `No one else holds ${grantLabel(anchorRole)} yet — for now the rule is theirs alone.`}{' '}
                    Every other role keeps seeing every row — you only restrict {grantLabel(anchorRole)} here.
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {columns.map((c) => {
                      const cur = policy[c.column]?.[anchorRole];
                      const kept = Array.isArray(cur) ? cur : [];
                      /* unset OR `*` both mean "sees every row" — the default;
                         narrowing starts the moment a value is picked. */
                      const seeAll = kept.length === 0;
                      return (
                        <div key={c.column} className="min-w-[220px] max-w-xs flex-1 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                          <p className="flex items-baseline gap-1.5">
                            <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{c.column}</span>
                            <span className="truncate text-xs text-slate-400">{c.tables.join(', ')}</span>
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <button
                              type="button"
                              aria-pressed={seeAll}
                              title={`${selected} sees every row of ${c.column} (no restriction)`}
                              onClick={() => onPolicy(c.column, anchorRole, '*')}
                              className={`rounded-full border px-2 py-0.5 text-xs ${
                                seeAll
                                  ? 'border-accent-500 bg-accent-600 text-white'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                              }`}
                            >
                              every row
                            </button>
                            {c.values.map((v) => {
                              const on = kept.includes(v);
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  aria-pressed={on}
                                  title={`Restrict ${selected} to rows where ${c.column} = ${v}`}
                                  onClick={() =>
                                    onPolicy(
                                      c.column,
                                      anchorRole,
                                      seeAll ? [v] : on ? kept.filter((x) => x !== v) : [...kept, v],
                                    )
                                  }
                                  className={`rounded-full border px-2 py-0.5 text-xs ${
                                    on
                                      ? 'border-accent-500 bg-accent-600 text-white'
                                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {v}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {seeAll
                              ? `${selected} sees every row of this column`
                              : `restricted to ${kept.length} value(s) — ${selected} sees no other rows`}
                          </p>
                          {(() => {
                            const hasRule = Object.values(policy[c.column] ?? {}).some((v) => Array.isArray(v) && v.length > 0);
                            const sim = sims[c.column];
                            const simTable = c.fqns[0]?.split('.').slice(-1)[0] ?? c.column;
                            return (
                              <div className="mt-1.5">
                                <button
                                  type="button"
                                  disabled={!hasRule || sim === 'running'}
                                  title={hasRule ? 'Count, on the real data, what each role would see — nothing is applied' : 'Paint at least one rule first'}
                                  onClick={() => void simulate(c.column, c.fqns[0] ?? '')}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
                                >
                                  {sim === 'running' ? <RefreshCw aria-hidden className="h-3 w-3 animate-spin" /> : <Eye aria-hidden className="h-3 w-3" />}
                                  Who would see what?
                                </button>
                                {sim && sim !== 'running' && 'error' in sim && (
                                  <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{sim.error}</p>
                                )}
                                {sim && sim !== 'running' && !('error' in sim) && (
                                  <div role="status" className="mt-1 space-y-0.5 rounded-lg bg-slate-50 p-1.5 text-xs dark:bg-slate-800/60">
                                    <p className="text-slate-500 dark:text-slate-400">
                                      measured on <span className="font-mono">{simTable}</span> · {sim.total_rows ?? '—'} rows — simulated on the plan, nothing applied
                                    </p>
                                    {c.fqns.length > 1 && (
                                      <p className="text-slate-400 dark:text-slate-500">
                                        {c.fqns.length - 1} other table(s) with {c.column} carry their own rows and are not counted here.
                                      </p>
                                    )}
                                    {Object.entries(sim.by_grant_type ?? {}).map(([gt, r]) => {
                                      const everything = r.allowed_values !== '*' && (r.share ?? 0) >= 1;
                                      return (
                                        <p key={gt} title={r.filter} className={everything ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-200'}>
                                          {grantLabel(gt)}: {r.visible_rows ?? '—'} of {sim.total_rows ?? '—'} rows
                                          {r.share != null ? ` (${Math.round(r.share * 100)}%)` : ''}
                                          {everything && ' — the chosen values cover the whole table; this restricts nothing'}
                                        </p>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Values come from the data actually observed in each column. A row rule is written on the
            Data360 role and reused by everyone who holds it — nothing is applied here; stage it
            below, then run it under Review &amp; apply.
          </p>
          {actionBar}
        </section>
      )}

      {/* ══ COLUMN MASKING (CLS) ═════════════════════════════════════ */}
      {subTab === 'masking' && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <EyeOff aria-hidden className="h-3.5 w-3.5" />
            Column masking (CLS) — which columns a person or group reads in clear
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {principalPicker}
            {selected && rolePicker}
          </div>

          {selected && anchorRole && (
            <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {masking.columns.length === 0 ? (
                  <>Nothing is masked yet.</>
                ) : masking.unmasked.includes(anchorRole) ? (
                  <>
                    <span className="font-medium">{selected}</span> reads the{' '}
                    {masking.columns.length} masked column(s) <span className="font-medium">in clear</span> —
                    their <span className="font-medium">{grantLabel(anchorRole)}</span> role is exempt.
                  </>
                ) : (
                  <>
                    <span className="font-medium">{selected}</span> sees the {masking.columns.length}{' '}
                    masked column(s) <span className="font-medium">masked</span> (their{' '}
                    <span className="font-medium">{grantLabel(anchorRole)}</span> role is not exempt).
                  </>
                )}
              </p>
              <label className="mt-1 flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={masking.unmasked.includes(anchorRole)}
                  onChange={() => onToggleUnmask(anchorRole)}
                  className="h-3.5 w-3.5"
                />
                <span>
                  Let <span className="font-medium">{selected}</span> read masked columns in clear
                  (exempt their <span className="font-medium">{grantLabel(anchorRole)}</span> role).
                </span>
              </label>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Masking has ONE exemption list for the whole change — it applies to every masked column,
            not per person. A column is seen in clear only by the roles below (ACCOUNTADMIN always
            reads clear); everyone else reads it masked:
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Seen in clear by</p>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Roles that see masked columns unmasked">
            {grantTypes.map((g) => {
              const on = masking.unmasked.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleUnmask(g.id)}
                  className={`rounded-lg px-2.5 py-1 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    on ? 'bg-accent-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {g.label ?? g.id}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              value={maskInput}
              onChange={(e) => setMaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && maskInput.trim()) {
                  onToggleMask(maskInput.trim().toUpperCase());
                  setMaskInput('');
                }
              }}
              placeholder="column to mask (e.g. EMAIL)"
              aria-label="Column to mask"
              className="h-8 w-56 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <button
              type="button"
              disabled={!maskInput.trim()}
              onClick={() => {
                onToggleMask(maskInput.trim().toUpperCase());
                setMaskInput('');
              }}
              className="h-8 rounded-lg border border-slate-200 px-2.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
            >
              Mask
            </button>
            {columns.length > 0 && <span className="text-xs text-slate-400 dark:text-slate-500">or pick:</span>}
            {columns.slice(0, 8).map((c) => (
              <button
                key={c.column}
                type="button"
                onClick={() => onToggleMask(c.column)}
                className={`rounded-full border px-2 py-0.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  masking.columns.includes(c.column)
                    ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-900/20 dark:text-accent-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {c.column}
              </button>
            ))}
          </div>

          {masking.columns.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {masking.columns.map((col) => (
                <span key={col} className="inline-flex items-center gap-1 rounded-lg border border-accent-500 bg-accent-50 px-2 py-0.5 font-mono text-xs text-accent-700 dark:bg-accent-900/20 dark:text-accent-300">
                  {col}
                  <button type="button" aria-label={`Stop masking ${col}`} onClick={() => onToggleMask(col)} className="text-accent-500 hover:text-accent-700 dark:hover:text-accent-200">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {masking.columns.length === 0
              ? 'No column masked — every role reads the real value.'
              : `${masking.columns.length} column(s) masked · seen in clear by ${masking.unmasked.map((u) => grantLabel(u)).join(', ') || 'no one'}.`}{' '}
            The masking policy is written for text columns — adapt the column type before applying. There is no row-style
            preview for masking: it is prepared as a high-risk change and takes effect only once an administrator applies
            it. A column you type is sent as written and is not checked against the model — pick from the observed columns
            when you can.
          </p>
          {actionBar}
        </section>
      )}

      {/* ══ REVIEW & APPLY — the parent's prepared-change footer ═════ */}
      {subTab === 'review' && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            Review &amp; apply
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {mapped || ruleCount || masking.columns.length
              ? `Staged: ${mapped} grant(s)${ruleCount ? `, ${ruleCount} row rule(s)` : ''}${masking.columns.length ? `, ${masking.columns.length} masked column(s)` : ''}. Prepare it, then tick and run the operations below.`
              : 'Nothing staged yet — map a person, paint a row rule or mask a column on the other tabs, then prepare the change. Any operations already listed below are the baseline access-role scaffolding this application needs.'}
          </p>
          <div className="mt-2">{footer}</div>
        </section>
      )}
    </div>
  );
}
