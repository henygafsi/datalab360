'use client';

/**
 * ConnectionSheet — the sheet of ONE first-class connection, opened in
 * place of the list.
 *
 * It shows what the backend actually knows: identity and masked secret
 * refs (never a value), capabilities as configured-vs-verified, the LAST
 * PERSISTED diagnostic with its distinct checks (marked stale the moment
 * the configuration version moves), real dependencies (visible
 * applications named, hidden ones counted — never guessed), and the
 * change history.
 *
 * Sensitive changes ride the draft lifecycle the contract enforces:
 * draft (active untouched, empty secret = unchanged, clearing explicit)
 * → test the draft → impact → apply (409 DRAFT_NOT_TESTED otherwise,
 * verification runs right after). Deletion checks dependencies server-side
 * and its refusals are rendered, not swallowed.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import {
  applyConnectionDraft,
  deleteConnection,
  discardConnectionDraft,
  getConnection,
  getConnectionImpact,
  putConnectionDraft,
  testConnection,
  updateConnection,
  type ConnectionDetail,
  type ConnectionImpact,
  type ConnectionTestResult,
  type Refusal,
} from '@/app/services/studio/connections';
import {
  getRestConnector,
  invalidateSourcesCaches,
  type RestConnector,
} from '@/app/services/studio/studio-api';
import StudioRestBuilder from '@/app/shared/studio/StudioRestBuilder';
import { RefusalView, TestResultView } from '@/app/shared/studio/sources/connection-bits';
import { fmtDateTime, neutralLabel } from '@/app/shared/studio/sources/sources-kit';

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' }) {
  return (
    <span
      className={`rounded-full px-1.5 py-px text-xs ${
        tone === 'green'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      {children}
    </span>
  );
}

export default function ConnectionSheet({
  connectionId,
  onClose,
  onChanged,
  onDeleted,
}: {
  connectionId: string;
  onClose: () => void;
  /** something about the shared definition changed — the list must reload */
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [c, setC] = useState<ConnectionDetail | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [draftTest, setDraftTest] = useState<ConnectionTestResult | null>(null);
  const [impact, setImpact] = useState<ConnectionImpact | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [editingRest, setEditingRest] = useState(false);
  /** the FULL stored REST definition — the editor must start from it, or a
   *  Save would replace endpoints/pagination/target with form defaults */
  const [restFull, setRestFull] = useState<RestConnector | 'loading' | null>(null);
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('');
  const [description, setDescription] = useState('');
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [clearKeys, setClearKeys] = useState<string[]>([]);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [applyArmed, setApplyArmed] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getConnection(connectionId);
      setC(d);
      setName(d.name ?? '');
      setEnvironment(d.environment ?? '');
      setDescription(d.description ?? '');
    } catch {
      setC('error');
    }
  }, [connectionId]);

  useEffect(() => {
    setC('loading');
    setTestResult(null);
    setDraftTest(null);
    setImpact(null);
    setRefusal(null);
    void load();
  }, [load]);

  const act = useCallback(
    async (key: string, fn: () => Promise<unknown>, reload = true) => {
      if (busy) return;
      setBusy(key);
      setRefusal(null);
      try {
        await fn();
        if (reload) await load();
      } finally {
        setBusy(null);
      }
    },
    [busy, load],
  );

  if (c === 'loading')
    return (
      <div role="status" className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the connection sheet…</span>
      </div>
    );
  if (c === 'error')
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        The connection sheet could not be read.
        <button type="button" onClick={onClose} className="ml-2 text-accent-600 hover:underline dark:text-accent-400">
          Back to the list
        </button>
      </section>
    );

  const perms = c.permissions ?? {};
  const secretRef = c.auth?.secret_ref ?? {};
  const configuredCaps = c.capabilities?.configured ?? [];
  const verifiedCaps = new Set(c.capabilities?.verified ?? []);
  const lastTest = testResult ?? c.last_test_detail ?? c.last_test ?? null;
  const deps = c.dependencies;
  const formFields = (c.form?.fields ?? []).filter((f) => f.scope !== 'object');
  const hasDraft = c.draft != null;
  const draftInfo = (c.draft ?? null) as {
    params_changed?: string[];
    secrets_changed?: string[];
    base_version?: number;
    last_test?: ConnectionTestResult | null;
  } | null;
  const version = c.version ?? 0;

  const runTest = (target: 'active' | 'draft') =>
    act(`test:${target}`, async () => {
      const r = await testConnection(connectionId, { target });
      if (r.ok) {
        if (target === 'draft') setDraftTest(r.value);
        else setTestResult(r.value);
      } else setRefusal(r.refusal);
    }, false);

  const saveDraft = () =>
    act('draft', async () => {
      const params: Record<string, unknown> = {};
      const secrets: Record<string, string> = {};
      for (const f of formFields) {
        const v = configValues[f.name] ?? '';
        if (v === '') continue; // empty = unchanged, for params typed here too
        if (f.secret) secrets[f.name] = v;
        else params[f.name] = v;
      }
      const r = await putConnectionDraft(connectionId, {
        expected_version: version,
        params,
        secrets,
        ...(clearKeys.length ? { clear_secrets: clearKeys } : {}),
      });
      if (!r.ok) setRefusal(r.refusal);
      else {
        setDraftTest(null);
        setImpact(null);
      }
    });

  const runApply = () =>
    act('apply', async () => {
      const r = await applyConnectionDraft(connectionId, {
        expected_version: version,
        confirm: true,
      });
      if (!r.ok) setRefusal(r.refusal);
      else {
        setEditingConfig(false);
        setConfigValues({});
        setClearKeys([]);
        setDraftTest(null);
        setApplyArmed(false);
        invalidateSourcesCaches();
        onChanged();
      }
    });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {neutralLabel(c.name) || c.connection_id}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {c.type ?? '—'} · environment: {c.environment ?? '—'} · owner: {c.owner ?? '—'} · v
            {version}
            {c.managed_by && c.managed_by !== 'studio' ? ` · managed by ${c.managed_by}` : ''}
            {hasDraft && (
              <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-px text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                draft pending
              </span>
            )}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {perms.configure && (
            <button
              type="button"
              onClick={() => setEditingDetails((v) => !v)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
            >
              {editingDetails ? 'Close details' : 'Rename / details'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the connection sheet"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* non-sensitive edits — expected_version guards concurrent saves */}
      {editingDetails && (
        <div className="mt-3 flex flex-wrap items-end gap-2.5 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-56 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Environment</span>
            <input
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="h-8 w-32 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
          <label className="block min-w-0 flex-1">
            <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
          <button
            type="button"
            disabled={busy != null}
            onClick={() =>
              void act('details', async () => {
                const r = await updateConnection(connectionId, {
                  expected_version: version,
                  name: name.trim(),
                  environment: environment.trim(),
                  description: description.trim(),
                });
                if (!r.ok) setRefusal(r.refusal);
                else {
                  setEditingDetails(false);
                  invalidateSourcesCaches();
                  onChanged();
                }
              })
            }
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Save
          </button>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Business names are editable — identifiers and bindings stay stable.
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* ── identity & capabilities ─────────────────────────────────── */}
        <section className="rounded-lg border border-slate-200 p-2.5 text-[13px] dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Identity & capabilities
          </p>
          <dl className="mt-1.5 space-y-1 text-slate-700 dark:text-slate-200">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-400 dark:text-slate-500">Authentication</dt>
              <dd>
                {c.auth?.method ?? '—'}
                {c.auth?.identity && (
                  <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
                    {Object.entries(c.auth.identity)
                      .filter(([, v]) => v != null && typeof v !== 'object')
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ')}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-400 dark:text-slate-500">Secrets</dt>
              <dd className="flex flex-wrap gap-1">
                {Object.entries(secretRef).length === 0 && (
                  <span className="text-slate-400 dark:text-slate-500">none</span>
                )}
                {Object.entries(secretRef).map(([k, v]) => (
                  <Chip key={k} tone={v === 'set' ? 'green' : 'slate'}>
                    {k}: {v === 'set' ? 'set · ••••••' : 'missing'}
                  </Chip>
                ))}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-400 dark:text-slate-500">Capabilities</dt>
              <dd className="flex flex-wrap gap-1">
                {configuredCaps.length === 0 && <span className="text-slate-400 dark:text-slate-500">—</span>}
                {configuredCaps.map((cap) => (
                  <Chip key={cap} tone={verifiedCaps.has(cap) ? 'green' : 'slate'}>
                    {cap} · {verifiedCaps.has(cap) ? 'verified' : 'declared'}
                  </Chip>
                ))}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-400 dark:text-slate-500">Your rights</dt>
              <dd className="text-xs text-slate-500 dark:text-slate-400">
                {(['use', 'read_metadata', 'read_data', 'configure', 'manage_secrets', 'write'] as const)
                  .filter((k) => perms[k])
                  .join(' · ') || '—'}
                {perms.note ? ` — ${perms.note}` : ''}
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            « declared » becomes « verified » only through a dated diagnostic. A secret is never
            displayed; when editing, an empty field means « unchanged » and clearing is explicit.
          </p>
        </section>

        {/* ── dependencies & history ──────────────────────────────────── */}
        <section className="rounded-lg border border-slate-200 p-2.5 text-[13px] dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Used by
          </p>
          {deps?.known === false ? (
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              The dependency lineage is not readable right now — unknown is unknown, not zero.
            </p>
          ) : (
            <>
              <p className="mt-1 text-slate-700 dark:text-slate-200">
                {deps?.total_applications ?? 0} application(s) · {deps?.objects ?? 0} object(s) ·{' '}
                {deps?.jobs ?? 0} job(s)
                {(deps?.hidden_applications ?? 0) > 0 &&
                  ` — ${deps?.hidden_applications} application(s) you cannot see are counted, not named`}
              </p>
              {(deps?.applications ?? []).length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {(deps?.applications ?? []).map((a, i) => {
                    const objCount = Array.isArray(a.objects) ? a.objects.length : a.objects;
                    return (
                      <li
                        key={a.draft_id ?? i}
                        title={Array.isArray(a.objects) ? a.objects.join(', ') : undefined}
                      >
                        {a.title ?? a.name ?? a.draft_id}
                        {objCount != null ? ` · ${objCount} object(s)` : ''}
                        {a.jobs != null ? ` · ${a.jobs} job(s)` : ''}
                      </li>
                    );
                  })}
                  {deps?.truncated && <li className="text-slate-400 dark:text-slate-500">… list truncated</li>}
                </ul>
              )}
            </>
          )}
          {(c.history ?? []).length > 0 && (
            <>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                History
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                {(c.history ?? []).slice(0, 6).map((h, i) => (
                  <li key={i}>
                    {fmtDateTime(h.at)} — {h.action ?? '—'}
                    {h.version != null ? ` (v${h.version})` : ''}
                    {h.by ? ` · ${h.by}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* ── the persisted diagnostic + explicit bounded test ──────────── */}
      <section className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Diagnostic
          </p>
          <button
            type="button"
            disabled={busy != null || !perms.use}
            title={perms.use ? 'Bounded (20 s), nothing written, your own identity' : 'You cannot use this connection'}
            onClick={() => void runTest('active')}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
          >
            {busy === 'test:active' && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
            Test the connection
          </button>
        </div>
        {/* role=status: the post-click result must reach screen readers */}
        <div className="mt-1.5" role="status">
          {busy === 'test:active' ? (
            <p className="text-[13px] text-slate-500 dark:text-slate-400">Running the bounded diagnostic…</p>
          ) : lastTest ? (
            <TestResultView result={lastTest} />
          ) : (
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Never tested — no diagnostic proof is recorded for this connection.
            </p>
          )}
        </div>
      </section>

      {/* ── sensitive configuration: draft → test → impact → apply ────── */}
      {perms.configure && formFields.length > 0 && (
        <section className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Configuration{hasDraft ? ' — a draft is pending' : ''}
            </p>
            <button
              type="button"
              onClick={() => setEditingConfig((v) => !v)}
              className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
            >
              {editingConfig ? 'Close' : hasDraft ? 'Continue the draft' : 'Change the configuration (draft)'}
            </button>
          </div>

          {editingConfig && (
            <div className="mt-2">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                The active configuration stays untouched until Apply. An empty field means
                « unchanged » — params and secrets alike.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2.5">
                {formFields.map((f) => (
                  <label key={f.name} className="block">
                    <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {f.label ?? f.name}
                      {f.secret ? ' (empty = unchanged)' : ''}
                    </span>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      value={configValues[f.name] ?? ''}
                      placeholder={f.secret ? '••••••' : f.placeholder}
                      onChange={(e) => setConfigValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="h-8 w-52 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </label>
                ))}
              </div>
              {perms.manage_secrets &&
                Object.entries(secretRef).filter(([, v]) => v === 'set').length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    Clear explicitly:
                    {Object.entries(secretRef)
                      .filter(([, v]) => v === 'set')
                      .map(([k]) => (
                        <label key={k} className="inline-flex cursor-pointer items-center gap-1">
                          <input
                            type="checkbox"
                            checked={clearKeys.includes(k)}
                            onChange={() =>
                              setClearKeys((prev) =>
                                prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
                              )
                            }
                            className="h-3.5 w-3.5 accent-accent-600"
                          />
                          <span className="font-mono">{k}</span>
                        </label>
                      ))}
                  </div>
                )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void saveDraft()}
                  className="rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  {busy === 'draft' ? 'Saving…' : 'Save the draft'}
                </button>
                {hasDraft && (
                  <>
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => void runTest('draft')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                    >
                      {busy === 'test:draft' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
                      Test the draft
                    </button>
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() =>
                        void act('impact', async () => setImpact(await getConnectionImpact(connectionId)), false)
                      }
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                    >
                      Impact
                    </button>
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => {
                        if (!applyArmed) {
                          setApplyArmed(true);
                          return;
                        }
                        void runApply();
                      }}
                      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                        applyArmed
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'border border-accent-500 text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-900/30'
                      }`}
                    >
                      {applyArmed ? 'Confirm — the active configuration changes now' : 'Apply…'}
                    </button>
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() =>
                        void act('discard', async () => {
                          const r = await discardConnectionDraft(connectionId);
                          if (!r.ok) setRefusal(r.refusal);
                          else {
                            setDraftTest(null);
                            setImpact(null);
                          }
                        })
                      }
                      className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400"
                    >
                      Discard the draft
                    </button>
                  </>
                )}
              </div>
              {draftInfo && (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Draft on v{draftInfo.base_version ?? version}: params changed —{' '}
                  {(draftInfo.params_changed ?? []).join(', ') || 'none'}; secrets changed —{' '}
                  {(draftInfo.secrets_changed ?? []).join(', ') || 'none'}. The active configuration
                  keeps answering meanwhile.
                </p>
              )}
              {draftTest && (
                <div role="status" className="mt-1.5 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Draft test</p>
                  <TestResultView result={draftTest} />
                </div>
              )}
              {impact && (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Impact: {impact.dependencies?.total_applications ?? 0} application(s) ·{' '}
                  {impact.active_runs?.count ?? 0} active run(s)
                  {impact.active_runs?.known === false ? ' (runs unknown)' : ''} · pooled sessions:{' '}
                  {impact.sessions?.pooled ?? 0}
                  {impact.sessions?.note ? ` — ${impact.sessions.note}` : ''}
                  {impact.rollback && typeof impact.rollback.note === 'string'
                    ? ` · rollback: ${impact.rollback.note}`
                    : ''}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* REST endpoints keep their dedicated editor (same engine, same
          secret semantics) — and the storage fix means an old connector's
          secret must be re-entered once */}
      {c.managed_by === 'studio_rest' && (
        <section className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Endpoints & ingestion (REST)
            </p>
            <button
              type="button"
              onClick={() => {
                const next = !editingRest;
                setEditingRest(next);
                if (next && (restFull == null || restFull === 'loading')) {
                  setRestFull('loading');
                  void getRestConnector(c.connection_id.replace(/^rest:/, '')).then((full) =>
                    setRestFull(full ?? null),
                  );
                }
              }}
              className="ml-auto rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
            >
              {editingRest ? 'Close the editor' : 'Edit endpoints & run'}
            </button>
          </div>
          {Object.values(secretRef).every((v) => v !== 'set') && Object.keys(secretRef).length > 0 && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              The stored secret is missing (a storage defect was fixed server-side) — re-enter it
              once in the editor below.
            </p>
          )}
          {editingRest &&
            (restFull === 'loading' ? (
              <div role="status" className="mt-2 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
                <span className="sr-only">Reading the stored definition…</span>
              </div>
            ) : restFull ? (
              <div className="mt-2">
                <StudioRestBuilder
                  connector={restFull}
                  onClose={() => setEditingRest(false)}
                  onSaved={() => onChanged()}
                />
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
                The stored definition could not be read — editing stays off rather than replacing
                what cannot be seen.
              </p>
            ))}
        </section>
      )}

      {refusal && (
        <div className="mt-3">
          <RefusalView refusal={refusal} />
        </div>
      )}

      {/* ── deletion — dependency-checked server-side, never guessed ──── */}
      {perms.configure && (
        <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <button
            type="button"
            disabled={busy != null}
            onClick={() => {
              if (!deleteArmed) {
                setDeleteArmed(true);
                return;
              }
              setDeleteArmed(false);
              void act('delete', async () => {
                const r = await deleteConnection(connectionId, true);
                if (!r.ok) setRefusal(r.refusal);
                else {
                  invalidateSourcesCaches();
                  onDeleted();
                }
              }, false);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              deleteArmed
                ? 'bg-red-50 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : 'text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400'
            }`}
          >
            {deleteArmed
              ? 'Confirm — every dependency is checked server-side first'
              : 'Delete this connection…'}
          </button>
        </div>
      )}
    </section>
  );
}
