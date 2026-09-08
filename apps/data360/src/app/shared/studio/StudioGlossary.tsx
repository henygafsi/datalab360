'use client';

/**
 * StudioGlossary — the application's business words.
 *
 * Terms feed the AI at understanding and model edit (context_block) — so
 * the glossary lives WITH the knowledge, editable in place: add a term
 * with its meaning, click one to reword it, clearing the meaning removes
 * it (the backend's own semantics). Application scope wins over account
 * scope; nothing here calls a model.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  getGlossary,
  putGlossary,
  type GlossaryTerm,
} from '@/app/services/studio/context';

export default function StudioGlossary({ draftId }: { draftId: string }) {
  const [terms, setTerms] = useState<GlossaryTerm[] | 'loading'>('loading');
  const [editing, setEditing] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void getGlossary(draftId).then(setTerms);
  }, [draftId]);

  useEffect(() => load(), [load]);

  const save = async (t: string, m: string) => {
    if (busy || !t.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await putGlossary([{ term: t.trim(), meaning: m.trim() }], draftId);
      setNote(m.trim() ? `« ${t.trim()} » saved — it feeds the AI from the next analysis.` : `« ${t.trim()} » removed.`);
      setEditing(null);
      setTerm('');
      setMeaning('');
      load();
    } catch {
      setNote('The glossary write failed.');
    } finally {
      setBusy(false);
    }
  };

  const list = Array.isArray(terms) ? terms : [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Glossary</h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          your words — injected into every AI step, never overwritten by a rescan
        </span>
      </div>

      {terms === 'loading' ? (
        <div role="status" className="mt-2 h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800">
          <span className="sr-only">Reading the glossary…</span>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-start gap-1.5">
          {list.map((t) =>
            editing === t.term ? (
              <span key={t.term} className="inline-flex items-center gap-1.5">
                <span className="rounded-full bg-accent-600/10 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200">
                  {t.term}
                </span>
                <input
                  autoFocus
                  defaultValue={t.meaning ?? ''}
                  aria-label={`Meaning of ${t.term} — empty removes it`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save(t.term, (e.target as HTMLInputElement).value);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  placeholder="meaning — empty removes the term"
                  className="h-7 w-64 rounded-lg border border-accent-400 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-accent-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </span>
            ) : (
              <button
                key={t.term}
                type="button"
                onClick={() => setEditing(t.term)}
                title={`${t.meaning ?? ''}${t.synonyms?.length ? ` · synonyms: ${t.synonyms.join(', ')}` : ''} — click to reword; an empty meaning removes it`}
                className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:border-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
              >
                <span className="font-medium">{t.term}</span>
                {t.meaning && <span className="ml-1 text-slate-400 dark:text-slate-500">{t.meaning.slice(0, 40)}{t.meaning.length > 40 ? '…' : ''}</span>}
              </button>
            ),
          )}
          <span className="inline-flex items-center gap-1">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="term"
              aria-label="New glossary term"
              className="h-7 w-28 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <input
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save(term, meaning)}
              placeholder="what it means, for a colleague"
              aria-label="Meaning of the new term"
              className="h-7 w-56 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <button
              type="button"
              disabled={busy || !term.trim() || !meaning.trim()}
              onClick={() => void save(term, meaning)}
              aria-label="Add the term"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-accent-500 text-accent-700 hover:bg-accent-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}
      {note && <p role="status" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
    </section>
  );
}
