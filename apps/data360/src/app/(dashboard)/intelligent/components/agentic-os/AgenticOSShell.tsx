'use client';

/**
 * Agentic OS — the 3-pane shell (v1, replaces the /intelligent home).
 *
 *   LEFT   StageRail       — lifecycle steps + grounding picker
 *   CENTER AgentCanvas     — the discussion (drafts, proposals, inline runs)
 *   RIGHT  ValidationRail  — human validation queue + honest capability map
 *
 * Mobile-aware from day one: below lg the rails collapse into toggleable
 * sheets and the discussion is the surface (mobile = consume, desktop =
 * author). Lives inside the standard CarbonLayout main — no full-bleed
 * fighting in v1.
 */
import { useState } from 'react';
import { PiListBullets, PiShieldCheck, PiX } from 'react-icons/pi';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import StageRail from './StageRail';
import AgentCanvas from './AgentCanvas';
import ValidationRail from './ValidationRail';

export default function AgenticOSShell() {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Compact toolbar — visible whenever a rail is collapsed (below xl) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-2 py-1.5 dark:border-gray-700 xl:hidden">
        <button
          type="button"
          onClick={() => {
            setLeftOpen((o) => !o);
            setRightOpen(false);
          }}
          aria-expanded={leftOpen}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
        >
          <PiListBullets className="h-4 w-4" aria-hidden /> Steps
        </button>
        <button
          type="button"
          onClick={() => {
            setRightOpen((o) => !o);
            setLeftOpen(false);
          }}
          aria-expanded={rightOpen}
          className="ml-auto flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <PiShieldCheck className="h-4 w-4" aria-hidden /> Validate
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* LEFT — desktop pane */}
        <aside className="hidden w-[264px] shrink-0 border-r border-gray-200 py-2 dark:border-gray-700 lg:block">
          <ErrorBoundary>
            <StageRail />
          </ErrorBoundary>
        </aside>

        {/* CENTER */}
        <main className="min-w-0 flex-1">
          <ErrorBoundary>
            <AgentCanvas />
          </ErrorBoundary>
        </main>

        {/* RIGHT — desktop pane */}
        <aside className="hidden w-[320px] shrink-0 border-l border-gray-200 py-2 dark:border-gray-700 xl:block">
          <ErrorBoundary>
            <ValidationRail />
          </ErrorBoundary>
        </aside>

        {/* Collapsed-rail sheets (one at a time, over the canvas) */}
        {(leftOpen || rightOpen) && (
          <div className="absolute inset-0 z-20 flex bg-white dark:bg-gray-900 xl:hidden">
            <div className="flex min-h-0 w-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
                <span className="text-sm font-medium">
                  {leftOpen ? 'Steps & grounding' : 'Validation & capabilities'}
                </span>
                <button
                  type="button"
                  aria-label="Close panel"
                  onClick={() => {
                    setLeftOpen(false);
                    setRightOpen(false);
                  }}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <PiX className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-2">
                <ErrorBoundary>{leftOpen ? <StageRail /> : <ValidationRail />}</ErrorBoundary>
              </div>
            </div>
          </div>
        )}

        {/* On lg (no xl) the right rail is reachable via the mobile toolbar too */}
      </div>
    </div>
  );
}
