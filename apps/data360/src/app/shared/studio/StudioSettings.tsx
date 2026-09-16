'use client';

/**
 * StudioSettings — /studio/settings: every application built in the Studio,
 * analyzed and configurable in one place.
 *
 * Left: the applications (backend drafts — the single source of truth).
 * Right, for the selected one: its configuration (title rename via
 * PUT /studio/drafts, the business context it was built from) and its
 * ANALYSIS from GET /studio/model/{id} — tables with row counts and
 * ingestion freshness, relationships, report shape, what is still to
 * confirm — plus the activation status. Real reads only; a draft without a
 * model yet says so instead of faking numbers ('—', never 0).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Play, RefreshCw } from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import { cleanName } from '@/app/shared/studio/StudioAppsHome';
import EmptyState from '@/components/ui/EmptyState';
import {
  decideEnrichment,
  decideEnrichmentsMany,
  getActivation,
  getDraft,
  getDraftSummary,
  getModel,
  grainText,
  listDrafts,
  listEnrichments,
  listInterventions,
  updateDraft,
  type AiEnrichment,
  type AiIntervention,
  type DraftSummary,
  type StudioDraftSummary,
  type StudioModelView,
} from '@/app/services/studio/studio-api';
import { pointJourneyTo } from '@/app/shared/studio/onboarding/journey';
import StudioAdminDigest from '@/app/shared/studio/StudioAdminDigest';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtCount(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

/** Enrichment value → one short plain line. Never a JSON dump: an object
 *  with no top-level string used to fall through to stringify, which is
 *  exactly the display_hints shape. */
function enrichmentPreview(value: unknown): string {
  const flatten = (v: unknown, depth = 0): string => {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map((x) => flatten(x, depth + 1)).filter(Boolean).join(' · ');
    if (typeof v === 'object' && depth < 3) {
      return Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => {
          const inner = flatten(x, depth + 1);
          if (!inner) return '';
          return Array.isArray(x) || typeof x === 'string' ? inner : `${k.replace(/_/g, ' ')}: ${inner}`;
        })
        .filter(Boolean)
        .join(' · ');
    }
    return '';
  };
  return flatten(value).trim() || 'nothing recorded for this entry';
}

/** kind-aware BUSINESS phrasing for a suggestion row — the raw flattened
 *  payload («rel_13.referential_integrity: evidence: unknown · left rows:
 *  10000 · orphan pct: 100 …») is a leak, not a sentence; it stays one hover
 *  away. Unknown kinds fall back to the generic preview, never blank. */
