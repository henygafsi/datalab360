'use client';

/**
 * PlainKit — the base primitives of the Data360 Lite language.
 *
 * Lite speaks in plain sentences on a white page: one question per screen,
 * honest provenance next to every figure, quiet text actions, and calm
 * informational notices. No decoration, no entrance animations, no jargon
 * in the first level of copy. Everything here is presentational — zero fetch.
 */

import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, Info, type LucideIcon } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* PlainQuestionHeader                                                */
/* ------------------------------------------------------------------ */

export interface PlainQuestionHeaderProps {
  question: string;
  detail?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  /** When given, the title is renameable in place. An application whose
   *  name comes from its implementation ("Application src transactions")
   *  and cannot be changed is a product that names itself after its
   *  plumbing — the reader must be able to say what this thing IS. */
  onRename?: (next: string) => void | Promise<void>;
}

/**
 * Lite rule 1 — ONE question per screen, in simple words, as the title
 * (e.g. « Merchants losing money — Which stores have a negative margin? »).
 * The question is the headline; `detail` carries the plain-language subtitle.
 */
export function PlainQuestionHeader({
  question,
  detail,
  backHref,
  backLabel,
  actions,
  onRename,
}: PlainQuestionHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {backLabel ?? 'Back'}
          </Link>
        ) : null}
        {onRename && editing ? (
          <input
            autoFocus
            value={draft}
            aria-label="Name of this application"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setDraft(question);
                setEditing(false);
              }
            }}
            onBlur={() => {
              const v = draft.trim();
              if (v && v !== question) void onRename(v);
              setEditing(false);
            }}
            className="w-full max-w-xl rounded-lg border border-accent-400 bg-white px-2 py-1 text-xl font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:bg-slate-900 dark:text-slate-100"
          />
        ) : (
          <h1
            {...(onRename
              ? {
                  role: 'button',
                  tabIndex: 0,
                  title: 'Click to rename this application',
                  onClick: () => {
                    setDraft(question);
                    setEditing(true);
                  },
                  onKeyDown: (e: ReactKeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDraft(question);
                      setEditing(true);
                    }
                  },
                  className:
                    'cursor-text rounded text-xl font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-100 dark:hover:bg-slate-800',
                }
              : { className: 'text-xl font-semibold text-slate-900 dark:text-slate-100' })}
          >
            {question}
          </h1>
        )}
        {detail ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {detail}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">{actions}</div>
      ) : null}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* ProvenanceLine                                                     */
/* ------------------------------------------------------------------ */

export interface ProvenanceLineProps {
  readAt?: string | null;
  coveredRows?: number | null;
  totalRows?: number | null;
  note?: string | null;
  className?: string;
}

function plainDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Lite rule 3 — honest inline provenance: « Figures read Sep 1 · figures
 * cover 5,000 of 300,000,020 rows ». The real data date plus the sampling,
 * always visible next to the figures. Unknown values render '—', never 0;
 * the line renders nothing only when every prop is absent.
 */
export function ProvenanceLine({
  readAt,
  coveredRows,
  totalRows,
  note,
  className,
}: ProvenanceLineProps) {
  const hasRead = readAt != null;
  const hasCoverage = coveredRows != null || totalRows != null;
  const hasNote = note != null && note !== '';

  if (!hasRead && !hasCoverage && !hasNote) return null;

  const parts: string[] = [];
  if (hasRead || hasCoverage) {
    const dateStr = hasRead ? plainDate(readAt as string) : null;
    parts.push(`Figures read ${dateStr ?? '—'}`);
  }
  if (hasCoverage) {
    const covered = coveredRows != null ? coveredRows.toLocaleString() : '—';
    const total = totalRows != null ? totalRows.toLocaleString() : '—';
    parts.push(`figures cover ${covered} of ${total} rows`);
  }

  const text = parts.join(' · ');
  const title = [text, hasNote ? note : null].filter(Boolean).join(' · ');

  return (
    <p
      className={`text-xs tabular-nums text-slate-500 dark:text-slate-400 ${className ?? ''}`}
      title={title || undefined}
    >
      {text || note}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* PlainCard                                                          */
/* ------------------------------------------------------------------ */

export interface PlainCardProps {
  title: string;
  description?: string;
  footer?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

/**
 * Lite rule 2 — a thing is described by its meaning, in a sentence
 * (« One transaction at a time, with 10 of its own details kept »).
 * `title` names it, `description` says what it means in plain words.
 * Minimal chrome: white card, calm hover, accent ring only when selected.
 */
export function PlainCard({
  title,
  description,
  footer,
  selected,
  onClick,
  children,
}: PlainCardProps) {
  const base =
    'rounded-xl border bg-white p-4 text-left dark:bg-slate-950 ' +
    (selected
      ? 'border-accent-500 ring-1 ring-accent-500 dark:border-accent-500'
      : 'border-slate-200 dark:border-slate-800');

  const body = (
    <>
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
        {title}
      </div>
      {description ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      ) : null}
      {children}
      {footer ? (
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {footer}
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected ?? undefined}
        className={`${base} block w-full transition-colors hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:border-slate-600`}
      >
        {body}
      </button>
    );
  }

  return <div className={base}>{body}</div>;
}

/* ------------------------------------------------------------------ */
/* QuietAction                                                        */
/* ------------------------------------------------------------------ */

export interface QuietActionProps {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
}

/**
 * Lite rule 6 — minimal chrome: actions are discreet text buttons with a
 * small icon (Refresh · Add a chart · Export…), never loud primary buttons.
 */
export function QuietAction({ label, icon: Icon, onClick, href }: QuietActionProps) {
  const className =
    'inline-flex items-center gap-1.5 text-xs text-slate-600 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:text-slate-100';
  const inner = (
    <>
      {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : null}
      {label}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* SampleSetNotice                                                    */
/* ------------------------------------------------------------------ */

export interface SampleSetNoticeProps {
  children: ReactNode;
}

/**
 * Lite rule 7 — guardrails in simple words (« That is one of the sample sets
 * Data360 shares with everyone, so nothing can be written into it. »).
 * It is information, not a warning: a calm one-line slate banner, no amber.
 */
export function SampleSetNotice({ children }: SampleSetNoticeProps) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/* ── SectionHead — ONE header grammar for every panel ─────────────────
 * icon in a tinted tile · semibold business label · honest count chip ·
 * muted hint · the section's action on the right. The same skeleton on
 * quality, jobs, workflows, access — the reader learns it once. */
export interface SectionHeadProps {
  icon?: LucideIcon;
  label: string;
  /** null/undefined ⇒ no chip (a count must be real, never invented) */
  count?: number | null;
  hint?: string;
  children?: ReactNode;
}

export function SectionHead({ icon: Icon, label, count, hint, children }: SectionHeadProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Icon && (
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600 dark:bg-accent-400/10 dark:text-accent-300"
        >
          <Icon className="h-4 w-4" />
        </span>
      )}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</h3>
      {count != null && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {count.toLocaleString()}
        </span>
      )}
      {hint && <span className="min-w-0 text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
      {children && <span className="ml-auto flex flex-wrap items-center gap-2">{children}</span>}
    </div>
  );
}
