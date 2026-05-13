'use client';

import { useState, useEffect, useRef, Component, type ReactNode } from 'react';

import DashboardSelector from './components/DashboardSelector';
import DashboardEditor from './components/DashboardEditor';
import { LayoutDashboard, Plus } from 'lucide-react';
import { PiWarningCircleBold } from 'react-icons/pi';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class BiDashboardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message || 'An unexpected error occurred' };
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
            onClick={() => { this.setState({ hasError: false, errorMessage: '' }); window.location.reload(); }}
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

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 animate-pulse" role="status" aria-label="Loading dashboard">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      ))}
      <span className="sr-only">Loading dashboard widgets...</span>
    </div>
  );
}

function BiDashboardContent() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const selectorRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

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
    <div className="@container">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <nav className="mb-2">
            <div className="flex items-center space-x-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Home</span>
              <div className="w-1 h-1 bg-slate-400 rounded-full" />
              <span className="text-slate-900 dark:text-slate-200 font-semibold">BI Dashboard</span>
            </div>
          </nav>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {selectedProjectName || 'BI Dashboard'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Build and manage multi-page dashboards
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div ref={selectorRef}>
            <DashboardSelector
              selectedProjectId={selectedProjectId}
              onProjectSelect={(id, name) => {
                setSelectedProjectId(id || null);
                setSelectedProjectName(name);
              }}
            />
          </div>
          <button
            onClick={() => {
              selectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const btn = selectorRef.current?.querySelector('button');
              if (btn) setTimeout(() => btn.click(), 300);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> New Dashboard
          </button>
        </div>
      </div>

      {/* Dashboard Editor or Empty State */}
      {selectedProjectId ? (
        <DashboardEditor
          key={selectedProjectId}
          projectId={selectedProjectId}
          projectName={selectedProjectName}
        />
      ) : (
        <div className="space-y-8">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <LayoutDashboard className="h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
              No Dashboard Selected
            </h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md">
              Create a new dashboard or select an existing one from the selector above to start building.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-4 max-w-lg">
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Bar / Column</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Compare categories</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">Line / Area</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Show trends over time</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800/30">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">Pie / Donut</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Show proportions</p>
              </div>
            </div>
            <button
              onClick={() => {
                selectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const btn = selectorRef.current?.querySelector('button');
                if (btn) setTimeout(() => btn.click(), 300);
              }}
              className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Create Your First Dashboard
            </button>
          </div>

        </div>
      )}
      {/* Related Modules */}
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline">Data Quality (Freshness)</a>
        <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore & Design (Source Tables)</a>
      </div>
    </div>
  );
}

export default function BiDashboardPage() {
  return (
    <BiDashboardErrorBoundary>
      <BiDashboardContent />
    </BiDashboardErrorBoundary>
  );
}
