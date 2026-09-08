'use client';

/**
 * StudioGovernanceMap — governance as a MAP you read, not a journey you walk.
 *
 * The wizard asked four questions in sequence and hid the answer to each one
 * behind the next. But governance is not a decision you take once — it is a
 * state you inspect: who exists, which roles exist, what the data lets them
 * see, and which policies stand. So everything is on screen at once and the
 * only act is to ASSOCIATE: a person or a warehouse role gets a Data360
 * role; a policy column gets its allowed values per Data360 role.
 *
 * The layering is the product's, and it is stated rather than implied: data
 * permissions live ONCE on the application's access role, and the five
 * functional roles reuse it. Nobody is ever granted a table directly, which
 * is why "who can read what" is answered by a mapping and not by a list of
 * per-person grants.
 *
 * Nothing here executes. An administrator ticks what should run and applies
 * it — the prepared change keeps its exact SQL and its undo.
 */

import { useMemo, useState } from 'react';
import { Database, KeyRound, Search, ShieldCheck, Users } from 'lucide-react';
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

export default function StudioGovernanceMap({
  view,
  gov,
  grantTypes,
  principals,
  principalsNote,
  mapping,
  onMap,
  policy,
  onPolicy,
  footer,
}: {
  view: AccessView;
  gov: RlsSuggestion | null;
  grantTypes: Array<{ id: string; label?: string; description?: string }>;
  principals: Principal[] | null;
  /** why the list is short or empty — never leave that unexplained */
  principalsNote?: string;
  mapping: RoleMapping;
  onMap: (name: string, grantType: string) => void;
  policy: PolicyMapping;
  onPolicy: (column: string, grantType: string, values: string[] | '*') => void;
  footer?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  /** the role whose values are being painted — 'view' is the common case */
  const [paintRole, setPaintRole] = useState('view');
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
    const byCol = new Map<string, { column: string; tables: string[]; values: string[] }>();
    for (const c of gov?.candidates ?? []) {
      const col = c.column ?? '';
      if (!col) continue;
      const cur = byCol.get(col) ?? { column: col, tables: [], values: [] };
      if (c.fqn) cur.tables.push(c.fqn.split('.').slice(-1)[0]);
      for (const v of c.observed_values ?? []) {
        const s = String(v.value ?? '');
        if (s && !cur.values.includes(s)) cur.values.push(s);
      }
      byCol.set(col, cur);
    }
    return [...byCol.values()];
  }, [gov]);

  const mapped = Object.values(mapping).filter(Boolean).length;
  const grantLabel = (
    gts: Array<{ id: string; label?: string }>,
    id: string,
  ): string => gts.find((g) => g.id === id)?.label ?? id;

  return (
    <div className="space-y-3">
      {/* ── what already exists, stated once ─────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
          The roles this application already has
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {roles.access_role && (
            <span
              className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300"
              title="Data permissions live here once — and are reused by every role below"
            >
              {roles.access_role}
            </span>
          )}
          {Object.entries(functional).map(([k, name]) => (
            <span
              key={k}
              className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              title={String(name)}
            >
              {k}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          A person is never granted a table directly: the data permission sits once on the access
          role, and the five Data360 roles reuse it.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* ── who exists → which Data360 role ───────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Users aria-hidden className="h-3.5 w-3.5" />
              People and roles that exist
            </p>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
              {mapped} mapped
            </span>
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
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400"
                  />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search a person or a role"
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </span>
              </label>

              <ul className="mt-2 max-h-72 space-y-0.5 overflow-auto">
                {shown.slice(0, 200).map((p) => (
                  <li
                    key={`${p.kind}:${p.name}`}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800 dark:text-slate-200">
                      {p.name}
                      <span className="ml-1.5 text-xs text-slate-400">{p.kind}</span>
                      {p.disabled && (
                        <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                          disabled
                        </span>
                      )}
                    </span>
                    <select
                      value={mapping[p.name] ?? ''}
                      aria-label={`Data360 role for ${p.name}`}
                      onChange={(e) => onMap(p.name, e.target.value)}
                      className="h-8 w-36 shrink-0 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="">not mapped</option>
                      {grantTypes.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label ?? g.id}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              {shown.length > 200 && (
                <p className="mt-1 text-xs text-slate-400">
                  {shown.length - 200} more — narrow the search to see them.
                </p>
              )}
            </>
          )}
        </section>

        {/* ── the data this application exposes ─────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Database aria-hidden className="h-3.5 w-3.5" />
            The data behind it
          </p>
          {objects.length === 0 ? (
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
              No object has been read yet for this application.
            </p>
          ) : (
            <ul className="mt-2 max-h-72 space-y-0.5 overflow-auto">
              {objects.map((o, i) => {
                const fqn = String((o as { fqn?: string }).fqn ?? '');
                const read = String((o as { read?: string }).read ?? '');
                const allowed = read === 'allowed' || read === 'predicted_allowed';
                return (
                  <li key={`${fqn}-${i}`} className="flex items-center gap-2 px-1.5 py-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                      {fqn.split('.').slice(-1)[0] || fqn}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
                        allowed
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                      title={
                        read.startsWith('predicted')
                          ? 'Predicted — no query ran under that role'
                          : 'Verified by a real read'
                      }
                    >
                      {allowed ? 'readable' : read || 'not tested'}
                      {read.startsWith('predicted') ? ' (predicted)' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ── the policy palette: pick a role, then paint its values ────
       * One HORIZONTAL palette, no sideways scroll: the five-role × N-column
       * matrix of selects forced a 640px-wide table and read as a grid to
       * decode. A reader thinks "what may an editor see?", role first — so
       * the role is a palette across the top, and the columns are wrapping
       * cards whose value chips paint the answer for THAT role. */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <KeyRound aria-hidden className="h-3.5 w-3.5" />
          Row policies — what each Data360 role may see
        </p>
        {columns.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
            No column in this application carries a small set of repeated values, so there is
            nothing to restrict rows by.
          </p>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Data360 role being configured"
              className="mt-2 flex flex-wrap gap-1"
            >
              {grantTypes.map((g) => {
                const on = paintRole === g.id;
                // how many columns already carry a rule for this role
                const rules = columns.filter((c) => {
                  const v = policy[c.column]?.[g.id];
                  return v === '*' || (Array.isArray(v) && v.length > 0);
                }).length;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setPaintRole(g.id)}
                    className={`rounded-lg px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                      on
                        ? 'bg-accent-600 font-medium text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {g.label ?? g.id}
                    {rules > 0 && (
                      <span className={`ml-1.5 text-xs ${on ? 'text-white/70' : 'text-slate-400'}`}>
                        {rules}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {columns.map((c) => {
                const cur = policy[c.column]?.[paintRole];
                const all = cur === '*';
                const kept = Array.isArray(cur) ? cur : [];
                return (
                  <div
                    key={c.column}
                    className="min-w-[220px] max-w-xs flex-1 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
                  >
                    <p className="flex items-baseline gap-1.5">
                      <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                        {c.column}
                      </span>
                      <span className="truncate text-xs text-slate-400">{c.tables.join(', ')}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <button
                        type="button"
                        aria-pressed={all}
                        title={`${grantLabel(grantTypes, paintRole)} sees every row of ${c.column}`}
                        onClick={() => onPolicy(c.column, paintRole, all ? [] : '*')}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          all
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
                            disabled={all}
                            onClick={() =>
                              onPolicy(
                                c.column,
                                paintRole,
                                on ? kept.filter((x) => x !== v) : [...kept, v],
                              )
                            }
                            className={`rounded-full border px-2 py-0.5 text-xs disabled:opacity-40 ${
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
                      {all
                        ? 'every row'
                        : kept.length
                          ? `${kept.length} value(s) kept`
                          : 'no rule — this role sees no row of this column'}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Values come from the data actually observed in each column. The rules compose ONE data
          role for this application, which the Data360 roles reuse — nothing is applied here; an
          administrator reviews and runs the change below.
        </p>
      </section>

      {footer}
    </div>
  );
}
