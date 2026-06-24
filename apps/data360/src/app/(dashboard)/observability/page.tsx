'use client';

import { useState, useEffect, useCallback, Component, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { PiWarningCircleBold } from 'react-icons/pi';
import ObservabilityDashboard from '@/app/shared/observability';
import Breadcrumb from '@/components/ui/Breadcrumb';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Bumped by the parent to force a remount after the user clicks Retry. */
  resetKey: number;
  onRetry: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches genuine render-time crashes in the observability dashboard tree and
 * surfaces the exact error message inline (no modal, page chrome stays visible).
 * The dashboard itself owns its data fetching / loading / empty states.
 */
class ObservabilityErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Clear the captured error once the parent bumps resetKey (Retry pressed).
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 m-4 p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <PiWarningCircleBold className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Couldn&apos;t render the observability dashboard
          </h3>
          <p className="max-w-md text-center text-sm text-gray-500 dark:text-gray-400">
            {this.state.error.message || 'An unexpected error occurred while rendering this page.'}
          </p>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ObservabilityPage() {
  // Bumping this key remounts the dashboard subtree, re-triggering its own fetches.
  const [resetKey, setResetKey] = useState(0);
  const handleRetry = useCallback(() => setResetKey((k) => k + 1), []);

  // SSE cache invalidation: when the backend pushes an observability_dashboard
  // event (batch probe checks, monitor edits) remount the dashboard subtree so it
  // re-runs its own fetches. The dashboard owns all data fetching internally, so a
  // keyed remount is the minimal way to reuse it. `observability_dashboard` is the
  // only key the observability router emits (verified against the backend router).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const shouldRefresh = lastInvalidation.keys.some(
      (k: string) => k === CACHE_KEYS.OBSERVABILITY_DASHBOARD
    );
    if (shouldRefresh) setResetKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  return (
    <div className="@container">
      <Breadcrumb items={[{ label: 'Observability', href: '/observability' }]} />
      <ObservabilityErrorBoundary resetKey={resetKey} onRetry={handleRetry}>
        <ObservabilityDashboard key={resetKey} />
      </ObservabilityErrorBoundary>
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 text-xs text-slate-500 dark:text-slate-400">
        <span>Explore:</span>
        <a href="/observability/lineage" className="text-blue-600 hover:underline dark:text-blue-400">
          Lineage
        </a>
        <a href="/observability/dependencies" className="text-blue-600 hover:underline dark:text-blue-400">
          Dependencies
        </a>
        <a href="/observability/freshness" className="text-blue-600 hover:underline dark:text-blue-400">
          Freshness Probes
        </a>
        <a href="/observability/budget" className="text-blue-600 hover:underline dark:text-blue-400">
          Budget & Resource Monitors
        </a>
        <a href="/observability/alerts" className="text-blue-600 hover:underline dark:text-blue-400">
          Alerts
        </a>
        <a href="/observability/slo" className="text-blue-600 hover:underline dark:text-blue-400">
          SLO Tracking
        </a>
        <a href="/observability/trust-center" className="text-blue-600 hover:underline dark:text-blue-400">
          Trust Center
        </a>
        <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
        <span>Related:</span>
        <a href="/data-quality" className="text-blue-600 hover:underline dark:text-blue-400">
          Data Quality (Checks)
        </a>
        <a href="/governance" className="text-blue-600 hover:underline dark:text-blue-400">
          Governance (Compliance)
        </a>
      </div>
    </div>
  );
}
