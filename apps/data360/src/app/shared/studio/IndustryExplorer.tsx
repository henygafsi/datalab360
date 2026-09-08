'use client';

/**
 * IndustryExplorer — the rich context selector of the Studio entry.
 *
 * Three levels on one calm screen: industry (icons) → category → focus.
 * The selection composes the BusinessContext the backend persists and feeds
 * to the AI prompt ({industry_id, category_id, hierarchy, audience, notes}),
 * so the generated application starts from the BEST DISPLAY for that
 * question, not a generic one. The drill hierarchy comes pre-filled from
 * the served taxonomy and stays editable; the audience is free text.
 *
 * Everything here is free — the AI runs later, in the journey's
 * understanding step. Where a backend domain pack covers the category, its
 * detail view stays one click away (`onOpenPack`); the journey's domain_id
 * derives from the category without ever being mandatory.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plug, Plus, X } from 'lucide-react';
import { QuietAction } from '@/app/shared/studio/PlainKit';
import type { DomainPacksCatalog } from '@/app/services/studio/domain-packs';
import {
  mergeTaxonomy,
  type IndustryFocus,
  type MergedCategory,
  type MergedIndustry,
} from '@/app/shared/studio/industry-catalog';
import type { NeedContext } from '@/app/shared/studio/onboarding/journey';
import { routes } from '@/config/routes';

export interface ExplorerSeed {
  needText: string;
  domainId?: string;
  context: NeedContext;
}

const MAX_HIERARCHY = 8;

function composeNotes(focuses: IndustryFocus[]): string | undefined {
  if (focuses.length === 0) return undefined;
  return `Focus: ${focuses.map((f) => f.label).join(' + ')}.`;
}

function displayHints(focuses: IndustryFocus[]): string[] {
  return [...new Set(focuses.flatMap((f) => f.display))];
}

function composeNeed(focuses: IndustryFocus[]): string {
  return focuses.map((f) => f.need).join('\n');
}

/* ── hierarchy editor (drill order, editable chips) ─────────────────── */

