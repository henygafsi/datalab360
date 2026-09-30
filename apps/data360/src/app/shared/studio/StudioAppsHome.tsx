'use client';

/**
 * StudioAppsHome — /studio: the applications, first.
 *
 * Cards carry a PROJECT NAME, not the question: the backend title arrives
 * as « question · timestamp » — the card shows the cleaned name (renamable
 * in place, PUT draft), the question stays as the subtitle when it differs.
 * Internal source-analysis drafts (« Describe these sources… ») are working
 * artifacts, hidden behind a toggle instead of flooding the grid; the grid
 * paginates at 12. No invented metadata: a missing updated_at renders from
 * the title's own timestamp when there is one, '—' otherwise.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, Hammer, Pencil, Plus, RefreshCw, X, Zap } from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import EmptyState from '@/components/ui/EmptyState';
import {
  listDrafts,
  updateDraft,
  type StudioDraftSummary,
} from '@/app/services/studio/studio-api';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';

const PAGE = 12;
const ANALYSIS_PREFIX = 'Describe these sources for a business reader';

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** « … · 20260907-062855 » → a date, when the title carries one. */
function dateFromTitle(title?: string | null): string | null {
  const m = /·\s*(\d{4})(\d{2})(\d{2})-\d{6}\s*$/.exec(title ?? '');
  return m ? fmtDate(`${m[1]}-${m[2]}-${m[3]}`) : null;
}

/** A draft created by the source-analysis flow carries the AI INSTRUCTION
 *  as its title ("Describe these sources for a business reader: …"). That
 *  is a prompt, not a name — a dozen cards then read identically. Name
 *  them by what they are instead. */
const ANALYSIS_PROMPT = /^describe these sources for a business reader/i;

