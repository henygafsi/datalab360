'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PiDatabase,
  PiFlowArrow,
  PiShieldCheck,
  PiBrain,
  PiMapTrifold,
  PiSparkle,
  PiGear,
} from 'react-icons/pi';
import { HiOutlineChartBarSquare } from 'react-icons/hi2';
import { CATEGORY_LABELS, getBlocksByCategory } from '@/app/(dashboard)/workflow/components/etl-blocks';
import type { ETLCategory } from '@/app/(dashboard)/workflow/components/etl-blocks';
import { cn } from '@/lib/utils';

const QUICK_LINKS = [
  { label: 'Connectivité', href: '/data-source-connection', icon: PiDatabase },
  { label: 'Explore & Design', href: '/explore-design', icon: PiMapTrifold },
  { label: 'Workflows & ETL', href: '/workflow', icon: PiFlowArrow },
  { label: 'Gouvernance', href: '/governance/users', icon: PiShieldCheck },
  { label: 'Policies', href: '/governance/policies', icon: PiGear },
  { label: 'Observability', href: '/observability', icon: HiOutlineChartBarSquare },
  { label: 'Intelligent (Cortex)', href: '/intelligent', icon: PiBrain },
];

export default function DataEngineerHub() {
  const pathname = usePathname();
  const categories: ETLCategory[] = ['source', 'transform', 'destination'];

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900/50 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/50">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Data Modeler / Data Engineer
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Accès rapide : modélisation, connectivité, workflows ETL, governance et observabilité
        </p>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Parcours & pages</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUICK_LINKS.map((item, index) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={`${item.href}-${index}`}
                  href={item.href}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-lg p-3 border transition-colors',
                    isActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="text-xs font-medium truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Blocs ETL (Workflow)</h3>
          <div className="space-y-2">
            {categories.map((cat) => {
              const blocks = getBlocksByCategory(cat);
              if (blocks.length === 0) return null;
              return (
                <div key={cat} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-2.5">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">{CATEGORY_LABELS[cat]}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {blocks.map((b) => (
                      <span key={b.id} className="inline-flex px-2 py-0.5 rounded-md text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300" title={b.tooltip || b.description}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <Link href="/workflow" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
            <PiFlowArrow className="w-4 h-4" />
            Créer un flow ETL
          </Link>
        </div>
      </div>
    </div>
  );
}
