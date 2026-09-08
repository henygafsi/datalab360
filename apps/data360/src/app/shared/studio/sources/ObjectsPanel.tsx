'use client';

/**
 * ObjectsPanel — the « Objects in use » view of /studio/source, on the
 * versioned-attachment contract (GET /studio/drafts/{id}/sources — the
 * persisted state, NO scan on display).
 *
 * An object exists through its attachment to an application, so the view
 * keeps an explicit application context. One dense row per object
 * (business/physical name, origin, understanding, volume with its method,
 * quality, usage) — a click opens the server-built object sheet in place:
 * copyable physical path, synthesis, the columns with their mapping and
 * anomalies, an ON-DEMAND bounded preview (the envelope is consumed only
 * on the click), usage with `lineage_known` honesty, rename (business
 * name only — the binding stays stable), a classified schema-check, and
 * a detach whose dependencies come back from the server as a 409 with
 * explicit resolution options — never « the job still works ».
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Pencil, RefreshCw, Search } from 'lucide-react';
import {
  detachSource,
  getDraftSources,
  getObjectSheet,
  patchAttachment,
  previewConnectionObject,
  schemaCheck,
  type AttachedSourceItem,
  type ConnectionPreview,
  type DraftSourcesView,
  type ObjectSheetView,
  type Refusal,
  type SchemaCheckResult,
} from '@/app/services/studio/connections';
import { listDrafts, type StudioDraftSummary } from '@/app/services/studio/studio-api';
import { QuietAction } from '@/app/shared/studio/PlainKit';
import StudioSourceCard from '@/app/shared/studio/StudioSourceCard';
import { RefusalView } from '@/app/shared/studio/sources/connection-bits';
import { CopyableFqn, Pager, fmtCount } from '@/app/shared/studio/sources/sources-kit';
import { routes } from '@/config/routes';

const PAGE_SIZE = 25;
const APP_STORE_KEY = 'd360_studio_sources_app';

const UNDERSTANDING_CLS: Record<string, string> = {
  known: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  stale: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  not_analysed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function volumeWords(v?: AttachedSourceItem['volume']): string {
  if (!v || v.state === 'unknown' || v.rows == null) return '—';
  return fmtCount(v.rows);
}

function qualityWords(q?: AttachedSourceItem['quality']): string {
  if (!q || q.state !== 'evaluated') return 'not evaluated';
  return `${q.checks ?? 0} check(s)`;
}

/** origin arrives as words or as {connection_id, database} — flatten. */
function originWords(s: AttachedSourceItem): string {
  const o = s.origin;
  if (typeof o === 'string' && o) return o;
  if (o && typeof o === 'object') {
    return [o.connection_id, o.database].filter(Boolean).join(' · ') || s.connection_id || '—';
  }
  return s.connection_id ?? '—';
}

/* ── the object sheet ───────────────────────────────────────────────── */

