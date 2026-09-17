'use client';

/**
 * StudioPolicyCatalog — the account's protection policies, read once from the
 * protection catalog (a free GET), opening the Policies tab of Access.
 *
 * Honesty rules carried from the backend contract:
 *  • `looks_like` on an existing policy is a NAME/COMMENT heuristic — the
 *    catalog itself says « not a proof », so the chip says "reads as" and the
 *    method stays in the tooltip.
 *  • attached{} is the only claim of what is in force on this footprint;
 *    an empty map renders as "none attached", never as an invented count.
 *  • The standards row is the ready-made vocabulary (mask, hash, row-restrict)
 *    the column editors below apply — this strip is a map, not a form.
 */

import { useEffect, useState } from 'react';
import { BookLock, RefreshCw } from 'lucide-react';
import {
  getDraft,
  getProtectionCatalog,
  type ProtectionCatalog,
} from '@/app/services/studio/studio-api';
import StudioProtectFlow from '@/app/shared/studio/StudioProtectFlow';

/** A maskable column from the persisted classification (row-restriction
 *  proposals stay the plan's business, not listed here). */
interface MaskableCol {
  key: string;
  table: string;
  column: string;
  category?: string;
  standard: string;
  standardLabel?: string;
}

export default function StudioPolicyCatalog({ draftId }: { draftId: string }) {
  const [cat, setCat] = useState<ProtectionCatalog | 'loading' | 'error'>('loading');
  const [maskable, setMaskable] = useState<MaskableCol[]>([]);

  useEffect(() => {
    let alive = true;
    setCat('loading');
    getProtectionCatalog(draftId)
      .then((c) => alive && setCat(c))
      .catch(() => alive && setCat('error'));
    // the catalog serves classification COUNTS only — the per-column detail
    // (category + proposed standard) is on the draft's understanding
    getDraft(draftId)
      .then((draft) => {
        if (!alive) return;
        const cols = (
          draft?.understanding as
            | { classification?: { columns?: Record<string, unknown> } }
            | undefined
        )?.classification?.columns;
        if (!cols) return;
        const out: MaskableCol[] = [];
        for (const [key, raw] of Object.entries(cols)) {
          for (const e of Array.isArray(raw) ? raw : [raw]) {
            if (typeof e !== 'object' || e == null) continue;
            const ent = e as {
              column?: string;
              category?: string;
              proposed_protection?: { standard_id?: string; label?: string; kind?: string };
            };
            if (ent.proposed_protection?.kind === 'row_access') continue;
            if (!ent.proposed_protection?.standard_id || !ent.column) continue;
            out.push({
              key,
              table: key.split('.').slice(0, 3).join('.'),
              column: ent.column,
              category: ent.category,
              standard: ent.proposed_protection.standard_id,
              standardLabel: ent.proposed_protection.label,
            });
          }
        }
        setMaskable(out);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [draftId]);

  if (cat === 'error') return null; // the grid below is the page — no wall on a missing catalog
  const loading = cat === 'loading';
  const policies = loading ? [] : ((cat as ProtectionCatalog).policies?.items ?? []);
  const standards = loading ? [] : ((cat as ProtectionCatalog).standards ?? []);
  const attached = loading ? {} : ((cat as ProtectionCatalog).attached ?? {});
  const attachedCount = Object.keys(attached).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <BookLock aria-hidden className="h-3.5 w-3.5" />
        Policy catalog
        {loading && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
      </p>
      {!loading && (
        <>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {attachedCount > 0
              ? `${attachedCount} ${attachedCount === 1 ? 'column carries' : 'columns carry'} a policy today.`
              : 'No policy is attached on this application’s tables yet.'}{' '}
            Row rules and masking are edited column by column below; a ready-made standard or an
            existing account policy is applied when the change runs.
          </p>
          {policies.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {policies.slice(0, 10).map((p, i) => {
                const name = String(p.name ?? p.fqn ?? `policy ${i + 1}`).split('.').slice(-1)[0];
                const ll = p.looks_like ?? null;
                return (
                  <li
                    key={p.fqn ?? p.name ?? i}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    title={
                      ll?.method
                        ? `${ll.method}${ll.category ? ` — reads as ${ll.category}` : ''}`
                        : 'an account policy — its intent is not classified'
                    }
                  >
                    <span className="font-mono">{name}</span>
                    {ll?.category && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-amber-400"
                        // the reading stays in the tooltip — 18 « reads as X »
                        // captions turned the catalog into a tag cloud
                      />
                    )}
                  </li>
                );
              })}
              {policies.length > 10 && (
                <li className="self-center text-xs text-slate-400 dark:text-slate-500">
                  +{policies.length - 10} more
                </li>
              )}
            </ul>
          )}
          {standards.length > 0 && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Ready-made standards:{' '}
              {standards
                .map((s) => s.label ?? s.standard_id)
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {maskable.length > 0 && (
            <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Columns the understanding flagged — protect directly, or stage them column by
                column in the PII layer below.
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {maskable.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className="font-mono text-xs">
                      {c.table.split('.').slice(-1)[0]}.{c.column}
                    </span>
                    {c.category && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        looks like {c.category}
                      </span>
                    )}
                    <StudioProtectFlow
                      draftId={draftId}
                      fqn={c.table}
                      column={c.column}
                      standard={c.standard}
                      standardLabel={c.standardLabel}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
