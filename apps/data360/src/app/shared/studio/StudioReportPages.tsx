'use client';

/**
 * StudioReportPages — the dashboard's pages, as a tab bar you can edit.
 *
 * A report used to be one endless column: every KPI, every chart and the
 * detail table stacked together, so "the dashboard" was whatever fitted on
 * screen and the rest was scrolling. The contract now carries
 * `pages: [{page_id, title, order}]` and a `page_id` on each layout entry,
 * which means a page is a PLACEMENT, not a property of the widget — moving
 * a chart between pages never rewrites its spec.
 *
 * Two server guards are surfaced here rather than worked around:
 *   · a page still carrying widgets is never deleted implicitly — the
 *     refusal names the widgets, and this asks you to move them first;
 *   · an undeclared page_id is refused with the list of declared pages.
 *
 * A report with no pages is a single page. Nothing here appears for it
 * until a second page is asked for.
 */

import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { StudioReportPage } from '@/app/services/studio/studio-api';

export default function StudioReportPages({
  pages,
  current,
  onSelect,
  counts,
  onAdd,
  onRename,
  onRemove,
  busy,
  editable,
}: {
  pages: StudioReportPage[];
  current: string;
  onSelect: (pageId: string) => void;
  /** widgets per page — a page is never silently emptied */
  counts: Record<string, number>;
  onAdd?: (title: string) => void | Promise<void>;
  onRename?: (pageId: string, title: string) => void | Promise<void>;
  onRemove?: (pageId: string) => void | Promise<void>;
  busy?: boolean;
  editable?: boolean;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  // one page is not a dashboard — the bar earns its space from two
  if (pages.length < 2 && !editable) return null;

  const ordered = [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1.5 dark:border-slate-800"
      role="tablist"
      aria-label="Dashboard pages"
    >
      {ordered.map((p) => {
        const on = p.page_id === current;
        const held = counts[p.page_id] ?? 0;
        if (renaming === p.page_id) {
          return (
            <span key={p.page_id} className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                disabled={busy}
                aria-label={`New name for the page ${p.title}`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setRenaming(null);
                    setDraft('');
                  }
                }}
                onBlur={() => {
                  const v = draft.trim();
                  if (v && v !== p.title) void onRename?.(p.page_id, v);
                  setRenaming(null);
                  setDraft('');
                }}
                className="h-7 w-40 rounded-lg border border-accent-400 bg-white px-2 text-[13px] text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:bg-slate-900 dark:text-slate-100"
              />
            </span>
          );
        }
        return (
          <span key={p.page_id} className="inline-flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={on}
              disabled={busy}
              onDoubleClick={() => {
                if (!editable) return;
                setRenaming(p.page_id);
                setDraft(p.title);
              }}
              onClick={() => onSelect(p.page_id)}
              title={editable ? 'Double-click to rename this page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                on
                  ? 'bg-accent-600 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {p.title}
              <span className={`ml-1.5 text-xs ${on ? 'text-white/70' : 'text-slate-400'}`}>
                {held}
              </span>
            </button>
            {editable && on && pages.length > 1 && (
              <button
                type="button"
                disabled={busy}
                title={
                  held > 0
                    ? `Move its ${held} widget(s) to another page first — nothing is deleted behind your back`
                    : 'Remove this empty page'
                }
                onClick={() => held === 0 && void onRemove?.(p.page_id)}
                aria-disabled={held > 0}
                className="ml-0.5 rounded p-1 text-slate-400 hover:text-red-600 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
                <span className="sr-only">Remove the page {p.title}</span>
              </button>
            )}
          </span>
        );
      })}

      {editable &&
        (adding ? (
          <input
            autoFocus
            value={draft}
            disabled={busy}
            placeholder="Name of the new page"
            aria-label="Name of the new page"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
            onBlur={() => {
              const v = draft.trim();
              if (v) void onAdd?.(v);
              setAdding(false);
              setDraft('');
            }}
            className="h-7 w-44 rounded-lg border border-accent-400 bg-white px-2 text-[13px] text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:bg-slate-900 dark:text-slate-100"
          />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setAdding(true);
              setDraft('');
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add a page
          </button>
        ))}
    </div>
  );
}

/**
 * MoveToPage — the control that makes pages usable: send this widget to
 * another page. It is the only way a reader composes a dashboard, so it
 * lives on the widget itself rather than in a settings screen.
 */
export function MoveToPage({
  pages,
  current,
  onMove,
  busy,
}: {
  pages: StudioReportPage[];
  current: string;
  onMove: (pageId: string) => void | Promise<void>;
  busy?: boolean;
}) {
  if (pages.length < 2) return null;
  return (
    <select
      value={current}
      disabled={busy}
      aria-label="Move this widget to another page"
      title="Move this widget to another page"
      onChange={(e) => void onMove(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="h-6 max-w-28 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    >
      {/* the saved page must always be present, even if it vanished from
          the report — otherwise the control renders blank on a widget that
          is in fact placed, and the next change overwrites it silently */}
      {!pages.some((p) => p.page_id === current) && (
        <option value={current}>{current} (missing)</option>
      )}
      {pages.map((p) => (
        <option key={p.page_id} value={p.page_id}>
          {p.title}
        </option>
      ))}
    </select>
  );
}