export function cleanName(d: StudioDraftSummary): string {
  const dn = (d.display_name ?? '').trim();
  if (dn && !ANALYSIS_PROMPT.test(dn)) return dn;
  const t = (d.title ?? '').replace(/\s*·\s*\d{8}-\d{6}\s*$/, '').trim();
  if (t && !ANALYSIS_PROMPT.test(t)) return t;
  if (ANALYSIS_PROMPT.test(t) || ANALYSIS_PROMPT.test(dn)) {
    const when = d.created_at ?? d.updated_at;
    const day = when ? new Date(when) : null;
    return day && !Number.isNaN(day.getTime())
      ? `Source analysis · ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : 'Source analysis';
  }
  return t || d.draft_id;
}

const STEP_LABEL: Record<string, string> = {
  need: 'defining the need',
  sources: 'picking sources',
  understanding: 'understanding the data',
  preview: 'first report',
  automation: 'automations',
  activation: 'activation',
};

function stepLabel(d: StudioDraftSummary): string {
  const raw = String(d.step ?? d.step_name ?? '')
    .replace(/^STUDIO_/i, '')
    .toLowerCase();
  return raw ? (STEP_LABEL[raw] ?? raw.replace(/_/g, ' ')) : 'not started';
}

export default function StudioAppsHome() {
  useTrackEvent();
  const [drafts, setDrafts] = useState<StudioDraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  const load = () => {
    setError(null);
    setDrafts(null);
    // the backend filters by purpose — the internal source-analysis
    // drafts only load when the user asks to see them
    listDrafts(showAnalysis ? 'all' : 'application')
      .then(setDrafts)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Your applications could not be read.'),
      );
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [showAnalysis]);

  const { apps, analysisCount } = useMemo(() => {
    const all = drafts ?? [];
    const isAnalysis = (d: StudioDraftSummary) =>
      d.purpose === 'source_analysis' ||
      String(d.title ?? '').startsWith(ANALYSIS_PREFIX) ||
      String(d.need ?? '').startsWith(ANALYSIS_PREFIX);
    return {
      apps: all,
      analysisCount: all.filter(isAnalysis).length,
    };
  }, [drafts]);

  /* lifecycle sections — LIVE first, then in build; counts are client
     tallies over the SERVED rows (the list is complete), never invented. */
  const live = apps.filter((d) => d.active_version != null);
  const building = apps.filter((d) => d.active_version == null);
  const visibleOf = (arr: StudioDraftSummary[]) => (showAll ? arr : arr.slice(0, PAGE));

  const saveRename = async () => {
    if (!renaming || renameBusy) return;
    const value = renaming.value.trim();
    if (!value) return setRenaming(null);
    setRenameBusy(true);
    try {
      // the NAME is display_name — the question keeps living in `need`,
      // and renaming never touches the SQL objects
      await updateDraft(renaming.id, { display_name: value });
      setDrafts((prev) =>
        prev?.map((d) => (d.draft_id === renaming.id ? { ...d, display_name: value } : d)) ?? prev,
      );
      setRenaming(null);
    } catch {
      // keep the editor open — the name was NOT saved
    } finally {
      setRenameBusy(false);
    }
  };

  /* one application card — unchanged; the lifecycle sections reuse it */
  const renderCard = (d: StudioDraftSummary) => {
              const name = cleanName(d);
              const need = String(d.need ?? '').trim();
              const when = fmtDate(d.updated_at) ?? dateFromTitle(d.title);
              const editing = renaming?.id === d.draft_id;
              return (
                <Link
                  key={d.draft_id}
                  href={routes.studioApp(d.draft_id)}
                  onClick={(e) => {
                    if (editing) e.preventDefault();
                  }}
                  className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-600"
                >
                  {editing ? (
                    <span className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                      <input
                        value={renaming!.value}
                        autoFocus
                        onChange={(e) =>
                          setRenaming((r) => (r ? { ...r, value: e.target.value } : r))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveRename();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        aria-label="Application name"
                        className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      />
                      <button
                        type="button"
                        disabled={renameBusy}
                        onClick={() => void saveRename()}
                        title="Save the name"
                        className="shrink-0 rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-900/30"
                      >
                        <Check aria-hidden className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenaming(null)}
                        title="Cancel"
                        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-start justify-between gap-1.5">
                      <p className="min-w-0 text-sm font-medium text-slate-900 line-clamp-2 group-hover:text-accent-700 dark:text-slate-100 dark:group-hover:text-accent-400">
                        {name}
                      </p>
                      <button
                        type="button"
                        title="Rename this application"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRenaming({ id: d.draft_id, value: name });
                        }}
                        className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-slate-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-slate-300"
                      >
                        <Pencil aria-hidden className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {need && need !== name && (
                    <p className="mt-0.5 text-xs text-slate-500 line-clamp-2 dark:text-slate-400" title={need}>
                      {need}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <span>
                      {stepLabel(d)}
                      {when ? ` · ${when}` : ''}
                    </span>
                    {d.active_version != null && (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-px text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        v{d.active_version} active
                      </span>
                    )}
                    {d.purpose === 'source_analysis' && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-px text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        analysis draft
                      </span>
                    )}
                  </p>
                </Link>
              );
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
      <PlainQuestionHeader
        question="Your applications"
        detail="Open one to work on its reports, model, data and access — or start a new one from your need."
        actions={
          <Link
            href={routes.studioNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <Plus aria-hidden className="h-4 w-4" />
            New application
          </Link>
        }
      />

      {drafts == null && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {error && (
        <EmptyState
          icon={AlertCircle}
          title="Your applications could not be read"
          description={error}
          action={<QuietAction label="Retry" icon={RefreshCw} onClick={load} />}
        />
      )}

      {drafts != null && apps.length === 0 && (
        <EmptyState
          title="No application yet"
          description="Start from your need — the AI proposes the sources, the model and the first report; you decide everything."
          action={<QuietAction label="Create the first one" icon={Plus} href={routes.studioNew} />}
        />
      )}

      {drafts != null && apps.length > 0 && (
        <>
          {/* the portfolio summary — icons + real counts */}
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Portfolio summary">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {apps.length} application{apps.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <Zap aria-hidden className="h-3 w-3 text-emerald-500" />
              {live.length} live
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <Hammer aria-hidden className="h-3 w-3 text-slate-400" />
              {building.length} in build
            </span>
            {analysisCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs tabular-nums text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {analysisCount} source analys{analysisCount === 1 ? 'is' : 'es'}
              </span>
            )}
          </div>

          {/* LIVE — running with an active version */}
          {live.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Zap aria-hidden className="h-3.5 w-3.5 text-emerald-500" />
                Live
                <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{live.length}</span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleOf(live).map(renderCard)}
              </div>
            </section>
          )}

          {/* IN BUILD — the stage each one is at stays on its card */}
          {building.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Hammer aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                In build
                <span className="rounded-full bg-slate-100 px-1.5 py-px text-xs tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{building.length}</span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleOf(building).map(renderCard)}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {!showAll && apps.length > PAGE && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs text-accent-600 hover:underline dark:text-accent-400"
              >
                Show all {apps.length} applications
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowAnalysis((v) => !v);
                setShowAll(false);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {showAnalysis
                ? `Hide the source-analysis drafts${analysisCount ? ` (${analysisCount})` : ''}`
                : 'Show the source-analysis drafts too'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
