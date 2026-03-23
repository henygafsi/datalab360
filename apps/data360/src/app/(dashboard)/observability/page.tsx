'use client';

import { useState, useEffect, Component, type ReactNode } from 'react';
import { PiWarningCircleBold } from 'react-icons/pi';
import ObservabilityDashboard from '@/app/shared/observability';
import Breadcrumb from '@/components/ui/Breadcrumb';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ObservabilityErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
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

export default function ObservabilityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Allow the component tree to mount, then hide loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 p-4">
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="@container">
        <Breadcrumb items={[{ label: 'Observability', href: '/observability' }]} />
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <PiWarningCircleBold className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); setTimeout(() => setLoading(false), 100); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ObservabilityErrorBoundary onError={(msg) => setError(msg)}>
      <Breadcrumb items={[{ label: 'Observability', href: '/observability' }]} />
      <ObservabilityDashboard />
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 px-4">
        <span>Related:</span>
        <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline">Data Quality (Checks)</a>
        <a href="/gouvernance" className="text-blue-600 dark:text-blue-400 hover:underline">Governance (Compliance)</a>
      </div>
    </ObservabilityErrorBoundary>
  );
}
