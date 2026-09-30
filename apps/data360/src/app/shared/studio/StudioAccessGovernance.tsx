'use client';

/**
 * StudioAccessGovernance — Access & Governance, role-centric.
 *
 * The question this page answers is « what can THIS role do, see, and what
 * protects it », so the page is a master-detail on roles: pick one on the
 * left, configure it across four steps in the middle, read the consequences
 * on the right, and stage everything into ONE change applied at the bottom.
 *
 * It is a drop-in for the previous governance surface: the same props, the
 * same parent-owned state, the same proven plan → dry-run → apply engine in
 * `footer`. Nothing here executes.
 *
 * Honesty invariants (unchanged, they are why this page is trustworthy):
 *  • Data permissions live ONCE on the application's access role and are
 *    reused by every functional role — so per-role differences are row rules
 *    and masking, never an invented per-role table grant. The Data access
 *    tab says so in place.
 *  • A capability toggle STAGES a grant; nothing runs before Prepare and an
 *    explicit apply by an administrator.
 *  • Every count is served or renders '—'. A person's standing access is read
 *    from the account, never assumed; the only proof of what someone can read
 *    is « Test the reads ».
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookLock,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  LayoutGrid,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import type { AccessView, RlsSuggestion } from '@/app/services/studio/studio-api';
import { getProtectionCatalog, getPii, type ProtectionCatalog, type PiiReport } from '@/app/services/studio/studio-api';
import { getAssignments, type AssignmentsView } from '@/app/services/studio/access-profiles';
import { getStudioSummary, type AccessSummary } from '@/app/services/studio/summary';
import StudioAccessGrid from '@/app/shared/studio/StudioAccessGrid';
import type { GrantTypeInfo, Principal, PolicyMapping, RoleMapping } from '@/app/shared/studio/StudioGovernanceMap';

type Step = 'capabilities' | 'data' | 'policies' | 'effective';

const STEPS: Array<{ id: Step; label: string; n: number }> = [
  { id: 'capabilities', label: 'Capabilities', n: 1 },
  { id: 'data', label: 'Data access', n: 2 },
  { id: 'policies', label: 'Protection & policies', n: 3 },
  { id: 'effective', label: 'Effective access', n: 4 },
];

/** the five capability cards, in the order the product grants them */
const CAP_ICON: Record<string, typeof Eye> = {
  view: Eye,
  edit: LayoutGrid,
  operate: Play,
  approve: CheckCircle2,
  admin: ShieldCheck,
};

function num(v: number | null | undefined): string {
  return typeof v === 'number' ? v.toLocaleString() : '—';
}

function tableOf(fqn: string): string {
  return fqn.split('.').slice(-1)[0] ?? fqn;
}

/** a stable tint per role name — the eye finds a role by its colour before
 *  it reads the label, which is what makes a long list navigable */
const ROLE_TINTS = [
  'bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300',
  'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300',
  'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
  'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300',
  'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300',
];
function tintOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ROLE_TINTS[h % ROLE_TINTS.length];
}

/* ── one KPI cell of the header strip ──────────────────────────────── */
function Kpi({
  icon: Icon,
  value,
  label,
  hint,
  tone,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  hint?: string;
  tone?: 'accent' | 'brand' | 'plain';
}) {
  const tile =
    tone === 'brand'
      ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300'
      : tone === 'accent'
        ? 'bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tile}`}>
        <Icon aria-hidden className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[22px] font-semibold leading-none tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
          {value}
        </span>
        <span className="mt-0.5 block truncate text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {hint && <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">{hint}</span>}
      </span>
    </div>
  );
}

