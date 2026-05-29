'use client';
import React from 'react';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

const ETLPipelineBuilder = dynamic(() => import('./ETLPipelineBuilder'), { ssr: false });

/**
 * Workflow module entry point.
 *
 * The live builder is `ETLPipelineBuilder` (drag-and-drop ETL DAG editor wired
 * to the workflow API). The previous legacy `WorkflowHomePage` builder and its
 * feature toggle were dead code (the toggle was never read) and have been
 * removed — `page.tsx` now mounts the single live surface directly.
 */
const WorkflowPage: React.FC = () => (
  <ErrorBoundary>
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      <div className="flex-1 overflow-hidden">
        <ETLPipelineBuilder />
      </div>
      {/* Cross-module links */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-gray-900">
        <span>Related:</span>
        <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore &amp; Design (Source Tables)</a>
        <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline">Data Quality (Checks)</a>
        <a href="/bi-dashboard" className="text-blue-600 dark:text-blue-400 hover:underline">BI Dashboard (Visualize)</a>
      </div>
    </div>
  </ErrorBoundary>
);

export default WorkflowPage;
