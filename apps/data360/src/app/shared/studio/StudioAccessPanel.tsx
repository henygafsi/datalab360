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
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Play,
  RefreshCw,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import {
  applyDraftAccess,
  getAccess,
  getGrantTypes,
  planDraftAccess,
  listAccountPrincipals,
  suggestRls,
  testDraftAccess,
  type AccessApplyLine,
  type AccessApplyResult,
  type AccessMutation,
  type AccessObjectRead,
  type AccessView,
  type RlsSuggestion,
} from '@/app/services/studio/studio-api';
import { emitAccessChanged } from '@/app/services/studio/studio-bus';
import StudioAccessGovernance from '@/app/shared/studio/StudioAccessGovernance';
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

/* ── prepared-change rendering helpers ─────────────────────────────── */

export const RISK_CLS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

/** The line's TARGET, in short words, extracted from its own SQL — thirty
 *  « grant select » checkboxes with no object read as duplicates when each
 *  one actually aims at a different table. Best-effort: unknown shapes fall
 *  back to the first SQL line (still truthful, never blank). */
export function mutationTarget(m: AccessMutation): string {
  const sql = (m.sql ?? [])[0] ?? '';
  const one = sql.replace(/\s+/g, ' ').trim();
  let x: RegExpMatchArray | null;
  if ((x = one.match(/^CREATE (?:OR REPLACE )?ROLE (?:IF NOT EXISTS )?"?([\w.]+)"?/i))) return x[1];
  if ((x = one.match(/^GRANT ([\w, ]+?) ON (?:TABLE |VIEW |SCHEMA |DATABASE )?"?([\w."]+)"? TO (?:ROLE )?"?([\w.]+)"?/i)))
    return `${x[2].replace(/"/g, '')} → ${x[3]}`;
  if ((x = one.match(/^GRANT ROLE "?([\w.]+)"? TO (?:ROLE |USER )?"?([\w.]+)"?/i)))
    return `${x[1]} → ${x[2]}`;
  if ((x = one.match(/^ALTER (?:TABLE|VIEW) "?([\w."]+)"?.*?POLICY "?([\w.]+)"?/i)))
    return `${x[1].replace(/"/g, '')} · ${x[2]}`;
  if ((x = one.match(/^CREATE (?:OR REPLACE )?(?:ROW ACCESS|MASKING) POLICY (?:IF NOT EXISTS )?"?([\w.]+)"?/i)))
    return x[1];
  return one.slice(0, 80) || '—';
}

export interface MutationGroup {
  kind: string;
  words: string;
  risk: string;
  items: AccessMutation[];
}

/** Group by kind, order of first appearance; the group carries the WORST
 *  risk of its lines (high > medium > low). */
export function groupMutations(mutations: AccessMutation[]): MutationGroup[] {
  const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  const groups: MutationGroup[] = [];
  const byKind = new Map<string, MutationGroup>();
  for (const m of mutations) {
    const kind = String(m.kind ?? 'change');
    let g = byKind.get(kind);
    if (!g) {
      g = { kind, words: kind.replace(/_/g, ' '), risk: m.risk ?? 'low', items: [] };
      byKind.set(kind, g);
      groups.push(g);
    }
    g.items.push(m);
    if ((rank[m.risk ?? 'low'] ?? 0) > (rank[g.risk] ?? 0)) g.risk = m.risk ?? g.risk;
  }
  return groups;
}

/* ── decision-shaped review ────────────────────────────────────────────
 *  The prepared change grouped by what it MEANS to the reader — who gets in,
 *  what data they read, row rules, column masking — not by SQL verb. The
 *  three WHO/WHAT/WHICH steps are authored above; this makes the REVIEW read
 *  back as those decisions instead of a statement list. */
export interface DecisionCategory {
  id: string;
  title: string;
  hint: string;
  groups: MutationGroup[];
  count: number;
  supported: number;
  risk: string;
}

const DECISION_DEFS: Array<{ id: string; title: string; hint: string; test: (k: string) => boolean }> = [
  { id: 'rls', title: 'Row rules (RLS)', hint: 'which rows a role may see', test: (k) => /(^|_)(row|rls)/.test(k) },
  { id: 'cls', title: 'Column masking (CLS)', hint: 'which columns are masked, and for whom', test: (k) => /(mask|cls|column)/.test(k) },
  { id: 'read', title: 'What data they read', hint: 'schema usage and table read grants', test: (k) => /(usage|select|read)/.test(k) },
  { id: 'who', title: 'Who gets in', hint: 'the roles this application needs, and who holds them', test: (k) => /role/.test(k) },
];

const CAT_ORDER: Record<string, number> = { who: 0, read: 1, rls: 2, cls: 3, other: 4 };

export function decisionCategories(mutations: AccessMutation[]): DecisionCategory[] {
  const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  const cats = new Map<string, DecisionCategory>();
  const put = (id: string, title: string, hint: string, g: MutationGroup) => {
    let c = cats.get(id);
    if (!c) {
      c = { id, title, hint, groups: [], count: 0, supported: 0, risk: 'low' };
      cats.set(id, c);
    }
    c.groups.push(g);
    c.count += g.items.length;
    c.supported += g.items.filter((m) => m.apply_supported !== false).length;
    if ((rank[g.risk] ?? 0) > (rank[c.risk] ?? 0)) c.risk = g.risk;
  };
  for (const g of groupMutations(mutations)) {
    const def = DECISION_DEFS.find((d) => d.test(g.kind));
    if (def) put(def.id, def.title, def.hint, g);
    else put('other', 'Other changes', 'supporting operations', g);
  }
  return [...cats.values()].sort((a, b) => (CAT_ORDER[a.id] ?? 9) - (CAT_ORDER[b.id] ?? 9));
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

/** Brand rule: vendor engine names never reach customer copy; apply failures
 *  carry the raw warehouse message. */
function neutralizeVendor(s?: string | null): string {
  return (s ?? '')
    .replace(/snowflake/gi, 'the data warehouse')
    .replace(/cortex/gi, 'the analytics engine');
}

/** The apply/dry-run outcome, per the backend's uniform results[]/summary:
 *  "N applied · M not granted", each failure named with its reason. */
function AccessOutcome({ outcome }: { outcome: AccessApplyResult }) {
  const s = outcome.summary ?? {};
  const results = outcome.results ?? [];
  const dry = outcome.status === 'dry_run';
  const failed = results.filter((r) => r.status === 'failed');
  const ok = dry
    ? s.would_apply ?? results.filter((r) => r.status === 'would_apply').length
    : s.applied ?? results.filter((r) => r.status === 'applied').length;
  const failCount = s.failed ?? failed.length;
  const skipCount = s.skipped ?? results.filter((r) => r.status === 'skipped').length;
  const headline = dry
    ? `Dry run — ${ok} would apply${skipCount ? ` · ${skipCount} not applicable` : ''}. Nothing changed.`
    : `${ok} applied${failCount ? ` · ${failCount} not granted` : ''}${skipCount ? ` · ${skipCount} skipped` : ''}.`;
  const bad = failCount > 0;
  return (
    <div
      className={`mt-2 rounded-lg border p-2.5 text-[13px] ${
        bad
          ? 'border-amber-300/70 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/30'
          : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40'
      }`}
    >
      <p
        className={`flex items-center gap-1.5 font-medium ${
          bad
            ? 'text-amber-800 dark:text-amber-200'
            : dry
              ? 'text-slate-700 dark:text-slate-200'
              : 'text-emerald-700 dark:text-emerald-300'
        }`}
      >
        {bad ? (
          <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
        )}
        {headline}
      </p>
      {failed.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {failed.map((r, i) => (
            <li
              key={r.mutation_id ?? i}
              className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <span className="font-medium">{r.object ?? r.kind ?? 'operation'}</span>
              {r.subject?.name ? ` → ${r.subject.name}` : ''}:{' '}
              {(() => {
                // deterministic diagnosis of the real failure seen live: a
                // row rule attached on a column the table does not have
                const raw = String(r.reason ?? '');
                const m = raw.match(/invalid identifier '([A-Z0-9_"]+)'/i);
                if (m) {
                  return `the rule column ${m[1].replace(/"/g, '')} does not exist on this table — pick a column every targeted table actually has, or exclude this table from the rule`;
                }
                return neutralizeVendor(r.reason) || r.error_code || 'not granted';
              })()}
              {r.failed_sql && (
                <span
                  className="mt-0.5 block truncate font-mono text-[11px] opacity-80"
                  title={r.failed_sql}
                >
                  {r.failed_sql}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* skipped is NOT a failure — the plan caught these before any ALTER.
          already-attached is benign; a DIFFERENT policy offers the swap. */}
      {(() => {
        const skipped = results.filter((r) => r.status === 'skipped');
        const notable = skipped.filter((r) => r.reason || r.error_code);
        if (notable.length === 0) return null;
        return (
          <ul className="mt-1.5 space-y-1">
            {notable.map((r, i) => {
              const rr = r as AccessApplyLine & {
                already_attached?: boolean;
                existing_policy?: string;
              };
              const benign = rr.already_attached === true;
              return (
                <li
                  key={r.mutation_id ?? `sk${i}`}
                  className={`rounded px-2 py-1 text-xs ${
                    benign
                      ? 'bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400'
                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                  }`}
                >
                  <span className="font-medium">{r.object ?? r.kind ?? 'operation'}</span>:{' '}
                  {neutralizeVendor(r.reason) || 'skipped'}
                  {rr.existing_policy && !benign && (
                    <span className="mt-0.5 block truncate font-mono text-[11px] opacity-80" title={rr.existing_policy}>
                      existing: {String(rr.existing_policy).split('.').slice(-1)[0]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        );
      })()}
      {!dry && failCount > 0 && (
        <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-300/80">
          The operations that applied are kept with their undo. Fix the cause above, then re-run —
          only the not-granted lines remain to apply.
        </p>
      )}
    </div>
  );
}

export default function StudioAccessPanel({
  draftId,
  prefill,
}: {
  draftId: string;
  /** a model/quality detection redirect — seeds the grid layer + column */
  prefill?: { kind: 'mask' | 'row'; column?: string } | null;
}) {
  const [view, setView] = useState<AccessView | 'loading' | 'error'>('loading');
  const [grantTypes, setGrantTypes] = useState<GrantType[]>([]);
  const [gov, setGov] = useState<RlsSuggestion | null>(null);
  const [grantType, setGrantType] = useState('view');
  /** column of the ready-made row policy, '' = the whole table */
  const [policyColumn, setPolicyColumn] = useState('');
  const [policyValues, setPolicyValues] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /** your-own-reads proof wall — EVIDENCE, folded under the flow (the page
   *  is for giving access, not for contemplating one's own table list) */
  const [meOpen, setMeOpen] = useState(false);
  /** the operation tree is opt-in — the change applies as a whole */
  const [opsOpen, setOpsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applyResult, setApplyResult] = useState<string | null>(null);
  /** the per-mutation outcome of the last dry-run/apply — "N applied · M not
   *  granted", each failure named with its reason */
  const [applyOutcome, setApplyOutcome] = useState<AccessApplyResult | null>(null);
  /** which decision categories are expanded (collapsed by default, so the
   *  review opens as a short summary, not a wall of ticked lines) */
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
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
  const cats = decisionCategories(mutations);
  const allSupportedIds = mutations
    .filter((m) => m.apply_supported !== false)
    .map((m) => m.mutation_id ?? '')
    .filter(Boolean);
  /** what apply/dry-run acts on: the ticked lines when the reader narrowed,
   *  otherwise every supported operation (the one-click common case) */
  const applyIds = picked.size > 0 ? [...picked] : allSupportedIds;
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

  /* what work is staged — a change needs at least ONE of: a person/role
   * mapped to a Data360 role, a row rule, or a masked column. A row-rule-only
   * or masking-only change is legitimate (the backend accepts who:[] with
   * restrictions and attaches the policies to the access role), so gating
   * « Prepare the change » on the mapping alone left policy-only edits with
   * no way to run — the disabled button the user photographed. */
  /* a REAL row restriction is a role narrowed to a specific value list. `*`
   * (or unset) means "sees every row" — the default — so it is NOT a rule on
   * its own and must not enable a plan by itself. */
  const hasRowRules = Object.values(policy).some((byGrant) =>
    Object.values(byGrant ?? {}).some((v) => Array.isArray(v) && v.length > 0),
  );
  const hasMasks = maskedCols.length > 0;
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  /* the user's rule: only an admin / governor / the app's creator (given the
   * right in Administration) CHANGES access — everyone with the app may READ
   * it. The backend serves the verdict; absent stays fail-open (honest: the
   * apply itself re-checks server-side). */
  const canChange = view.me?.can_change_access !== false;
  /* seeing and preparing is NOT applying — the warehouse GRANTs need an
   * ACCOUNTADMIN-tier session, so the apply button follows its own flag */
  const canApply = view.me?.can_apply_access !== false;
  const canPrepare = canChange && (mappedCount > 0 || hasRowRules || hasMasks);

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

    /* A row policy is EXHAUSTIVE over the functional roles: any role missing
     * from `allowed_values_by_grant_type` compiles to « ELSE FALSE » and sees
     * NO rows. So restricting one role (edit → these values) while leaving the
     * others out would silently blank every other role's rows — the opposite
     * of "edit what this person sees". For every narrowed column we therefore
     * send an entry for EVERY functional role: the narrowed list for the roles
     * the user restricted, and `*` (see everything) for the rest. A column
     * with no narrowed role is not a restriction and is dropped. */
    const allRoleIds = grantTypes.map((g) => g.id);
    const rows = Object.entries(policy)
      .map(([column, byGrant]) => {
        const narrowed = Object.values(byGrant ?? {}).some((v) => Array.isArray(v) && v.length > 0);
        if (!narrowed) return null;
        const allowed_values_by_grant_type: Record<string, string[] | '*'> = {};
        for (const id of allRoleIds) {
          const v = byGrant?.[id];
          allowed_values_by_grant_type[id] = Array.isArray(v) && v.length > 0 ? v : '*';
        }
        return { column, allowed_values_by_grant_type };
      })
      .filter((r): r is { column: string; allowed_values_by_grant_type: Record<string, string[] | '*'> } => r != null);

    // Nothing staged anywhere → don't fire an empty plan.
    const hasRestrictions = rows.length > 0 || maskedCols.length > 0;
    if (who.length === 0 && !hasRestrictions) return;

    // Whenever a policy is staged, the plan must name the WHOLE set of
    // functional roles — the row/mask CASE is built over all of them, and a
    // role left out of `grant_types` is treated as FALSE (the backend now also
    // rejects restrictions with no grant type at all: 422
    // GRANT_TYPES_REQUIRED_FOR_POLICIES). Without restrictions we keep the
    // mapping-only set (default view provisioning is fine).
    const grant_types = [
      ...new Set([
        ...Object.values(mapping).filter(Boolean),
        ...(hasRestrictions ? allRoleIds : []),
      ]),
    ] as string[];

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

  /* test the reads of everyone the change is FOR — self plus every mapped
   * principal. Reading only 'me' proves nothing about the people a change
   * targets, and reads as a false « verified » when nobody is mapped. */
  const testReads = () =>
    void run(
      'test',
      async () => {
        const mapped = Object.entries(mapping)
          .filter(([, gt]) => Boolean(gt))
          .map(([name]) => name.toUpperCase());
        setTests(await testDraftAccess(draftId, ['me', ...mapped]));
      },
      false,
    );

  return (
    <div className="space-y-3">
      {/* the give-access FLOW leads — the your-own-reads proof wall moved
          below it, folded (evidence on demand, never the page's opening) */}
      {/* Governance is a MAP, not a journey: everything on screen, and the
          only act is to associate someone who exists with a Data360 role,
          and a policy column with the values each role may see. */}
      {!canChange && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          You can read this application's access, but changing it needs the application's
          creator, an admin or approve role on it, or a platform administrator — and the final
          apply always needs a platform administrator. Those roles are granted in{' '}
          <a href="/studio/admin" className="font-medium text-accent-700 hover:underline dark:text-accent-400">
            Administration
          </a>
          .
        </p>
      )}
      <StudioAccessGovernance
        draftId={draftId}
        prefill={prefill}
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
        onPrepare={() => plan()}
        onTest={testReads}
        busy={busy}
        canPrepare={canPrepare}
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
      {roles?.access_role && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Data permissions live once on{' '}
          <span className="font-mono">{roles.access_role}</span> and are reused by every role
          above — a person is never granted a table directly.
        </p>
      )}

      {/* the prepared change: GROUPED by nature, each line naming its real
          TARGET (extracted from the SQL) — thirty bare « grant select » rows
          read as duplicates when only the kind shows; and the SQL renders
          UNDER its own line, never as a second parallel list */}
      {mutations.length > 0 && allSupportedIds.length === 0 && (
        /* the user staged grants, prepared — and NOTHING can run. Say it in
           words, never as a bare « 0 operation » with a cryptic line. */
        <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          The prepared change contains only product-role mappings the backend does not yet apply
          from this panel — no warehouse operation would run, and nothing happens silently. This
          gap is reported; granting to warehouse roles will become a real, appliable operation.
        </p>
      )}
      {mutations.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Review &amp; apply — {allSupportedIds.length} operation{allSupportedIds.length > 1 ? 's' : ''} to run
          </p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {cats.map((c) => `${c.title} ${c.count}`).join(' · ')}
            {mutations.length !== allSupportedIds.length &&
              ` · ${mutations.length - allSupportedIds.length} not applicable from here`}
            . Nothing runs before an explicit dry run or apply below.
          </p>

          {/* the change applies AS A WHOLE — managing the roles above is the
              selection. The per-operation detail is opt-in, for whoever wants
              to narrow or read the SQL before signing it off. */}
          <button
            type="button"
            aria-expanded={opsOpen}
            onClick={() => setOpsOpen((o) => !o)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronRight aria-hidden className={`h-3.5 w-3.5 transition-transform ${opsOpen ? 'rotate-90' : ''}`} />
            {opsOpen ? 'Hide the operations' : `Show the ${allSupportedIds.length} operation${allSupportedIds.length > 1 ? 's' : ''} and their SQL`}
          </button>
          <div className={`mt-1.5 space-y-1.5 ${opsOpen ? '' : 'hidden'}`}>
            {cats.map((c) => {
              const open = openCats.has(c.id);
              const catIds = c.groups
                .flatMap((g) => g.items.map((m) => m.mutation_id ?? ''))
                .filter(Boolean);
              const pickedHere = catIds.filter((id) => picked.has(id)).length;
              return (
                <section key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenCats((s) => {
                        const n = new Set(s);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                    className="flex w-full items-center gap-2 p-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    {open ? (
                      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="font-medium text-slate-800 dark:text-slate-100">{c.title}</span>
                    <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline">
                      {c.hint}
                    </span>
                    <span className={`ml-auto rounded-full px-1.5 py-px text-xs ${RISK_CLS[c.risk] ?? RISK_CLS.low}`}>
                      {c.risk} risk
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-px text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {pickedHere ? `${pickedHere}/${c.count}` : c.count}
                    </span>
                  </button>

                  {open && (
                    <div className="space-y-2 border-t border-slate-100 p-2 dark:border-slate-800">
                      {c.groups.map((g) => {
                        const pickable = g.items
                          .filter((m) => m.apply_supported !== false)
                          .map((m) => m.mutation_id ?? '');
                        const pickedCount = g.items.filter((m) => picked.has(m.mutation_id ?? '')).length;
                        const allPicked = pickable.length > 0 && pickable.every((id) => picked.has(id));
                        return (
                          <div key={g.kind}>
                            <label className="flex items-center gap-2 text-[13px]">
                              <input
                                type="checkbox"
                                checked={allPicked}
                                disabled={pickable.length === 0}
                                ref={(el) => {
                                  if (el) el.indeterminate = pickedCount > 0 && !allPicked;
                                }}
                                onChange={(e) =>
                                  setPicked((p) => {
                                    const n = new Set(p);
                                    for (const id of pickable) {
                                      if (e.target.checked) n.add(id);
                                      else n.delete(id);
                                    }
                                    return n;
                                  })
                                }
                                aria-label={`Tick all: ${g.words}`}
                                className="h-3.5 w-3.5"
                              />
                              <span className="font-medium text-slate-700 dark:text-slate-200">{g.words}</span>
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                {pickedCount ? `${pickedCount}/${g.items.length} ticked` : `${g.items.length} line(s)`}
                              </span>
                            </label>
                            <ul className="mt-1 space-y-0.5 pl-5">
                              {g.items.map((m) => (
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
                                    <span className="min-w-0 truncate font-mono text-xs text-slate-600 dark:text-slate-300" title={(m.sql ?? []).join('\n')}>
                                      {mutationTarget(m)}
                                    </span>
                                    {m.apply_supported === false && (
                                      <span className="text-xs text-amber-700 dark:text-amber-400">
                                        not applicable from here — product-role layer
                                      </span>
                                    )}
                                  </label>
                                  {showSql && (
                                    <div className="mb-1 ml-5 mt-0.5">
                                      <pre className="overflow-x-auto rounded bg-slate-50 p-1.5 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                                        {(m.sql ?? []).join('\n')}
                                      </pre>
                                      {(m.undo_sql?.length ?? 0) > 0 && (
                                        <p className="mt-0.5 truncate font-mono text-xs text-slate-400 dark:text-slate-500" title={(m.undo_sql ?? []).join('\n')}>
                                          undo: {(m.undo_sql ?? [])[0]}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        aria-expanded={showSql}
                        onClick={() => setShowSql((v) => !v)}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      >
                        {showSql ? 'Hide' : 'Show'} the exact SQL and its undo
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {picked.size > 0 && (
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="mt-1 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {picked.size} selected — clear to apply all instead
            </button>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={applyIds.length === 0 || busy != null}
              onClick={() =>
                void run(
                  'dry',
                  async () => {
                    setApplyResult(null);
                    setApplyOutcome(await applyDraftAccess(draftId, applyIds, false));
                  },
                  false,
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Dry run
            </button>
            <button
              type="button"
              disabled={applyIds.length === 0 || busy != null}
              title={
                me.can_change_access
                  ? 'Runs the operations below — proofs and undo are kept'
                  : 'Applying needs the product ACCOUNTADMIN — the refusal renders as-is'
              }
              onClick={() =>
                void run('apply', async () => {
                  setApplyResult(null);
                  const out = await applyDraftAccess(draftId, applyIds, true);
                  setApplyOutcome(out);
                  setPicked(new Set());
                  // a real apply moved the in-force counts — tell the KPI strip
                  if (out.status !== 'dry_run') emitAccessChanged(draftId);
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy === 'apply' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              {picked.size > 0
                ? `Apply ${picked.size} selected`
                : `Apply all ${allSupportedIds.length} operation${allSupportedIds.length > 1 ? 's' : ''}`}
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={testReads}
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

          {/* the outcome — "N applied · M not granted", failures named */}
          {applyOutcome && (
            <AccessOutcome outcome={applyOutcome} />
          )}
        </>
      )}

      {applyResult && (
        <p className="mt-1.5 text-[13px] text-slate-600 dark:text-slate-300">{applyResult}</p>
      )}
      {tests && mappedCount === 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Only your own reads were tested — no person or role is mapped yet, so this proves your
          access, not theirs. Map someone above to test the access this change is for.
        </p>
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

      {/* your own reads — the proofs, folded: open when you need evidence */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          aria-expanded={meOpen}
          onClick={() => setMeOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-slate-800/50"
        >
          <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-accent-500" />
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Your own access — proofs
          </span>
          <span className="min-w-0 truncate text-xs text-slate-400 dark:text-slate-500">
            {me.username} · {me.data360_role ?? me.snowflake_role ?? '—'} ·{' '}
            {(me.objects ?? []).length} object(s) verified
          </span>
          <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
            {meOpen ? '−' : '+'}
          </span>
        </button>
        {meOpen && (
          <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <ul className="space-y-1">
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
          </div>
        )}
      </section>
    </div>
  );
}
