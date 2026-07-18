'use client';

/**
 * Agentic OS — top lifecycle progress dock (WAW onboarding). Six phases the
 * project moves through; the current phase is derived from touched steps +
 * whether a project/deployment exists. Premium, calm, one line.
 */
import { useAtomValue } from 'jotai';
import { PiCheck } from 'react-icons/pi';
import { activeProjectIdAtom, activeStageAtom, touchedStagesAtom } from './store';
import type { LifecycleStage } from './types';

const PHASES = [
  { key: 'understand', label: 'Understand', hint: 'Objective & data' },
  { key: 'sources', label: 'Sources', hint: 'Connect & select' },
  { key: 'design', label: 'Design', hint: 'Model / pipeline / dashboard' },
  { key: 'dryrun', label: 'Dry Run', hint: 'Test on sample' },
  { key: 'review', label: 'Review', hint: 'Validate results' },
  { key: 'deploy', label: 'Deploy', hint: 'Go live' },
] as const;

// Map the OS lifecycle stages onto the 6 onboarding phases.
const STAGE_PHASE: Record<LifecycleStage, number> = {
  sources: 1,
  ingestion: 1,
  models: 2,
  workflow: 2,
  dashboards: 2,
  questions: 0,
  dependencies: 2,
};

export default function LifecycleDock() {
  const stage = useAtomValue(activeStageAtom);
  const touched = useAtomValue(touchedStagesAtom);
  const projectId = useAtomValue(activeProjectIdAtom);

  const anyTouched = Object.keys(touched).length > 0;
  let current = anyTouched ? Math.max(STAGE_PHASE[stage] ?? 0, projectId ? 2 : 0) : 0;
  if (current < 0) current = 0;

  return (
    <div className="flex w-full items-center gap-1 overflow-x-auto px-3 py-2">
      {PHASES.map((p, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={p.key} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex min-w-0 flex-col items-center gap-0.5 px-1">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done
                    ? 'bg-primary text-white'
                    : active
                      ? 'bg-primary/15 text-primary ring-2 ring-primary'
                      : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                }`}
              >
                {done ? <PiCheck className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span
                className={`whitespace-nowrap text-[10px] font-medium ${
                  active ? 'text-primary' : done ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400'
                }`}
              >
                {p.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <span
                className={`h-0.5 flex-1 rounded ${done ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
