'use client';

/**
 * RightSheet — the ONE way a temporary panel opens over the E&D workspace.
 *
 * The previous pattern (raw `fixed inset-y-0 right-0 z-50` divs with no
 * backdrop) let the underlying right rail and the header widgets stay fully
 * visible behind/over the panel — reading as "a tab popped on top of another
 * tab" (clipped titles, project pill floating over the sheet). One dimmed
 * backdrop means exactly one focused layer at a time, Snowsight-style.
 *
 * Closes on backdrop click and Escape. Fluid width: full-width on small
 * screens, capped by `maxWidth` on larger ones (13" @100% safe).
 */

import { useEffect, type ReactNode } from 'react';

interface RightSheetProps {
  label: string;
  maxWidth?: string; // tailwind max-w-* class
  onClose: () => void;
  children: ReactNode;
}

export default function RightSheet({ label, maxWidth = 'max-w-md', onClose, children }: RightSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`fixed inset-y-0 right-0 z-[71] flex w-full ${maxWidth} flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900`}
      >
        {children}
      </div>
    </>
  );
}
