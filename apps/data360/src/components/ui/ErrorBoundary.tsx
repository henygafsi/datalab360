'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  /** True while the boundary is auto-recovering from a transient chunk error. */
  autoRetrying: boolean;
}

// Transient-class errors: a failed chunk fetch / dynamic import. Typical causes
// are an HMR window in dev or a deploy swapping hashed chunks under a live tab.
// One automatic reload fixes these — the user should never have to click Retry.
const TRANSIENT_ERROR_RE =
  /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export function isTransientChunkError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: string }).name ?? '';
  const message = (error as { message?: string }).message ?? String(error);
  return name === 'ChunkLoadError' || TRANSIENT_ERROR_RE.test(message);
}

// sessionStorage guard so the automatic retry happens exactly ONCE per window
// (a reload that hits the same error again must surface the boundary, not loop).
const AUTO_RETRY_KEY = 'd360-eb-auto-retry-at';
const AUTO_RETRY_COOLDOWN_MS = 60_000;

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, autoRetrying: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (typeof window === 'undefined' || !isTransientChunkError(error)) return;
    let lastRetryAt = 0;
    try {
      lastRetryAt = Number(window.sessionStorage.getItem(AUTO_RETRY_KEY) ?? 0);
    } catch {
      return; // storage unavailable → fall through to the manual boundary
    }
    if (Date.now() - lastRetryAt < AUTO_RETRY_COOLDOWN_MS) return; // already auto-retried — show the boundary
    try {
      window.sessionStorage.setItem(AUTO_RETRY_KEY, String(Date.now()));
    } catch {
      return;
    }
    this.setState({ autoRetrying: true });
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      if (this.state.autoRetrying) {
        // A reload is in flight — show a quiet recovering state, not the error card.
        return (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-[400px] flex-col items-center justify-center gap-3"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Recovering the page…</p>
          </div>
        );
      }
      if (this.props.fallback) return this.props.fallback;
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
            type="button"
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
