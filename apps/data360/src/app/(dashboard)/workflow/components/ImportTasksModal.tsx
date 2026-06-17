'use client';

/**
 * ImportTasksModal — discover existing Snowflake task graphs and import each
 * as a workflow project (PDF page 8 #2).
 *
 * The user opens the modal → we call /workflow/tasks/discover → render each
 * root task graph as a clickable card → click → /workflow/tasks/import →
 * new workflow project appears in the page's workflows list (parent reloads).
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, Loader2, Database, GitBranch, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  discoverTasks,
  importTaskGraph,
  type TaskGraph,
} from '@/app/services/api/workflowApi';
import { getApiErrorMessage } from '@/lib/api-client';

interface ImportTasksModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the parent can reload its workflow list. */
  onImported: (projectName: string) => void;
}

export default function ImportTasksModal({
  open,
  onClose,
  onImported,
}: ImportTasksModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphs, setGraphs] = useState<TaskGraph[]>([]);
  const [importingFqn, setImportingFqn] = useState<string | null>(null);

  const fetchGraphs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await discoverTasks();
      setGraphs(res.graphs ?? []);
    } catch (e) {
      setError(getApiErrorMessage(e) || 'Failed to load Snowflake tasks');
    } finally {
      setLoading(false);
    }
  };

  // Fetch on open
  useEffect(() => {
    if (open) void fetchGraphs();
  }, [open]);

  // Esc-to-close (panel had no keyboard dismiss).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleImport = async (graph: TaskGraph) => {
    if (importingFqn) return;
    const root = graph.tasks.find((t) => t.is_root) ?? graph.tasks[0];
    if (!root) return;
    setImportingFqn(root.fqn);
    try {
      const res = await importTaskGraph(root.fqn);
      toast.success(
        `Imported "${res.project_name}" (${res.steps_created} step${res.steps_created === 1 ? '' : 's'})`,
      );
      onImported(res.project_name);
      onClose();
    } catch (e) {
      toast.error(getApiErrorMessage(e) || 'Failed to import task');
    } finally {
      setImportingFqn(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          role="dialog"
          aria-modal="false"
          aria-label="Import Snowflake task graphs"
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="relative flex h-full w-full flex-col">
            {/* Decorative orb */}
            <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-500/30 blur-3xl" />

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ rotate: -8, scale: 0.85 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30"
                >
                  <Download className="h-5 w-5 text-white" />
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent" />
                </motion.div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                    Import Snowflake task graphs
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Discover existing tasks in Snowflake and bring each graph in as a
                    workflow project.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <motion.button
                  whileHover={{ rotate: 90, scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => void fetchGraphs()}
                  disabled={loading}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800"
                  aria-label="Refresh"
                >
                  <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            </div>

            {/* Body */}
            <div className="relative flex-1 overflow-y-auto px-6 py-4">
              {loading && graphs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-cyan-500" />
                  <p className="text-xs text-slate-500">Scanning Snowflake for tasks…</p>
                </div>
              ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                        Couldn't load tasks
                      </p>
                      <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">{error}</p>
                    </div>
                  </div>
                </div>
              ) : graphs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800">
                    <Database className="h-6 w-6 text-slate-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    No Snowflake tasks found
                  </p>
                  <p className="mt-1 max-w-[280px] text-xs text-slate-500">
                    Once you create tasks in Snowflake, they'll appear here ready
                    to import as workflow projects.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {graphs.map((g, i) => {
                    const root = g.tasks.find((t) => t.is_root) ?? g.tasks[0];
                    const isImporting = importingFqn === root?.fqn;
                    return (
                      <motion.button
                        key={g.root_task}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.22,
                          delay: Math.min(i * 0.03, 0.18),
                        }}
                        whileHover={!isImporting ? { y: -2 } : undefined}
                        whileTap={!isImporting ? { scale: 0.985 } : undefined}
                        onClick={() => void handleImport(g)}
                        disabled={isImporting}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all',
                          'hover:border-cyan-300 hover:shadow-md',
                          'disabled:cursor-wait disabled:opacity-70',
                          'dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-cyan-700',
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/15 to-blue-500/15 text-cyan-600 dark:text-cyan-400">
                          <GitBranch className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {g.root_task.split('.').pop()}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {g.task_count} task{g.task_count === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="truncate">{g.root_task}</span>
                            {g.schedule && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                {g.schedule}
                              </span>
                            )}
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                g.state === 'started'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                              )}
                            >
                              {g.state}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-cyan-600 group-hover:translate-x-0.5 dark:text-cyan-400">
                          {isImporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 transition-transform" />
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="relative flex items-center justify-between border-t border-slate-200 px-6 py-3 dark:border-slate-700">
              <p className="text-[11px] text-slate-400">
                {graphs.length > 0
                  ? `${graphs.length} root task${graphs.length === 1 ? '' : 's'} available`
                  : 'Click a task graph to import'}
              </p>
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