function ObjectSheet({
  draftId,
  refId,
  onClose,
  onOpenConnection,
  onChangedList,
}: {
  draftId: string;
  refId: string;
  onClose: () => void;
  onOpenConnection: (connectionId: string) => void;
  onChangedList: () => void;
}) {
  const [sheet, setSheet] = useState<ObjectSheetView | 'loading' | 'error'>('loading');
  const [colQ, setColQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [preview, setPreview] = useState<ConnectionPreview | null>(null);
  const [schema, setSchema] = useState<SchemaCheckResult | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      setSheet(await getObjectSheet(draftId, refId));
    } catch {
      setSheet('error');
    }
  }, [draftId, refId]);

  useEffect(() => {
    setSheet('loading');
    setPreview(null);
    setSchema(null);
    setRefusal(null);
    void load();
  }, [load]);

  if (sheet === 'loading')
    return (
      <div role="status" className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the object sheet…</span>
      </div>
    );
  if (sheet === 'error')
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        The object sheet could not be read.
        <button type="button" onClick={onClose} className="ml-2 text-accent-600 hover:underline dark:text-accent-400">
          Back to the list
        </button>
      </section>
    );

  const h = sheet.header ?? {};
  const syn = sheet.synthesis ?? {};
  const cols = sheet.columns;
  const usage = sheet.usage ?? {};
  const fqn = h.physical_path ?? refId;
  const connectionId = h.connection?.connection_id;
  const colItems = (cols?.items ?? []).filter(
    (c) => !colQ.trim() || c.name.toLowerCase().includes(colQ.trim().toLowerCase()),
  );

  const runPreview = async () => {
    if (!connectionId) return;
    setBusy('preview');
    setRefusal(null);
    const r = await previewConnectionObject(connectionId, {
      ref: refId,
      rows: 20,
      draft_id: draftId,
    });
    setBusy(null);
    if (r.ok) setPreview(r.value);
    else setRefusal(r.refusal);
  };

  const runSchemaCheck = async () => {
    setBusy('schema');
    setRefusal(null);
    const r = await schemaCheck(draftId, refId);
    setBusy(null);
    if (r.ok) setSchema(r.value);
    else setRefusal(r.refusal);
  };

  const saveName = async () => {
    const v = newName.trim();
    if (!v) return;
    setBusy('rename');
    setRefusal(null);
    const r = await patchAttachment(draftId, refId, { business_name: v });
    setBusy(null);
    setRenaming(false);
    if (!r.ok) setRefusal(r.refusal);
    else {
      await load();
      onChangedList();
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
            Objects in use
          </button>
          {renaming ? (
            <span className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveName();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                aria-label="Business name of this object"
                className="h-8 w-72 rounded-lg border border-accent-400 bg-white px-2 text-base font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={busy === 'rename'}
                onClick={() => void saveName()}
                className="rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40"
              >
                Save
              </button>
            </span>
          ) : (
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
              {h.business_name ?? fqn.split('.').slice(-1)[0]}
              <button
                type="button"
                aria-label="Rename this object (business name only — the binding stays)"
                title="Rename — the business name is free; the physical binding never re-associates by name"
                onClick={() => {
                  setNewName(h.business_name ?? '');
                  setRenaming(true);
                }}
                className="rounded p-0.5 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-slate-200"
              >
                <Pencil aria-hidden className="h-3.5 w-3.5" />
              </button>
            </h2>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <CopyableFqn fqn={fqn} />
            {h.type && <span>{h.type}</span>}
            {h.binding_version != null && <span>· binding v{h.binding_version}</span>}
            {connectionId && (
              <button
                type="button"
                onClick={() => onOpenConnection(connectionId)}
                className="text-accent-600 hover:underline dark:text-accent-400"
              >
                via {connectionId}
              </button>
            )}
          </p>
        </div>
      </div>

      {/* ── synthesis ─────────────────────────────────────────────────── */}
      <section className="mt-3 rounded-lg border border-slate-200 p-2.5 text-[13px] dark:border-slate-800">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Synthesis
        </p>
        <p className="mt-1 text-slate-700 dark:text-slate-200">
          {syn.description || (
            <span className="text-slate-400 dark:text-slate-500">
              No description yet — add one on the card below; your words feed the AI.
            </span>
          )}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span>
            grain:{' '}
            {syn.grain?.key?.length
              ? `${syn.grain.key.join(' + ')}${syn.grain.status ? ` (${syn.grain.status})` : ''}`
              : 'not established'}
          </span>
          <span>volume: {volumeWords(syn.volume)}</span>
          <span>
            quality:{' '}
            {syn.quality?.state === 'evaluated'
              ? `${syn.quality.overall ?? ''} · ${syn.quality.checks ?? 0} check(s)`
              : 'not evaluated'}
          </span>
          <span>
            understanding: {syn.understanding?.state ?? 'not_analysed'}
            {syn.understanding?.stale ? ' (stale — the attachment changed since)' : ''}
          </span>
        </p>
      </section>

      {/* ── columns (server-known, mapping + anomalies + actions) ─────── */}
      <section className="mt-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Columns
            {cols?.state === 'known' && (
              <span className="ml-1.5 normal-case tracking-normal text-slate-400">
                {(cols.items ?? []).length}
              </span>
            )}
          </p>
          {cols?.state === 'known' && (cols.items ?? []).length > 8 && (
            <label className="relative ml-auto">
              <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={colQ}
                onChange={(e) => setColQ(e.target.value)}
                placeholder="Search columns"
                aria-label="Search columns"
                className="h-7 w-48 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          )}
        </div>

        {cols?.state !== 'known' ? (
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            Columns are not discovered yet — run the understanding from the application to analyse
            this object (nothing runs on display).
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Column</th>
                  <th className="px-2 py-1 font-medium">Type</th>
                  <th className="px-2 py-1 font-medium">Role</th>
                  <th className="px-2 py-1 font-medium">Anomalies</th>
                  <th className="px-2 py-1 font-medium">Lands in</th>
                  <th className="px-2 py-1 font-medium" aria-label="Column actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {colItems.map((col) => (
                  <tr key={col.name}>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs text-slate-700 dark:text-slate-200">
                      {col.name}
                      {col.key && Object.keys(col.key).length > 0 && (
                        <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          key
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-500 dark:text-slate-400">
                      {col.type ?? '—'}
                      {col.nullable ? ' · nullable' : ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-500 dark:text-slate-400">
                      {col.role ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {(col.anomalies ?? []).length > 0 ? (
                        <span
                          className="rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                          title={(col.anomalies ?? [])
                            .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
                            .join(' · ')}
                        >
                          {(col.anomalies ?? []).length}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {col.mapping?.column ? (
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          {col.mapping.target ? `${col.mapping.target}.` : ''}
                          {col.mapping.column}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">not mapped</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        {col.mapping?.target_id && (
                          <Link
                            href={`${routes.studioApp(draftId)}?view=model`}
                            className="text-xs text-accent-600 hover:underline dark:text-accent-400"
                            title="Open this mapping in the application's model"
                          >
                            mapping
                          </Link>
                        )}
                        {col.mapping?.responsible_job_id && (
                          <Link
                            href={`${routes.studioApp(draftId)}?view=jobs`}
                            className="text-xs text-accent-600 hover:underline dark:text-accent-400"
                            title={`Open the responsible process (${col.mapping.responsible_job_id})`}
                          >
                            job
                          </Link>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {colItems.length === 0 && (
              <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                {colQ ? `No column matches « ${colQ} ».` : 'No column recorded.'}
              </p>
            )}
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          Correcting a definition happens on the card below (your words are authoritative). The
          source system&apos;s data is never modified from here.
        </p>
      </section>

      {/* ── on-demand bounded preview + schema check ──────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy != null || !connectionId}
          onClick={() => void runPreview()}
          title="Reads a bounded sample within the free envelope — only on this click"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
        >
          {busy === 'preview' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          Preview a sample
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void runSchemaCheck()}
          title="Bounded read of the current columns, classified against what was analysed"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
        >
          {busy === 'schema' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          Check the schema
        </button>
      </div>

      {refusal && (
        <div className="mt-2">
          <RefusalView refusal={refusal} />
        </div>
      )}

      {preview && (
        <div className="mt-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {preview.row_count ?? 0} row(s) · {preview.method ?? 'sample'}
            {preview.scope?.note ? ` — ${preview.scope.note}` : ''}
            {preview.scope?.is_production_total === false && ' · not a production total'}
            {preview.scope?.freshness ? ` · ${preview.scope.freshness}` : ''}
          </p>
          {(preview.columns ?? []).length > 0 && (
            <div className="mt-1 max-h-56 overflow-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {(preview.columns ?? []).slice(0, 12).map((cn) => (
                      <th key={cn} className="px-2 py-1 font-medium">{cn}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(preview.rows ?? []).slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      {(row as unknown[]).slice(0, 12).map((v, j) => (
                        <td key={j} className="whitespace-nowrap px-2 py-0.5 text-slate-600 dark:text-slate-300">
                          {v == null ? '—' : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {schema && (
        <div className="mt-2 rounded-lg border border-slate-200 p-2 text-[13px] dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Schema check
          </p>
          <ul className="mt-1 space-y-0.5 text-slate-700 dark:text-slate-200">
            <li>added: {(schema.added ?? []).join(', ') || 'none'}</li>
            <li>removed: {(schema.removed ?? []).join(', ') || 'none'}</li>
            <li>
              type changed:{' '}
              {(schema.type_changed ?? []).map((t) => `${t.name} (${t.from} → ${t.to})`).join(', ') ||
                'none'}
            </li>
            {(schema.rename_candidates ?? []).length > 0 && (
              <li>
                possible renames — TO CONFIRM, never auto-applied:{' '}
                {(schema.rename_candidates ?? []).map((r) => `${r.from} → ${r.to}`).join(', ')}
              </li>
            )}
          </ul>
          {(schema.impacts?.targets ?? []).length > 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              impacts: {(schema.impacts?.targets ?? []).map((t) => t.name).join(', ')}
            </p>
          )}
          {schema.ai?.available === false && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              An AI-proposed adaptation is not available yet — the classification above is.
            </p>
          )}
        </div>
      )}

      {/* ── usage — lineage honesty ───────────────────────────────────── */}
      <section className="mt-3 rounded-lg border border-slate-200 p-2.5 text-[13px] dark:border-slate-800">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Used by
        </p>
        {usage.lineage_known === false ? (
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {usage.note ?? 'The lineage is not known — that is not the same as zero dependencies.'}
          </p>
        ) : (
          <p className="mt-1 text-slate-700 dark:text-slate-200">
            {(usage.targets ?? []).length} target(s) · {(usage.jobs ?? []).length} job(s) ·{' '}
            {(usage.kpis ?? []).length} KPI(s) · {(usage.charts ?? []).length} chart(s)
            {' — '}
            <Link href={`${routes.studioApp(draftId)}?view=model`} className="text-accent-600 hover:underline dark:text-accent-400">
              open the model
            </Link>
            {' · '}
            <Link href={`${routes.studioApp(draftId)}?view=jobs`} className="text-accent-600 hover:underline dark:text-accent-400">
              open the processes
            </Link>
          </p>
        )}
      </section>

      {/* the functional card: the company's words (feed the AI), health,
          storage cost with assumptions, load pattern + sample DQ */}
      {h.physical_path && (
        <div className="mt-3">
          <StudioSourceCard draftId={draftId} fqn={h.physical_path} onChanged={onChangedList} />
        </div>
      )}
    </section>
  );
}

/* ── the list ───────────────────────────────────────────────────────── */

export default function ObjectsPanel({
  initialSelection,
  onSelectionChange,
  onAddSource,
  onOpenConnection,
}: {
  /** ?object= deep link (a ref). */
  initialSelection?: string | null;
  onSelectionChange?: (ref: string | null) => void;
  onAddSource: () => void;
  onOpenConnection: (connectionId: string) => void;
}) {
  const [apps, setApps] = useState<StudioDraftSummary[] | 'loading' | 'error'>('loading');
  const [appId, setAppId] = useState<string | null>(null);
  const [view, setView] = useState<DraftSourcesView | 'loading' | 'error' | null>(null);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(initialSelection ?? null);
  const [removeArm, setRemoveArm] = useState<string | null>(null);
  const [detachBusy, setDetachBusy] = useState<string | null>(null);
  const [detachRefusal, setDetachRefusal] = useState<{ ref: string; refusal: Refusal } | null>(null);
  const [detachNote, setDetachNote] = useState<string | null>(null);
  const debounced = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0);

  const loadApps = useCallback(() => {
    setApps('loading');
    void listDrafts('application')
      .then((ds) => {
        const sorted = [...ds].sort((a, b) =>
          String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
        );
        setApps(sorted);
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(APP_STORE_KEY);
        } catch {
          /* storage unavailable */
        }
        const first = sorted.find((d) => d.draft_id === stored) ?? sorted[0];
        setAppId((cur) => cur ?? first?.draft_id ?? null);
      })
      .catch(() => setApps('error'));
  }, []);
  useEffect(() => loadApps(), [loadApps]);

  // an in-flight detach of app A must never overwrite app B's list: the
  // generation guard alone is not enough (A's late reload re-bumps it), so
  // every response is also checked against the CURRENT app
  const appIdRef = useRef<string | null>(null);
  appIdRef.current = appId;
  const load = useCallback(
    async (params: { q: string; offset: number }, silent = false) => {
      if (!appId) return;
      const target = appId;
      const my = ++gen.current;
      if (!silent) setView('loading');
      try {
        const v = await getDraftSources(appId, {
          q: params.q || undefined,
          offset: params.offset,
          limit: PAGE_SIZE,
        });
        if (my === gen.current && target === appIdRef.current) setView(v);
      } catch {
        if (my === gen.current && target === appIdRef.current) setView('error');
      }
    },
    [appId],
  );

  useEffect(() => {
    // an app change resets EVERY per-app state — an armed destructive
    // button must never survive into another application's row
    setQ('');
    setOffset(0);
    setDetachNote(null);
    setDetachRefusal(null);
    setRemoveArm(null);
    void load({ q: '', offset: 0 });
  }, [load]);

  const pickApp = (id: string) => {
    setAppId(id);
    setSelected(null);
    onSelectionChange?.(null);
    try {
      window.localStorage.setItem(APP_STORE_KEY, id);
    } catch {
      /* storage unavailable */
    }
  };

  const search = (value: string) => {
    setQ(value);
    setOffset(0);
    if (debounced.current) clearTimeout(debounced.current);
    debounced.current = setTimeout(() => void load({ q: value.trim(), offset: 0 }), 350);
  };

  const goPage = (p: number) => {
    const o = p * PAGE_SIZE;
    setOffset(o);
    void load({ q: q.trim(), offset: o });
  };

  const select = useCallback(
    (ref: string | null) => {
      setSelected(ref);
      onSelectionChange?.(ref);
    },
    [onSelectionChange],
  );

  const ready = typeof view === 'object' && view != null ? view : null;
  const items = ready?.items ?? [];
  const total = ready?.total ?? items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const runDetach = useCallback(
    async (s: AttachedSourceItem, resolution?: string) => {
      if (!appId) return;
      setDetachBusy(s.ref);
      setDetachNote(null);
      setDetachRefusal(null);
      const r = await detachSource(appId, s.ref, {
        confirm: true,
        resolution,
        expectedVersion: ready?.sources_version,
      });
      setDetachBusy(null);
      if (!r.ok) {
        setDetachRefusal({ ref: s.ref, refusal: r.refusal });
        return;
      }
      const jobs = Object.entries(r.value.jobs_state ?? {});
      setDetachNote(
        `Detached. The source itself is NOT deleted and other applications are untouched.` +
          (jobs.length
            ? ` Affected process(es): ${jobs.map(([j, st]) => `${j} → ${st}`).join(', ')} — none of them is functional on this source anymore.`
            : ''),
      );
      void load({ q: q.trim(), offset }, true);
    },
    [appId, load, offset, q, ready?.sources_version],
  );

  const appBar = (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="sources-app" className="text-xs text-slate-500 dark:text-slate-400">
        Application
      </label>
      <select
        id="sources-app"
        value={appId ?? ''}
        disabled={detachBusy != null}
        onChange={(e) => pickApp(e.target.value)}
        className="h-8 max-w-72 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {Array.isArray(apps) &&
          apps.map((d) => (
            <option key={d.draft_id} value={d.draft_id}>
              {d.display_name || d.title || d.need?.slice(0, 60) || d.draft_id}
            </option>
          ))}
      </select>
      {(ready?.stale_for?.length ?? 0) > 0 && (
        <span
          className="rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          title={`Understanding is stale for: ${(ready?.stale_for ?? []).join(', ')}`}
        >
          understanding stale for {ready?.stale_for?.length} object(s)
        </span>
      )}
    </div>
  );

  if (apps === 'loading')
    return (
      <div role="status" className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the applications…</span>
      </div>
    );
  if (apps === 'error')
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        The applications could not be read — objects in use are listed per application.{' '}
        <QuietAction label="Try again" icon={RefreshCw} onClick={loadApps} />
      </p>
    );
  if (apps.length === 0)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[13px] text-slate-600 dark:text-slate-300">
          No application yet — an object is « in use » once an application attaches it.
        </p>
        <button
          type="button"
          onClick={onAddSource}
          className="mt-2 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          Add a source
        </button>
      </div>
    );

  if (appId && selected) {
    return (
      <ObjectSheet
        draftId={appId}
        refId={selected}
        onClose={() => select(null)}
        onOpenConnection={onOpenConnection}
        onChangedList={() => void load({ q: q.trim(), offset }, true)}
      />
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        {appBar}
        <label className="relative ml-auto">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="Search objects"
            aria-label="Search objects"
            className="h-8 w-52 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
      </div>

      {view === 'loading' || view == null ? (
        <div role="status" className="mt-3 h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
          <span className="sr-only">Reading the objects…</span>
        </div>
      ) : view === 'error' ? (
        <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">
          The objects of this application could not be read.{' '}
          <QuietAction
            label="Try again"
            icon={RefreshCw}
            onClick={() => void load({ q: q.trim(), offset })}
          />
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Object</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Origin</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Understanding</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Volume</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Quality</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">Usage</th>
                  <th scope="col" className="px-2 py-1.5 font-medium" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((s) => {
                  const und = s.understanding?.state ?? 'not_analysed';
                  const uCls = UNDERSTANDING_CLS[und] ?? UNDERSTANDING_CLS.not_analysed;
                  const usage = s.usage;
                  return (
                    <tr key={s.ref} className="text-[13px]">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => select(s.ref)}
                          title={`Open the object sheet — ${s.fqn ?? s.ref}`}
                          className="rounded font-medium text-slate-900 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-100 dark:hover:text-accent-400"
                        >
                          {s.business_name || s.physical_name || s.ref}
                        </button>
                        <p className="truncate font-mono text-xs text-slate-400 dark:text-slate-500" title={s.fqn ?? s.ref}>
                          {(s.fqn ?? s.ref).split('.').slice(-2).join('.')}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {originWords(s)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${uCls}`}>
                          {und.replace('_', ' ')}
                        </span>
                      </td>
                      <td
                        className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-600 dark:text-slate-300"
                        title={s.volume?.method ?? undefined}
                      >
                        {volumeWords(s.volume)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {qualityWords(s.quality)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-300">
                        {usage?.lineage_known === false ? (
                          <span className="text-slate-400 dark:text-slate-500" title="Lineage unknown — not the same as zero">
                            lineage unknown
                          </span>
                        ) : (
                          `${usage?.targets ?? 0} target(s) · ${usage?.jobs ?? 0} job(s)`
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <button
                          type="button"
                          disabled={detachBusy != null}
                          onClick={() => {
                            if (removeArm !== s.ref) {
                              setRemoveArm(s.ref);
                              return;
                            }
                            setRemoveArm(null);
                            void runDetach(s);
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                            removeArm === s.ref
                              ? 'bg-red-50 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : 'text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400'
                          }`}
                        >
                          {removeArm === s.ref
                            ? 'Confirm — this application only; the source stays'
                            : detachBusy === s.ref
                              ? 'Detaching…'
                              : 'Detach…'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">
                {q
                  ? `No object matches « ${q} ».`
                  : 'This application has no attached object yet — add a source to attach some.'}
              </p>
            )}
          </div>
          <Pager
            page={Math.floor(offset / PAGE_SIZE)}
            pageCount={pageCount}
            onPage={goPage}
            total={total}
            shown={items.length}
          />

          {/* a refused detach comes back with its real dependencies and the
              explicit resolutions — the user chooses, nothing is guessed */}
          {detachRefusal && (
            <div className="mt-2">
              <RefusalView refusal={detachRefusal.refusal} />
              {Array.isArray(detachRefusal.refusal.detail?.options) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Resolve by:</span>
                  {(detachRefusal.refusal.detail!.options as string[])
                    .filter((o) => o !== 'replace')
                    .map((o) => (
                      <button
                        key={o}
                        type="button"
                        disabled={detachBusy != null}
                        onClick={() => {
                          const s = items.find((i) => i.ref === detachRefusal.ref);
                          if (s) void runDetach(s, o);
                        }}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                      >
                        {o === 'suspend_jobs' ? 'suspend its processes' : 'keep them, marked broken'}
                      </button>
                    ))}
                  <span className="text-slate-400 dark:text-slate-500">
                    (replacing the source happens from the object sheet&apos;s binding)
                  </span>
                </div>
              )}
            </div>
          )}
          {detachNote && (
            <p role="status" className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              {detachNote}{' '}
              {appId && (
                <Link href={`${routes.studioApp(appId)}?view=jobs`} className="text-accent-600 hover:underline dark:text-accent-400">
                  open the processes
                </Link>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
