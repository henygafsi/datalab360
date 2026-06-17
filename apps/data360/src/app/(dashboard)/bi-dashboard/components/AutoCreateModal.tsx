'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input } from 'rizzui';
import { Sparkles, X, Loader2, Table2, LayoutDashboard } from 'lucide-react';
import toast from 'react-hot-toast';
import { autoCreateDashboard } from '@/app/services/api/biDashboardApi';
import { useDataSourcePicker } from '../hooks/useDataSourcePicker';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';

type Mode = 'table' | 'schema';

interface AutoCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (projectId: string, name: string) => void;
}

export default function AutoCreateModal({ isOpen, onClose, onCreated }: AutoCreateModalProps) {
  const {
    source,
    dbOptions,
    schemaOptions,
    tableOptions,
    setDatabase,
    setSchema,
    setTable,
  } = useDataSourcePicker();
  const [mode, setMode] = useState<Mode>('schema');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Action-RBAC gate (System 2): POST /bi-dashboard/auto-create →
  // require_action('bi_reporting','create'). Fail-open while the allow-set
  // loads; honest disabled + tooltip on a deny.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;

  const canSubmit =
    !submitting &&
    canCreate &&
    source.database &&
    source.schema &&
    (mode === 'schema' || (mode === 'table' && source.table));

  // Escape-to-close (non-blocking drawer — page stays interactive).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res =
        mode === 'schema'
          ? await autoCreateDashboard({
              mode: 'schema',
              database: source.database,
              schema: source.schema,
              name: name.trim() || undefined,
            })
          : await autoCreateDashboard({
              mode: 'table',
              table_fqn: `${source.database}.${source.schema}.${source.table}`,
              name: name.trim() || undefined,
            });

      const projectId = (res.project_id || res.dashboard_id || '') as string;
      const finalName =
        (res.name as string) ||
        name.trim() ||
        (mode === 'schema'
          ? `Auto Dashboard (${source.schema})`
          : `Auto Dashboard (${source.table})`);

      if (!projectId) {
        toast.error('Auto-create did not return a project id');
        return;
      }

      const widgetCount = Array.isArray(res.widgets_created)
        ? res.widgets_created.length
        : 0;
      const pageCount = Array.isArray((res as { pages?: unknown[] }).pages)
        ? ((res as { pages: unknown[] }).pages.length)
        : 1;
      toast.success(
        `Created "${finalName}" — ${pageCount} page${pageCount !== 1 ? 's' : ''}, ${widgetCount} widget${widgetCount !== 1 ? 's' : ''}`,
      );
      onCreated(projectId, finalName);
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="Auto-create Dashboard"
      className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Auto-create Dashboard
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generate a starter dashboard with KPIs, charts, and tables.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode('schema')}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors',
              mode === 'schema'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> From Schema
          </button>
          <button
            type="button"
            onClick={() => setMode('table')}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors',
              mode === 'table'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            <Table2 className="h-3.5 w-3.5" /> From Table
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 px-1">
          {mode === 'schema'
            ? 'We classify each table into a business domain (Sales, Marketing, Operations, Finance, HR, Customer, Other) and build one page per domain.'
            : 'We analyze a single table\'s columns and build a one-page dashboard with KPIs and charts.'}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Database
            </label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-sm"
              value={source.database}
              onChange={(e) => setDatabase(e.target.value)}
              disabled={submitting}
            >
              <option value="">Select database...</option>
              {dbOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Schema
            </label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-sm"
              value={source.schema}
              onChange={(e) => setSchema(e.target.value)}
              disabled={!source.database || submitting}
            >
              <option value="">Select schema...</option>
              {schemaOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {mode === 'table' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Table
              </label>
              <select
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-sm"
                value={source.table}
                onChange={(e) => setTable(e.target.value)}
                disabled={!source.schema || submitting}
              >
                <option value="">Select table...</option>
                {tableOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Dashboard Name (optional)
            </label>
            <Input
              size="sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'schema'
                ? `e.g. ${source.schema || 'RETAIL'} Overview`
                : 'e.g. Orders Dashboard'}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" size="md" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="md"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={!canCreate ? 'Requires the "create" permission on Business Reporting.' : undefined}
            className="gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Create Dashboard</>
            )}
          </Button>
        </div>
      </div>
    </aside>,
    document.body,
  );
}