function HierarchyEditor({
  levels,
  defaults,
  onChange,
}: {
  levels: string[];
  defaults: string[];
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState('');

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= levels.length) return;
    const next = [...levels];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const add = () => {
    const v = adding.trim().toLowerCase();
    if (!v || levels.includes(v) || levels.length >= MAX_HIERARCHY) return;
    onChange([...levels, v]);
    setAdding('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Drill order
        </p>
        {defaults.length > 0 && levels.join('|') !== defaults.join('|') && (
          <QuietAction label="Reset" onClick={() => onChange(defaults)} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {levels.map((level, i) => (
          <span
            key={level}
            className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {i > 0 && (
              <button
                type="button"
                aria-label={`Move ${level} earlier in the drill order`}
                onClick={() => move(i, -1)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <ChevronLeft className="h-3 w-3" aria-hidden />
              </button>
            )}
            {level}
            {i < levels.length - 1 && (
              <button
                type="button"
                aria-label={`Move ${level} later in the drill order`}
                onClick={() => move(i, 1)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <ChevronRight className="h-3 w-3" aria-hidden />
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${level} from the drill order`}
              onClick={() => onChange(levels.filter((l) => l !== level))}
              className="ml-0.5 text-slate-400 hover:text-red-500"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        {levels.length < MAX_HIERARCHY && (
          <span className="inline-flex items-center gap-1">
            <input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="add a level"
              aria-label="Add a drill level"
              className="h-6 w-24 rounded-full border border-dashed border-slate-300 bg-transparent px-2 text-xs text-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-600 dark:text-slate-300"
            />
            <button
              type="button"
              aria-label="Add level"
              onClick={add}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        The order your readers drill down — from the whole company to one row.
      </p>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────────── */

export default function IndustryExplorer({
  catalog,
  onStart,
  onOpenPack,
  onStartFromData,
}: {
  catalog: DomainPacksCatalog;
  onStart: (seed: ExplorerSeed) => void;
  onOpenPack: (domainId: string) => void;
  onStartFromData: () => void;
}) {
  const industries = useMemo(
    () => mergeTaxonomy(catalog.taxonomy?.industries),
    [catalog],
  );

  const [industryId, setIndustryId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Multi-selection everywhere (user rule): several questions can be
  // combined into one application — the need is their composition.
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [customNeed, setCustomNeed] = useState(false);
  const [needText, setNeedText] = useState('');
  const [hierarchy, setHierarchy] = useState<string[]>([]);
  const [audience, setAudience] = useState('');

  const industry: MergedIndustry | null =
    industries.find((i) => i.id === industryId) ?? null;
  const category: MergedCategory | null =
    industry?.categories.find((c) => c.id === categoryId) ?? null;
  const focuses: IndustryFocus[] =
    category?.focuses.filter((f) => focusIds.includes(f.id)) ?? [];

  /* multi-domain (≤5): the PRIMARY industry drives the journey; extras
   * add their domain to the analysis (datalake scan + merged packs) */
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const domainOf = (ind: MergedIndustry): string | undefined =>
    ind.categories[0]?.domainIds[0];

  const toggleExtra = (ind: MergedIndustry) => {
    setExtraIds((prev) =>
      prev.includes(ind.id)
        ? prev.filter((x) => x !== ind.id)
        : prev.length + 1 < 5
          ? [...prev, ind.id]
          : prev,
    );
  };

  const pickIndustry = (ind: MergedIndustry) => {
    setExtraIds((prev) => prev.filter((x) => x !== ind.id));
    setIndustryId(ind.id);
    // Auto-advance when there is exactly one category — one decision less.
    const only = ind.categories.length === 1 ? ind.categories[0] : null;
    setCategoryId(only?.id ?? null);
    setHierarchy(only?.hierarchy ?? []);
    setFocusIds([]);
    setCustomNeed(false);
    setNeedText('');
    setAudience('');
  };

  const pickCategory = (cat: MergedCategory) => {
    setCategoryId(cat.id);
    setHierarchy(cat.hierarchy);
    setFocusIds([]);
    setCustomNeed(false);
    setNeedText('');
  };

  const toggleFocus = (f: IndustryFocus) => {
    setFocusIds((prev) => {
      const next = prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id];
      const list = category?.focuses.filter((x) => next.includes(x.id)) ?? [];
      setCustomNeed(false);
      setNeedText(composeNeed(list));
      return next;
    });
  };

  const packDomainId = category?.domainIds[0];
  const packForCategory = packDomainId
    ? catalog.packs.find((p) => p.domain_id === packDomainId) ?? null
    : null;

  const canStart = needText.trim().length >= 3 && industry != null;

  const start = () => {
    if (!canStart || !industry) return;
    const domains = [
      ...(packDomainId ? [packDomainId] : []),
      ...extraIds
        .map((id) => industries.find((i) => i.id === id))
        .map((i) => (i ? domainOf(i) : undefined))
        .filter((d): d is string => !!d),
    ].filter((d, i, a) => a.indexOf(d) === i);
    onStart({
      needText: needText.trim(),
      domainId: packDomainId,
      context: {
        industry_id: industry.id,
        category_id: category?.id ?? null,
        hierarchy,
        audience: audience.trim() || null,
        display_hints: displayHints(focuses),
        notes: composeNotes(focuses) ?? null,
        ...(domains.length > 1 ? { domains } : {}),
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Level 1 — industries (icons) */}
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
        role="listbox"
        aria-label="Industries"
      >
        {industries.map((ind) => {
          const Icon = ind.icon;
          const active = ind.id === industryId;
          const extra = extraIds.includes(ind.id);
          return (
            <button
              key={ind.id}
              type="button"
              role="option"
              aria-selected={active || extra}
              onClick={(e) => {
                // an existing primary + a click elsewhere with the add
                // affordance = MULTI-domain; plain click switches primary
                if ((e.target as HTMLElement).closest('[data-add-domain]')) return;
                pickIndustry(ind);
              }}
              title={ind.description || ind.label}
              className={`relative flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                active
                  ? 'border-accent-500 bg-accent-50/50 ring-1 ring-accent-500 dark:bg-accent-900/10'
                  : extra
                    ? 'border-accent-300 bg-accent-50/30 ring-1 ring-accent-300 dark:bg-accent-900/5'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
              }`}
            >
              {industryId && !active && (
                <span
                  data-add-domain
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExtra(ind);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      toggleExtra(ind);
                    }
                  }}
                  title={
                    extra
                      ? 'Remove this domain from the analysis'
                      : 'Analyze this domain TOO — one application, several domains (max 5)'
                  }
                  className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    extra
                      ? 'bg-accent-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-accent-50 hover:text-accent-700 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {extra ? 'added ✓' : '+ add'}
                </span>
              )}
              <Icon
                aria-hidden
                className={`h-4 w-4 ${active ? 'text-accent-600' : 'text-slate-400 dark:text-slate-500'}`}
              />
              <span className="text-xs font-medium leading-tight text-slate-800 dark:text-slate-200">
                {ind.label}
              </span>
              {ind.fromBackend && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  ready-made domain
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Level 2 — categories of the picked industry */}
      {industry && industry.categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Categories">
          {industry.categories.map((cat) => {
            const active = cat.id === categoryId;
            return (
              <button
                key={cat.id}
                type="button"
                aria-pressed={active}
                onClick={() => pickCategory(cat)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  active
                    ? 'border-accent-500 bg-accent-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Level 3 — focus + context, side by side */}
      {category && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pick one or several questions — or write your own
            </p>
            <div className="space-y-1.5">
              {category.focuses.map((f) => {
                const active = focusIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleFocus(f)}
                    className={`block w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                      active
                        ? 'border-accent-500 ring-1 ring-accent-500'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {f.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {f.need}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {f.display.map((d) => (
                        <span
                          key={d}
                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs leading-4 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        >
                          {d}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
              {category.focuses.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  No ready-made question here yet — say it in your own words below.
                </p>
              )}
            </div>
            <textarea
              value={needText}
              onChange={(e) => {
                setNeedText(e.target.value);
                // Typing makes it a custom need — the picks stop rewriting it.
                setCustomNeed(e.target.value !== composeNeed(focuses));
              }}
              rows={2}
              placeholder="e.g. Which stores are losing money and why?"
              aria-label="Your question, in your own words"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </section>

          <section className="space-y-3">
            <HierarchyEditor
              levels={hierarchy}
              defaults={category.hierarchy}
              onChange={setHierarchy}
            />
            <div className="space-y-1">
              <label
                htmlFor="studio-audience"
                className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                Who reads it
              </label>
              <input
                id="studio-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                maxLength={200}
                placeholder="e.g. store managers, every Monday"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            {/* What the AI receives — honest, visible, never hidden */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <p className="font-medium text-slate-700 dark:text-slate-200">
                The AI drafts everything from this
              </p>
              <p className="mt-1">
                {[
                  industry?.label,
                  category.label,
                  focuses.length > 0 ? focuses.map((f) => f.label).join(' + ') : null,
                ]
                  .filter(Boolean)
                  .join(' › ')}
                {hierarchy.length > 0 && ` · drill: ${hierarchy.join(' → ')}`}
                {audience.trim() && ` · for ${audience.trim()}`}
              </p>
              {focuses.length > 0 && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {composeNotes(focuses)} Preferred display: {displayHints(focuses).join(', ')}.
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Nothing runs yet — the analysis happens in the next steps, and
                you confirm every definition.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={!canStart}
                onClick={start}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start — the AI drafts the application
              </button>
              {packForCategory && (
                <QuietAction
                  label="See what this domain proposes"
                  onClick={() => onOpenPack(packForCategory.domain_id)}
                />
              )}
            </div>
          </section>
        </div>
      )}

      {/* Always-available alternatives */}
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <QuietAction
          label="Start from your own data instead"
          icon={Plug}
          onClick={onStartFromData}
        />
        <QuietAction label="Connect a source first" href={routes.studioSource} />
      </div>
    </div>
  );
}
