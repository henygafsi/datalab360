'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useModal } from '@/app/shared/modal-views/use-modal';

export default function GlobalModal() {
  const { isOpen, view, closeModal } = useModal();
  const pathname = usePathname();
  useEffect(() => {
    closeModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes the drawer (rizzui Modal handled this internally before).
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Panel"
      className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      {view}
    </div>
  );
}
