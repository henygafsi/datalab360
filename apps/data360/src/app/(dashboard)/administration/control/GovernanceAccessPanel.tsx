'use client';

/**
 * GovernanceAccessPanel — the platform "Governance & Access" editor (#141).
 *
 * One standardized 5-step flow (Principals → Application role → Data objects &
 * baskets → Data policies → Review & apply) that builds a single
 * EntitlementSpec, previews its real impact (masked/hashed sample + rows
 * accessible/hidden + SQL) BEFORE any save, then runs it through
 * compile → approve (four-eyes) → apply, all governed. Nothing reaches the
 * warehouse until an ACCOUNTADMIN confirms, and a write/admin/approve grant
 * needs a second approver.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Lock, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  applyEntitlement,
  approveEntitlement,
  compileEntitlement,
  createEntitlement,
  getGovernanceSummary,
  governanceRefusal,
  listEntitlements,
  previewEntitlement,
  revokeEntitlement,
  updateEntitlement,
  type AppRole,
  type EntitlementItem,
  type EntitlementPreview,
  type EntitlementSpec,
  type EntitlementsView,
  type GovernanceSummary,
  type ObjectRight,
} from '@/app/services/studio/admin-governance';
import { listAccountPrincipals } from '@/app/services/studio/studio-api';
import StudioKpiHeader, { type Kpi } from '@/app/shared/studio/StudioKpiHeader';

const STEPS = ['principals', 'role', 'objects', 'policies', 'review'] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = {
  principals: 'Principals',
  role: 'Application role',
  objects: 'Data objects',
  policies: 'Data policies',
  review: 'Review & apply',
};
const STEP_SUB: Record<Step, string> = {
  principals: 'Who gets access',
  role: 'What they can do',
  objects: 'Which data (baskets)',
  policies: 'How it is protected',
  review: 'Preview and confirm',
};

const APP_ROLES: Array<{ id: AppRole; label: string; desc: string }> = [
  { id: 'viewer', label: 'Viewer', desc: 'Read-only access — view data and run queries.' },
  { id: 'editor', label: 'Editor', desc: 'Create and edit content and modify data.' },
  { id: 'approver', label: 'Approver', desc: 'Review and approve changes and manage workflow.' },
  { id: 'admin', label: 'Admin', desc: 'Full access — manage all settings and permissions.' },
];
const RIGHTS: ObjectRight[] = ['view', 'edit', 'delete'];

function summaryKpis(s: GovernanceSummary | null): Kpi[] {
  if (!s) return [];
  const m = (k: string) => (s.method as Record<string, string> | undefined)?.[k];
  return [
    { key: 'principals', label: 'Principals with access', value: s.principals_with_access ?? null, method: m('principals_with_access') },
    { key: 'policies', label: 'Active policies', value: s.active_policies ?? null, method: m('active_policies') },
    { key: 'tables', label: 'Protected tables', value: s.protected_tables ?? null, method: m('protected_tables') },
    { key: 'approvals', label: 'Pending approvals', value: s.pending_approvals ?? null, tone: (s.pending_approvals ?? 0) > 0 ? 'warn' : 'default' },
    {
      key: 'compliance',
      label: 'Policy compliance',
      value: s.policy_compliance_pct ?? null,
      unit: '%',
      tone: s.policy_compliance_pct == null ? 'default' : s.policy_compliance_pct >= 90 ? 'good' : s.policy_compliance_pct >= 70 ? 'warn' : 'bad',
      method: m('policy_compliance_pct'),
    },
  ];
}

/* ── the 5-step editor ──────────────────────────────────────────────── */

