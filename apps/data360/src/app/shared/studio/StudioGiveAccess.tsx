'use client';

/**
 * StudioGiveAccess — access starts from the PERSON, not from the machinery.
 *
 * The user directive this implements: « partir d'un user / groupe → choisir un
 * panier de données (deny by default) → rôles déjà lus et compris → l'IA
 * propose, y compris le nettoyage ». One simple panel, three questions:
 *
 *   ① WHO — pick one or several users / groups (they exist on the account;
 *      nothing is typed free-hand). DENY BY DEFAULT is said in words: nobody
 *      sees anything of an application until an admin applies a grant.
 *   ② WHAT THEY SEE — the data basket: « everything the application reads »
 *      (the app's access role, the common case) or one of the saved data
 *      profiles (rows / masked columns already composed). Fine-tuning lives
 *      in the Access grid, one tab away.
 *   ③ WHAT THEY MAY DO — at most FOUR role cards by default (View · Edit ·
 *      Operate · Admin); any further served role stays behind « More roles ».
 *
 * The backend session is the source of truth: what a person ALREADY holds is
 * read from the served assignments (free GET of persisted state) and said
 * inline — and the same read powers the CLEAN-UP proposals: grants whose
 * state drifted outside the plan (applied_outside / revoked_outside) are
 * listed with a dry-run-first revoke. Nothing here executes without an
 * explicit apply; a proposal is never a fact.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eraser,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
} from 'lucide-react';
import {
  createAssignment,
  getAssignments,
  listProfiles,
  removeAssignment,
  type AccessProfile,
  type AssignmentsView,
} from '@/app/services/studio/access-profiles';
import { emitAccessChanged } from '@/app/services/studio/studio-bus';
import type { GrantTypeInfo, Principal } from '@/app/shared/studio/StudioGovernanceMap';

/** the four roles shown by default — anything else the backend serves stays
 *  behind « More roles » (presentation only; nothing served is hidden). */
const DEFAULT_ROLE_IDS = ['view', 'edit', 'operate', 'admin'];

type Basket = { kind: 'app' } | { kind: 'profile'; profile: AccessProfile };

