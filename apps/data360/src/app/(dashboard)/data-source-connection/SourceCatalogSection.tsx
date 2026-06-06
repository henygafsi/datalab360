'use client';

import { useState } from 'react';
import { HiOutlineChevronDown, HiOutlineChevronRight } from 'react-icons/hi2';
import { Library } from 'lucide-react';
import SourceCatalog from './SourceCatalog';

/**
 * Collapsible host for the enterprise Source Catalog (`GET /connect/source-catalog`).
 * The `SourceCatalog` component existed but was never routed onto any surface;
 * this section makes it reachable from the connection hub without restructuring
 * the wizard. Collapsed by default so it doesn't push the connector picker down,
 * and only mounts (fetches) when expanded.
 */
export default function SourceCatalogSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
      >
        {open ? (
          <HiOutlineChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <HiOutlineChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <Library className="h-5 w-5 text-indigo-500" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Browse Source Catalog</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Explore already-connected tables by domain, system and data layer
          </p>
        </div>
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{open ? 'Hide' : 'Open'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 p-4 dark:border-slate-700">
          <SourceCatalog />
        </div>
      )}
    </div>
  );
}
