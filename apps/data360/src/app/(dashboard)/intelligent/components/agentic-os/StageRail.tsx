'use client';

/**
 * Agentic OS — LEFT rail: lifecycle step strip + grounding picker.
 *
 * The 7 steps of the chain (sources → … → dependencies). The active step drives
 * the center routing and the right-rail capability map. Under "Sources" the
 * existing SourceTree is embedded as the picker: selecting a table adds its FQN
 * to the grounding context (max 5 — the coco draft limit), which every agent
 * call is grounded on.
 */
import { useAtom } from 'jotai';
import { Badge } from 'rizzui';
import {
  PiDatabase,
  PiTreeStructure,
  PiDownloadSimple,
  PiFlowArrow,
  PiChartBar,
  PiChatCircleDots,
  PiGraph,
  PiX,
} from 'react-icons/pi';
import type { IconType } from 'react-icons';
import { useAtomValue } from 'jotai';
import { toast } from 'react-hot-toast';
import SourceTree from '@/app/(dashboard)/sources/components/SourceTree';
import CatalogGraphCanvas from '@/app/(dashboard)/explore-design/catalog/components/CatalogGraphCanvas';
import ETLPalette from '@/app/(dashboard)/workflow/components/ETLPalette';
import { STAGE_META, STAGE_ORDER, type LifecycleStage } from './types';
import {
  activeProjectIdAtom,
  activeStageAtom,
  groundingTablesAtom,
  touchedStagesAtom,
} from './store';

const STAGE_ICON: Record<LifecycleStage, IconType> = {
  sources: PiDatabase,
  models: PiTreeStructure,
  ingestion: PiDownloadSimple,
  workflow: PiFlowArrow,
  dashboards: PiChartBar,
  questions: PiChatCircleDots,
  dependencies: PiGraph,
};

const MAX_GROUNDING = 5;

export default function StageRail() {
  const [activeStage, setActiveStage] = useAtom(activeStageAtom);
  const [grounding, setGrounding] = useAtom(groundingTablesAtom);
  const [touched, setTouched] = useAtom(touchedStagesAtom);
  const projectId = useAtomValue(activeProjectIdAtom);

  const selectStage = (s: LifecycleStage) => {
    setActiveStage(s);
    setTouched((t) => ({ ...t, [s]: t[s] === 'done' ? 'done' : 'active' }));
  };

  const addGrounding = (database: string, schema: string, table: string) => {
    const fqn = `${database}.${schema}.${table}`;
    setGrounding((g) => {
      if (g.includes(fqn)) return g;
      if (g.length >= MAX_GROUNDING) return g;
      return [...g, fqn];
    });
    setTouched((t) => ({ ...t, sources: 'done' }));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Step strip */}
      <nav aria-label="Lifecycle steps" className="shrink-0 space-y-0.5 px-1">
        {STAGE_ORDER.map((s) => {
          const Icon = STAGE_ICON[s];
          const meta = STAGE_META[s];
          const state = touched[s];
          const active = activeStage === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => selectStage(s)}
              aria-current={active ? 'step' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                active
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
              title={meta.hint}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{meta.label}</span>
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${
                  state === 'done'
                    ? 'bg-emerald-500'
                    : state === 'active'
                      ? 'bg-amber-400'
                      : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            </button>
          );
        })}
      </nav>

      {/* Grounding chips (always visible — this is the agent's context) */}
      <div className="mt-3 shrink-0 border-t border-gray-200 px-2 pt-3 dark:border-gray-700">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Grounding
          </span>
          <span className="text-[11px] text-gray-400">
            {grounding.length}/{MAX_GROUNDING}
          </span>
        </div>
        {grounding.length === 0 ? (
          <p className="text-xs text-gray-400">
            Pick tables below — the agent answers about this selection.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {grounding.map((fqn) => (
              <Badge key={fqn} variant="outline" size="sm" className="max-w-full gap-1 pr-1">
                <span className="truncate text-[11px]" title={fqn}>
                  {fqn.split('.').slice(-1)[0]}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${fqn} from grounding`}
                  onClick={() => setGrounding((g) => g.filter((x) => x !== fqn))}
                  className="rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <PiX className="h-3 w-3" aria-hidden />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Stage picker — Sources embeds the real catalog tree; every step
          offers starter prompts so the first run always succeeds. */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-gray-200 pt-2 dark:border-gray-700">
        <div className="mb-2 space-y-1 px-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Try at this step
          </span>
          {STAGE_META[activeStage].starters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('agentic-os:prefill', { detail: { text: s } }),
                )
              }
              className="block w-full rounded-md border border-dashed border-gray-200 px-2 py-1.5 text-left text-xs text-gray-500 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-gray-700 dark:border-gray-700 dark:hover:text-gray-200"
            >
              {s}
            </button>
          ))}
        </div>
        {(activeStage === 'sources' || activeStage === 'dependencies' || activeStage === 'ingestion') && (
          <SourceTree
            onSelectTable={addGrounding}
            selectedTable={grounding[grounding.length - 1]}
          />
        )}
        {activeStage === 'models' && (
          <div className="h-[340px] px-1">
            <CatalogGraphCanvas
              className="h-full"
              onSelectNode={(node) => {
                const fqn = node?.anchor_fqn;
                if (fqn && fqn.split('.').length === 3) {
                  const [d, s, t] = fqn.split('.');
                  addGrounding(d, s, t);
                } else {
                  toast('Select a product node — it anchors a real table into the grounding.', {
                    icon: 'ℹ️',
                  });
                }
              }}
            />
          </div>
        )}
        {activeStage === 'workflow' && (
          <div className="px-1">
            <ETLPalette projectId={projectId || undefined} />
          </div>
        )}
      </div>
    </div>
  );
}