function EntitlementEditor({
  initial,
  features,
  onClose,
  onSaved,
}: {
  initial: EntitlementItem | null;
  features: EntitlementsView['features'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>('principals');
  const [spec, setSpec] = useState<EntitlementSpec>(() => ({
    name: initial?.name ?? '',
    principals: initial?.principals ?? [],
    app_role: initial?.app_role ?? 'viewer',
    objects: initial?.objects ?? [],
    policies: initial?.policies ?? {},
    features: initial?.features ?? [],
  }));
  const [id, setId] = useState<string | null>(initial?.id ?? null);
  const [state, setState] = useState<string | null>(initial?.state ?? null);
  const [preview, setPreview] = useState<EntitlementPreview | 'loading' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [principals, setPrincipals] = useState<Array<{ type: string; name: string }>>([]);
  const [newP, setNewP] = useState('');
  const [newObj, setNewObj] = useState('');
  const [previewFqn, setPreviewFqn] = useState<string>('');

  useEffect(() => {
    void listAccountPrincipals()
      .then((p) => setPrincipals((p.principals ?? []).map((x) => ({ type: x.kind, name: x.name }))))
      .catch(() => setPrincipals([]));
  }, []);

  const patch = (p: Partial<EntitlementSpec>) => setSpec((s) => ({ ...s, ...p }));

  const runPreview = useCallback(async () => {
    setPreview('loading');
    setRefusal(null);
    try {
      const fqn = previewFqn || spec.objects?.[0]?.fqn || undefined;
      const r = await previewEntitlement({ spec, fqn, rows: 20 });
      setPreview(r);
    } catch (e) {
      setPreview(null);
      setRefusal(governanceRefusal(e)?.message ?? 'The preview did not answer.');
    }
  }, [spec, previewFqn]);

  const canSave = (spec.principals?.length ?? 0) > 0 && (spec.objects?.length ?? 0) > 0 && !!spec.name?.trim();

  const save = async (): Promise<string | null> => {
    setBusy('save');
    setRefusal(null);
    try {
      const item = id ? await updateEntitlement(id, spec) : await createEntitlement(spec);
      const newId = item.id ?? id;
      setId(newId ?? null);
      setState(item.state ?? 'draft');
      return newId ?? null;
    } catch (e) {
      setRefusal(governanceRefusal(e)?.message ?? 'The entitlement could not be saved.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runStep = async (fn: (eid: string) => Promise<{ state?: string; four_eyes_required?: boolean }>, label: string) => {
    let eid = id;
    if (!eid) eid = await save();
    if (!eid) return;
    setBusy(label);
    setRefusal(null);
    setNote(null);
    try {
      const r = await fn(eid);
      setState(r.state ?? state);
      setNote(
        label === 'apply'
          ? 'Applied — the policies are live. Revoke to undo.'
          : label === 'compile'
            ? r.four_eyes_required || r.state === 'awaiting_approval'
              ? 'Compiled — awaiting a second approver (four-eyes).'
              : 'Compiled — ready to apply.'
            : label === 'approve'
              ? 'Approved — ready to apply.'
              : 'Done.',
      );
      onSaved();
    } catch (e) {
      setRefusal(governanceRefusal(e)?.message ?? 'The action was refused.');
    } finally {
      setBusy(null);
    }
  };

  const idx = STEPS.indexOf(step);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <ShieldCheck aria-hidden className="h-4 w-4 text-accent-600" />
        <input
          value={spec.name ?? ''}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Name this policy — e.g. « Finance readers, masked PII »"
          aria-label="Policy name"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        {state && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {state}
          </span>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800">
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/* numbered step rail */}
      <ol className="flex flex-wrap items-center gap-1.5 px-4 py-2.5" aria-label="Governance steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="h-px w-4 bg-slate-200 dark:bg-slate-700" />}
            <button
              type="button"
              aria-current={step === s ? 'step' : undefined}
              onClick={() => setStep(s)}
              className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                step === s ? 'bg-accent-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${step === s ? 'bg-white/25' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{i + 1}</span>
              <span className="hidden sm:inline">{STEP_LABEL[s]}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[1fr,380px]">
        {/* ── the active step ── */}
        <div className="min-w-0 text-[13px]">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {STEP_LABEL[step]} — {STEP_SUB[step]}
          </p>

          {step === 'principals' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  list="admin-principals"
                  value={newP}
                  onChange={(e) => setNewP(e.target.value)}
                  placeholder="user, group or role name"
                  className="h-8 w-64 rounded-lg border border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
                <datalist id="admin-principals">
                  {principals.slice(0, 300).map((p) => (
                    <option key={`${p.type}:${p.name}`} value={p.name}>{p.type}</option>
                  ))}
                </datalist>
                <button
                  type="button"
                  disabled={!newP.trim()}
                  onClick={() => {
                    const kind = principals.find((p) => p.name === newP.trim())?.type ?? 'user';
                    patch({ principals: [...(spec.principals ?? []), { type: kind as 'user', name: newP.trim() }] });
                    setNewP('');
                  }}
                  className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(spec.principals ?? []).map((p, i) => (
                  <span key={`${p.name}:${i}`} className="inline-flex items-center gap-1 rounded-full bg-accent-600/10 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200">
                    {p.name} <span className="text-accent-500">· {p.type}</span>
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => patch({ principals: (spec.principals ?? []).filter((_, j) => j !== i) })}>
                      <X aria-hidden className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {(spec.principals ?? []).length === 0 && <span className="text-slate-400 dark:text-slate-500">No principal yet.</span>}
              </div>
            </div>
          )}

          {step === 'role' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {APP_ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={spec.app_role === r.id}
                    onClick={() => patch({ app_role: r.id })}
                    className={`rounded-xl border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                      spec.app_role === r.id ? 'border-accent-500 ring-1 ring-accent-500' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{r.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{r.desc}</span>
                  </button>
                ))}
              </div>
              {(features?.features?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Administration features this policy grants (view / edit / approve):</p>
                  <div className="flex max-h-40 flex-wrap gap-1 overflow-auto">
                    {(features!.features ?? []).slice(0, 60).map((f) => {
                      const key = String(f.key ?? '');
                      const on = (spec.features ?? []).some((x) => x.key === key);
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            patch({
                              features: on
                                ? (spec.features ?? []).filter((x) => x.key !== key)
                                : [...(spec.features ?? []), { key, level: 'view' }],
                            })
                          }
                          className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-accent-500 bg-accent-600 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                        >
                          {String(f.name ?? key)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'objects' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  value={newObj}
                  onChange={(e) => setNewObj(e.target.value)}
                  placeholder="DATABASE.SCHEMA.TABLE"
                  className="h-8 w-72 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
                <button
                  type="button"
                  disabled={!newObj.trim()}
                  onClick={() => {
                    const fqn = newObj.trim().toUpperCase();
                    if (!(spec.objects ?? []).some((o) => o.fqn === fqn))
                      patch({ objects: [...(spec.objects ?? []), { fqn, rights: ['view'] }] });
                    setNewObj('');
                  }}
                  className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40"
                >
                  <Plus aria-hidden className="inline h-3 w-3" /> Add table
                </button>
              </div>
              <ul className="space-y-1">
                {(spec.objects ?? []).map((o, i) => (
                  <li key={o.fqn} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-800">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">{o.fqn}</span>
                    {RIGHTS.map((r) => {
                      const on = o.rights.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={on}
                          title={r === 'view' ? 'SELECT' : r === 'edit' ? '+INSERT, UPDATE' : '+DELETE'}
                          onClick={() =>
                            patch({
                              objects: (spec.objects ?? []).map((x, j) =>
                                j === i ? { ...x, rights: on ? x.rights.filter((y) => y !== r) : [...x.rights, r] } : x,
                              ),
                            })
                          }
                          className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                            on
                              ? r === 'delete'
                                ? 'bg-red-600 text-white'
                                : r === 'edit'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-accent-600 text-white'
                              : 'border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                    <button type="button" aria-label={`Remove ${o.fqn}`} onClick={() => patch({ objects: (spec.objects ?? []).filter((_, j) => j !== i) })} className="text-slate-400 hover:text-red-600">
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {(spec.objects ?? []).length === 0 && <li className="text-slate-400 dark:text-slate-500">No table in the basket yet.</li>}
              </ul>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                view = SELECT · edit = +INSERT, UPDATE · delete = +DELETE. Edit/delete at platform scope trigger a
                second-approver (four-eyes) check.
              </p>
            </div>
          )}

          {step === 'policies' && (
            <div className="space-y-3">
              <PolicyList
                title="Row-level security"
                sub="Users see only rows matching a value on a column."
                items={(spec.policies?.rows ?? []).map((r) => `${r.column ?? '?'} ${r.operator ?? 'in'} (${(r.values ?? []).join(', ')})`)}
                onAdd={(v) => {
                  const [column, ...rest] = v.split(/\s*=\s*|\s+/);
                  patch({ policies: { ...spec.policies, rows: [...(spec.policies?.rows ?? []), { column: column?.toUpperCase(), operator: 'in', values: rest.filter(Boolean) }] } });
                }}
                onRemove={(i) => patch({ policies: { ...spec.policies, rows: (spec.policies?.rows ?? []).filter((_, j) => j !== i) } })}
                placeholder="COLUMN value1 value2 (RLS)"
              />
              <PolicyList
                title="Data masking"
                sub="Sensitive columns shown masked to non-admins."
                items={spec.policies?.columns_masked ?? []}
                onAdd={(v) => patch({ policies: { ...spec.policies, columns_masked: [...(spec.policies?.columns_masked ?? []), v.toUpperCase()] } })}
                onRemove={(i) => patch({ policies: { ...spec.policies, columns_masked: (spec.policies?.columns_masked ?? []).filter((_, j) => j !== i) } })}
                placeholder="COLUMN to mask"
              />
              <PolicyList
                title="Encryption"
                sub="Columns stored one-way hashed (SHA2)."
                items={spec.policies?.columns_encrypted ?? []}
                onAdd={(v) => patch({ policies: { ...spec.policies, columns_encrypted: [...(spec.policies?.columns_encrypted ?? []), v.toUpperCase()] } })}
                onRemove={(i) => patch({ policies: { ...spec.policies, columns_encrypted: (spec.policies?.columns_encrypted ?? []).filter((_, j) => j !== i) } })}
                placeholder="COLUMN to encrypt"
              />
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Retention & classification</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <input
                    value={spec.policies?.retention?.column ?? ''}
                    onChange={(e) => patch({ policies: { ...spec.policies, retention: { column: e.target.value.toUpperCase(), days: spec.policies?.retention?.days ?? 0 } } })}
                    placeholder="DATE column"
                    className="h-7 w-40 rounded border border-slate-200 bg-white px-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  />
                  <input
                    type="number"
                    value={spec.policies?.retention?.days ?? ''}
                    onChange={(e) => patch({ policies: { ...spec.policies, retention: { column: spec.policies?.retention?.column ?? '', days: Number(e.target.value) || 0 } } })}
                    placeholder="days"
                    className="h-7 w-24 rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  />
                  <span className="text-xs text-slate-400 dark:text-slate-500">purge runs as a scheduled workflow, never inline</span>
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-2">
              <p className="text-slate-600 dark:text-slate-300">
                {spec.principals?.length ?? 0} principal(s) · role <span className="font-medium">{spec.app_role}</span> ·{' '}
                {spec.objects?.length ?? 0} object(s) · {(spec.policies?.rows?.length ?? 0)} RLS ·{' '}
                {(spec.policies?.columns_masked?.length ?? 0)} masked · {(spec.policies?.columns_encrypted?.length ?? 0)} encrypted.
              </p>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                <button type="button" disabled={!canSave || busy != null} onClick={() => void save().then((r) => r && setNote('Saved as draft.'))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">
                  {busy === 'save' ? 'Saving…' : 'Save as draft'}
                </button>
                <button type="button" disabled={!canSave || busy != null} onClick={() => void runStep((eid) => compileEntitlement(eid), 'compile')} className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40">
                  {busy === 'compile' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
                  Compile the plan
                </button>
                {state === 'awaiting_approval' && (
                  <button type="button" disabled={busy != null} onClick={() => void runStep((eid) => approveEntitlement(eid, { decision: 'approve', note: 'approved from the editor' }), 'approve')} className="inline-flex items-center gap-1.5 rounded-lg border border-accent-400 px-3 py-1.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 dark:text-accent-300">
                    <Lock aria-hidden className="h-3.5 w-3.5" /> Approve (four-eyes)
                  </button>
                )}
                <button type="button" disabled={busy != null || !id} title="Dry-run by default; ACCOUNTADMIN confirm applies for real" onClick={() => void runStep((eid) => applyEntitlement(eid, { confirm: true }), 'apply')} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-40">
                  {busy === 'apply' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
                  Apply
                </button>
                {(state === 'applied' || state === 'partially_applied') && (
                  <button type="button" disabled={busy != null} onClick={() => void runStep((eid) => revokeEntitlement(eid, true), 'revoke')} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400">
                    Revoke (undo)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* step nav */}
          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            <button type="button" disabled={idx === 0} onClick={() => setStep(STEPS[idx - 1])} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
              Back
            </button>
            {idx < STEPS.length - 1 && (
              <button type="button" onClick={() => setStep(STEPS[idx + 1])} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-900 dark:bg-slate-700">
                Next: {STEP_LABEL[STEPS[idx + 1]]}
              </button>
            )}
          </div>

          {note && <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-emerald-700 dark:text-emerald-300"><Check aria-hidden className="h-3.5 w-3.5" />{note}</p>}
          {refusal && <p role="alert" className="mt-2 text-[13px] text-amber-700 dark:text-amber-300">{refusal}</p>}
        </div>

        {/* ── Preview & impact ── */}
        <aside className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview &amp; impact</p>
            <button type="button" disabled={preview === 'loading'} onClick={() => void runPreview()} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">
              {preview === 'loading' && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />} Simulate
            </button>
          </div>
          {(spec.objects?.length ?? 0) > 1 && (
            <select value={previewFqn} onChange={(e) => setPreviewFqn(e.target.value)} className="mt-1.5 h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              {(spec.objects ?? []).map((o) => <option key={o.fqn} value={o.fqn}>{o.fqn}</option>)}
            </select>
          )}
          {preview == null && <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Simulate to see the masked sample and the exact impact — before anything is saved.</p>}
          {preview === 'loading' && <div role="status" className="mt-2 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />}
          {preview && preview !== 'loading' && (
            <div className="mt-2 space-y-2 text-xs">
              {preview.impact && (
                <ul className="space-y-0.5 text-slate-600 dark:text-slate-300">
                  <li><span className="font-medium tabular-nums">{preview.impact.rows_accessible ?? '—'}</span> rows accessible{preview.impact.rows_accessible_pct != null ? ` (${preview.impact.rows_accessible_pct}%)` : ''}</li>
                  <li><span className="font-medium tabular-nums">{preview.impact.columns_masked ?? 0}</span> columns masked · <span className="font-medium tabular-nums">{preview.impact.columns_encrypted ?? 0}</span> encrypted</li>
                  <li><span className="font-medium tabular-nums">{preview.impact.rows_hidden ?? 0}</span> rows hidden · schema changes: {preview.impact.schema_changes ? 'yes' : 'none'}</li>
                  {preview.impact.write_access && <li className="text-amber-700 dark:text-amber-300">grants write access</li>}
                </ul>
              )}
              {(preview.warnings ?? []).map((w, i) => (
                <p key={i} role="alert" className="rounded bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{w}</p>
              ))}
              {preview.sample?.rows && preview.sample.rows.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
                  <table className="min-w-full">
                    <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <tr>{(preview.sample.columns ?? []).map((c) => <th key={c} className="whitespace-nowrap px-1.5 py-1 font-medium">{c}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {preview.sample.rows.slice(0, 6).map((row, ri) => (
                        <tr key={ri}>{(row as unknown[]).map((cell, ci) => <td key={ci} className="whitespace-nowrap px-1.5 py-1 text-slate-600 dark:text-slate-300">{cell == null ? '—' : String(cell).slice(0, 20)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(preview.sql_preview ?? []).length > 0 && (
                <details>
                  <summary className="cursor-pointer text-slate-500 dark:text-slate-400">SQL preview ({preview.sql_preview!.length})</summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-1.5 font-mono text-[11px] text-slate-600 dark:bg-slate-950 dark:text-slate-400">{preview.sql_preview!.join('\n')}</pre>
                </details>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function PolicyList({
  title,
  sub,
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  title: string;
  sub: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <span key={`${it}:${i}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {it}
            <button type="button" aria-label={`Remove ${it}`} onClick={() => onRemove(i)}><X aria-hidden className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          placeholder={placeholder}
          aria-label={title}
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            if (e.key === 'Enter' && v) {
              onAdd(v);
              (e.target as HTMLInputElement).value = '';
            }
          }}
          className="h-7 w-48 rounded border border-slate-200 bg-white px-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        />
      </div>
    </div>
  );
}

/* ── the panel (header + list + editor) ─────────────────────────────── */

export default function GovernanceAccessPanel() {
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [view, setView] = useState<EntitlementsView | 'loading' | 'error'>('loading');
  const [editing, setEditing] = useState<EntitlementItem | null | 'new'>(null);

  const load = useCallback(() => {
    void getGovernanceSummary().then(setSummary).catch(() => setSummary({}));
    void listEntitlements()
      .then(setView)
      .catch(() => setView('error'));
  }, []);
  useEffect(load, [load]);

  const meta = useMemo(() => (typeof view === 'object' ? view : ({} as EntitlementsView)), [view]);

  if (editing) {
    return (
      <EntitlementEditor
        initial={editing === 'new' ? null : editing}
        features={meta.features}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Governance &amp; Access</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Control who can access what data, and how it is protected — application roles, object baskets and data
            policies in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" /> Create policy
        </button>
      </div>

      <StudioKpiHeader kpis={summaryKpis(summary)} loading={summary === null} />

      {view === 'loading' ? (
        <div role="status" className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
      ) : view === 'error' ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          The governance policies could not be read.
        </p>
      ) : (meta.entitlements ?? []).length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No governance policy yet — create one to grant access under RLS, masking and encryption.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full text-[13px]">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Policy</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Principals</th>
                <th className="px-3 py-2 font-medium">Objects</th>
                <th className="px-3 py-2 font-medium">Protections</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(meta.entitlements ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{e.name ?? e.id}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{e.state ?? 'draft'}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">{e.principals?.length ?? 0}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">{e.objects?.length ?? 0}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {(e.policies?.rows?.length ?? 0)} RLS · {(e.policies?.columns_masked?.length ?? 0)} masked · {(e.policies?.columns_encrypted?.length ?? 0)} enc
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button type="button" onClick={() => setEditing(e)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200">Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
