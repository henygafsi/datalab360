'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DesignDockPanel — the single harmonized, NON-blocking surface for every
 * explore-design create/configure action (Dynamic / Event / Hybrid / Stream /
 * standard tables, ingestion config, relationships, templates…).
 *
 * Replaces the per-feature centered `<Modal>` backdrops. It docks to the right
 * edge as a drawer with NO page-blocking scrim, so the canvas + source rail
 * behind it stay fully interactive (you can keep clicking tables while a
 * creation form is open). Dismisses on the X button or Escape.
 *
 * Rendered through a portal so it is never clipped by ReactFlow / overflow
 * containers, and sits above the ContextRightBar (z-[70]).
 */
export interface DesignDockPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Leading icon node (already sized/coloured by the caller). */
  icon?: React.ReactNode;
  /** Drawer max-width Tailwind class. Default `max-w-xl` (~576px). */
  widthClass?: string;
  /** Optional sticky footer (e.g. Cancel / Create actions). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
}

export default function DesignDockPanel({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  widthClass = 'max-w-xl',
  footer,
  children,
  bodyClassName,
}: DesignDockPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape-to-close — only while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="design-dock-panel"
          role="dialog"
          aria-modal="false"
          aria-label={title}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className={cn(
            'fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl',
            'dark:border-slate-700 dark:bg-slate-900',
            widthClass,
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              {icon && <div className="shrink-0">{icon}</div>}
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">
                  {title}
                </h3>
                {subtitle && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className={cn('flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>

          {/* Optional sticky footer */}
          {footer && (
            <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-700">{footer}</div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
