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
  LayoutGrid,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import type { AccessView, RlsSuggestion } from '@/app/services/studio/studio-api';
import StudioAccessGrid from '@/app/shared/studio/StudioAccessGrid';
import StudioGiveAccess from '@/app/shared/studio/StudioGiveAccess';

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

type SubTab = 'give' | 'grid' | 'people' | 'review';

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
  const [subTab, setSubTab] = useState<SubTab>('give');
  /** the principal whose access is being edited — SHARED across every tab:
   *  pick a person on « People & roles » and the policy tabs edit what THAT
   *  person sees (resolved to their Data360 role, since row/column policies
   *  live on the role, never on the individual). */
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
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

  /* Prepare / Test on the policy tab itself — the full checkboxed apply
     stays under « Review & apply », one click away. */
  const actionBar = (onPrepare || onTest) && (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      {onPrepare && (
        <button
          type="button"
          disabled={busy != null || canPrepare === false}
          // the prepared change, its result and any error render under
          // « Review & apply »; open it so the outcome is on the tab the user
          // is looking at, instead of a spinner that stops with nothing shown.
          onClick={() => {
            onPrepare();
            setSubTab('review');
          }}
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
          // the test results render under « Review & apply » — open it so the
          // reads show where the user is looking, not on a hidden tab.
          onClick={() => {
            onTest();
            setSubTab('review');
          }}
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
    { id: 'give', label: 'Give access', icon: UserPlus, count: mapped || undefined },
    { id: 'grid', label: 'Access grid', icon: LayoutGrid, count: ruleCount + masking.columns.length || undefined },
    { id: 'people', label: 'People & roles', icon: Users },
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
        <p
          className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
          title="People → Data360 roles → the access role and its policies. A person is never granted a table directly. This panel composes NEW access; a standing grant is verified by Test the reads, not assumed."
        >
          {/* ONE line — the full doctrine stays in the tooltip, not on the page */}
          A person gets a role, never a table. Viewer = read the application; higher roles add what
          they may do.
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

      {/* ══ GIVE ACCESS — person-first, deny-by-default, ≤4 roles ═════ */}
      {subTab === 'give' && (
        <StudioGiveAccess
          draftId={draftId}
          principals={principals}
          principalsNote={principalsNote}
          grantTypes={grantTypes}
          onMap={onMap}
          tablesCount={objects.length}
          actionBar={actionBar}
        />
      )}

      {/* ══ ACCESS GRID — columns × roles, navigable by grant type ════ */}
      {subTab === 'grid' && (
        <StudioAccessGrid
          draftId={draftId}
          grantTypes={grantTypes}
          columns={columns}
          policy={policy}
          onPolicy={onPolicy}
          masking={masking}
          onToggleMask={onToggleMask}
          onToggleUnmask={onToggleUnmask}
          accessRole={roles.access_role}
          tablesCount={objects.length}
          actionBar={actionBar}
        />
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
