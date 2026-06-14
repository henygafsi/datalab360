'use client';

/**
 * ModuleTree — the scannable centre of the Access Control Center.
 *
 * Renders the action-registry as module → page → tab → action, COLLAPSED by
 * default (one summary row per module: allowed/denied counts · feature-governance
 * entitlement pill · usage chip). Expanding a module reveals its per-page
 * tab×action tri-state grid.
 *
 * The tree is mode-agnostic: it reads cell state through `stateOf` and reports
 * edits through `onCycle`. In "edit role" mode the cells are editable tri-state;
 * in "test user" mode `editable` is false and the cells reflect the user's
 * resolved effective decision (read-only).
 */
import { useState } from 'react';
import { ChevronRight, Info, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';
import type { ActionRegistryResponse } from '@/app/services/governance/fetch_roles';
import { Chip, keyOf, NA, type ModuleUsage, type PermLevel } from './shared';

export interface ModuleTreeProps {
  registry: ActionRegistryResponse;
  /** Resolve a cell's stored/effective level (undefined = inherit). */
  stateOf: (key: string) => PermLevel | undefined;
  /** Whether cells are editable (edit-role mode + custom role). */
  editable: boolean;
  onCycle: (m: string, p: string, t: string, a: string) => void;
  /** Currently inspected module (highlighted). */
  selectedModule: string | null;
  onSelectModule: (moduleKey: string) => void;
  /** Best-effort feature-governance entitlement summary, or null when absent. */
  entitlementSummary: (moduleKey: string) => { on: number; total: number } | null;
  /** Best-effort per-module usage rollup, or undefined when absent. */
  usage: (moduleKey: string) => ModuleUsage | undefined;
}

function Cell({
  level,
  editable,
  onClick,
  label,
}: {
  level: PermLevel | undefined;
  editable: boolean;
  onClick: () => void;
  label: string;
}) {
  const tip =
    level === 'allow'
      ? `${label} = explicit ALLOW`
      : level === 'deny'
        ? `${label} = explicit DENY`
        : `${label} = inherit (no stored rule)`;
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={onClick}
      title={`${tip}${editable ? ' · click to cycle' : ''}`}
      className={cn(
        'h-5 w-7 rounded text-[9px] font-bold transition-colors',
        level === 'allow' &&
          'bg-emerald-500/90 text-white hover:bg-emerald-500',
        level === 'deny' && 'bg-rose-500/90 text-white hover:bg-rose-500',
        level === undefined &&
          'bg-slate-200/70 text-slate-400 hover:bg-slate-300 dark:bg-slate-700/60 dark:text-slate-500',
        !editable && 'cursor-default opacity-80 hover:bg-current',
      )}
    >
      {level === 'allow' ? '✓' : level === 'deny' ? '✕' : '·'}
    </button>
  );
}

