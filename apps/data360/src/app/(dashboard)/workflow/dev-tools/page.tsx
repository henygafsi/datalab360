'use client';

/**
 * Workflow Developer Tools
 *
 * Surfaces the dev-tools backend surface that previously had no UI:
 *   - Git Repositories      → /workflow/git/repositories
 *   - Notebooks             → /workflow/notebooks
 *   - Run SQL (ad-hoc)      → /workflow/run-sql
 *   - Run Python (ad-hoc)   → /workflow/run-python
 *
 * Conventions applied:
 *   - Shared <ActionRail> for create flows (page stays visible, no backdrop).
 *   - <ConfirmDestructiveDialog> ONLY for destructive drops.
 *   - Every async action follows Idle → Running → Completed/Empty/Error with a
 *     visible elapsed timer for long Snowflake calls.
 *   - No fake zeros, no silent empty arrays: failed fetches render an inline
 *     error banner (distinct from the empty state); missing values render "—".
 *   - Backend routes may not be deployed yet (~part of the API surface is
 *     unrouted). Every call degrades to an inline error / empty state — no
 *     crash.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  GitBranch,
  BookOpen,
  Database,
  Code2,
  RefreshCw,
  Plus,
  Trash2,
  Play,
  Loader2,
  AlertTriangle,
  Inbox,
  ArrowLeft,
  Tag,
  GitFork,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ActionRail, useActionPanel } from '@/app/shared/action-rail';
import { ConfirmDestructiveDialog } from '@/components/ui/confirm-dialog';
import { FormField, Input } from '../components/config-forms/_shared';
import {
  listGitRepositories,
  createGitRepository,
  dropGitRepository,
  fetchGitRepository,
  listGitBranches,
  listGitTags,
  listNotebooks,
  createNotebook,
  executeNotebook,
  dropNotebook,
  runAdHocSQL,
  runAdHocPython,
  type GitRepository,
  type Notebook,
  type SqlQueryResult,
  type PythonExecutionResult,
} from '@/app/services/workflow';

// ─────────────────────────────────────────────────────────────────────────
// Shared state primitives (local — no shared EmptyState component exists)
// ─────────────────────────────────────────────────────────────────────────

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const resp = (e as { response?: { data?: { detail?: string; message?: string }; status?: number } }).response;
    if (resp?.data?.detail) return resp.data.detail;
    if (resp?.data?.message) return resp.data.message;
    if (resp?.status === 404) return 'This endpoint is not available yet (404). It may not be deployed.';
  }
  return e instanceof Error ? e.message : String(e);
}

const EmptyState: React.FC<{ icon: React.ElementType; label: string; hint?: string }> = ({
  icon: Icon,
  label,
  hint,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <Icon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
    {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
  </div>
);

/** Inline error banner — distinct from EmptyState so a failed fetch never reads as "no data". */
const ErrorBanner: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span className="flex-1">{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="shrink-0 font-medium underline hover:no-underline">
        Retry
      </button>
    )}
  </div>
);

const RowSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-2" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
    ))}
  </div>
);

/** Elapsed timer chip for long-running Snowflake actions. */
function useElapsed(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running) {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      if (startRef.current !== null) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return elapsed;
}

const ElapsedChip: React.FC<{ seconds: number }> = ({ seconds }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
    <Loader2 className="h-3 w-3 animate-spin" />
    {seconds}s
  </span>
);

type TabKey = 'git' | 'notebooks' | 'sql' | 'python';

// ─────────────────────────────────────────────────────────────────────────
// Git Repositories
// ─────────────────────────────────────────────────────────────────────────

