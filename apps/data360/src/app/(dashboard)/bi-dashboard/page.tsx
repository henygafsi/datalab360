'use client';

import { useState, useEffect } from 'react';
import { Loader } from 'rizzui';
import DashboardSelector from './components/DashboardSelector';
import DashboardEditor from './components/DashboardEditor';
import { LayoutDashboard } from 'lucide-react';
import { PiWarningCircleBold } from 'react-icons/pi';

export default function BiDashboardPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Brief loading state while component tree mounts
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while loading BI Dashboard');
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
      </div>
    );
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
              <span className="text-slate-500 dark:text-slate-400 font-medium">Business Reporting</span>
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

        <DashboardSelector
          selectedProjectId={selectedProjectId}
          onProjectSelect={(id, name) => {
            setSelectedProjectId(id || null);
            setSelectedProjectName(name);
          }}
        />
      </div>

      {/* Dashboard Editor or Empty State */}
      {selectedProjectId ? (
        <DashboardEditor
          key={selectedProjectId}
          projectId={selectedProjectId}
          projectName={selectedProjectName}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <LayoutDashboard className="h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
            No Dashboard Selected
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md">
            Create a new dashboard or select an existing one from the selector above to start building.
          </p>
        </div>
      )}
    </div>
  );
}