export default function StudioGiveAccess({
  draftId,
  principals,
  principalsNote,
  grantTypes,
  onMap,
  tablesCount,
  actionBar,
}: {
  draftId: string;
  principals: Principal[] | null;
  principalsNote?: string;
  grantTypes: GrantTypeInfo[];
  onMap: (name: string, grantType: string) => void;
  tablesCount?: number;
  /** the shared Prepare / Review bar from the parent — the staging path */
  actionBar?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [basket, setBasket] = useState<Basket>({ kind: 'app' });
  const [role, setRole] = useState('view');
  const [moreRoles, setMoreRoles] = useState(false);
  const [profiles, setProfiles] = useState<AccessProfile[] | null>(null);
  const [assign, setAssign] = useState<AssignmentsView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** cleanup: armed assignment_id → its dry-run outcome awaiting confirm */
  const [revokePreview, setRevokePreview] = useState<{ id: string; words: string } | null>(null);

  /* both reads are FREE GETs of persisted state (the honesty cost rule):
     the baskets that exist, and what everyone already holds — so the panel
     can SAY what the backend session already knows instead of asking. */
  const loadServed = useCallback(() => {
    void listProfiles(draftId)
      .then((v) => setProfiles(v.profiles ?? []))
      .catch(() => setProfiles([]));
    void getAssignments(draftId)
      .then(setAssign)
      .catch(() => setAssign(null));
  }, [draftId]);
  useEffect(() => loadServed(), [loadServed]);

  const shown = useMemo(() => {
    // the application's Access page grants DATA to ROLES — never to a
    // person directly (user directive): individual users are managed in
    // Administration; here only roles/groups can receive access
    const list = (principals ?? []).filter((p) => p.kind === 'role');
    const needle = q.trim().toLowerCase();
    return (needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list).slice(0, 30);
  }, [principals, q]);
  const usersHidden = useMemo(
    () => (principals ?? []).filter((p) => p.kind === 'user').length,
    [principals],
  );

  /** what a principal ALREADY holds — read, never assumed */
  const heldBy = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const it of assign?.items ?? []) {
      const n = it.principal?.name;
      if (!n) continue;
      m.set(
        n.toUpperCase(),
        (it.grants ?? [])
          .filter((g) => g.state === 'applied' || g.state === 'applied_outside')
          .map((g) => String(g.grant_type ?? '')),
      );
    }
    return m;
  }, [assign]);

  /** the DRIFT — grants whose real state left the plan; the clean-up source */
  const drift = useMemo(() => {
    const rows: Array<{ id: string; who: string; grant: string; state: string }> = [];
    for (const it of assign?.items ?? []) {
      for (const g of it.grants ?? []) {
        if ((g.state === 'applied_outside' || g.state === 'revoked_outside') && g.assignment_id) {
          rows.push({
            id: g.assignment_id,
            who: String(it.principal?.name ?? '—'),
            grant: String(g.grant_type ?? '—'),
            state: String(g.state),
          });
        }
      }
    }
    return rows;
  }, [assign]);

  const roleCards = grantTypes.filter((g) => DEFAULT_ROLE_IDS.includes(g.id));
  const extraRoles = grantTypes.filter((g) => !DEFAULT_ROLE_IDS.includes(g.id));

  const togglePick = (name: string) =>
    setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  /** GRANT: the app basket stages through the parent's plan (Prepare →
   *  Review, nothing runs); a PROFILE basket posts assignments dry-run-first
   *  through the profiles engine, one outcome per person. */
  const grant = async () => {
    setError(null);
    setNote(null);
    if (picked.length === 0) return;
    if (basket.kind === 'app') {
      for (const name of picked) onMap(name, role);
      setNote(
        `${picked.length} grant(s) staged — nothing runs before Prepare, then an explicit apply under Review.`,
      );
      return;
    }
    setBusy('grant');
    try {
      let ok = 0;
      const refusals: string[] = [];
      for (const name of picked) {
        const p = (principals ?? []).find((x) => x.name === name);
        const r = await createAssignment(draftId, {
          principal: { type: p?.kind ?? 'user', name },
          grant_type: role,
          profile_id: basket.profile.profile_id,
          confirm: true,
        });
        if (r.ok) ok += 1;
        else refusals.push(`${name}: ${r.refusal.message ?? 'refused'}`);
      }
      if (refusals.length) setError(refusals.join(' · '));
      setNote(
        `${ok} of ${picked.length} assignment(s) recorded on « ${basket.profile.name ?? basket.profile.profile_id} » — compile & apply the profile to make them real.`,
      );
      emitAccessChanged(draftId);
      loadServed();
    } catch (e) {
      // a transport failure must never be silent — the user just clicked GIVE ACCESS
      setError(e instanceof Error ? e.message : 'The assignment could not be sent — nothing was recorded.');
    } finally {
      setBusy(null);
    }
  };

  /** CLEAN-UP: dry-run first (the revoke SQL is shown), confirm second. */
  const revoke = async (id: string, confirm: boolean) => {
    setBusy(`rv:${id}`);
    setError(null);
    try {
      const r = await removeAssignment(draftId, id, confirm);
      if (!r.ok) {
        setError(r.refusal.message ?? 'The revoke was refused.');
      } else if (!confirm) {
        const sql = String((r.value as { revoke_sql?: string })?.revoke_sql ?? '');
        setRevokePreview({ id, words: sql || 'The revoke is ready — nothing has run yet.' });
      } else {
        setRevokePreview(null);
        setNote('Revoked — the grant is gone and the proof kept.');
        emitAccessChanged(draftId);
        loadServed();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The revoke could not be sent — the grant is unchanged.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* deny-by-default, said in words — the contract of the whole surface */}
      <p className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        <ShieldCheck aria-hidden className="mr-1 inline h-3.5 w-3.5 text-accent-500" />
        By default <span className="font-medium">nobody sees anything</span> of this application —
        access exists only once a grant below is applied by an admin. What a person already holds is
        read from the account, never assumed.
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* ── ① WHO ─────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <UserPlus aria-hidden className="h-3.5 w-3.5" /> ① Which roles get access
          </p>
          {principals == null ? (
            <div className="mt-2 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
          ) : principals.length === 0 ? (
            <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
              {principalsNote ?? 'No user or role could be read from the account.'}
            </p>
          ) : (
            <>
              <label className="relative mt-2 block">
                <span className="sr-only">Search people and groups</span>
                <Search aria-hidden className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search a role or a group"
                  className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </label>
              {usersHidden > 0 && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  data is granted to roles, never to a person — the {usersHidden} account user(s)
                  are assigned to roles (and created){' '}
                  <a
                    href="/administration"
                    className="rounded text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
                  >
                    in Administration
                  </a>
                  .
                </p>
              )}
              <ul className="mt-2 max-h-56 space-y-0.5 overflow-auto pr-0.5">
                {shown.map((p) => {
                  const on = picked.includes(p.name);
                  const held = heldBy.get(p.name.toUpperCase()) ?? [];
                  return (
                    <li key={`${p.kind}:${p.name}`}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePick(p.name)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                          on ? 'bg-accent-50 ring-1 ring-accent-500 dark:bg-accent-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                          {on && <Check aria-hidden className="h-3 w-3" />}
                        </span>
                        {p.kind === 'role' ? (
                          <Layers aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        ) : (
                          <UserRound aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{p.name}</span>
                        {held.length > 0 && (
                          <span
                            className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-px text-[11px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            title={`Already holds: ${held.join(', ')} (read from the account)`}
                          >
                            holds {held[0]}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {picked.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {picked.length} selected — {picked.join(', ')}
                </p>
              )}
            </>
          )}
        </section>

        {/* ── ② WHAT THEY SEE — the basket ─────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Layers aria-hidden className="h-3.5 w-3.5" /> ② What data they see
          </p>
          <div className="mt-2 space-y-1.5">
            <button
              type="button"
              aria-pressed={basket.kind === 'app'}
              onClick={() => setBasket({ kind: 'app' })}
              className={`w-full rounded-lg border p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                basket.kind === 'app'
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
              }`}
            >
              <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200">
                Everything the application reads
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                the {tablesCount ?? '—'} table(s) of this application — the common case
              </span>
            </button>
            {(profiles ?? []).map((pr) => {
              const on = basket.kind === 'profile' && basket.profile.profile_id === pr.profile_id;
              return (
                <button
                  key={pr.profile_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setBasket({ kind: 'profile', profile: pr })}
                  className={`w-full rounded-lg border p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    on ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200">
                    {pr.name ?? pr.profile_id}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {pr.objects?.length ?? 0} object(s)
                    {pr.rows?.length ? ` · ${pr.rows.length} row rule(s)` : ''}
                    {pr.columns_masked?.length ? ` · ${pr.columns_masked.length} masked` : ''}
                    {pr.state ? ` · ${String(pr.state).replace(/_/g, ' ')}` : ''}
                  </span>
                </button>
              );
            })}
            {profiles != null && profiles.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No saved basket yet — « Data profiles » above creates one; row rules and masking are
                fine-tuned in the Access grid.
              </p>
            )}
          </div>
        </section>

        {/* ── ③ WHAT THEY MAY DO — ≤4 roles by default ─────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> ③ What they may do
          </p>
          <div className="mt-2 space-y-1.5">
            {roleCards.map((g) => {
              const on = role === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRole(g.id)}
                  className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    on ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                    {on && <Check aria-hidden className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-1.5 text-[13px] font-medium text-slate-800 dark:text-slate-200">
                      {g.label ?? g.id}
                      {g.id === 'view' && <span className="text-xs font-normal text-slate-400">default</span>}
                    </span>
                    {g.description && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{g.description}</span>
                    )}
                  </span>
                </button>
              );
            })}
            {extraRoles.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={moreRoles}
                  onClick={() => setMoreRoles((v) => !v)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  {moreRoles ? 'Fewer roles' : `More roles (${extraRoles.map((g) => g.label ?? g.id).join(', ')})…`}
                </button>
                {moreRoles &&
                  extraRoles.map((g) => {
                    const on = role === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRole(g.id)}
                        className={`flex w-full items-start gap-2 rounded-lg border p-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                          on ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {g.label ?? g.id}
                      </button>
                    );
                  })}
              </>
            )}
          </div>
        </section>
      </div>

      {/* the one action — staged, never silent */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={picked.length === 0 || busy != null}
          onClick={() => void grant()}
          title={
            picked.length === 0
              ? 'Pick at least one person or group first'
              : basket.kind === 'app'
                ? 'Stages the grant — Prepare then apply under Review; nothing runs now'
                : 'Records the assignment on the basket — the profile still has to be compiled & applied'
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {busy === 'grant' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          Give {picked.length || ''} {picked.length === 1 ? 'person' : 'people'} {grantTypes.find((g) => g.id === role)?.label ?? role} access
        </button>
        {note && <p className="text-xs text-emerald-700 dark:text-emerald-300">{note}</p>}
        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      {/* ── the AI-read CLEAN-UP — drift proposed for revoke, dry-run first ── */}
      {drift.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-950/20">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
            <Eraser aria-hidden className="h-3.5 w-3.5" />
            Proposed clean-up — {drift.length} grant{drift.length > 1 ? 's' : ''} drifted outside the plan
          </p>
          <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/80">
            Read from the account, not assumed: these grants changed outside Data360. Revoking is
            dry-run first — the exact SQL shows before anything runs.
          </p>
          <ul className="mt-2 space-y-1">
            {drift.slice(0, 8).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="font-medium text-slate-800 dark:text-slate-200">{d.who}</span>
                <span className="text-slate-500 dark:text-slate-400">{d.grant}</span>
                <span className="rounded-full bg-white px-1.5 py-px text-xs text-amber-700 dark:bg-slate-900 dark:text-amber-300">
                  {d.state.replace(/_/g, ' ')}
                </span>
                {revokePreview?.id === d.id ? (
                  <span className="flex w-full items-center gap-2 pl-5">
                    <span className="min-w-0 truncate font-mono text-xs text-slate-500 dark:text-slate-400" title={revokePreview.words}>
                      {revokePreview.words}
                    </span>
                    <button
                      type="button"
                      disabled={busy === `rv:${d.id}`}
                      onClick={() => void revoke(d.id, true)}
                      className="shrink-0 rounded-lg bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Confirm the revoke
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokePreview(null)}
                      className="shrink-0 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy === `rv:${d.id}`}
                    onClick={() => void revoke(d.id, false)}
                    className="ml-auto rounded-lg border border-amber-300/70 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-950/40"
                  >
                    {busy === `rv:${d.id}` ? 'Preparing…' : 'Revoke (dry-run)'}
                  </button>
                )}
              </li>
            ))}
            {drift.length > 8 && (
              <li className="pl-5 text-xs text-amber-700/80 dark:text-amber-300/70">
                +{drift.length - 8} more — the full truth per principal lives under Data profiles →
                assignments.
              </li>
            )}
          </ul>
        </section>
      )}

      {actionBar}
    </div>
  );
}