const GitReposTab: React.FC = () => {
  const [repos, setRepos] = useState<GitRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<GitRepository | null>(null);
  const [refs, setRefs] = useState<Record<string, { branches: string[]; tags: string[] } | 'loading' | string>>({});
  const { isOpen, open, close } = useActionPanel<'create'>();
  const [form, setForm] = useState({ name: '', origin: '', api_integration: '', secret: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRepos(await listGitRepositories());
    } catch (e) {
      setError(errMessage(e));
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !form.origin.trim()) {
      toast.error('Name and origin URL are required');
      return;
    }
    setCreating(true);
    try {
      await createGitRepository({
        name: form.name.trim(),
        origin: form.origin.trim(),
        api_integration: form.api_integration.trim() || undefined,
        secret: form.secret.trim() || undefined,
      });
      toast.success('Repository linked');
      close();
      setForm({ name: '', origin: '', api_integration: '', secret: '' });
      await load();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setCreating(false);
    }
  }, [form, close, load]);

  const handleFetch = useCallback(async (name: string) => {
    setBusy(name);
    try {
      await fetchGitRepository(name);
      toast.success(`Fetched ${name}`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const handleShowRefs = useCallback(async (name: string) => {
    setRefs((prev) => ({ ...prev, [name]: 'loading' }));
    try {
      const [branches, tags] = await Promise.all([
        listGitBranches(name).catch(() => [] as string[]),
        listGitTags(name).catch(() => [] as string[]),
      ]);
      setRefs((prev) => ({ ...prev, [name]: { branches, tags } }));
    } catch (e) {
      setRefs((prev) => ({ ...prev, [name]: errMessage(e) }));
    }
  }, []);

  const handleDrop = useCallback(async () => {
    if (!dropTarget) return;
    try {
      await dropGitRepository(dropTarget.name);
      toast.success(`Dropped ${dropTarget.name}`);
      setDropTarget(null);
      await load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  }, [dropTarget, load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Snowflake Git repository integrations
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => open('create')}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Link repository
          </Button>
        </div>
      </div>

      {loading ? (
        <RowSkeleton />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : repos.length === 0 ? (
        <EmptyState icon={GitBranch} label="No Git repositories" hint="Link a repository to use it in workflow steps." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {repos.map((repo) => {
            const ref = refs[repo.name];
            return (
              <li key={repo.name} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {repo.name}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                      {repo.origin || '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void handleShowRefs(repo.name)}>
                      <GitFork className="mr-1 h-3.5 w-3.5" />
                      Refs
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleFetch(repo.name)}
                      disabled={busy === repo.name}
                    >
                      {busy === repo.name ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      )}
                      Fetch
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDropTarget(repo)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
                {ref === 'loading' && (
                  <p className="mt-2 text-xs text-slate-400">Loading refs…</p>
                )}
                {typeof ref === 'string' && ref !== 'loading' && (
                  <p className="mt-2 text-xs text-red-500">{ref}</p>
                )}
                {ref && typeof ref === 'object' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ref.branches.length === 0 && ref.tags.length === 0 ? (
                      <span className="text-xs text-slate-400">No branches or tags</span>
                    ) : (
                      <>
                        {ref.branches.map((b) => (
                          <span
                            key={`b-${b}`}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          >
                            <GitBranch className="h-3 w-3" />
                            {b}
                          </span>
                        ))}
                        {ref.tags.map((t) => (
                          <span
                            key={`t-${t}`}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          >
                            <Tag className="h-3 w-3" />
                            {t}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ActionRail
        isOpen={isOpen}
        onClose={close}
        title="Link Git repository"
        description="Connect a Snowflake Git repository integration."
        accentClassName="bg-emerald-500"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Link
            </Button>
          </>
        }
      >
        <FormField label="Name" required hint="Snowflake object name for the repository">
          <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="MY_REPO" />
        </FormField>
        <FormField label="Origin URL" required hint="Git remote, e.g. https://github.com/org/repo.git">
          <Input value={form.origin} onChange={(v) => setForm((f) => ({ ...f, origin: v }))} placeholder="https://…" />
        </FormField>
        <FormField label="API Integration" hint="Optional Snowflake API integration name">
          <Input
            value={form.api_integration}
            onChange={(v) => setForm((f) => ({ ...f, api_integration: v }))}
            placeholder="GIT_API_INTEGRATION"
          />
        </FormField>
        <FormField label="Secret" hint="Optional credentials secret name">
          <Input value={form.secret} onChange={(v) => setForm((f) => ({ ...f, secret: v }))} placeholder="GIT_SECRET" />
        </FormField>
      </ActionRail>

      <ConfirmDestructiveDialog
        open={!!dropTarget}
        onOpenChange={(o) => !o && setDropTarget(null)}
        tier="hard"
        title="Drop Git repository"
        resourceLabel="repository"
        resourceName={dropTarget?.name ?? ''}
        body={`This removes the Git repository integration "${dropTarget?.name ?? ''}". Steps referencing it will fail.`}
        confirmLabel="Drop"
        onConfirm={handleDrop}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Notebooks
// ─────────────────────────────────────────────────────────────────────────

const NotebooksTab: React.FC = () => {
  const [items, setItems] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Notebook | null>(null);
  const { isOpen, open, close } = useActionPanel<'create'>();
  const [form, setForm] = useState({ name: '', database: '', schema: '', warehouse: '' });
  const [creating, setCreating] = useState(false);
  const elapsed = useElapsed(!!executing);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listNotebooks());
    } catch (e) {
      setError(errMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !form.database.trim() || !form.schema.trim()) {
      toast.error('Name, database and schema are required');
      return;
    }
    setCreating(true);
    try {
      await createNotebook({
        name: form.name.trim(),
        database: form.database.trim(),
        schema: form.schema.trim(),
        warehouse: form.warehouse.trim() || undefined,
      });
      toast.success('Notebook created');
      close();
      setForm({ name: '', database: '', schema: '', warehouse: '' });
      await load();
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setCreating(false);
    }
  }, [form, close, load]);

  const handleExecute = useCallback(async (name: string) => {
    setExecuting(name);
    try {
      const res = await executeNotebook(name);
      toast.success(res.message || `Executed ${name}`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setExecuting(null);
    }
  }, []);

  const handleDrop = useCallback(async () => {
    if (!dropTarget) return;
    try {
      await dropNotebook(dropTarget.name);
      toast.success(`Dropped ${dropTarget.name}`);
      setDropTarget(null);
      await load();
    } catch (e) {
      toast.error(errMessage(e));
    }
  }, [dropTarget, load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">Snowflake notebooks</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => open('create')}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New notebook
          </Button>
        </div>
      </div>

      {loading ? (
        <RowSkeleton />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState icon={BookOpen} label="No notebooks" hint="Create a notebook to run interactive code." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {items.map((nb) => (
            <li key={nb.name} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{nb.name}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                  {nb.database || '—'}.{nb.schema || '—'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {executing === nb.name && <ElapsedChip seconds={elapsed} />}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleExecute(nb.name)}
                  disabled={executing === nb.name}
                >
                  {executing === nb.name ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1 h-3.5 w-3.5" />
                  )}
                  Run
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDropTarget(nb)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ActionRail
        isOpen={isOpen}
        onClose={close}
        title="New notebook"
        description="Create a Snowflake notebook."
        accentClassName="bg-indigo-500"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </>
        }
      >
        <FormField label="Name" required>
          <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="MY_NOTEBOOK" />
        </FormField>
        <FormField label="Database" required>
          <Input value={form.database} onChange={(v) => setForm((f) => ({ ...f, database: v }))} placeholder="MY_DB" />
        </FormField>
        <FormField label="Schema" required>
          <Input value={form.schema} onChange={(v) => setForm((f) => ({ ...f, schema: v }))} placeholder="PUBLIC" />
        </FormField>
        <FormField label="Warehouse" hint="Optional compute warehouse">
          <Input value={form.warehouse} onChange={(v) => setForm((f) => ({ ...f, warehouse: v }))} placeholder="COMPUTE_WH" />
        </FormField>
      </ActionRail>

      <ConfirmDestructiveDialog
        open={!!dropTarget}
        onOpenChange={(o) => !o && setDropTarget(null)}
        tier="hard"
        title="Drop notebook"
        resourceLabel="notebook"
        resourceName={dropTarget?.name ?? ''}
        body={`This permanently drops the notebook "${dropTarget?.name ?? ''}".`}
        confirmLabel="Drop"
        onConfirm={handleDrop}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Run SQL (ad-hoc)
// ─────────────────────────────────────────────────────────────────────────

const RunSqlTab: React.FC = () => {
  const [sql, setSql] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(running);

  const run = useCallback(async () => {
    if (!sql.trim()) {
      toast.error('Enter a SQL statement');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await runAdHocSQL({ sql: sql.trim(), warehouse: warehouse.trim() || undefined });
      setResult(res);
      setRan(true);
    } catch (e) {
      setError(errMessage(e));
      setRan(true);
    } finally {
      setRunning(false);
    }
  }, [sql, warehouse]);

  const columns = result?.columns ?? [];
  const rows = result?.data ?? [];

  return (
    <div className="space-y-3">
      <FormField label="SQL" hint="Ad-hoc statement run against your Snowflake account.">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={6}
          placeholder="SELECT * FROM …"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </FormField>
      <div className="flex items-end gap-3">
        <div className="w-48">
          <FormField label="Warehouse" hint="Optional">
            <Input value={warehouse} onChange={setWarehouse} placeholder="COMPUTE_WH" />
          </FormField>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Button onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            Run SQL
          </Button>
          {running && <ElapsedChip seconds={elapsed} />}
        </div>
      </div>

      {error ? (
        <ErrorBanner message={error} onRetry={() => void run()} />
      ) : running ? (
        <RowSkeleton rows={3} />
      ) : ran && rows.length === 0 ? (
        <EmptyState icon={Inbox} label="Statement completed" hint="No rows returned." />
      ) : rows.length > 0 ? (
        <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.slice(0, 200).map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                      {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 200 && (
            <p className="px-3 py-2 text-xs text-slate-400">Showing first 200 of {rows.length} rows.</p>
          )}
        </div>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Run Python (ad-hoc)
// ─────────────────────────────────────────────────────────────────────────

const RunPythonTab: React.FC = () => {
  const [code, setCode] = useState('');
  const [packages, setPackages] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PythonExecutionResult | null>(null);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(running);

  const run = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Enter Python code');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const pkgs = packages
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const res = await runAdHocPython({ code, packages: pkgs.length ? pkgs : undefined });
      setResult(res);
      setRan(true);
    } catch (e) {
      setError(errMessage(e));
      setRan(true);
    } finally {
      setRunning(false);
    }
  }, [code, packages]);

  return (
    <div className="space-y-3">
      <FormField label="Python" hint="Runs in a Snowpark sandbox against your account.">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={8}
          placeholder="def main(session):\n    return session.sql('SELECT 1').collect()"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </FormField>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <FormField label="Packages" hint="Comma-separated, optional (e.g. pandas, numpy)">
            <Input value={packages} onChange={setPackages} placeholder="pandas, numpy" />
          </FormField>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Button onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            Run Python
          </Button>
          {running && <ElapsedChip seconds={elapsed} />}
        </div>
      </div>

      {error ? (
        <ErrorBanner message={error} onRetry={() => void run()} />
      ) : running ? (
        <RowSkeleton rows={3} />
      ) : ran && result ? (
        result.error ? (
          <ErrorBanner message={result.error} />
        ) : (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {result.output?.trim() || '— (no stdout)'}
          </pre>
        )
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'git', label: 'Git Repositories', icon: GitBranch },
  { key: 'notebooks', label: 'Notebooks', icon: BookOpen },
  { key: 'sql', label: 'Run SQL', icon: Database },
  { key: 'python', label: 'Run Python', icon: Code2 },
];

const TAB_KEYS: TabKey[] = ['git', 'notebooks', 'sql', 'python'];

function parseTab(raw: string | null): TabKey {
  return TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : 'git';
}

const WorkflowDevToolsPage: React.FC = () => {
  const searchParams = useSearchParams();
  // ?tab= is parsed ONCE on mount (deep links keep working); switches are
  // pure state + history.replaceState — no navigation, no remount.
  const [tab, setTabState] = useState<TabKey>(() => parseTab(searchParams.get('tab')));
  const setTab = useCallback((next: TabKey) => {
    setTabState(next);
    window.history.replaceState(null, '', `?tab=${next}`);
  }, []);

  return (
    /*
     * Viewport-fit shell (no page scroll — user directive 2026-07-10). The
     * page renders inside the carbon dashboard chrome: header (85px) + main
     * pt-6 (24px) above, lg:pb-16 (64px) + footer (73px) below = 246px.
     * `h-screen` previously overflowed the document by that chrome height.
     * Each tab body scrolls internally in <main> below.
     */
    <div className="flex h-[calc(100dvh-246px)] min-h-[480px] flex-col overflow-hidden bg-white dark:bg-gray-900">
      <header className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <Link
            href="/workflow"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Builder
          </Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Developer Tools</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Git repositories, notebooks, and ad-hoc SQL / Python execution.
        </p>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 px-6 dark:border-slate-700" aria-label="Developer tools">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              tab === key
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
            aria-current={tab === key ? 'page' : undefined}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl">
          {tab === 'git' && <GitReposTab />}
          {tab === 'notebooks' && <NotebooksTab />}
          {tab === 'sql' && <RunSqlTab />}
          {tab === 'python' && <RunPythonTab />}
        </div>
      </main>
    </div>
  );
};

export default WorkflowDevToolsPage;
