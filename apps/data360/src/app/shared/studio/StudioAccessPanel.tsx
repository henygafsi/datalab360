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
  listAccountPrincipals,
  suggestRls,
  testDraftAccess,
  type AccessMutation,
  type AccessObjectRead,
  type AccessView,
  type RlsSuggestion,
} from '@/app/services/studio/studio-api';
import StudioGovernanceMap, {
  type PolicyMapping,
  type Principal,
  type RoleMapping,
} from '@/app/shared/studio/StudioGovernanceMap';

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
  const [grantType, setGrantType] = useState('view');
  /** column of the ready-made row policy, '' = the whole table */
  const [policyColumn, setPolicyColumn] = useState('');
  const [policyValues, setPolicyValues] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [tests, setTests] = useState<AccessObjectRead[] | null>(null);
  /** the plan's reuse decisions — "template X already grants READ", the
   *  honest reason a plan can be right while creating NOTHING */
  const [planDecisions, setPlanDecisions] = useState<
    Array<{ subject?: { name?: string }; data360_role?: string; decision?: string; why?: string }>
  >([]);
  const [showSql, setShowSql] = useState(false);
  /** who exists on the account — the map associates, it never invents */
  const [principals, setPrincipals] = useState<Principal[] | null>(null);
  const [principalsNote, setPrincipalsNote] = useState<string | null>(null);
  const [mapping, setMapping] = useState<RoleMapping>({});
  const [policy, setPolicy] = useState<PolicyMapping>({});
  /** column-level security: masked columns + the roles that still see them in
   *  clear (defaults to the privileged pair, admin + approve). */
  const [maskedCols, setMaskedCols] = useState<string[]>([]);
  const [unmaskedGrants, setUnmaskedGrants] = useState<string[]>(['approve', 'admin']);

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
    void listAccountPrincipals()
      .then((r) => {
        setPrincipals(r.principals);
        setPrincipalsNote(r.note ?? null);
      })
      .catch(() => {
        setPrincipals([]);
        setPrincipalsNote('The account’s users and roles could not be read.');
      });
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

  const plan = () => {
    /* The whole map goes in one plan: every principal that was associated,
     * and every policy column with the values each Data360 role may see.
     * `restrictions` is an OBJECT with a `rows` list, and each rule names
     * its values per grant type — a bare list under a `values` key was
     * rejected with 400 "Input should be a valid dictionary", which is how
     * this step came to do nothing at all, silently. */
    const who = Object.entries(mapping)
      .filter(([, gt]) => Boolean(gt))
      .map(([name, gt]) => {
        const p = (principals ?? []).find((x) => x.name === name);
        const kind = p?.kind ?? 'role';
        /* grant_type travels for a PERSON only. On a warehouse role the
         * server derives the functional role itself, and sending one made
         * the read run under a role the session already holds — turning a
         * prediction into a false "verified". */
        return kind === 'user' ? { type: kind, name, grant_type: gt } : { type: kind, name };
      });
    if (who.length === 0) return;
    // taken from the MAPPING: a warehouse role travels without a grant_type
    // (the server derives it), so reading it back off `who` would drop it
    const grant_types = [...new Set(Object.values(mapping).filter(Boolean))];

    const rows = Object.entries(policy)
      .map(([column, byGrant]) => {
        const allowed_values_by_grant_type: Record<string, string[] | '*'> = {};
        for (const [gt, vals] of Object.entries(byGrant ?? {})) {
          if (vals === '*') allowed_values_by_grant_type[gt] = '*';
          else if (Array.isArray(vals) && vals.length) allowed_values_by_grant_type[gt] = vals;
        }
        return Object.keys(allowed_values_by_grant_type).length
          ? { column, allowed_values_by_grant_type }
          : null;
      })
      .filter(Boolean);

    // rows (RLS) and masked columns (CLS) travel in ONE restrictions object:
    // the masking policy is generated per masked column, and the roles NOT in
    // unmasked_grant_types see the value hidden.
    const restrictions: Record<string, unknown> = {};
    if (rows.length) restrictions.rows = rows;
    if (maskedCols.length) {
      restrictions.columns_masked = maskedCols;
      restrictions.unmasked_grant_types = unmaskedGrants;
    }

    void run('plan', async () => {
      const res = (await planDraftAccess(draftId, {
        who,
        grant_types,
        ...(Object.keys(restrictions).length ? { restrictions } : {}),
      } as never)) as { reuse?: typeof planDecisions; plan?: { reuse?: typeof planDecisions } };
      // the draft-scoped route nests the decisions under `plan`
      setPlanDecisions(res?.plan?.reuse ?? res?.reuse ?? []);
    });
  };

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

      {/* Governance is a MAP, not a journey: everything on screen, and the
          only act is to associate someone who exists with a Data360 role,
          and a policy column with the values each role may see. */}
      <StudioGovernanceMap
        draftId={draftId}
        view={view}
        gov={gov}
        grantTypes={grantTypes}
        principals={principals}
        principalsNote={principalsNote ?? undefined}
        mapping={mapping}
        onMap={(name, gt) => setMapping((m) => ({ ...m, [name]: gt }))}
        policy={policy}
        onPolicy={(col, gt, vals) =>
          setPolicy((pp) => ({ ...pp, [col]: { ...(pp[col] ?? {}), [gt]: vals } }))
        }
        masking={{ columns: maskedCols, unmasked: unmaskedGrants }}
        onToggleMask={(col) =>
          setMaskedCols((cs) => (cs.includes(col) ? cs.filter((c) => c !== col) : [...cs, col]))
        }
        onToggleUnmask={(gt) =>
          setUnmaskedGrants((gs) => (gs.includes(gt) ? gs.filter((g) => g !== gt) : [...gs, gt]))
        }
        footer={(<>

      {/* the step's own footer button prepares the change — no second
          primary action competing with it here */}
      {busy === 'plan' && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
          Preparing…
        </p>
      )}
      {planDecisions.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {planDecisions.map((r, i) => (
            <li
              key={i}
              className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[13px] text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
            >
              {r.subject?.name}: already covered as {r.data360_role} — {r.why ?? 'nothing to create'}
            </li>
          ))}
        </ul>
      )}
      {mutations.length === 0 && planDecisions.length === 0 && busy !== 'plan' && (
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Nothing is prepared yet. Map at least one person or role above, then prepare the change —
          an administrator still has to tick and run it.
        </p>
      )}
      <button
        type="button"
        disabled={busy != null || Object.values(mapping).filter(Boolean).length === 0}
        onClick={() => plan()}
        title={
          Object.values(mapping).filter(Boolean).length === 0
            ? 'Map someone to a Data360 role first'
            : 'Prepare the change — nothing runs yet'
        }
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        {busy === 'plan' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
        Prepare the change
      </button>

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
                    /* test MYSELF plus everyone the map associated — reading
                     * only 'me' proves nothing about the people this change
                     * is for, and that is the whole question here. */
                    const mapped = Object.entries(mapping)
                      .filter(([, gt]) => Boolean(gt))
                      .map(([name]) => name.toUpperCase());
                    setTests(await testDraftAccess(draftId, ['me', ...mapped]));
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
        </>)}
      />
    </div>
  );
}
