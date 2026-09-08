'use client';

/**
 * StudioAccessPanel — governance BY ROLE, in three plain steps.
 *
 *   1. WHO gets access — a person or a role.
 *   2. WHAT they may do — a palette of at most five roles, each card saying
 *      in business words what it allows (never an enum in a select).
 *   3. WHICH data they see — the tables the application exposes and, when
 *      the rows must be restricted, a ready-made row policy picked from the
 *      values actually observed in the column.
 *
 * The layering never changes: object grants live ONCE on the hidden
 * <APP>_ACCESS role, which is granted to the functional roles — so the same
 * data permission is reused instead of being duplicated per person.
 *
 * Honesty rules kept from C-3: planning EXECUTES NOTHING (it returns a diff
 * with the exact SQL and its undo), apply is dry-run by default and runs
 * only the checked mutations, a 403 APPROVAL_REQUIRED renders verbatim, and
 * a read is marked verified only when a query really ran under that role.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Play, RefreshCw, ShieldCheck, Table2 } from 'lucide-react';
import {
  applyDraftAccess,
  getAccess,
  getGrantTypes,
  planDraftAccess,
  suggestRls,
  testDraftAccess,
  type AccessMutation,
  type AccessObjectRead,
  type AccessView,
  type RlsSuggestion,
} from '@/app/services/studio/studio-api';
import StudioStepper from '@/app/shared/studio/StudioStepper';

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: { message?: string; error_code?: string; how?: string } | string } } })
    ?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return `${detail.message}${detail.how ? ` — ${detail.how}` : ''}`;
  if (detail?.error_code) return detail.error_code;
  return e instanceof Error ? e.message : 'The action failed.';
}

function ReadChip({ r }: { r?: string }) {
  const allowed = r === 'allowed' || r === 'predicted_allowed';
  const predicted = String(r ?? '').startsWith('predicted');
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        allowed
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      }`}
      title={
        predicted
          ? 'Predicted — your session does not hold that role, so no query was run under it'
          : 'Verified by a real read'
      }
    >
      {allowed ? 'can read' : 'cannot read'}
      {predicted ? ' (predicted)' : ''}
    </span>
  );
}

interface GrantType {
  id: string;
  label?: string;
  description?: string;
  actions?: string[];
  template_role?: string;
  product_level?: string;
}

export default function StudioAccessPanel({ draftId }: { draftId: string }) {
  const [view, setView] = useState<AccessView | 'loading' | 'error'>('loading');
  const [grantTypes, setGrantTypes] = useState<GrantType[]>([]);
  const [gov, setGov] = useState<RlsSuggestion | null>(null);
  const [who, setWho] = useState('');
  const [whoKind, setWhoKind] = useState<'user' | 'role'>('user');
  const [grantType, setGrantType] = useState('view');
  /** column of the ready-made row policy, '' = the whole table */
  const [policyColumn, setPolicyColumn] = useState('');
  const [policyValues, setPolicyValues] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [tests, setTests] = useState<AccessObjectRead[] | null>(null);
  const [showSql, setShowSql] = useState(false);
  /** the guided flow: one decision per step */
  const [step, setStep] = useState(0);

  const load = useCallback(async () => {
    try {
      setView(await getAccess(draftId));
    } catch {
      setView('error');
    }
  }, [draftId]);

  useEffect(() => {
    void load();
    void getGrantTypes()
      .then((gts) =>
        setGrantTypes(
          gts
            .map((g) => ({
              id: String(g.grant_type ?? g.id ?? ''),
              label: g.label,
              description: g.description,
              actions: (g as { actions?: string[] }).actions,
              template_role: (g as { template_role?: string }).template_role,
              product_level: (g as { product_level?: string }).product_level,
            }))
            .filter((g) => g.id),
        ),
      )
      .catch(() => undefined);
    void suggestRls(draftId)
      .then(setGov)
      .catch(() => undefined); // the palette still works without candidates
  }, [draftId, load]);

  if (view === 'loading')
    return <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (view === 'error')
    return (
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        Access could not be read for this application.
      </p>
    );

  const me = view.me ?? {};
  const mutations: AccessMutation[] = view.diff?.mutations ?? [];
  const roles = view.diff?.roles ?? gov?.roles;
  const candidates = gov?.candidates ?? [];
  /* Resolved by TABLE + column, never by the bare column name: RLS
   * candidates are exactly the columns that repeat across tables
   * (TENANT_ID, REGION, COUNTRY). Matching on the name alone showed the
   * values observed in a DIFFERENT table than the one selected, so a
   * reader could grant row access against a value list that was never
   * the one in front of them. */
  const candidateKey = (c: { fqn?: string; column?: string }) => `${c.fqn ?? ''}.${c.column ?? ''}`;
  const chosen = candidates.find((c) => candidateKey(c) === policyColumn);

  const run = async (key: string, fn: () => Promise<unknown>, reload = true) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (reload) await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const plan = () =>
    void run('plan', () =>
      planDraftAccess(draftId, {
        who: [
          {
            type: whoKind,
            name: who.trim().toUpperCase(),
            ...(whoKind === 'user' ? { grant_type: grantType } : {}),
          },
        ],
        grant_types: [grantType],
        // the wire carries the bare column; the UI resolved WHICH table it
        // came from, so the values sent belong to the column shown
        ...(chosen && policyValues.length
          ? { restrictions: [{ column: chosen.column, values: policyValues }] }
          : {}),
      } as never),
    );

  return (
    <div className="space-y-3">
      {/* what I can read myself — the only reads that are proven */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck aria-hidden className="h-4 w-4 text-accent-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Your access on this application
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {me.username} · {me.data360_role ?? me.snowflake_role ?? '—'}
            {me.can_change_access ? ' · can change access' : ' · read-only view of your access'}
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {(me.objects ?? []).map((o) => (
            <li key={o.fqn} className="flex flex-wrap items-center gap-2 text-[13px]">
              <Table2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                {String(o.fqn ?? '').split('.').slice(-1)[0]}
              </span>
              <ReadChip r={o.read} />
              {o.query_id && (
                <span className="text-xs text-slate-400 dark:text-slate-500" title={o.query_id}>
                  proof {String(o.query_id).slice(0, 12)}…
                </span>
              )}
            </li>
          ))}
        </ul>
        {me.note && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{me.note}</p>}
      </section>

      {/* the palette: who → what → which data */}
      {/* Give access — one decision per step, never one long scroll */}
      <StudioStepper
        current={step}
        onStep={setStep}
        finishLabel="Prepare the change"
        onFinish={() => { if (who.trim()) plan(); }}
        steps={[
          {
            id: 'who',
            label: 'Who',
            title: 'Who gets access?',
            subtitle: 'A person, or a role that several people already hold.',
            canContinue: who.trim().length > 0,
            blockedReason: 'Name the person or role first.',
            content: (<>
{/* 1 — who */}
      <div className="mt-2.5">
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <select
            value={whoKind}
            onChange={(e) => setWhoKind(e.target.value as 'user' | 'role')}
            aria-label="Who kind"
            className="h-8 w-32 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="user">a person</option>
            <option value="role">a role</option>
          </select>
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder={whoKind === 'user' ? 'user name (e.g. HAHA)' : 'role name (e.g. BI_ANALYST)'}
            aria-label="Who to plan access for"
            className="h-8 w-52 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </div>
      </div>
            </>),
          },
          {
            id: 'what',
            label: 'What they may do',
            title: 'What may they do?',
            subtitle: 'At most five roles per application — pick the one that matches their job.',
            tally: grantTypes.find((g) => g.id === grantType)?.label ?? grantType,
            content: (<>
{/* 2 — what they may do: the ≤5 role cards */}
      <div className="mt-3">
        {grantTypes.length === 0 ? (
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            The role palette could not be read — planning stays available with the default role.
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label="Role to grant"
            className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {grantTypes.map((g) => {
              const active = grantType === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setGrantType(g.id)}
                  className={`rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    active
                      ? 'border-accent-500 bg-accent-50/60 dark:border-accent-600 dark:bg-accent-900/20'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {active && <Check aria-hidden className="h-3.5 w-3.5 text-accent-600" />}
                    <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                      {g.label ?? g.id}
                    </span>
                  </span>
                  {g.description && (
                    <span className="mt-0.5 block text-xs leading-snug text-slate-600 dark:text-slate-300">
                      {g.description}
                    </span>
                  )}
                  {g.template_role && (
                    <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
                      typically: {g.template_role}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
            </>),
          },
          {
            id: 'data',
            label: 'Which data',
            title: 'Which data may they see?',
            subtitle: 'The tables of this application, optionally restricted to the rows that concern them.',
            tally: policyColumn ? `${policyValues.length} value(s) kept` : 'the whole table',
            content: (<>
{/* 3 — which data: tables + a ready-made row policy */}
      <div className="mt-3">
        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">
          {(me.objects ?? []).length > 0
            ? `The ${(me.objects ?? []).length} table(s) of this application` +
              (roles?.access_role ? ', through its data-access role.' : '.')
            : 'The tables of this application.'}
        </p>
        {candidates.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">
              Restrict rows by
              <select
                value={policyColumn}
                onChange={(e) => {
                  setPolicyColumn(e.target.value);
                  setPolicyValues([]);
                }}
                className="mt-0.5 block h-8 w-64 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">no restriction — the whole table</option>
                {candidates.map((c) => (
                  <option key={candidateKey(c)} value={candidateKey(c)}>
                    {c.column}
                    {c.fqn ? ` · ${c.fqn.split('.').slice(-1)[0]}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {chosen && (
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Values they may see (observed in the data)
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {(chosen.observed_values ?? []).map((v) => {
                    const val = String(v.value ?? '');
                    const on = policyValues.includes(val);
                    return (
                      <button
                        key={val}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPolicyValues((p) =>
                            on ? p.filter((x) => x !== val) : [...p, val],
                          )
                        }
                        className={`rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                          on
                            ? 'border-accent-500 bg-accent-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                        }`}
                        title={`${v.count ?? '—'} rows carry this value`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            No column of this application holds a small set of repeated values, so there is no
            ready-made row restriction to offer.
          </p>
        )}
      </div>
            </>),
          },
          {
            id: 'review',
            label: 'Review',
            title: 'Review, then apply',
            subtitle: 'Nothing runs until you tick a line and confirm.',
            content: (<>

      {/* the step's own footer button prepares the change — no second
          primary action competing with it here */}
      {busy === 'plan' && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
          Preparing…
        </p>
      )}
      {mutations.length === 0 && busy !== 'plan' && (
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Nothing prepared yet — use « Prepare the change » below.
        </p>
      )}

      {roles?.access_role && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Data permissions live once on{' '}
          <span className="font-mono">{roles.access_role}</span> and are reused by every role
          above — a person is never granted a table directly.
        </p>
      )}

      {/* the prepared change, in words, with the SQL one click away */}
      {mutations.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Prepared change — tick what to run
          </p>
          <ul className="mt-1 space-y-1">
            {mutations.map((m) => (
              <li key={m.mutation_id} className="text-[13px]">
                <label className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={m.apply_supported === false}
                    checked={picked.has(m.mutation_id ?? '')}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(m.mutation_id ?? '');
                        else n.delete(m.mutation_id ?? '');
                        return n;
                      })
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-slate-700 dark:text-slate-200">
                    {String(m.kind ?? '').replace(/_/g, ' ')}
                  </span>
                  {m.risk && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      risk {m.risk}
                    </span>
                  )}
                  {m.apply_supported === false && (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      not applicable from here — product-role layer
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-expanded={showSql}
            onClick={() => setShowSql((v) => !v)}
            className="mt-1 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500"
          >
            {showSql ? 'Hide' : 'Show'} the exact SQL and its undo
          </button>
          {showSql && (
            <ul className="mt-1 space-y-1.5">
              {mutations.map((m) => (
                <li key={`sql-${m.mutation_id}`}>
                  <pre className="overflow-x-auto rounded bg-slate-50 p-1.5 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                    {(m.sql ?? []).join('\n')}
                  </pre>
                  {(m.undo_sql?.length ?? 0) > 0 && (
                    <p
                      className="mt-0.5 truncate font-mono text-xs text-slate-400 dark:text-slate-500"
                      title={(m.undo_sql ?? []).join('\n')}
                    >
                      undo: {(m.undo_sql ?? [])[0]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={picked.size === 0 || busy != null}
              onClick={() =>
                void run(
                  'dry',
                  async () => {
                    const r = await applyDraftAccess(draftId, [...picked], false);
                    setApplyResult(
                      `Dry run — nothing changed: the SQL above is exactly what would run (${String(r.status ?? 'previewed')}).`,
                    );
                  },
                  false,
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Dry run {picked.size || ''}
            </button>
            <button
              type="button"
              disabled={picked.size === 0 || busy != null}
              title={
                me.can_change_access
                  ? 'Executes ONLY the ticked lines — proofs and undo are kept'
                  : 'Applying needs the product ACCOUNTADMIN — the refusal renders as-is'
              }
              onClick={() =>
                void run('apply', async () => {
                  const r = await applyDraftAccess(draftId, [...picked], true);
                  setApplyResult(
                    `Applied — status ${String(r.status)}; the undo SQL is kept on the record.`,
                  );
                  setPicked(new Set());
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy === 'apply' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Apply {picked.size || ''} for real
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run(
                  'test',
                  async () => {
                    const w = who.trim().toUpperCase();
                    setTests(await testDraftAccess(draftId, w ? ['me', w] : ['me']));
                  },
                  false,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              {busy === 'test' ? (
                <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play aria-hidden className="h-3.5 w-3.5" />
              )}
              Test the reads
            </button>
          </div>
        </>
      )}

      {applyResult && (
        <p className="mt-1.5 text-[13px] text-slate-600 dark:text-slate-300">{applyResult}</p>
      )}
      {tests && (
        <ul className="mt-2 space-y-1">
          {tests.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="w-32 shrink-0 truncate font-medium text-slate-700 dark:text-slate-300">
                {t.as}
              </span>
              <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">
                {String(t.fqn ?? '').split('.').slice(-1)[0]}
              </span>
              <ReadChip r={t.read} />
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
            </>),
          },
        ]}
      />
    </div>
  );
}