function humanizeEnrichment(
  kind: string | undefined,
  scopeKey: string | undefined,
  value: unknown,
): string | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const k = String(kind ?? '');
  if (k === 'dq_rule') {
    const rule = (String(scopeKey ?? '').split('.').slice(-1)[0] || 'quality rule').replace(/_/g, ' ');
    const verdict =
      typeof v.verdict === 'string' ? v.verdict : typeof v.status === 'string' ? v.status : undefined;
    const orphans = v.orphans ?? v.violations;
    const left = v.left_rows ?? v.rows;
    const pct = v.orphan_pct ?? v.violation_pct;
    return [
      `${rule} ${verdict === 'fail' ? 'FAILS' : verdict === 'pass' ? 'holds' : 'is proposed'}`,
      orphans != null && left != null
        ? `${Number(orphans).toLocaleString()} of ${Number(left).toLocaleString()} rows without a match`
        : null,
      pct != null ? `(${Number(pct).toLocaleString()}%)` : null,
      typeof v.evidence === 'string' && v.evidence !== 'unknown' ? `evidence ${v.evidence}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (k === 'relationship') {
    const from = (v.from_column ?? v.from) as string | undefined;
    const to = (v.to_column ?? v.to) as string | undefined;
    const label = typeof v.label === 'string' ? v.label : undefined;
    if (label || (from && to))
      return `${label ?? `link ${from} → ${to}`}${typeof v.status === 'string' ? ` · ${String(v.status).replace(/_/g, ' ')}` : ''}`;
  }
  return null;
}

type ModelPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'none' } // no model yet — honest, not an error
  | { kind: 'error'; message: string }
  | { kind: 'ready'; model: StudioModelView };

interface DraftContext {
  industry_id?: string | null;
  category_id?: string | null;
  hierarchy?: string[];
  audience?: string | null;
  notes?: string | null;
}

export default function StudioSettings() {
  const router = useRouter();
  useTrackEvent();

  const [drafts, setDrafts] = useState<StudioDraftSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [context, setContext] = useState<DraftContext | null>(null);
  const [modelPhase, setModelPhase] = useState<ModelPhase>({ kind: 'idle' });
  const [activation, setActivation] = useState<Record<string, unknown> | null>(null);
  const [interventions, setInterventions] = useState<AiIntervention[] | null>(null);
  const [proposed, setProposed] = useState<AiEnrichment[] | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [cost, setCost] = useState<DraftSummary['cost']>(null);

  const load = useCallback(async () => {
    setListError(null);
    setDrafts(null);
    try {
      const all = await listDrafts();
      setDrafts(all);
      if (all.length > 0) setSelectedId((prev) => prev ?? all[0].draft_id);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'The applications could not be read.');
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* per-application detail: config + model analysis + activation */
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    const summary = drafts?.find((d) => d.draft_id === selectedId);
    setTitle(summary?.title ?? '');
    setSaving('idle');
    setContext(null);
    setActivation(null);
    setModelPhase({ kind: 'loading' });

    setCost(null);
    // ONE summary call replaces draft + activation (+ cost rollup).
    void getDraftSummary(selectedId).then((s) => {
      if (!alive) return;
      if (s) {
        if (s.title) setTitle(String(s.title));
        setContext((s.context as DraftContext) ?? null);
        setActivation((s.activation as Record<string, unknown>) ?? null);
        setCost(s.cost ?? null);
        return;
      }
      // resilience: older backend without ?include — the two old reads
      void getDraft(selectedId)
        .then((payload) => {
          if (!alive || !payload) return;
          const p = payload as { title?: string; context?: DraftContext };
          if (p.title) setTitle(p.title);
          setContext(p.context ?? null);
        })
        .catch(() => undefined);
      void getActivation(selectedId).then((a) => alive && setActivation(a));
    });

    void getModel(selectedId)
      .then((model) => {
        if (!alive) return;
        setModelPhase(
          (model.tables?.length ?? 0) > 0 || model.report
            ? { kind: 'ready', model }
            : { kind: 'none' },
        );
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) setModelPhase({ kind: 'none' });
        else
          setModelPhase({
            kind: 'error',
            message: e instanceof Error ? e.message : 'The analysis could not be read.',
          });
      });

    // AI registry: the journal + the suggestions awaiting the user's call.
    setInterventions(null);
    setProposed(null);
    void listInterventions({ draftId: selectedId, limit: 20 })
      .then((items) => alive && setInterventions(items))
      .catch(() => alive && setInterventions([]));
    void listEnrichments({ draftId: selectedId, status: 'proposed' })
      .then((items) => alive && setProposed(items))
      .catch(() => alive && setProposed([]));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const saveTitle = useCallback(async () => {
    if (!selectedId || !title.trim() || saving === 'saving') return;
    setSaving('saving');
    try {
      await updateDraft(selectedId, { title: title.trim() });
      setDrafts((prev) =>
        prev?.map((d) => (d.draft_id === selectedId ? { ...d, title: title.trim() } : d)) ?? prev,
      );
      setSaving('saved');
    } catch {
      setSaving('idle');
    }
  }, [saving, selectedId, title]);

  const continueApp = useCallback(() => {
    if (!selectedId) return;
    pointJourneyTo(selectedId); // the guided journey resumes this app too
    router.push(routes.studioApp(selectedId));
  }, [router, selectedId]);

  const decide = useCallback(
    async (id: string, status: 'confirmed' | 'rejected') => {
      setDeciding(id);
      try {
        await decideEnrichment(id, status);
        setProposed((prev) => prev?.filter((e) => e.enrichment_id !== id) ?? prev);
      } catch {
        /* stays listed — retry possible */
      } finally {
        setDeciding(null);
      }
    },
    [],
  );

  const selected = drafts?.find((d) => d.draft_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PlainQuestionHeader
        question="Your applications"
        detail="What each application is made of, how fresh its data is, and its configuration — every figure read live."
        backHref={routes.studio}
        backLabel="Studio"
        actions={
          <>
            <QuietAction label="Refresh" icon={RefreshCw} onClick={() => void load()} />
          </>
        }
      />

      {drafts == null ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : listError ? (
        <EmptyState
          icon={AlertCircle}
          title="The applications could not be read"
          description={listError}
          action={<QuietAction label="Retry" icon={RefreshCw} onClick={() => void load()} />}
        />
      ) : drafts.length === 0 ? (
        <EmptyState
          title="No application yet"
          description="Start one from the Studio — pick your industry and the question that matters."
          action={<QuietAction label="Open the Studio" href={routes.studio} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px,1fr]">
          {/* the applications */}
          <nav aria-label="Applications" className="space-y-1.5">
            {drafts.map((d) => {
              const active = d.draft_id === selectedId;
              return (
                <button
                  key={d.draft_id}
                  type="button"
                  onClick={() => setSelectedId(d.draft_id)}
                  aria-current={active ? 'true' : undefined}
                  className={`block w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    active
                      ? 'border-accent-500 ring-1 ring-accent-500'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {cleanName(d)}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {d.step ? `step: ${d.step}` : 'not started'} · updated {fmtDate(d.updated_at)}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* the selected application */}
          {selected && (
            <div className="min-w-0 space-y-4">
              {/* configuration */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Configuration
                </h3>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setSaving('idle');
                    }}
                    maxLength={120}
                    aria-label="Application name"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => void saveTitle()}
                    disabled={saving === 'saving' || !title.trim() || title.trim() === (selected.title ?? '')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-accent-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    {saving === 'saved' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> Saved
                      </>
                    ) : (
                      'Rename'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={continueApp}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-600 px-3 text-xs font-medium text-white hover:bg-accent-700"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    Continue this application
                  </button>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-slate-400 dark:text-slate-500">Business context</dt>
                    <dd className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {context?.industry_id
                        ? [context.industry_id, context.category_id].filter(Boolean).join(' › ')
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-400 dark:text-slate-500">Drill order</dt>
                    <dd className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {context?.hierarchy?.length ? context.hierarchy.join(' → ') : '—'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-400 dark:text-slate-500">Audience</dt>
                    <dd className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {context?.audience || '—'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-400 dark:text-slate-500">Activation</dt>
                    <dd className="text-slate-700 dark:text-slate-200">
                      {typeof activation?.status === 'string'
                        ? String(activation.status)
                        : 'not requested'}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-400 dark:text-slate-500">AI cost</dt>
                    <dd className="tabular-nums text-slate-700 dark:text-slate-200">
                      {cost
                        ? `${cost.ai_calls ?? '—'} AI call(s) · ${
                            cost.duration_ms != null ? `${(cost.duration_ms / 1000).toFixed(0)}s` : '—'
                          } · ${cost.credits_charged ?? 0} credit(s)`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* analysis */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Analysis
                  </h3>
                  {selectedId && (
                    <span className="flex items-center gap-3">
                      <QuietAction
                        label="Open the workspace"
                        href={routes.studioApp(selectedId)}
                      />
                      <QuietAction
                        label="Full model"
                        href={`${routes.studioModel}?draft=${encodeURIComponent(selectedId)}`}
                      />
                    </span>
                  )}
                </div>
                {/* 'idle' = nothing selected yet. It had NO branch, so the
                    card rendered as an empty grey block with no explanation. */}
                {modelPhase.kind === 'idle' && (
                  <p className="mt-2.5 text-[13px] text-slate-500 dark:text-slate-400">
                    {selectedId
                      ? 'Reading this application…'
                      : 'Pick an application on the left to see what its analysis found.'}
                  </p>
                )}
                {modelPhase.kind === 'loading' && (
                  <div className="mt-2.5 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
                )}
                {modelPhase.kind === 'none' && (
                  <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    No model yet — run the understanding step to build one. Nothing is analyzed
                    before you pick the data.
                  </p>
                )}
                {modelPhase.kind === 'error' && (
                  <p role="alert" className="mt-2.5 text-xs text-red-600 dark:text-red-400">
                    {modelPhase.message}
                  </p>
                )}
                {modelPhase.kind === 'ready' && (
                  <div className="mt-2.5 space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: 'Tables', value: fmtCount(modelPhase.model.tables?.length) },
                        { label: 'Links', value: fmtCount(modelPhase.model.relationships?.length) },
                        {
                          label: 'Key figures',
                          value: fmtCount(modelPhase.model.report?.kpis?.length),
                        },
                        {
                          label: 'Charts',
                          value: fmtCount(modelPhase.model.report?.charts?.length),
                        },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-800"
                        >
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {s.label}
                          </p>
                          <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {s.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {(modelPhase.model.tables ?? []).length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800">
                            <tr>
                              {['Table', 'One row is', 'Rows (approx.)', 'Data freshness'].map((h) => (
                                <th
                                  key={h}
                                  scope="col"
                                  className="whitespace-nowrap px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {modelPhase.model.tables!.map((t) => {
                              const stale =
                                t.ingestion?.days_since_last_load != null &&
                                t.ingestion.days_since_last_load > 7;
                              return (
                                <tr key={t.entity_id}>
                                  <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-700 dark:text-slate-200">
                                    {t.name}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                                    {grainText(t.grain) ?? '—'}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1 tabular-nums text-slate-700 dark:text-slate-300">
                                    {fmtCount(t.row_count_approx)}
                                  </td>
                                  <td
                                    className={`whitespace-nowrap px-2 py-1 ${
                                      stale
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    {t.ingestion?.days_since_last_load != null
                                      ? `${t.ingestion.days_since_last_load} day(s) since last load`
                                      : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {(modelPhase.model.definitions ?? []).filter((d) => d.status === 'to_confirm')
                      .length > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {
                          modelPhase.model.definitions!.filter((d) => d.status === 'to_confirm')
                            .length
                        }{' '}
                        definition(s) still to confirm — the application keeps working meanwhile.
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* suggestions to confirm — the learning loop is the USER's call */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Suggestions to confirm
                </h3>
                {proposed == null ? (
                  <div className="mt-2.5 h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
                ) : proposed.length === 0 ? (
                  <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    Nothing awaiting your decision — new suggestions appear here after each
                    analysis, and only what YOU confirm feeds future answers.
                  </p>
                ) : (
                  <>
                  {/* one approval instead of N clicks — grouped by source */}
                  {(() => {
                    const groups = new Map<string, { kind?: string; count: number }>();
                    for (const e of proposed) {
                      const parts = String(e.scope_key ?? '').split('.');
                      const prefix = parts.length >= 3 ? parts.slice(0, 3).join('.') : (e.kind ?? 'other');
                      const g = groups.get(prefix) ?? { kind: e.kind, count: 0 };
                      g.count += 1;
                      groups.set(prefix, g);
                    }
                    const big = [...groups.entries()].filter(([, g]) => g.count >= 5).slice(0, 3);
                    if (big.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {big.map(([prefix, g]) => (
                          <button
                            key={prefix}
                            type="button"
                            disabled={deciding === `bulk:${prefix}`}
                            title={`One decision for the ${g.count} proposed ${String(g.kind ?? '').replace(/_/g, ' ')} suggestions of ${prefix} — recorded like any confirmation`}
                            onClick={async () => {
                              setDeciding(`bulk:${prefix}`);
                              try {
                                await decideEnrichmentsMany({
                                  status: 'confirmed',
                                  filter: { scope_prefix: prefix, kind: g.kind, status: 'proposed', limit: 500 },
                                });
                                setProposed((prev) =>
                                  prev?.filter(
                                    (e) => !String(e.scope_key ?? '').startsWith(prefix) || e.kind !== g.kind,
                                  ) ?? prev,
                                );
                              } catch {
                                /* the per-item buttons stay usable */
                              } finally {
                                setDeciding(null);
                              }
                            }}
                            className="rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50 dark:text-accent-300 dark:hover:bg-accent-900/30"
                          >
                            {deciding === `bulk:${prefix}` ? 'Confirming…' : `Confirm all ${g.count} · ${prefix}`}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  <ul className="mt-2.5 space-y-1.5">
                    {proposed.slice(0, 12).map((e) => (
                      <li
                        key={e.enrichment_id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-800"
                      >
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {(e.kind ?? '—').replace(/_/g, ' ')}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200"
                          title={`${e.scope_key ?? ''} — ${enrichmentPreview(e.value)}`}
                        >
                          {humanizeEnrichment(e.kind, e.scope_key, e.value) ??
                            `${e.scope_key ? `${e.scope_key}: ` : ''}${enrichmentPreview(e.value)}`}
                        </span>
                        <button
                          type="button"
                          disabled={deciding === e.enrichment_id}
                          onClick={() => void decide(e.enrichment_id, 'confirmed')}
                          className="rounded-md bg-accent-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={deciding === e.enrichment_id}
                          onClick={() => void decide(e.enrichment_id, 'rejected')}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                        >
                          Reject
                        </button>
                      </li>
                    ))}
                  </ul>
                  </>
                )}
              </section>

              {/* AI history — every intervention, with its provenance */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  AI history
                </h3>
                {interventions == null ? (
                  <div className="mt-2.5 h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
                ) : interventions.length === 0 ? (
                  <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    No AI intervention recorded for this application yet.
                  </p>
                ) : (
                  <div className="mt-2.5 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>
                          {['What', 'Model', 'Outcome', 'Took', 'When'].map((h) => (
                            <th
                              key={h}
                              scope="col"
                              className="whitespace-nowrap px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {interventions.slice(0, 20).map((it) => (
                          <tr
                            key={it.intervention_id}
                            title={[
                              it.output_summary,
                              it.prompt_id && `prompt ${it.prompt_id} ${it.prompt_version ?? ''}`,
                              it.run_id,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-700 dark:text-slate-200">
                              {(it.kind ?? '—').replace(/_/g, ' ')}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                              {it.provider === 'manual' ? 'manual' : it.model ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 text-slate-600 dark:text-slate-300">
                              {it.decision?.status ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 tabular-nums text-slate-500 dark:text-slate-400">
                              {it.cost?.duration_ms != null
                                ? `${(it.cost.duration_ms / 1000).toFixed(1)}s`
                                : '—'}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                              {fmtDate(it.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {/* D-1 — the account's operational truth, no separate monitoring page */}
      <StudioAdminDigest />
    </div>
  );
}
