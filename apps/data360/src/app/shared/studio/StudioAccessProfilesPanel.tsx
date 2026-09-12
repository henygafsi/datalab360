'use client';

/**
 * StudioAccessProfilesPanel — governance around the PROFILE object.
 *
 * Roles say what people can DO; a data PROFILE says what data they SEE —
 * Who → can do what → on which data → under which restrictions, compiled
 * to one Snowflake role per profile + merged RLS/masking policies, with
 * the SQL always one click away as EVIDENCE, never the interface.
 *
 * The pilot list (name / state / stale / objects / assignments) swaps for
 * the profile sheet in place, stepped the way the change really flows:
 * Definition → Assignments (the truth per principal, read from SHOW
 * GRANTS — applied_outside / revoked_outside said as such) → Plan (the
 * compiled diff, grouped, each line naming its target) → Apply (dry-run
 * first, ACCOUNTADMIN-gated, refusals rendered) → Evidence (proofs +
 * undo by run_id). Observed values load ONLY on an explicit search —
 * the sample envelope is a spending decision, never a mount effect.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import {
  applyProfiles,
  compileProfiles,
  createAssignment,
  createProfile,
  deleteProfile,
  getAssignments,
  getObservedValues,
  listProfiles,
  removeAssignment,
  undoAccessRun,
  updateProfile,
  type AccessProfile,
  type ApplyResult,
  type AssignmentsView,
  type CompileResult,
  type ObservedValues,
  type ProfilePayload,
  type ProfileRow,
  type ProfilesView,
} from '@/app/services/studio/access-profiles';
import { getDraftSources, type Refusal } from '@/app/services/studio/connections';
import { listAccountPrincipals, type AccessMutation } from '@/app/services/studio/studio-api';
import { QuietAction } from '@/app/shared/studio/PlainKit';
import {
  RISK_CLS,
  groupMutations,
  mutationTarget,
} from '@/app/shared/studio/StudioAccessPanel';
import { RefusalView } from '@/app/shared/studio/sources/connection-bits';

const STATE_CLS: Record<string, string> = {
  planned: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  applied: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  partially_applied: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const GRANT_STATE_CLS: Record<string, string> = {
  planned: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  applied: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  applied_outside: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  revoked_outside: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// The guided spine the user asked for: pick/create a profile → choose the
// DATA & policies it grants → assign USERS → review & apply. "plan" and
// "evidence" fold into one Review & apply step (the proofs land there too).
const STEPS = ['data', 'users', 'apply'] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = {
  data: 'Data & policies',
  users: 'Users',
  apply: 'Review & apply',
};

/* ── the observed-values picker (explicit search, bounded) ──────────── */

function ValuesPicker({
  draftId,
  fqns,
  column,
  picked,
  onToggle,
}: {
  draftId: string;
  /** the profile's objects — the reader chooses WHICH one to observe from
   *  (a column can live in several; observing the wrong table was a real
   *  bug — the values shown must be the ones the rule actually gates). */
  fqns: string[];
  column: string;
  picked: string[];
  onToggle: (v: string) => void;
}) {
  const [q, setQ] = useState('');
  const [fqn, setFqn] = useState(fqns[0] ?? '');
  const [res, setRes] = useState<ObservedValues | 'loading' | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const search = async () => {
    if (!fqn) return;
    setRes('loading');
    setRefusal(null);
    const r = await getObservedValues(draftId, { fqn, column, q: q.trim() || undefined });
    if (r.ok) setRes(r.value);
    else {
      setRes(null);
      setRefusal(r.refusal);
    }
  };

  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {fqns.length > 1 && (
          <select
            value={fqn}
            onChange={(e) => {
              setFqn(e.target.value);
              setRes(null);
            }}
            aria-label="Observe values from which object"
            className="h-7 max-w-[12rem] rounded-lg border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {fqns.map((f) => (
              <option key={f} value={f}>
                {f.split('.').slice(-1)[0]}
              </option>
            ))}
          </select>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder={`Search observed ${column} values…`}
          aria-label={`Search observed values of ${column}`}
          className="h-7 w-56 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={() => void search()}
          title="Reads a bounded sample of this column — a spending decision, never automatic"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
        >
          <Search aria-hidden className="h-3 w-3" />
          Observe
        </button>
      </div>
      {res === 'loading' && (
        <p role="status" className="mt-1 text-xs text-slate-400 dark:text-slate-500">Reading a bounded sample…</p>
      )}
      {res && res !== 'loading' && (
        <div className="mt-1">
          <div className="flex flex-wrap gap-1">
            {res.values.map((v) => {
              const val = String(v.value ?? '');
              const on = picked.includes(val);
              return (
                <button
                  key={val}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(val)}
                  className={`rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors ${
                    on
                      ? 'border-accent-500 bg-accent-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                  }`}
                  title={`${v.count?.toLocaleString() ?? '—'} row(s) in the sample`}
                >
                  {val} · {v.count?.toLocaleString() ?? '—'}
                </button>
              );
            })}
            {res.values.length === 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                No observed value matches{res.typed?.validated === false ? ' — a typed value absent from the sample stays validated:false' : ''}.
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Bounded sample ({res.method?.sample_rows?.toLocaleString() ?? '—'} rows)
            {res.has_more ? ' · more values exist — narrow the search' : ''}. A value you type
            yourself is kept but marked unvalidated until observed.
          </p>
        </div>
      )}
      {refusal && (
        <div className="mt-1"><RefusalView refusal={refusal} /></div>
      )}
    </div>
  );
}

