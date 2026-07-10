'use client';

import { useState, useEffect, useRef, Component, type ReactNode } from 'react';
import { PiWarningCircleBold } from 'react-icons/pi';
import CommandCenterDashboard from '@/app/shared/command-center';
import OnboardingTour from '@/app/shared/onboarding-tour';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class AccountOverviewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || 'An unexpected error occurred');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 m-4 p-8">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            An error occurred while loading this page. This is usually temporary.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// NOTE (2026-07-10 tabbed redesign): the Access Requests widget that used to
// sit at the bottom of this page moved INTO the Command Center's Security tab
// (shared/command-center/AccessRequestsCard.tsx) — content unchanged, and its
// pending count now badges the Security entry of the SectionRail.

/**
 * ViewportFitFrame — pins its child to exactly the height left in the
 * viewport, so the PAGE never scrolls ("no one-page lifetime scroll"):
 * everything below the ProblemsInsightStrip lives in the Command Center's
 * inner-scroll frame. Measured (not a hardcoded calc()) because the strip
 * above grows when the Cortex narrative lands and the layout footer/paddings
 * below are fixed chrome we must reserve.
 */
function ViewportFitFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const node = ref.current;
      if (!node) return;
      // Self-correcting: whatever the frame currently renders at, absorb the
      // page's actual scroll excess (or spare room) into the frame height.
      // This converges regardless of WHERE the extra pixels come from
      // (footer, paddings, body-vs-html scrollHeight discrepancies…).
      const doc = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      const excess = doc - window.innerHeight;
      const current = node.getBoundingClientRect().height;
      // Floor low enough that 1280×800 (frame ≈ 260px after fixed chrome)
      // still converges to zero page scroll; boards scroll internally.
      const next = Math.max(240, Math.round(current - excess));
      // Change-guard: avoid resize-observer feedback loops on 1px jitter.
      setHeight((prev) => (prev != null && Math.abs(prev - next) <= 1 ? prev : next));
    };

    measure();
    window.addEventListener('resize', measure);
    // The strip above loads async and changes height — re-measure when the
    // document reflows (guarded setter above prevents loops). Entry/layout
    // animations (framer translateY) transiently inflate scrollHeight without
    // firing the observer when they end — the delayed re-measures settle it.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    const t1 = window.setTimeout(measure, 700);
    const t2 = window.setTimeout(measure, 2000);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ height: height != null ? `${height}px` : 'calc(100dvh - 460px)' }}
      className="min-h-[240px] px-4 pb-1"
    >
      {children}
    </div>
  );
}

export default function AccountOverviewPage() {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="@container">
        <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 p-4">
          <PiWarningCircleBold className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <AccountOverviewErrorBoundary onError={(msg) => setError(msg)}>
      {/* USER DIRECTIVE 2026-07-11 (screenshot #45): NO page header at all —
          breadcrumb + Problems strip deleted; their numbers already live in
          the rail's account-health pulse (failed queries/logins chips) and
          the Security tab. The freed ~350px goes to the tab content. */}
      {/* Tabbed Command Center (2026-07-10): per-section tabs in a
          viewport-fit frame — only the frame's inner area scrolls, the page
          itself never does. */}
      <ViewportFitFrame>
        <CommandCenterDashboard />
      </ViewportFitFrame>
      <OnboardingTour />
    </AccountOverviewErrorBoundary>
  );
}
