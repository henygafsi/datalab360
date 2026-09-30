'use client';

/**
 * StudioKnowledgeHeader — knowledge is CONTINUOUS, not a Generate button.
 *
 * The header says where the knowledge came from — « updated from N source
 * observations · M accepted definitions · … » — with the four honest
 * counts (confirmed / proposed / rejected / stale) and ONE explicit
 * re-derivation action. The review itself stays below (the registre
 * routes): the user validates what is ambiguous, never retypes what the
 * analyses already learned.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getKnowledge, syncKnowledge, type KnowledgeView } from '@/app/services/studio/context';

const COUNT_CLS: Record<string, string> = {
  confirmed: 'bg-accent-600/10 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200',
  proposed: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  rejected: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  stale: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

export default function StudioKnowledgeHeader({
  draftId,
  onSynced,
}: {
  draftId: string;
  /** a sync may have written new proposals — the review list reloads */
  onSynced?: () => void;
}) {
  const [k, setK] = useState<KnowledgeView | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void getKnowledge(draftId).then(setK);
  }, [draftId]);

  useEffect(() => load(), [load]);

  const sync = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await syncKnowledge(draftId, true);
      setNote(
        r.status === 'unchanged'
          ? 'Nothing new — the knowledge already reflects the context.'
          : `${r.written ?? 0} proposal(s) written${r.stale_marked ? ` · ${r.stale_marked} marked stale` : ''}.`,
      );
      load();
      onSynced?.();
    } catch {
      setNote('The re-derivation could not run.');
    } finally {
      setBusy(false);
    }
  };

  const uf = k?.updated_from;
  const fromWords = uf
    ? [
        uf.source_observations ? `${uf.source_observations} source observation(s)` : null,
        uf.accepted_definitions ? `${uf.accepted_definitions} accepted definition(s)` : null,
        uf.reporting ? `${uf.reporting} reporting edit(s)` : null,
        uf.dq_findings ? `${uf.dq_findings} quality finding(s)` : null,
        uf.decisions ? `${uf.decisions} decision(s)` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Knowledge</h3>
        {k?.counts &&
          (['confirmed', 'proposed', 'stale', 'rejected'] as const).map((key) =>
            (k.counts?.[key] ?? 0) > 0 ? (
              <span key={key} className={`rounded-full px-1.5 py-px text-xs ${COUNT_CLS[key]}`}>
                {k.counts?.[key]} {key}
              </span>
            ) : null,
          )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void sync()}
          title="Explicit re-derivation from the current context — nothing is scanned, nothing confirmed for you"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
        >
          {busy && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
          Refresh from context
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {fromWords
          ? `Updated from: ${fromWords}. It keeps itself current after each analysis, decision and model edit — review below what is proposed; your words are never overwritten.`
          : 'Knowledge derives from the context automatically — analyses, decisions and model edits feed it; review below what is proposed.'}
        {k?.account_wide?.count ? (
          <span className="ml-1 text-slate-400 dark:text-slate-500">
            ({k.account_wide.count} account-wide item(s) live apart.)
          </span>
        ) : null}
      </p>
      {note && (
        <p role="status" className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p>
      )}
    </section>
  );
}
