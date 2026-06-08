'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BarChart2, ChevronLeft, Plus, RefreshCw, Sparkles } from 'lucide-react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { getDashboard } from '@/app/services/api/biDashboardApi';
import type { FullDashboard } from '@/app/services/api/types';

// ---------------------------------------------------------------------------
// NL-to-chart bar (stub — wired to /bi-dashboard/nl-to-chart)
// ---------------------------------------------------------------------------

function NlBar({ projectId }: { projectId: string }) {
  const [question, setQuestion] = useState('');
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <Sparkles className="w-4 h-4 text-cyan-500 shrink-0" />
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder='Ask AI: "Show monthly revenue by region"'
        className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
      />
      <button
        disabled={!question.trim()}
        className="px-3 py-1 text-xs font-medium bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white rounded-md transition-colors"
      >
        Generate
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty page state
// ---------------------------------------------------------------------------

function EmptyPage() {
  return (
    <div className="flex flex-col items-center justify-center h-80 gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
        <BarChart2 className="w-8 h-8 text-cyan-400" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">No widgets yet</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Add a chart, KPI card, or table widget. Use AI generation above to start from a question.
        </p>
      </div>
      <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors">
        <Plus className="w-4 h-4" />
        Add Widget
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BIDashboardProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? '';

  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    getDashboard(projectId)
      .then(setDashboard)
      .catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          setError('Dashboard not found.');
        } else {
          setError('Failed to load dashboard.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [projectId]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
        {/* Top bar */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 flex items-center gap-3">
          <Link
            href="/bi-dashboard"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Dashboards
          </Link>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          {isLoading ? (
            <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ) : (
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {dashboard?.project_name ?? 'BI Dashboard'}
            </h1>
          )}
          {isLoading && <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin ml-auto" />}
        </div>

        {/* NL bar */}
        {!error && <NlBar projectId={projectId} />}

        {/* Content */}
        <div className="flex-1 p-6">
          {error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Link href="/bi-dashboard" className="text-sm text-cyan-600 hover:underline">
                Back to dashboards
              </Link>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-36 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <EmptyPage />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