/* ── the object picker (categorized by schema, paginated, stable) ─────
 * Replaces the old flat chip row of every application object. Objects are
 * grouped by their schema (db.schema), each group is a collapsible
 * category with a one-line summary and a paginated grid — no infinite
 * superposed list. Selection is the controlled `selected` array, stable
 * across pages, categories and search. Reading a category or turning a
 * page is pure local state (the objects are already in hand).            */

const OBJ_PAGE = 12;

function ObjectCategory({
  schema,
  items,
  selected,
  onToggle,
  onSelectMany,
  query,
  defaultOpen,
}: {
  schema: string;
  items: string[]; // FQNs
  selected: string[];
  onToggle: (fqn: string) => void;
  onSelectMany: (fqns: string[], on: boolean) => void;
  query: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(0);
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((f) => f.toLowerCase().includes(q)) : items;
  const pageCount = Math.max(1, Math.ceil(filtered.length / OBJ_PAGE));
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(0);
  }, [page, pageCount]);
  const shown = filtered.slice(page * OBJ_PAGE, (page + 1) * OBJ_PAGE);
  const pickedHere = items.filter((f) => selected.includes(f)).length;
  const allOn = filtered.length > 0 && filtered.every((f) => selected.includes(f));
  const isOpen = open || q.length > 0;

  if (q && filtered.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{schema}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {items.length} object{items.length === 1 ? '' : 's'}
          </span>
          {pickedHere > 0 && (
            <span className="rounded-full bg-accent-600/10 px-1.5 py-px text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200">
              {pickedHere} picked
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{isOpen ? '−' : '+'}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectMany(filtered, !allOn)}
          className="shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-400"
        >
          {allOn ? 'Clear' : 'All'}
        </button>
      </div>
      {isOpen && (
        <div className="border-t border-slate-100 p-2 dark:border-slate-800">
          <div className="flex flex-wrap gap-1">
            {shown.map((fqn) => {
              const on = selected.includes(fqn);
              return (
                <button
                  key={fqn}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(fqn)}
                  title={fqn}
                  className={`rounded-full border px-2 py-0.5 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    on
                      ? 'border-accent-500 bg-accent-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {fqn.split('.').slice(-1)[0]}
                </button>
              );
            })}
          </div>
          {pageCount > 1 && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700"
              >
                Previous
              </button>
              <span className="tabular-nums">page {page + 1} of {pageCount}</span>
              <button
                type="button"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ObjectPicker({
  objects,
  selected,
  onToggle,
  onSelectMany,
}: {
  objects: string[] | null;
  selected: string[];
  onToggle: (fqn: string) => void;
  onSelectMany: (fqns: string[], on: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const bySchema = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const fqn of objects ?? []) {
      const parts = fqn.split('.');
      const schema = parts.length >= 2 ? parts.slice(0, -1).join('.') : '(unqualified)';
      if (!map.has(schema)) map.set(schema, []);
      map.get(schema)!.push(fqn);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [objects]);

  if (objects == null) {
    return (
      <div role="status" className="mt-1 h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the application&apos;s objects…</span>
      </div>
    );
  }
  if (objects.length === 0) {
    return (
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        This application reads no object yet — add sources first.
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {selected.length} of {objects.length} selected
        </span>
        <label className="relative ml-auto">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search objects"
            aria-label="Search objects"
            className="h-7 w-48 rounded-lg border border-slate-200 bg-white pl-6 pr-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
      </div>
      <div className="space-y-1.5">
        {bySchema.map(([schema, items], i) => (
          <ObjectCategory
            key={schema}
            schema={schema}
            items={items}
            selected={selected}
            onToggle={onToggle}
            onSelectMany={onSelectMany}
            query={query}
            defaultOpen={bySchema.length <= 2 || i === 0}
          />
        ))}
      </div>
    </div>
  );
}

/* ── the profile sheet ──────────────────────────────────────────────── */

function ProfileSheet({
  draftId,
  profile,
  meta,
  onClose,
  onChanged,
}: {
  draftId: string;
  /** null = creating a new profile */
  profile: AccessProfile | null;
  meta: ProfilesView;
  onClose: () => void;
  onChanged: () => void;
}) {
  const creating = profile == null;
  const [step, setStep] = useState<Step>('data');
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /* definition state */
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [objects, setObjects] = useState<string[]>(profile?.objects ?? []);
  const [rows, setRows] = useState<ProfileRow[]>(profile?.rows ?? []);
  const [masked, setMasked] = useState<string[]>(profile?.columns_masked ?? []);
  const [appObjects, setAppObjects] = useState<string[] | null>(null);

  /* assignments state */
  const [assign, setAssign] = useState<AssignmentsView | 'loading' | null>(null);
  const [principals, setPrincipals] = useState<Array<{ type: string; name: string }>>([]);
  const [newPrincipal, setNewPrincipal] = useState('');
  const [newGrant, setNewGrant] = useState('view');
  const [pendingSql, setPendingSql] = useState<string[] | null>(null);

  /* plan/apply state */
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applyRes, setApplyRes] = useState<ApplyResult | null>(null);
  const [applyArmed, setApplyArmed] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [undoArmed, setUndoArmed] = useState<string | null>(null);

  useEffect(() => {
    void getDraftSources(draftId, { limit: 200 })
      .then((v) => setAppObjects(v.items.map((i) => i.fqn ?? i.ref)))
      .catch(() => setAppObjects([]));
  }, [draftId]);

  const loadAssignments = useCallback(async () => {
    setAssign('loading');
    try {
      setAssign(await getAssignments(draftId, { limit: 30 }));
    } catch {
      setAssign(null);
    }
  }, [draftId]);

  useEffect(() => {
    if (step === 'users' && assign == null) {
      void loadAssignments();
      void listAccountPrincipals()
        .then((p) =>
          setPrincipals(
            (p.principals ?? [])
              .map((x) => ({ type: x.kind, name: x.name }))
              .filter((x) => x.name),
          ),
        )
        .catch(() => setPrincipals([]));
    }
  }, [assign, loadAssignments, step]);

  const saveDefinition = async () => {
    if (busy) return;
    setBusy('save');
    setRefusal(null);
    setNote(null);
    // A row rule is only meaningful with BOTH a column and at least one value —
    // an operator like `in ()` restricts nothing. A half-filled rule (the one
    // « + rule » adds before you type) must never be persisted as if it were a
    // real restriction, so drop the incomplete ones and say how many.
    const cleanRows = rows.filter((r) => r.column.trim() !== '' && (r.values ?? []).length > 0);
    const skipped = rows.length - cleanRows.length;
    const payload: ProfilePayload = {
      name: name.trim(),
      description: description.trim(),
      objects,
      rows: cleanRows,
      columns_masked: masked,
    };
    const r = creating
      ? await createProfile(draftId, payload)
      : await updateProfile(draftId, profile!.profile_id, {
          ...payload,
          expected_version: profile!.version ?? 0,
        });
    setBusy(null);
    if (!r.ok) setRefusal(r.refusal);
    else {
      const base = creating
        ? 'Profile created — compile the plan when the definition is ready.'
        : 'Profile saved. An applied profile edited turns stale until re-applied.';
      setNote(skipped > 0 ? `${base} ${skipped} incomplete row rule(s) were skipped — a rule needs a column and at least one value.` : base);
      onChanged();
      if (creating) onClose();
    }
  };

  const runCompile = async () => {
    if (busy) return;
    setBusy('compile');
    setRefusal(null);
    setApplyRes(null);
    const r = await compileProfiles(draftId);
    setBusy(null);
    if (!r.ok) setRefusal(r.refusal);
    else {
      setCompiled(r.value);
      setPicked(new Set());
    }
  };

  const runApply = async (confirm: boolean) => {
    if (busy) return;
    setBusy(confirm ? 'apply' : 'dry');
    setRefusal(null);
    const ids = [...picked];
    const r = await applyProfiles(draftId, {
      ...(ids.length ? { mutation_ids: ids } : {}),
      confirm,
    });
    setBusy(null);
    setApplyArmed(false);
    if (!r.ok) setRefusal(r.refusal);
    else {
      setApplyRes(r.value);
      if (confirm) {
        setStep('apply');
        onChanged();
      }
    }
  };

  const mutations = (compiled?.diff?.mutations ?? []) as AccessMutation[];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {creating ? 'New data profile' : (profile?.name ?? profile?.profile_id)}
        </h3>
        {!creating && (
          <>
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${STATE_CLS[profile?.state ?? 'planned'] ?? STATE_CLS.planned}`}>
              {profile?.state ?? 'planned'}
            </span>
            {profile?.stale && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" title="The definition changed after the last apply — re-compile and re-apply">
                stale
              </span>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the profile sheet"
          className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/* The three layers, kept DISTINCT (never conflated): the business
          PROFILE, the Snowflake data-access ROLE it generates (derived, not
          editable), and the USERS assigned to that role. */}
      {!creating && (
        <dl className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50">
          <div className="flex items-center gap-1.5">
            <dt className="text-slate-400 dark:text-slate-500">Profile</dt>
            <dd className="font-medium text-slate-700 dark:text-slate-200">{profile?.name ?? profile?.profile_id}</dd>
          </div>
          <span aria-hidden className="text-slate-300 dark:text-slate-600">→</span>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="shrink-0 text-slate-400 dark:text-slate-500">generates role</dt>
            <dd className="min-w-0 break-all font-mono text-slate-600 dark:text-slate-300" title="A Snowflake data-access role, generated from this profile — not edited by hand.">
              {profile?.role ?? <span className="italic text-slate-400 dark:text-slate-500">created on apply</span>}
            </dd>
          </div>
          <span aria-hidden className="text-slate-300 dark:text-slate-600">→</span>
          <div className="flex items-center gap-1.5">
            <dt className="text-slate-400 dark:text-slate-500">granted to</dt>
            <dd className="font-medium tabular-nums text-slate-700 dark:text-slate-200">
              {profile?.assignments ?? 0} user{(profile?.assignments ?? 0) === 1 ? '' : 's'}
            </dd>
          </div>
        </dl>
      )}

      <ol className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="Profile steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="h-px w-4 bg-slate-200 dark:bg-slate-700" />}
            <button
              type="button"
              aria-current={step === s ? 'step' : undefined}
              disabled={creating && s !== 'data'}
              title={creating && s !== 'data' ? 'Create the profile first' : undefined}
              onClick={() => setStep(s)}
              className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-[13px] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                step === s
                  ? 'bg-accent-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                  step === s ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {i + 1}
              </span>
              {STEP_LABEL[s]}
            </button>
          </li>
        ))}
      </ol>

      {/* ── ① DATA & POLICIES — who sees WHICH data, in words then rules ─ */}
      {step === 'data' && (
        <div className="mt-3 space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2.5">
            <label className="block">
              <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Name *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Magasins Nord"
                className="h-8 w-56 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
            <label className="block min-w-0 flex-1">
              <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">What it means, for a colleague</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sees only the northern stores; amounts masked"
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              On which objects
            </p>
            <ObjectPicker
              objects={appObjects}
              selected={objects}
              onToggle={(fqn) =>
                setObjects((o) => (o.includes(fqn) ? o.filter((x) => x !== fqn) : [...o, fqn]))
              }
              onSelectMany={(fqns, on) =>
                setObjects((o) => {
                  const set = new Set(o);
                  for (const f of fqns) {
                    if (on) set.add(f);
                    else set.delete(f);
                  }
                  return [...set];
                })
              }
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Row restrictions
              </p>
              <button
                type="button"
                onClick={() => setRows((r) => [...r, { column: '', operator: 'in', values: [] }])}
                className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
              >
                + rule
              </button>
            </div>
            {rows.length === 0 && (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                No row rule — the profile sees every row of its objects.
              </p>
            )}
            <ul className="mt-1 space-y-2">
              {rows.map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      value={r.column}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)))
                      }
                      placeholder="COLUMN"
                      aria-label={`Rule ${i + 1} column`}
                      className="h-7 w-44 rounded border border-slate-200 bg-white px-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    />
                    <select
                      value={r.operator ?? 'in'}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))
                      }
                      aria-label={`Rule ${i + 1} operator`}
                      className="h-7 rounded border border-slate-200 bg-white px-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {(meta.operators ?? ['in', 'eq', 'between', 'like']).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <span className="flex flex-wrap gap-1">
                      {(r.values ?? []).map((v) => (
                        <span key={v} className="rounded-full bg-accent-600/10 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200">
                          {v}
                          <button
                            type="button"
                            aria-label={`Remove ${v}`}
                            onClick={() =>
                              setRows((rs) =>
                                rs.map((x, j) =>
                                  j === i ? { ...x, values: (x.values ?? []).filter((y) => y !== v) } : x,
                                ),
                              )
                            }
                            className="ml-1 text-accent-700 hover:text-accent-900 dark:text-accent-300"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                      className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                    >
                      remove rule
                    </button>
                  </div>
                  {r.column && objects.length > 0 && (
                    <ValuesPicker
                      draftId={draftId}
                      fqns={objects}
                      column={r.column}
                      picked={r.values ?? []}
                      onToggle={(v) =>
                        setRows((rs) =>
                          rs.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  values: (x.values ?? []).includes(v)
                                    ? (x.values ?? []).filter((y) => y !== v)
                                    : [...(x.values ?? []), v],
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Masked columns
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {masked.map((c) => (
                <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {c}
                  <button
                    type="button"
                    aria-label={`Stop masking ${c}`}
                    onClick={() => setMasked((m) => m.filter((x) => x !== c))}
                    className="ml-1 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                placeholder="COLUMN to mask + Enter"
                aria-label="Column to mask"
                onKeyDown={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim().toUpperCase();
                  if (e.key === 'Enter' && v) {
                    setMasked((m) => (m.includes(v) ? m : [...m, v]));
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="h-7 w-48 rounded border border-slate-200 bg-white px-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
            <button
              type="button"
              disabled={busy != null || !name.trim() || objects.length === 0}
              title={objects.length === 0 ? 'Pick at least one object' : undefined}
              onClick={() => void saveDefinition()}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              {busy === 'save' ? 'Saving…' : creating ? 'Create the profile' : 'Save the definition'}
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Nothing reaches the warehouse here — the plan compiles it, apply executes it, both explicit.
            </span>
          </div>
        </div>
      )}

      {/* ── ② USERS — assign people/roles; the truth per principal ────── */}
      {step === 'users' && !creating && (
        <div className="mt-3 space-y-2 text-[13px]">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Grant this profile — the Snowflake role{' '}
            {profile?.role ? (
              <span className="font-mono text-slate-700 dark:text-slate-200">{profile.role}</span>
            ) : (
              <span className="italic text-slate-400 dark:text-slate-500">created on apply</span>
            )}{' '}
            — to a <span className="font-medium">user or a role</span>. Assigning a principal here
            grants them that role; the level (view / edit / operate / approve / admin) says what they
            may DO with the data the profile exposes.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              list="profile-principals"
              value={newPrincipal}
              onChange={(e) => setNewPrincipal(e.target.value)}
              placeholder="user or role name"
              aria-label="Principal to assign"
              className="h-8 w-56 rounded-lg border border-slate-200 bg-white px-2 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <datalist id="profile-principals">
              {principals.slice(0, 200).map((p) => (
                <option key={`${p.type}:${p.name}`} value={p.name}>{p.type}</option>
              ))}
            </datalist>
            <select
              value={newGrant}
              onChange={(e) => setNewGrant(e.target.value)}
              aria-label="Functional grant"
              className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {(meta.grant_types ?? ['view', 'edit', 'operate', 'approve', 'admin']).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy != null || !newPrincipal.trim()}
              onClick={() =>
                void (async () => {
                  setBusy('assign');
                  setRefusal(null);
                  setPendingSql(null);
                  const kind = principals.find((p) => p.name === newPrincipal.trim())?.type ?? 'user';
                  const r = await createAssignment(draftId, {
                    principal: { type: kind, name: newPrincipal.trim() },
                    grant_type: newGrant,
                    profile_id: profile!.profile_id,
                    confirm: false,
                  });
                  setBusy(null);
                  if (!r.ok) setRefusal(r.refusal);
                  else {
                    setPendingSql(((r.value as { sql?: string[] }).sql ?? []) as string[]);
                    setNewPrincipal('');
                    await loadAssignments();
                  }
                })()
              }
              className="rounded-lg bg-accent-600 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy === 'assign' ? 'Planning…' : 'Plan the assignment'}
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              planned first — it executes with the apply, never on this click
            </span>
          </div>
          {pendingSql && pendingSql.length > 0 && (
            <pre className="overflow-x-auto rounded bg-slate-50 p-1.5 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">{pendingSql.join('\n')}</pre>
          )}

          {assign === 'loading' || assign == null ? (
            <div role="status" className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
              <span className="sr-only">Reading the assignments…</span>
            </div>
          ) : (
            <>
              {assign.grants_readable === false && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  SHOW GRANTS is not readable with your role — states below are the plan, not the live truth.
                </p>
              )}
              <ul className="space-y-1.5">
                {assign.items.map((it, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {it.principal?.name}
                      <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">{it.principal?.type}</span>
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {it.grants.map((g, j) => (
                        <li key={j} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={`rounded-full px-1.5 py-px ${GRANT_STATE_CLS[g.state ?? 'planned'] ?? GRANT_STATE_CLS.planned}`}>
                            {(g.state ?? 'planned').replace('_', ' ')}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {g.grant_type}
                            {g.profile_id ? ` + profile ${g.profile_id}` : ''}
                            {g.legacy_access_role ? ` (legacy ${g.legacy_access_role})` : ''}
                          </span>
                          {g.origin === 'inherited' && (
                            <span className="text-slate-400 dark:text-slate-500">inherited via {g.via}</span>
                          )}
                          {g.since && <span className="text-slate-400 dark:text-slate-500">since {g.since.slice(0, 10)}</span>}
                          {g.assignment_id && (
                            <button
                              type="button"
                              disabled={busy != null}
                              onClick={() =>
                                void (async () => {
                                  setBusy(`rm:${g.assignment_id}`);
                                  setRefusal(null);
                                  const r = await removeAssignment(draftId, g.assignment_id!, false);
                                  setBusy(null);
                                  if (!r.ok) setRefusal(r.refusal);
                                  else {
                                    const sql = (r.value as { revoke_sql?: string[] }).revoke_sql ?? [];
                                    setPendingSql(sql);
                                    setNote('Dry run — the revoke SQL above runs only with an ACCOUNTADMIN confirm from the apply step.');
                                  }
                                })()
                              }
                              className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-red-600 disabled:opacity-40 dark:text-slate-500 dark:hover:text-red-400"
                            >
                              revoke…
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {assign.items.length === 0 && (
                  <li className="text-xs text-slate-400 dark:text-slate-500">Nobody is assigned yet.</li>
                )}
              </ul>
              {assign.has_more && (
                <QuietAction
                  label="Load more principals"
                  onClick={() =>
                    void getAssignments(draftId, { limit: 30, cursor: assign.cursor ?? undefined }).then((n) =>
                      setAssign((a) =>
                        a && a !== 'loading' ? { ...n, items: [...a.items, ...n.items] } : n,
                      ),
                    )
                  }
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ── ③ REVIEW & APPLY — the compiled diff, grouped, evidence-first ─ */}
      {step === 'apply' && !creating && (
        <div className="mt-3 space-y-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void runCompile()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {busy === 'compile' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Compile the plan
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              target − current, for ALL profiles of this application — nothing executes here
            </span>
          </div>

          {compiled?.diff?.nothing_to_change && (
            <p role="status" className="text-slate-600 dark:text-slate-300">Nothing to change — the warehouse already matches the profiles.</p>
          )}

          {mutations.length > 0 && (
            <>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {mutations.length} operation(s):{' '}
                {groupMutations(mutations).map((g) => `${g.items.length} ${g.words}`).join(' · ')}
              </p>
              <div className="space-y-2">
                {groupMutations(mutations).map((g) => {
                  const pickable = g.items.filter((m) => m.apply_supported !== false).map((m) => m.mutation_id ?? '');
                  const allPicked = pickable.length > 0 && pickable.every((id) => picked.has(id));
                  return (
                    <section key={g.kind} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allPicked}
                          disabled={pickable.length === 0}
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
                        <span className="font-medium text-slate-800 dark:text-slate-100">{g.words}</span>
                        <span className={`rounded-full px-1.5 py-px text-xs ${RISK_CLS[g.risk] ?? RISK_CLS.low}`}>{g.risk} risk</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{g.items.length} line(s)</span>
                      </label>
                      <ul className="mt-1 space-y-0.5 pl-5">
                        {g.items.map((m) => (
                          <li key={m.mutation_id} className="flex flex-wrap items-center gap-2">
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
                              aria-label={`Tick ${mutationTarget(m)}`}
                              className="h-3.5 w-3.5"
                            />
                            <span className="min-w-0 truncate font-mono text-xs text-slate-600 dark:text-slate-300" title={(m.sql ?? []).join('\n')}>
                              {mutationTarget(m)}
                            </span>
                            {showSql && (
                              <pre className="basis-full overflow-x-auto rounded bg-slate-50 p-1.5 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">{(m.sql ?? []).join('\n')}</pre>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
              <button
                type="button"
                aria-expanded={showSql}
                onClick={() => setShowSql((v) => !v)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                {showSql ? 'Hide' : 'Show'} the exact SQL under each line
              </button>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void runApply(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                >
                  {busy === 'dry' ? 'Dry run…' : `Dry run ${picked.size || 'all'}`}
                </button>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => {
                    if (!applyArmed) {
                      setApplyArmed(true);
                      return;
                    }
                    void runApply(true);
                  }}
                  title="ACCOUNTADMIN-gated — the refusal renders as-is"
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    applyArmed
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-accent-600 text-white hover:bg-accent-700'
                  }`}
                >
                  {busy === 'apply' ? 'Applying…' : applyArmed ? 'Confirm — this changes the warehouse' : `Apply ${picked.size || 'all'}…`}
                </button>
              </div>
              {applyRes?.status === 'dry_run' && (
                <p role="status" className="text-xs text-slate-500 dark:text-slate-400">
                  Dry run — nothing changed; the SQL above is exactly what would run.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── EVIDENCE — proofs + undo by run_id (folded into Review & apply) ─ */}
      {step === 'apply' && !creating && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-2.5 text-[13px] dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Evidence
          </p>
          {applyRes?.applied?.length ? (
            <>
              <p className="text-slate-700 dark:text-slate-200">
                Run <span className="font-mono text-xs">{applyRes.run_id}</span> — {applyRes.status}.
              </p>
              <ul className="space-y-1">
                {applyRes.applied.map((a, i) => (
                  <li key={a.mutation_id ?? i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{(a.kind ?? '').replace(/_/g, ' ')}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{a.status}</span>
                    </p>
                    {(a.proofs ?? []).map((p, j) => (
                      <p key={j} className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400" title={p.sql}>
                        {p.query_id} · {p.duration_ms} ms
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
              {applyRes.run_id && (
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => {
                    if (undoArmed !== applyRes.run_id) {
                      setUndoArmed(applyRes.run_id ?? null);
                      return;
                    }
                    setUndoArmed(null);
                    void (async () => {
                      setBusy('undo');
                      setRefusal(null);
                      const r = await undoAccessRun(draftId, applyRes.run_id!);
                      setBusy(null);
                      if (!r.ok) setRefusal(r.refusal);
                      else {
                        setNote('Undo executed — the run’s undo SQL ran; re-compile to see the new diff.');
                        onChanged();
                      }
                    })();
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    undoArmed === applyRes.run_id
                      ? 'bg-red-50 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400'
                  }`}
                >
                  {undoArmed === applyRes.run_id ? 'Confirm — runs the stored undo SQL' : 'Undo this run…'}
                </button>
              )}
            </>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">
              No apply in this session yet — the proofs of an apply (query ids, durations, undo SQL)
              land here, and every past run stays undoable by its run_id from the shared history.
            </p>
          )}
        </div>
      )}

      {note && <p role="status" className="mt-2 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
      {refusal && (
        <div className="mt-2"><RefusalView refusal={refusal} /></div>
      )}
    </section>
  );
}

/* ── the pilot list ─────────────────────────────────────────────────── */

export default function StudioAccessProfilesPanel({ draftId }: { draftId: string }) {
  const [view, setView] = useState<ProfilesView | 'loading' | 'error'>('loading');
  const [open, setOpen] = useState<AccessProfile | null | 'new'>(null);
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await listProfiles(draftId));
    } catch {
      setView('error');
    }
  }, [draftId]);

  useEffect(() => {
    setView('loading');
    setOpen(null);
    void load();
  }, [load]);

  const meta = useMemo(
    () => (typeof view === 'object' ? view : ({ profiles: [] } as ProfilesView)),
    [view],
  );

  if (view === 'loading')
    return (
      <div role="status" className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the data profiles…</span>
      </div>
    );
  if (view === 'error')
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        The data profiles could not be read.{' '}
        <QuietAction label="Try again" icon={RefreshCw} onClick={() => { setView('loading'); void load(); }} />
      </p>
    );

  if (open) {
    return (
      <ProfileSheet
        draftId={draftId}
        profile={open === 'new' ? null : open}
        meta={meta}
        onClose={() => setOpen(null)}
        onChanged={() => void load()}
      />
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Data profiles</h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          roles say what people DO — a profile says what data they SEE
        </span>
        <button
          type="button"
          onClick={() => setOpen('new')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          New profile
        </button>
      </div>

      {meta.profiles.length === 0 ? (
        <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
          No data profile yet — everyone with a role sees every row (the legacy behaviour, kept).
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Profile</th>
                <th className="px-2 py-1.5 font-medium">State</th>
                <th className="px-2 py-1.5 font-medium">Objects</th>
                <th className="px-2 py-1.5 font-medium">Rules</th>
                <th className="px-2 py-1.5 font-medium">Assignments</th>
                <th className="px-2 py-1.5 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {meta.profiles.map((p) => (
                <tr key={p.profile_id} className="text-[13px]">
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setOpen(p)}
                      className="rounded font-medium text-slate-900 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-100 dark:hover:text-accent-400"
                    >
                      {p.name ?? p.profile_id}
                    </button>
                    {p.description && (
                      <p className="truncate text-xs text-slate-400 dark:text-slate-500">{p.description}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLS[p.state ?? 'planned'] ?? STATE_CLS.planned}`}>
                      {p.state ?? 'planned'}
                    </span>
                    {p.stale && (
                      <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">stale</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                    {p.objects?.length ?? 0}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                    {/* count every masked column as a rule — collapsing N to 1
                        under-reported a profile's real governance surface */}
                    {(p.rows?.length ?? 0) + (p.columns_masked?.length ?? 0)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                    {p.assignments ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOpen(p)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        disabled={busy != null}
                        onClick={() => {
                          if (removeArmed !== p.profile_id) {
                            setRemoveArmed(p.profile_id);
                            return;
                          }
                          setRemoveArmed(null);
                          void (async () => {
                            setBusy(`rm:${p.profile_id}`);
                            setRefusal(null);
                            const r = await deleteProfile(draftId, p.profile_id, true);
                            setBusy(null);
                            if (!r.ok) setRefusal(r.refusal);
                            else void load();
                          })();
                        }}
                        className={`rounded-lg px-2 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                          removeArmed === p.profile_id
                            ? 'bg-red-50 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400'
                        }`}
                      >
                        {removeArmed === p.profile_id ? 'Confirm — policies stay until undo' : 'Delete…'}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta.compiled && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Last compiled plan: {meta.compiled.mutations ?? '—'} mutation(s)
          {meta.compiled.at ? ` · ${new Date(meta.compiled.at).toLocaleString()}` : ''} — open a
          profile → Plan &amp; apply.
        </p>
      )}
      {refusal && (
        <div className="mt-2"><RefusalView refusal={refusal} /></div>
      )}
    </section>
  );
}