export default function ModuleTree({
  registry,
  stateOf,
  editable,
  onCycle,
  selectedModule,
  onSelectModule,
  entitlementSummary,
  usage,
}: ModuleTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(Object.keys(registry.registry)),
  );

  const toggle = (m: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  const modules = Object.entries(registry.registry);

  return (
    <div className="space-y-2">
      {modules.map(([mKey, mData]) => {
        const isCollapsed = collapsed.has(mKey);
        const isSelected = selectedModule === mKey;
        const pages = Object.entries(mData.pages ?? {});

        // Per-module allow/deny rollup across all coordinates.
        let allow = 0;
        let deny = 0;
        for (const [pKey, pData] of pages) {
          const tabs = pData.tabs?.length ? pData.tabs : ['*'];
          for (const t of tabs) {
            for (const a of pData.actions ?? []) {
              const lvl = stateOf(keyOf(mKey, pKey, t, a));
              if (lvl === 'allow') allow += 1;
              else if (lvl === 'deny') deny += 1;
            }
          }
        }

        const ent = entitlementSummary(mKey);
        const use = usage(mKey);

        return (
          <GlassPanel
            key={mKey}
            depth={1}
            radius="xl"
            className={cn(
              'overflow-hidden transition-shadow',
              isSelected && 'ring-2 ring-violet-400/60 dark:ring-violet-500/40',
            )}
          >
            <div className="flex w-full items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => toggle(mKey)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={!isCollapsed}
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform',
                    !isCollapsed && 'rotate-90',
                  )}
                />
                <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {mData.label || mKey}
                </span>
                <span className="shrink-0 font-mono text-[10px] font-normal text-slate-400">
                  {mKey}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-1.5">
                {allow > 0 && (
                  <Chip tone="emerald" title="Explicit ALLOW grants in this module">
                    {allow} allow
                  </Chip>
                )}
                {deny > 0 && (
                  <Chip tone="rose" title="Explicit DENY rules in this module">
                    {deny} deny
                  </Chip>
                )}
                {/* Feature-governance entitlement (cross-cut, module-level). */}
                {ent ? (
                  <Chip
                    tone={ent.on === 0 ? 'slate' : ent.on === ent.total ? 'sky' : 'amber'}
                    title="Feature-governance entitlements enabled for this account"
                  >
                    {ent.on}/{ent.total} feat
                  </Chip>
                ) : null}
                {/* Usage attribution. */}
                {use ? (
                  <Chip
                    tone={use.errors > 0 ? 'amber' : 'slate'}
                    title={`${use.requests} requests · ${use.distinctUsers} users · ${use.errors} errors (7d)`}
                  >
                    <Activity className="h-3 w-3" />
                    {use.requests.toLocaleString()}
                  </Chip>
                ) : (
                  <NA title="No usage attribution available for this module" />
                )}
                <button
                  type="button"
                  onClick={() => onSelectModule(mKey)}
                  title="Open detail inspector"
                  className={cn(
                    'rounded-lg p-1 transition-colors',
                    isSelected
                      ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300'
                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800',
                  )}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="space-y-3 border-t border-white/30 px-3 py-2 dark:border-white/10">
                {pages.length === 0 ? (
                  <p className="text-[10px] italic text-slate-400">No pages registered.</p>
                ) : (
                  pages.map(([pKey, pData]) => {
                    const tabs = pData.tabs?.length ? pData.tabs : ['*'];
                    const actions = pData.actions ?? [];
                    return (
                      <div key={pKey}>
                        <p className="mb-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {pData.label || pKey}{' '}
                          <span className="font-mono text-[9px] font-normal text-slate-400">
                            {pKey}
                          </span>
                        </p>
                        <div className="scrollbar-thin overflow-x-auto">
                          <table className="border-collapse text-[10px]">
                            <thead>
                              <tr>
                                <th className="sticky left-0 z-10 bg-white/80 px-2 py-1 text-left font-semibold text-slate-500 backdrop-blur dark:bg-slate-900/70 dark:text-slate-400">
                                  tab \ action
                                </th>
                                {actions.map((a) => (
                                  <th
                                    key={a}
                                    className="whitespace-nowrap px-1.5 py-1 text-center font-semibold text-slate-500 dark:text-slate-400"
                                  >
                                    {a}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tabs.map((t) => (
                                <tr
                                  key={t}
                                  className="odd:bg-slate-50/40 dark:odd:bg-slate-800/20"
                                >
                                  <td className="sticky left-0 z-10 max-w-[160px] truncate bg-white/80 px-2 py-1 font-mono text-slate-600 backdrop-blur dark:bg-slate-900/70 dark:text-slate-300">
                                    {t}
                                  </td>
                                  {actions.map((a) => {
                                    const k = keyOf(mKey, pKey, t, a);
                                    return (
                                      <td key={a} className="px-1 py-0.5 text-center">
                                        <Cell
                                          level={stateOf(k)}
                                          editable={editable}
                                          onClick={() => onCycle(mKey, pKey, t, a)}
                                          label={`${mKey}:${pKey}:${t}:${a}`}
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </GlassPanel>
        );
      })}
    </div>
  );
}
