'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { getDashboard } from '@/app/services/api/biDashboardApi';
import type { FullDashboard } from '@/app/services/api/types';
import DashboardEditor from '../components/DashboardEditor';
import ProjectStatusBadges from '../components/ProjectStatusBadges';
import AdnHeaderBadge from '@/app/shared/score-cards/AdnHeaderBadge';

// ---------------------------------------------------------------------------
// Page
//
// The self-service builder (NL-to-chart bar, chart palette, grid, widget
// config) lives entirely in <DashboardEditor>. This page only owns the
// breadcrumb + load/error shell around it.
// ---------------------------------------------------------------------------

export default function BIDashboardProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? '';

  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    getDashboard(projectId)
      .then(setDashboard)
      .catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          setError('Dashboard not found.');
        } else if (status != null && status >= 500) {
          // Server-side failure — be specific so it doesn't read as a missing
          // dashboard, and offer a Retry instead of a dead end.
          setError(`The server couldn’t load this dashboard (error ${status}). This is a backend issue, not your dashboard.`);
        } else {
          setError('Failed to load dashboard.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [projectId, reloadKey]);

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
          <div className="ml-auto flex items-center gap-3">
            {isLoading && <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
            {!error && !isLoading && projectId && (
              <>
                {/* Per-project 5-axis ADN health badge — compact for this dense
                    top bar; self-hides when the rollup route is unprovisioned. */}
                <AdnHeaderBadge projectId={projectId} compact />
                <ProjectStatusBadges projectId={projectId} />
              </>
            )}
          </div>
        </div>

        {/* Content — full self-service builder (palette + grid + config).
            Restored from bd84756^ (G1 BI builder regression). */}
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-md text-sm text-red-600">{error}</p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
              <Link href="/bi-dashboard" className="text-sm text-cyan-600 hover:underline">
                Back to dashboards
              </Link>
            </div>
          </div>
        ) : isLoading ? (
          <div className="grid flex-1 grid-cols-3 gap-4 p-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-36 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <DashboardEditor
              projectId={projectId}
              projectName={dashboard?.project_name ?? 'BI Dashboard'}
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
