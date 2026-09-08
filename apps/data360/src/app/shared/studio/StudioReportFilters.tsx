'use client';

/**
 * StudioReportFilters — the report's page filters, as controls that work.
 *
 * Why it exists: the report already declared its filters, and the run
 * routes have always accepted `global_filters`. The UI listed them as dead
 * text ("DAT_FACTURE · date_range") under the sentence "page filters are
 * set by the generator". So the reader saw a filter, could not set it, and
 * the server reported `filters_applied: 0` on every widget. A filter you
 * cannot set is worse than no filter: it claims the figures are scoped.
 *
 * Operators are the server's closed set — sending anything else earns a
 * 422, so the controls only ever emit BETWEEN, IN, ILIKE or a comparison.
 *
 * Nothing is applied until Apply is pressed: a filter that re-queried on
 * every keystroke would spend the preview envelope on half-typed values.
 */

import { useCallback, useMemo, useState } from 'react';
import { Check, Filter, X } from 'lucide-react';
import type { GlobalFilter, StudioReportSpec } from '@/app/services/studio/studio-api';

type Decl = NonNullable<StudioReportSpec['filters']>[number];
export type FilterDraft = Record<string, { from?: string; to?: string; values?: string[]; text?: string }>;

const isRange = (t: string) => /date_range|range|between/i.test(t);
const isIn = (t: string) => /^in$|multi|list|categor/i.test(t);

/** What the draft means as server filters — the single translation point. */
export function toGlobalFilters(decls: Decl[], draft: FilterDraft): GlobalFilter[] {
  const out: GlobalFilter[] = [];
  for (const d of decls) {
    const v = draft[d.filter_id];
    if (!v) continue;
    if (isRange(d.type)) {
      const { from, to } = v;
      if (from && to) out.push({ column: d.column, operator: 'between', value: [from, to] });
      else if (from) out.push({ column: d.column, operator: '>=', value: from });
      else if (to) out.push({ column: d.column, operator: '<=', value: to });
    } else if (isIn(d.type)) {
      const vals = (v.values ?? []).filter((s) => s !== '');
      if (vals.length) out.push({ column: d.column, operator: 'in', value: vals });
    } else if ((v.text ?? '').trim() !== '') {
      out.push({ column: d.column, operator: 'ilike', value: `%${v.text!.trim()}%` });
    }
  }
  return out;
}

export default function StudioReportFilters({
  filters,
  applied,
  onApply,
  busy,
}: {
  filters: Decl[];
  /** what is currently applied to the widgets — for the honest summary */
  applied: GlobalFilter[];
  onApply: (next: GlobalFilter[]) => void;
  busy?: boolean;
}) {
  const [draft, setDraft] = useState<FilterDraft>({});
  const [token, setToken] = useState<Record<string, string>>({});

  const pending = useMemo(() => toGlobalFilters(filters, draft), [filters, draft]);
  const dirty = useMemo(
    () => JSON.stringify(pending) !== JSON.stringify(applied),
    [pending, applied],
  );

  const set = useCallback((id: string, patch: Partial<FilterDraft[string]>) => {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }, []);

  const addToken = useCallback(
    (id: string) => {
      const raw = (token[id] ?? '').trim();
      if (!raw) return;
      setDraft((d) => {
        const cur = d[id]?.values ?? [];
        const add = raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '' && !cur.includes(s));
        return add.length ? { ...d, [id]: { ...d[id], values: [...cur, ...add] } } : d;
      });
      setToken((t) => ({ ...t, [id]: '' }));
    },
    [token],
  );

  if (filters.length === 0) return null;

  return (
    <section
      aria-label="Report filters"
      className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5 pb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Filter aria-hidden className="h-3.5 w-3.5" />
          Filters
        </span>

        {filters.map((f) => {
          const id = f.filter_id;
          const v = draft[id] ?? {};
          if (isRange(f.type)) {
            return (
              <div key={id} className="flex items-end gap-1.5">
                <label className="block">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {f.column} from
                  </span>
                  <input
                    type="date"
                    value={v.from ?? ''}
                    onChange={(e) => set(id, { from: e.target.value })}
                    className="h-8 w-[150px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">to</span>
                  <input
                    type="date"
                    value={v.to ?? ''}
                    onChange={(e) => set(id, { to: e.target.value })}
                    className="h-8 w-[150px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </label>
              </div>
            );
          }
          if (isIn(f.type)) {
            const vals = v.values ?? [];
            return (
              <div key={id}>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {f.column} is one of
                  </span>
                  <input
                    value={token[id] ?? ''}
                    onChange={(e) => setToken((t) => ({ ...t, [id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addToken(id);
                      }
                    }}
                    onBlur={() => addToken(id)}
                    placeholder="type a value, Enter"
                    className="h-8 w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </label>
                {vals.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {vals.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          set(id, { values: vals.filter((x) => x !== val) })
                        }
                        className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-xs text-accent-800 hover:bg-accent-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:bg-accent-900/30 dark:text-accent-200"
                      >
                        {val}
                        <X aria-hidden className="h-3 w-3" />
                        <span className="sr-only">remove {val}</span>
                      </button>
                    ))}
                  </span>
                )}
              </div>
            );
          }
          return (
            <label key={id} className="block">
              <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                {f.column} contains
              </span>
              <input
                value={v.text ?? ''}
                onChange={(e) => set(id, { text: e.target.value })}
                className="h-8 w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          );
        })}

        <span className="ml-auto flex items-center gap-2 pb-0.5">
          {applied.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft({});
                setToken({});
                onApply([]);
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => onApply(pending)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {/* "Applied" only when something IS applied — saying it over an
                empty filter set contradicts the line just below it */}
            {busy ? (
              'Applying…'
            ) : !dirty && applied.length > 0 ? (
              <>
                <Check aria-hidden className="h-3.5 w-3.5" />
                Applied
              </>
            ) : (
              'Apply'
            )}
          </button>
        </span>
      </div>

      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        {applied.length === 0
          ? 'No filter is applied — every widget reads its full scope, within the preview cap.'
          : `${applied.length} filter${applied.length > 1 ? 's' : ''} applied to every widget: ${applied
              .map((g) => `${g.column} ${g.operator}`)
              .join(', ')}.`}
        {dirty && ' What you changed is not applied yet.'}
      </p>
    </section>
  );
}
