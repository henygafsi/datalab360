'use client';

/**
 * ManualAiTemplateFork — the explicit "how do you want to build it?" fork.
 *
 * Three big selectable cards rendered with radio-group semantics. Extracted
 * from the UnifiedProjectWizard so it can be re-used by the "Change approach"
 * affordance in both module headers (workflow + explore-design).
 *
 * Persona notes:
 *   - Superadmin: the choice made here is recorded on the project as a
 *     `build:*` tag for governance.
 *   - Admin: three big cards, one click — no implicit branching.
 *   - QA: visible + switchable, not a hidden cache.
 */
import { motion } from 'framer-motion';
import { Hammer, Sparkles, LayoutTemplate, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BuildMode = 'manual' | 'ai' | 'template';

interface ForkOption {
  mode: BuildMode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** Per-module copy override is applied by the parent via `descriptions`. */
  defaultDescription: string;
}

const FORK_OPTIONS: ForkOption[] = [
  {
    mode: 'manual',
    icon: Hammer,
    title: 'Build manually',
    defaultDescription: 'Start with a blank canvas. Full control.',
  },
  {
    mode: 'ai',
    icon: Sparkles,
    title: 'Guide me with AI',
    defaultDescription:
      'Describe what you need, AI scaffolds the whole thing.',
  },
  {
    mode: 'template',
    icon: LayoutTemplate,
    title: 'Start from a template',
    defaultDescription: 'Pick a proven starting point.',
  },
];

export interface ManualAiTemplateForkProps {
  /** Currently selected mode, or null when nothing chosen yet. */
  value: BuildMode | null;
  onChange: (mode: BuildMode) => void;
  /** Optional per-module copy override keyed by mode. */
  descriptions?: Partial<Record<BuildMode, string>>;
  /** Accessible label for the radio group. */
  ariaLabel?: string;
  className?: string;
}

export default function ManualAiTemplateFork({
  value,
  onChange,
  descriptions,
  ariaLabel = 'How do you want to build it?',
  className,
}: ManualAiTemplateForkProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid gap-3 sm:grid-cols-3', className)}
    >
      {FORK_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.mode;
        const isAi = opt.mode === 'ai';
        return (
          <motion.button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === null && opt.mode === 'manual') ? 0 : -1}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onChange(opt.mode)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange(opt.mode);
              }
            }}
            className={cn(
              'group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border p-4 text-left transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              selected
                ? isAi
                  ? 'border-fuchsia-300 bg-gradient-to-br from-purple-50 to-fuchsia-50 shadow-sm shadow-fuchsia-500/10 focus-visible:ring-fuchsia-400 dark:border-fuchsia-700/60 dark:from-purple-900/30 dark:to-fuchsia-900/20'
                  : 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm shadow-blue-500/10 focus-visible:ring-blue-400 dark:border-blue-700/60 dark:from-blue-900/30 dark:to-indigo-900/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600',
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                selected
                  ? isAi
                    ? 'bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white shadow-sm shadow-fuchsia-500/30'
                    : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-400',
              )}
            >
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div>
              <p
                className={cn(
                  'text-sm font-semibold',
                  selected
                    ? isAi
                      ? 'text-fuchsia-700 dark:text-fuchsia-200'
                      : 'text-blue-700 dark:text-blue-200'
                    : 'text-slate-800 dark:text-slate-100',
                )}
              >
                {opt.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {descriptions?.[opt.mode] ?? opt.defaultDescription}
              </p>
            </div>
            {isAi && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300">
                <Coins className="h-2.5 w-2.5" />
                uses AI credits
              </span>
            )}
            {/* Selected accent dot — radio-style affordance */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors',
                selected
                  ? isAi
                    ? 'border-fuchsia-500 bg-fuchsia-500'
                    : 'border-blue-500 bg-blue-500'
                  : 'border-slate-300 dark:border-slate-600',
              )}
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
