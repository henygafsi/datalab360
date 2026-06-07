'use client';

import { useState, useCallback, useEffect } from 'react';
import { BarChart2, GitBranch, Compass, Layers, Plus, ChartBar, Copy, Sparkles } from 'lucide-react';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { createDashboard } from '@/app/services/api/biDashboardApi';

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 gap-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
        <BarChart2 className="w-10 h-10 text-cyan-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No BI Dashboard yet
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          Create project-based dashboards with charts, KPI cards, tables, and NL-to-chart AI generation.
        </p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Dashboard
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createDashboard({
        project_name: name.trim(),
        description: description.trim() || null,
      });
      onCreated(res.project_id);
    } catch {
      setError('Failed to create dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New BI Dashboard</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Dashboard name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sales Analytics Q1"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature cards
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: ChartBar,
    title: 'Chart Builder',
    description: 'Bar, line, pie, scatter, heatmap, funnel, gauge and more from any data warehouse table.',
  },
  {
    icon: Sparkles,
    title: 'NL-to-Chart',
    description: 'Describe your question in plain language and get an auto-generated chart config.',
  },
  {
    icon: Copy,
    title: 'Multi-page Dashboards',
    description: 'Organize widgets across pages with grid or freeform layout and global filters.',
  },
  {
    icon: Layers,
    title: 'Template Gallery',
    description: 'Start from pre-built templates: Retail KPIs, FinOps, Pipeline Health, and more.',
  },
];

function FeatureGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 mt-8">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        >
          <f.icon className="w-6 h-6 text-cyan-500 mb-2" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{f.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{f.description}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BIDashboardPage() {
  const { trackFeatureClick } = useTrackEvent();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    trackFeatureClick('page_view', { module: 'bi_dashboard' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreated = useCallback((projectId: string) => {
    trackFeatureClick('bi_dashboard_created', { projectId });
    setShowCreate(false);
    // Redirect to the new project
    window.location.href = `/bi-dashboard/${projectId}`;
  }, [trackFeatureClick]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
                <BarChart2 className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">BI Dashboard</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Self-service analytics — project-based dashboards on your data warehouse
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                trackFeatureClick('bi_dashboard_open_create');
                setShowCreate(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Dashboard
            </button>
          </div>
        </div>

        {/* Cross-module context */}
        <div className="px-6 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>Related:</span>
          <a href="/explore-design" className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
            <Compass className="w-3 h-3" /> Explore &amp; Design (Source Tables)
          </a>
          <a href="/workflow" className="text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
            <GitBranch className="w-3 h-3" /> Workflow (ETL Pipelines)
          </a>
        </div>

        {/* Content */}
        <div className="p-6 max-w-4xl mx-auto">
          <EmptyState onCreate={() => { setShowCreate(true); }} />
          <FeatureGrid />
        </div>

        {/* Create modal */}
        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onCreated={handleCreated}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
