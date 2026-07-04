'use client';

import React from 'react';

/**
 * DockedFormPanel — a lightweight docked side-panel shell for the governance
 * create forms. Mounts as a flex SIBLING (sticky, self-start) of a table rather
 * than a centered modal / portal scrim, so the page behind stays visible and
 * interactive. The hosted form owns its own header, close (X) and Cancel — this
 * shell only provides the docked card + width + scroll.
 */
export default function DockedFormPanel({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      role="region"
      aria-label={ariaLabel}
      className="sticky top-4 flex max-h-[calc(100vh-6rem)] w-[400px] max-w-full shrink-0 flex-col self-start overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/[0.03] motion-safe:animate-slide-in-right dark:border-slate-800 dark:bg-slate-900 dark:ring-white/5"
    >
      {children}
    </aside>
  );
}
