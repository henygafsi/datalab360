'use client';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Maximize2, Minimize2 } from 'lucide-react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import ManageAccessButton from '@/app/shared/governance/ManageAccessButton';

const ETLPipelineBuilder = dynamic(() => import('./ETLPipelineBuilder'), { ssr: false });

/**
 * Desktop gate (md ≥ 768px). The builder is a heavy drag-and-drop ETL DAG editor
 * (react-flow canvas) that is unusable on a phone and previously collapsed to a
 * blank canvas on mobile. We default to desktop (the 99% case → no flash for
 * real users) and only render the builder once a desktop viewport is confirmed,
 * so we never mount the heavy canvas on a phone.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

const MobileNotice: React.FC = () => (
  <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
    <svg className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
    <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
      Workflow builder is desktop-first
    </h2>
    <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400">
      The drag-and-drop ETL pipeline editor needs a larger screen. Open this page
      on a desktop or tablet to design, deploy and run workflows.
    </p>
  </div>
);

/**
 * Workflow module entry point.
 *
 * The live builder is `ETLPipelineBuilder` (drag-and-drop ETL DAG editor wired
 * to the workflow API), shown on desktop/tablet; phones get a clear notice
 * instead of an empty canvas. The previous legacy `WorkflowHomePage` builder and
 * its feature toggle were dead code and have been removed.
 */
const WorkflowPage: React.FC = () => {
  const isDesktop = useIsDesktop();
  // Fullscreen deep-dive via the NATIVE Fullscreen API on the frame div:
  // the SAME component goes full-viewport with zero remount, so the
  // react-flow canvas keeps its unsaved state. Esc exits natively.
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen();
  };
  return (
    <ErrorBoundary>
      {/*
       * Viewport-fit shell (no page scroll — user directive 2026-07-10).
       * The page renders inside the carbon dashboard chrome: header (85px) +
       * main pt-6 (24px) above, lg:pb-16 (64px) + footer (73px) below = 246px.
       * `h-screen` here previously overflowed the document by exactly that
       * chrome height, so the PAGE scrolled while the canvas also panned.
       * Sizing to the remaining space keeps the builder canvas panning/zooming
       * internally (react-flow) and the smart panel scrolling internally,
       * while the document itself never scrolls.
       */}
      <div
        ref={frameRef}
        className={
          isFullscreen
            ? 'flex h-screen w-screen flex-col overflow-hidden bg-white dark:bg-gray-900'
            : 'flex flex-col h-[calc(100dvh-222px)] min-h-[480px] overflow-hidden bg-white dark:bg-gray-900'
        }
      >
        <div className="flex-1 overflow-hidden">
          {isDesktop ? <ETLPipelineBuilder /> : <MobileNotice />}
        </div>
        {/* Cross-module links + fullscreen deep-dive toggle */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-gray-900 flex-wrap">
          <span>Related:</span>
          <a href="/workflow/actions" className="text-blue-600 dark:text-blue-400 hover:underline">All actions (capability catalog)</a>
          <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore &amp; Design (Source Tables)</a>
          <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline">Data Quality (Checks)</a>
          <a href="/bi-dashboard" className="text-blue-600 dark:text-blue-400 hover:underline">BI Dashboard (Visualize)</a>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen (Esc)' : 'Expand builder to fullscreen'}
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Expand builder to fullscreen'}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
              {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
            <ManageAccessButton module="workflow" page="workflow" objectLabel="Workflow" />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default WorkflowPage;