export default function StudioAccessGovernance({
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
  prefill,
}: {
  draftId: string;
  view: AccessView;
  prefill?: { kind: 'mask' | 'row'; column?: string } | null;
  gov: RlsSuggestion | null;
  grantTypes: GrantTypeInfo[];
  principals: Principal[] | null;
  principalsNote?: string;
  mapping: RoleMapping;
  onMap: (name: string, grantType: string) => void;
  policy: PolicyMapping;
  onPolicy: (column: string, grantType: string, values: string[] | '*') => void;
  masking: { columns: string[]; unmasked: string[] };
  onToggleMask: (column: string) => void;
  onToggleUnmask: (grantType: string) => void;
  onPrepare?: () => void;
  onTest?: () => void;
  busy?: string | null;
  canPrepare?: boolean;
  footer?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('capabilities');
  const [q, setQ] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);

  /* free reads — persisted truth, never a re-detection */
  const [assign, setAssign] = useState<AssignmentsView | null>(null);
  const [catalog, setCatalog] = useState<ProtectionCatalog | null>(null);
  const [pii, setPii] = useState<PiiReport | null>(null);
  const [summary, setSummary] = useState<AccessSummary | null>(null);

  useEffect(() => {
    let alive = true;
    void getAssignments(draftId).then((a) => alive && setAssign(a)).catch(() => undefined);
    void getProtectionCatalog(draftId).then((c) => alive && setCatalog(c)).catch(() => undefined);
    void getPii(draftId).then((p) => alive && setPii(p)).catch(() => undefined);
    void getStudioSummary(draftId, ['access'])
      .then((r) => alive && setSummary(r.access ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [draftId]);

  /* a model/quality detection lands on the protection step, seeded */
  useEffect(() => {
    if (!prefill) return;
    setStep('policies');
    if (prefill.kind === 'mask' && prefill.column && !masking.columns.includes(prefill.column)) {
      onToggleMask(prefill.column);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const roles = view.diff?.roles ?? {};
  const functional = (roles.functional ?? {}) as Record<string, string>;
  const objects = view.me?.objects ?? [];

  /** what each principal HOLDS today, read from the account */
  const heldBy = useMemo(() => {
    const m = new Map<string, { grant?: string; state?: string; origin?: string }>();
    for (const it of assign?.items ?? []) {
      const name = it.principal?.name;
      const g = (it.grants ?? [])[0];
      if (name) m.set(name.toUpperCase(), { grant: g?.grant_type, state: g?.state, origin: g?.origin });
    }
    return m;
  }, [assign]);

  /** the roles list — account roles only; people live in Administration */
  const roleList = useMemo(() => {
    const list = (principals ?? []).filter((p) => p.kind === 'role');
    const needle = q.trim().toLowerCase();
    const filtered = needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list;
    // the ones that already hold something, or are being staged, come first
    return [...filtered].sort((a, b) => {
      const aw = (mapping[a.name] ? 2 : 0) + (heldBy.has(a.name.toUpperCase()) ? 1 : 0);
      const bw = (mapping[b.name] ? 2 : 0) + (heldBy.has(b.name.toUpperCase()) ? 1 : 0);
      return bw - aw || a.name.localeCompare(b.name);
    });
  }, [principals, q, mapping, heldBy]);

  useEffect(() => {
    if (!selected && roleList.length > 0) setSelected(roleList[0].name);
  }, [roleList, selected]);

  const sel = selected ? roleList.find((r) => r.name === selected) ?? null : null;
  const selHeld = selected ? heldBy.get(selected.toUpperCase()) : undefined;
  const selStaged = selected ? mapping[selected] : undefined;
  const selLevel = selStaged || selHeld?.grant || '';

  /* ── staged change, in words ───────────────────────────────────────── */
  const mapped = Object.values(mapping).filter(Boolean).length;
  const ruleCols = useMemo(
    () =>
      Object.entries(policy).filter(([, byGrant]) =>
        Object.values(byGrant ?? {}).some((v) => Array.isArray(v) && v.length > 0),
      ),
    [policy],
  );
  const stagedCount = mapped + ruleCols.length + masking.columns.length;

  /* ── KPI strip, all served or '—' ──────────────────────────────────── */
  const policiesCount = catalog?.policies?.items?.length;
  const attachedCount = catalog?.attached ? Object.keys(catalog.attached).length : undefined;
  const piiConfirmed = pii?.counts?.confirmed;
  const footprintDatasets = summary?.footprint?.datasets ?? undefined;

  const capCards: GrantTypeInfo[] =
    grantTypes.length > 0 ? grantTypes : Object.keys(functional).map((id) => ({ id }) as GrantTypeInfo);

  return (
    <div className="space-y-3">
      {/* ══ the header strip — what this application's access IS today ══ */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icon={ShieldCheck}
          tone="accent"
          value={num(grantTypes.length || Object.keys(functional).length || undefined)}
          label="Application roles"
          hint={roles.access_role ? 'data lives once on the access role' : undefined}
        />
        <Kpi
          icon={Users}
          value={num(assign ? assign.total ?? assign.items?.length : undefined)}
          label="Roles with access"
          hint={assign?.grants_readable === false ? 'grants not readable' : 'read from the account'}
        />
        <Kpi
          icon={Database}
          value={num(objects.length || undefined)}
          label="Governed datasets"
          hint={footprintDatasets != null ? `of ${footprintDatasets} in footprint` : undefined}
        />
        <Kpi
          icon={BookLock}
          value={num(attachedCount ?? policiesCount)}
          label="Policies"
          hint={attachedCount != null ? 'attached on this application' : 'in the account catalog'}
        />
        <Kpi
          icon={Sparkles}
          tone={stagedCount > 0 ? 'brand' : 'plain'}
          value={num(stagedCount || undefined)}
          label="Pending changes"
          hint={stagedCount > 0 ? 'nothing runs before you apply' : 'nothing staged'}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* ══ LEFT — the roles ═════════════════════════════════════════ */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Roles
            </p>
            <a
              href="/studio/admin"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
              title="Roles and users are created in Administration"
            >
              <UserPlus aria-hidden className="h-3 w-3" />
              New role
            </a>
          </div>
          <div className="relative mt-2">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a role"
              aria-label="Search a role"
              className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <ul className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-0.5">
            {roleList.map((p) => {
              const held = heldBy.get(p.name.toUpperCase());
              const staged = mapping[p.name];
              const on = selected === p.name;
              return (
                <li key={p.name}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(p.name)}
                    className={`w-full rounded-xl border px-2 py-2 text-left transition-all ${
                      on
                        ? 'border-accent-200 bg-accent-50/70 shadow-sm dark:border-accent-800 dark:bg-accent-950/40'
                        : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${tintOf(p.name)}`}
                      >
                        {p.name.replace(/^D360_/, '').slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium text-slate-800 dark:text-slate-100">
                        {p.name}
                      </span>
                      {staged ? (
                        <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[10px] font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                          staged
                        </span>
                      ) : held?.grant ? (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {held.grant}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate pl-9 text-[11px] text-slate-500 dark:text-slate-400">
                      {staged
                        ? `${staged} — staged, not applied`
                        : held?.grant
                          ? held.origin === 'inherited'
                            ? 'inherited from the account'
                            : 'granted on this application'
                          : 'no access to this application'}
                    </span>
                  </button>
                </li>
              );
            })}
            {roleList.length === 0 && (
              <li className="rounded-lg border border-slate-200 p-3 text-center text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {principals === null ? 'Reading the account roles…' : principalsNote ?? 'No role served.'}
              </li>
            )}
          </ul>
          <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
            Data is granted to roles, never to a person. People are attached to roles in{' '}
            <a href="/studio/admin" className="text-accent-700 hover:underline dark:text-accent-400">
              Administration
            </a>
            .
          </p>
        </section>

        {/* ══ CENTER — the selected role, in four steps ════════════════ */}
        <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!sel ? (
            <p className="py-10 text-center text-[13px] text-slate-500 dark:text-slate-400">
              Pick a role on the left to define what it can do and see.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-2">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tintOf(sel.name)}`}
                >
                  <KeyRound aria-hidden className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-mono text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    {sel.name}
                  </h3>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    {selLevel
                      ? `${selLevel}${selStaged ? ' — staged on this change' : ' — in force today'}`
                      : 'No access to this application yet'}
                    {sel.holds?.length ? ` · also holds ${sel.holds.slice(0, 3).join(', ')}` : ''}
                  </p>
                </div>
              </div>

              {/* the four steps */}
              <div role="tablist" aria-label="Role configuration" className="mt-2.5 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
                {STEPS.map((s) => {
                  const on = step === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setStep(s.id)}
                      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                        on
                          ? 'border-accent-600 font-medium text-accent-700 dark:border-accent-400 dark:text-accent-300'
                          : 'border-transparent text-slate-600 hover:border-slate-300 dark:text-slate-300'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                          on ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {s.n}
                      </span>
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* ── 1. CAPABILITIES ───────────────────────────────────── */}
              {step === 'capabilities' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <h4 className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                      What this role can do
                    </h4>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">
                      One level per role. Picking a level stages the grant — nothing runs before you
                      prepare and an administrator applies it.
                    </p>
                  </div>
                  <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                    {capCards.map((g) => {
                      const id = g.id;
                      const Icon = CAP_ICON[id] ?? Lock;
                      const on = selLevel === id;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => selected && onMap(selected, on ? '' : id)}
                            className={`h-full w-full rounded-2xl border p-3 text-left transition-all ${
                              on
                                ? 'border-accent-400 bg-accent-50/80 shadow-md shadow-accent-600/10 dark:border-accent-600 dark:bg-accent-950/40'
                                : 'border-slate-200/80 hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:hover:border-slate-600'
                            }`}
                          >
                            <span className="flex items-center justify-between">
                              <Icon
                                aria-hidden
                                className={`h-4 w-4 ${on ? 'text-accent-600 dark:text-accent-300' : 'text-slate-400'}`}
                              />
                              <span
                                className={`h-4 w-7 rounded-full transition-colors ${
                                  on ? 'bg-accent-600' : 'bg-slate-200 dark:bg-slate-700'
                                }`}
                              >
                                <span
                                  className={`block h-3.5 w-3.5 translate-y-px rounded-full bg-white transition-transform ${
                                    on ? 'translate-x-3.5' : 'translate-x-px'
                                  }`}
                                />
                              </span>
                            </span>
                            <span className="mt-1.5 block text-[13px] font-medium capitalize text-slate-800 dark:text-slate-100">
                              {g.label ?? id}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                              {g.description ?? '—'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {selLevel && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      {selStaged
                        ? `« ${selLevel} » is staged for ${sel.name}. It becomes real when the change is applied.`
                        : `${sel.name} holds « ${selLevel} » today — read from the account, not assumed.`}
                    </p>
                  )}
                </div>
              )}

              {/* ── 2. DATA ACCESS ────────────────────────────────────── */}
              {step === 'data' && (
                <div className="mt-3 space-y-2">
                  <div>
                    <h4 className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                      The data this application governs
                    </h4>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">
                      Object grants live once on{' '}
                      <span className="font-mono text-[11px]">{roles.access_role ?? 'the access role'}</span> and
                      are reused by every role — so what changes per role is the rows it may see and
                      the columns it reads in clear, edited under Protection &amp; policies.
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="px-3 py-2 text-left font-medium">Dataset</th>
                          <th className="px-3 py-2 text-left font-medium">Level</th>
                          <th className="px-3 py-2 text-left font-medium">Row scope</th>
                          <th className="px-3 py-2 text-left font-medium">Masked columns</th>
                          <th className="px-3 py-2 text-left font-medium">Read</th>
                        </tr>
                      </thead>
                      <tbody>
                        {objects.map((o) => {
                          const fqn = o.fqn ?? '';
                          const rulesHere = ruleCols.filter(([col]) =>
                            (gov?.candidates ?? []).some((c) => c.column === col && c.fqn === fqn),
                          );
                          const maskedHere = masking.columns.filter((col) =>
                            (gov?.candidates ?? []).some((c) => c.column === col && c.fqn === fqn),
                          );
                          return (
                            <tr key={fqn} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                              <td className="px-3 py-2">
                                <span className="block font-medium text-slate-800 dark:text-slate-100">
                                  {tableOf(fqn)}
                                </span>
                                <span className="block truncate font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                                  {fqn}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {selLevel || 'no access'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                {rulesHere.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setStep('policies')}
                                    className="text-accent-700 hover:underline dark:text-accent-400"
                                  >
                                    {rulesHere.length} row rule{rulesHere.length > 1 ? 's' : ''}
                                  </button>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500">every row</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                {maskedHere.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setStep('policies')}
                                    className="text-accent-700 hover:underline dark:text-accent-400"
                                  >
                                    {maskedHere.length} masked
                                  </button>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500">none</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {o.read === 'allowed' ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                    <CheckCircle2 aria-hidden className="h-3 w-3" />
                                    {o.verified ? 'verified' : 'allowed'}
                                  </span>
                                ) : o.read ? (
                                  <span className="text-slate-500 dark:text-slate-400">{o.read}</span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {objects.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-2.5 py-6 text-center text-slate-500 dark:text-slate-400">
                              No dataset attached to this application yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── 3. PROTECTION & POLICIES ──────────────────────────── */}
              {step === 'policies' && (
                <div className="mt-3 space-y-2.5">
                  <div>
                    <h4 className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                      How the data is protected
                    </h4>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">
                      Row rules narrow what each role sees; masking hides a column from everyone but
                      the exempt roles. Both are staged into the same change.
                    </p>
                  </div>
                  <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {[
                      { icon: KeyRound, label: 'Row rules', n: ruleCols.length },
                      { icon: EyeOff, label: 'Masked columns', n: masking.columns.length },
                      { icon: Fingerprint, label: 'Sensitive confirmed', n: piiConfirmed ?? undefined },
                      { icon: BookLock, label: 'Account policies', n: policiesCount ?? undefined },
                    ].map((c) => (
                      <li
                        key={c.label}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/30"
                      >
                        <c.icon aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                        <span className="mt-1 block text-[15px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {num(c.n)}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{c.label}</span>
                      </li>
                    ))}
                  </ul>
                  {/* the proven editors — one row per column, roles across */}
                  <StudioAccessGrid
                    initialLayer={prefill?.kind === 'mask' ? 'pii' : undefined}
                    draftId={draftId}
                    grantTypes={grantTypes}
                    columns={(() => {
                      const byCol = new Map<
                        string,
                        { column: string; tables: string[]; fqns: string[]; values: string[] }
                      >();
                      for (const c of gov?.candidates ?? []) {
                        const col = c.column ?? '';
                        if (!col) continue;
                        const cur = byCol.get(col) ?? { column: col, tables: [], fqns: [], values: [] };
                        if (c.fqn) {
                          cur.tables.push(tableOf(c.fqn));
                          cur.fqns.push(c.fqn);
                        }
                        for (const v of c.observed_values ?? []) {
                          const s = String(v.value ?? '');
                          if (s && !cur.values.includes(s)) cur.values.push(s);
                        }
                        byCol.set(col, cur);
                      }
                      return [...byCol.values()];
                    })()}
                    policy={policy}
                    onPolicy={onPolicy}
                    masking={masking}
                    onToggleMask={onToggleMask}
                    onToggleUnmask={onToggleUnmask}
                    accessRole={roles.access_role}
                    tablesCount={objects.length}
                  />
                </div>
              )}

              {/* ── 4. EFFECTIVE ACCESS ───────────────────────────────── */}
              {step === 'effective' && (
                <div className="mt-3 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                        What this role really reads
                      </h4>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">
                        A prediction is not a proof: run the reads to see what the warehouse actually
                        returns for every object of this application.
                      </p>
                    </div>
                    {onTest && (
                      <button
                        type="button"
                        disabled={busy != null}
                        onClick={onTest}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent-600 px-3 py-1.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50 dark:text-accent-400 dark:hover:bg-accent-950/30"
                      >
                        {busy === 'test' ? (
                          <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play aria-hidden className="h-3.5 w-3.5" />
                        )}
                        Test the reads
                      </button>
                    )}
                  </div>
                  <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {[
                      {
                        label: 'Objects readable',
                        n: objects.filter((o) => o.read === 'allowed').length,
                        of: objects.length,
                      },
                      { label: 'Verified by a real read', n: objects.filter((o) => o.verified).length, of: objects.length },
                      { label: 'Row rules in this change', n: ruleCols.length },
                      { label: 'Masked columns', n: masking.columns.length },
                    ].map((c) => (
                      <li key={c.label} className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
                        <span className="block text-[15px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {num(c.n)}
                          {c.of != null && (
                            <span className="text-[11px] font-normal text-slate-400"> / {c.of}</span>
                          )}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{c.label}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="px-3 py-2 text-left font-medium">Object</th>
                          <th className="px-3 py-2 text-left font-medium">Result</th>
                          <th className="px-3 py-2 text-left font-medium">Proof</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(view.tests ?? objects).map((o, i) => (
                          <tr
                            key={(o.fqn ?? '') + i}
                            className="border-b border-slate-100 last:border-0 dark:border-slate-800/70"
                          >
                            <td className="px-3 py-2">
                              <span className="block font-medium text-slate-800 dark:text-slate-100">
                                {tableOf(o.fqn ?? '')}
                              </span>
                              {o.as && (
                                <span className="block text-[10.5px] text-slate-400 dark:text-slate-500">
                                  as {o.as}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {o.read === 'allowed' ? (
                                <span className="text-emerald-700 dark:text-emerald-400">allowed</span>
                              ) : o.read ? (
                                <span className="text-slate-600 dark:text-slate-300">{o.read}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                              {o.verified ? (
                                <span title={o.query_id ?? undefined}>
                                  real read{typeof o.duration_ms === 'number' ? ` · ${o.duration_ms} ms` : ''}
                                </span>
                              ) : (
                                <span>predicted — not proven</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ══ RIGHT — what the change would mean ══════════════════════ */}
        <aside className="space-y-2.5">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              What the analysis suggests
            </p>
            <ul className="mt-2 space-y-2 text-[12.5px]">
              {piiConfirmed != null && piiConfirmed > 0 && masking.columns.length === 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setStep('policies')}
                    className="text-left text-accent-700 hover:underline dark:text-accent-400"
                  >
                    {piiConfirmed} sensitive column{piiConfirmed > 1 ? 's are' : ' is'} confirmed and
                    not masked — mask them here
                  </button>
                </li>
              )}
              {(gov?.candidates?.length ?? 0) > 0 && ruleCols.length === 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setStep('policies')}
                    className="text-left text-accent-700 hover:underline dark:text-accent-400"
                  >
                    {gov!.candidates!.length} column{gov!.candidates!.length > 1 ? 's' : ''} could
                    narrow what a role sees — set a row rule
                  </button>
                </li>
              )}
              {selected && !selLevel && (
                <li>
                  <button
                    type="button"
                    onClick={() => setStep('capabilities')}
                    className="text-left text-accent-700 hover:underline dark:text-accent-400"
                  >
                    {sel?.name} has no access yet — pick what it may do
                  </button>
                </li>
              )}
              {objects.some((o) => !o.verified) && (
                <li className="text-slate-500 dark:text-slate-400">
                  {objects.filter((o) => !o.verified).length} object(s) never proven by a real read —
                  « Test the reads » settles it.
                </li>
              )}
              {piiConfirmed === 0 && ruleCols.length === 0 && masking.columns.length === 0 && (
                <li className="text-slate-500 dark:text-slate-400">
                  Nothing flagged on this application's data right now.
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
              This change
            </p>
            <ul className="mt-1.5 space-y-1 text-[12.5px] text-slate-600 dark:text-slate-300">
              <li>{mapped} role grant{mapped === 1 ? '' : 's'} staged</li>
              <li>{ruleCols.length} row rule{ruleCols.length === 1 ? '' : 's'}</li>
              <li>{masking.columns.length} masked column{masking.columns.length === 1 ? '' : 's'}</li>
            </ul>
            <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              Nothing runs before Prepare, then an explicit apply by an administrator.
            </p>
          </section>
        </aside>
      </div>

      {/* ══ the change strip — an EVENT SUMMARY, not a wall of actions.
              What is staged, what happened last, and one way in. The
              operations themselves live behind it, applied as a whole:
              managing the roles IS the change, there is nothing more to
              select afterwards. ═══════════════════════════════════════ */}
      <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200/80 bg-white/95 px-3.5 py-2.5 shadow-lg shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-200">
            <Sparkles aria-hidden className={`h-3.5 w-3.5 ${stagedCount > 0 ? 'text-brand-500' : 'text-slate-300'}`} />
            {stagedCount > 0 ? `${stagedCount} staged` : 'Nothing staged'}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-500 dark:text-slate-400">
            {stagedCount > 0
              ? [
                  mapped ? `${mapped} role grant${mapped > 1 ? 's' : ''}` : null,
                  ruleCols.length ? `${ruleCols.length} row rule${ruleCols.length > 1 ? 's' : ''}` : null,
                  masking.columns.length ? `${masking.columns.length} masked column${masking.columns.length > 1 ? 's' : ''}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') + ' — nothing runs until an administrator applies it.'
              : 'Pick a role and what it may do, or protect a column — the change follows from what you set.'}
          </span>
          <button
            type="button"
            disabled={busy != null && busy !== 'plan'}
            aria-expanded={reviewOpen}
            onClick={() => {
              const open = !reviewOpen;
              setReviewOpen(open);
              // managing the roles IS the change: opening the review prepares
              // it, so there is no second « prepare » step to remember
              if (open && canPrepare !== false && onPrepare) onPrepare();
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy === 'plan' ? (
              <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            )}
            {reviewOpen ? 'Hide the change' : 'Review & apply'}
            <ChevronRight
              aria-hidden
              className={`h-3.5 w-3.5 transition-transform ${reviewOpen ? 'rotate-90' : ''}`}
            />
          </button>
        </div>
        {reviewOpen && <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}
