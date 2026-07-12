'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge, Button, Input, Loader, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { toMessage } from '@/lib/error-messages';
import {
  PiCpu, PiCloudArrowUp, PiPlay, PiPause, PiPlus,
  PiArrowsClockwise, PiWarningCircle, PiTerminalWindow,
  PiArrowSquareOut, PiPackage, PiCopy, PiSparkle,
  PiTrash, PiTimer,
} from 'react-icons/pi';
import {
  listComputePools,
  createComputePool,
  suspendPool,
  resumePool,
  listServices,
  createService,
  getServiceStatus,
  getServiceLogs,
  listStreamlitApps,
  createStreamlitApp,
  listImageRepos,
} from '@/app/services/cortex/snowpark';
import type {
  ComputePool,
  ContainerService,
  StreamlitApp,
  ImageRepo,
} from '@/app/services/cortex/snowpark';
import {
  suspendService,
  resumeService,
  dropService,
  autoStopService,
} from '@/app/services/cortex/ai';
import PermissionGatedButton from '@/components/ui/PermissionGatedButton';
import { usePagedRows, TablePager } from '@/components/ui/TablePager';
import { useCanPerform } from '@/hooks/useCanPerform';
import { ConfirmDestructiveDialog, ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CACHE_KEYS, useCacheInvalidationSubscription as useCacheInvalidation } from '@/components/providers/CacheInvalidationProvider';

type SubTab = 'compute-pools' | 'services' | 'streamlit' | 'image-repos';

const SUB_TABS = [
  { id: 'compute-pools' as SubTab, label: 'Compute Pools', icon: PiCpu },
  { id: 'services' as SubTab, label: 'Container Services', icon: PiCloudArrowUp },
  { id: 'streamlit' as SubTab, label: 'Data Apps', icon: PiPlay },
  { id: 'image-repos' as SubTab, label: 'Image Repositories', icon: PiPackage },
];

const INSTANCE_FAMILIES = [
  'CPU_X64_XS', 'CPU_X64_S', 'CPU_X64_M', 'CPU_X64_L',
  'GPU_NV_S', 'GPU_NV_M', 'GPU_NV_L',
];

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE' || s === 'RUNNING' || s === 'READY')
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{s}</Badge>;
  if (s === 'SUSPENDED' || s === 'STOPPED')
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">{s}</Badge>;
  if (s === 'PENDING' || s === 'STARTING')
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{s}</Badge>;
  if (s === 'FAILED' || s === 'ERROR')
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{s}</Badge>;
  return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">{s || 'UNKNOWN'}</Badge>;
}

function SkeletonRows({ rows = 3, cols = 5 }: { rows?: number; cols?: number }) {
  return <>{Array.from({ length: rows }).map((_, i) => (
    <tr key={i} className="animate-pulse">{Array.from({ length: cols }).map((_, j) => (
      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" /></td>
    ))}</tr>
  ))}</>;
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">{msg}</td></tr>;
}

function TH({ children, className = 'text-left' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}

function KPIBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</span>
    </div>
  );
}

function ErrorBar({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <PiWarningCircle className="w-5 h-5 text-red-500" />
      <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
      <Button variant="text" size="sm" className="ml-auto" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function RefreshBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return <Button variant="outline" size="sm" onClick={onClick} disabled={loading} aria-label="Refresh"><PiArrowsClockwise className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>;
}

// States that resolve on their own — while any row sits in one of these,
// poll the list so the badge updates without a manual refresh. Stops once
// everything has settled (or the component unmounts).
const TRANSITIONAL_STATES = new Set(['PENDING', 'STARTING', 'SUSPENDING', 'RESUMING', 'STOPPING']);

/**
 * usePollWhile — re-runs `load` every `intervalMs` while `shouldPoll` is true.
 * Uses a ref for `load` so the interval isn't torn down/recreated by an
 * unstable callback identity, avoiding a stale-closure restart loop.
 */
function usePollWhile(shouldPoll: boolean, load: () => void, intervalMs = 5000) {
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!shouldPoll) return;
    const id = setInterval(() => loadRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [shouldPoll, intervalMs]);
}

// ── Compute Pools Sub-Tab ──────────────────────────────────────────────────

function ComputePoolsPanel() {
  const [pools, setPools] = useState<ComputePool[]>([]);
  const poolsPager = usePagedRows(pools, 25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', min_nodes: 1, max_nodes: 1, instance_family: 'CPU_X64_XS', auto_suspend_secs: 300, comment: '' });
  const [creating, setCreating] = useState(false);
  const [busyPool, setBusyPool] = useState<string | null>(null);

  // Action-RBAC: fine-grained gates (fail-open while `/my-permissions` loads).
  const createPerm = useCanPerform('cortex', 'create');
  const configurePerm = useCanPerform('cortex', 'configure');
  const canCreate = createPerm.allowed || createPerm.loading;
  const canConfigure = configurePerm.allowed || configurePerm.loading;

  const errMsg = (e: any) => toMessage(e, 'Failed');
  // `silent` polls refresh state in place without flashing the skeleton.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try { setPools((await listComputePools()).pools || []); }
    catch (e: any) { setError(errMsg(e)); if (!silent) setPools([]); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Cross-user real-time: refresh (silently) when another user creates/alters a
  // pool and the backend broadcasts the SNOWPARK_SERVICES cache-key invalidation.
  useCacheInvalidation({
    onInvalidate: (keys) => { if (keys.includes(CACHE_KEYS.SNOWPARK_SERVICES)) load(true); },
  });

  // Same transitional auto-poll as Container Services — pools report STARTING/
  // SUSPENDING/RESUMING while they settle.
  const hasTransitional = pools.some((p) => TRANSITIONAL_STATES.has((p.state || '').toUpperCase()));
  usePollWhile(hasTransitional, useCallback(() => load(true), [load]));

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    try {
      await createComputePool({ ...form, auto_resume: true });
      toast.success(`Pool ${form.name} created`);
      setShowCreate(false); setForm({ name: '', min_nodes: 1, max_nodes: 1, instance_family: 'CPU_X64_XS', auto_suspend_secs: 300, comment: '' });
      load();
    } catch (e: any) { toast.error(errMsg(e)); }
    finally { setCreating(false); }
  };

  const handleToggle = async (pool: ComputePool) => {
    const suspended = (pool.state || '').toUpperCase() === 'SUSPENDED';
    setBusyPool(pool.name);
    try {
      suspended ? await resumePool(pool.name) : await suspendPool(pool.name);
      toast.success(`${pool.name} ${suspended ? 'resumed' : 'suspended'}`); load();
    } catch (e: any) { toast.error(errMsg(e)); }
    finally { setBusyPool(null); }
  };

  const activePools = pools.filter(p => (p.state || '').toUpperCase() === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <KPIBadge label="Total Pools" value={loading ? '—' : pools.length} />
          <KPIBadge label="Active" value={loading ? '—' : activePools} />
          <KPIBadge label="Total Nodes" value={loading ? '—' : pools.reduce((sum, p) => sum + (Number(p.max_nodes) || 0), 0)} />
        </div>
        <div className="flex gap-2">
          <RefreshBtn loading={loading} onClick={() => load()} />
          <PermissionGatedButton
            module="cortex"
            action="manage-compute-pools"
            size="sm"
            className="gap-1"
            onClick={() => setShowCreate(!showCreate)}
            deniedReason="Requires the manage-compute-pools permission on Intelligence → Container Apps."
          >
            <PiPlus className="w-4 h-4" /> Create Pool
          </PermissionGatedButton>
        </div>
      </div>

      {showCreate && (
        <div className="p-4 border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-900/20 rounded-lg space-y-3">
          <h4 className="font-medium text-gray-900 dark:text-white">Create Compute Pool</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="MY_POOL" />
            <Input label="Min Nodes" type="number" value={String(form.min_nodes)} onChange={(e) => setForm({ ...form, min_nodes: parseInt(e.target.value) || 1 })} />
            <Input label="Max Nodes" type="number" value={String(form.max_nodes)} onChange={(e) => setForm({ ...form, max_nodes: parseInt(e.target.value) || 1 })} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Instance Family</label>
              <select className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm" value={form.instance_family} onChange={(e) => setForm({ ...form, instance_family: e.target.value })}>
                {INSTANCE_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!canCreate || creating} title={!canCreate ? "You lack the 'create' permission on Intelligence → Container Apps. Ask an administrator to grant it." : undefined}>{creating ? <Loader size="sm" /> : 'Create'}</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {error && <ErrorBar error={error} onRetry={load} />}

      <div className="overflow-auto max-h-[480px] rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            <tr><TH>Name</TH><TH>State</TH><TH>Instance Family</TH><TH className="text-center">Nodes (Min/Max)</TH><TH className="text-center">Auto Suspend</TH><TH className="text-right">Actions</TH></tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? <SkeletonRows rows={3} cols={6} /> : pools.length === 0 ? (
              <EmptyRow cols={6} msg="No compute pools found. Create one to get started." />
            ) : poolsPager.visible.map((p) => (
              <tr key={p.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-900 dark:text-gray-200">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3"><StatusBadge status={p.state} /></td>
                <td className="px-4 py-3">{p.instance_family}</td>
                <td className="px-4 py-3 text-center">{p.min_nodes} / {p.max_nodes}</td>
                <td className="px-4 py-3 text-center">{p.auto_suspend_secs}s</td>
                <td className="px-4 py-3 text-right">
                  <PermissionGatedButton
                    module="cortex"
                    action="manage-compute-pools"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={!canConfigure || busyPool === p.name}
                    title={!canConfigure ? "You lack the 'configure' permission on Intelligence → Container Apps. Ask an administrator to grant it." : undefined}
                    onClick={() => handleToggle(p)}
                    deniedReason="Requires the manage-compute-pools permission on Intelligence → Container Apps."
                  >
                    {busyPool === p.name ? <><PiArrowsClockwise className="w-3.5 h-3.5 animate-spin" /> Working…</> : (p.state || '').toUpperCase() === 'SUSPENDED' ? <><PiPlay className="w-3.5 h-3.5" /> Resume</> : <><PiPause className="w-3.5 h-3.5" /> Suspend</>}
                  </PermissionGatedButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePager page={poolsPager.page} totalPages={poolsPager.totalPages} total={poolsPager.total} onPage={poolsPager.setPage} className="border-t-0" />
      </div>
    </div>
  );
}

// ── Container Services Sub-Tab ─────────────────────────────────────────────

function ContainerServicesPanel() {
  const [services, setServices] = useState<ContainerService[]>([]);
  const servicesPager = usePagedRows(services, 25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', database: '', schema: 'PUBLIC', compute_pool: '', spec_yaml: '', min_instances: 1, max_instances: 1 });
  const [creating, setCreating] = useState(false);
  const [logPanel, setLogPanel] = useState<{ name: string; logs: string } | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  // Lifecycle: suspend/resume (per-row busy), drop (confirm), auto-stop (modal).
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<ContainerService | null>(null);
  const [dropping, setDropping] = useState(false);
  const [autoStopTarget, setAutoStopTarget] = useState<ContainerService | null>(null);
  const [autoStopForm, setAutoStopForm] = useState<{ seconds: number; mode: 'suspend' | 'drop' }>({ seconds: 3600, mode: 'suspend' });
  const [autoStopBusy, setAutoStopBusy] = useState(false);

  // Action-RBAC: fine-grained gates (fail-open while `/my-permissions` loads).
  const createPerm = useCanPerform('cortex', 'create');
  const deletePerm = useCanPerform('cortex', 'delete');
  const configurePerm = useCanPerform('cortex', 'configure');
  const canCreate = createPerm.allowed || createPerm.loading;
  const canDelete = deletePerm.allowed || deletePerm.loading;
  const canConfigure = configurePerm.allowed || configurePerm.loading;

  // `silent` skips the full-page skeleton toggle so background polls refresh the
  // status badges in place rather than flashing the table back to skeleton.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try { const r = await listServices(); setServices(r.services || []); }
    catch (e: any) { setError(toMessage(e, 'Failed to load')); if (!silent) setServices([]); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cross-user real-time: refresh (silently) when another user deploys/suspends/
  // drops a service and the backend broadcasts the SNOWPARK_SERVICES cache key.
  useCacheInvalidation({
    onInvalidate: (keys) => { if (keys.includes(CACHE_KEYS.SNOWPARK_SERVICES)) load(true); },
  });

  // Auto-poll while any service is still spinning up/down so the status badge
  // resolves on its own (was: stuck on PENDING until a manual refresh).
  const hasTransitional = services.some((s) => TRANSITIONAL_STATES.has((s.status || '').toUpperCase()));
  usePollWhile(hasTransitional, useCallback(() => load(true), [load]));

  const errMsg = (e: any) => toMessage(e, 'Action failed');
  const svcParams = (s: ContainerService) => ({ database: s.database_name, schema: s.schema_name });
  const isSuspended = (s: ContainerService) => ['SUSPENDED', 'STOPPED'].includes((s.status || '').toUpperCase());

  const handleToggle = async (svc: ContainerService) => {
    const suspended = isSuspended(svc);
    setActionBusy(svc.name);
    try {
      suspended ? await resumeService(svc.name, svcParams(svc)) : await suspendService(svc.name, svcParams(svc));
      toast.success(`${svc.name} ${suspended ? 'resumed' : 'suspended'}`);
      await load();
    } catch (e: any) { toast.error(errMsg(e)); }
    finally { setActionBusy(null); }
  };

  const handleDrop = async () => {
    if (!dropTarget) return;
    setDropping(true);
    try {
      await dropService(dropTarget.name, svcParams(dropTarget));
      toast.success(`Service ${dropTarget.name} dropped`);
      setDropTarget(null);
      await load();
    } catch (e: any) { toast.error(errMsg(e)); }
    finally { setDropping(false); }
  };

  const handleAutoStop = async () => {
    if (!autoStopTarget) return;
    setAutoStopBusy(true);
    try {
      await autoStopService(autoStopTarget.name, autoStopForm.seconds, autoStopForm.mode);
      toast.success(`Auto-${autoStopForm.mode} scheduled for ${autoStopTarget.name} in ${autoStopForm.seconds}s`);
      setAutoStopTarget(null);
    } catch (e: any) { toast.error(errMsg(e)); }
    finally { setAutoStopBusy(false); }
  };

  const handleCreate = async () => {
    if (!form.name || !form.compute_pool || !form.spec_yaml) { toast.error('Name, compute pool, and spec YAML required'); return; }
    setCreating(true);
    try {
      await createService(form);
      toast.success(`Service ${form.name} deployed`);
      setShowCreate(false); load();
    } catch (e: any) { toast.error(toMessage(e, 'Deploy failed')); }
    finally { setCreating(false); }
  };

  const viewLogs = async (svc: ContainerService) => {
    setLogsLoading(true); setLogPanel({ name: svc.name, logs: '' });
    try {
      const r = await getServiceLogs(svc.name);
      setLogPanel({ name: svc.name, logs: r.logs || '(no logs)' });
    } catch (e: any) { setLogPanel({ name: svc.name, logs: `Error: ${toMessage(e)}` }); }
    finally { setLogsLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIBadge label="Total Services" value={loading ? '—' : services.length} />
        <div className="flex gap-2">
          <RefreshBtn loading={loading} onClick={() => load()} />
          <PermissionGatedButton
            module="cortex"
            action="manage-services"
            size="sm"
            className="gap-1"
            onClick={() => setShowCreate(!showCreate)}
            deniedReason="Requires the manage-services permission on Intelligence → Container Apps."
          >
            <PiPlus className="w-4 h-4" /> Deploy Service
          </PermissionGatedButton>
        </div>
      </div>

      {showCreate && (
        <div className="p-4 border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-900/20 rounded-lg space-y-3">
          <h4 className="font-medium text-gray-900 dark:text-white">Deploy Container Service</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input label="Service Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="MY_SERVICE" />
            <Input label="Database" value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} placeholder="MY_DB" />
            <Input label="Compute Pool" value={form.compute_pool} onChange={(e) => setForm({ ...form, compute_pool: e.target.value })} placeholder="MY_POOL" />
            <Input label="Min Instances" type="number" value={String(form.min_instances)} onChange={(e) => setForm({ ...form, min_instances: parseInt(e.target.value) || 1 })} />
            <Input label="Max Instances" type="number" value={String(form.max_instances)} onChange={(e) => setForm({ ...form, max_instances: parseInt(e.target.value) || 1 })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Spec YAML</label>
            <Textarea value={form.spec_yaml} onChange={(e) => setForm({ ...form, spec_yaml: e.target.value })} rows={6} placeholder="spec:\n  containers:\n    - name: main\n      image: /db/schema/repo/image:latest\n  endpoints:\n    - name: api\n      port: 8080" className="font-mono text-xs" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!canCreate || creating} title={!canCreate ? "You lack the 'create' permission on Intelligence → Container Apps. Ask an administrator to grant it." : undefined}>{creating ? <Loader size="sm" /> : 'Deploy'}</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {error && <ErrorBar error={error} onRetry={load} />}

      <div className="overflow-auto max-h-[480px] rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            <tr><TH>Name</TH><TH>Compute Pool</TH><TH>Status</TH><TH className="text-center">Instances</TH><TH>Created</TH><TH className="text-right">Actions</TH></tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? <SkeletonRows rows={3} cols={6} /> : services.length === 0 ? (
              <EmptyRow cols={6} msg="No services found. Deploy one to get started." />
            ) : servicesPager.visible.map((s) => (
              <tr key={s.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-900 dark:text-gray-200">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{s.compute_pool}</td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-center">{s.min_instances} / {s.max_instances}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{s.created_on ? new Date(s.created_on).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => viewLogs(s)}><PiTerminalWindow className="w-3.5 h-3.5" /> Logs</Button>
                    <PermissionGatedButton
                      module="cortex"
                      action="manage-services"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={!canConfigure || actionBusy === s.name}
                      title={!canConfigure ? "You lack the 'configure' permission on Intelligence → Container Apps. Ask an administrator to grant it." : undefined}
                      onClick={() => handleToggle(s)}
                      deniedReason="Requires the manage-services permission on Intelligence → Container Apps."
                    >
                      {actionBusy === s.name
                        ? <Loader size="sm" />
                        : isSuspended(s) ? <><PiPlay className="w-3.5 h-3.5" /> Resume</> : <><PiPause className="w-3.5 h-3.5" /> Suspend</>}
                    </PermissionGatedButton>
                    <PermissionGatedButton
                      module="cortex"
                      action="manage-services"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={!canConfigure}
                      title={!canConfigure ? "You lack the 'configure' permission on Intelligence → Container Apps. Ask an administrator to grant it." : 'Schedule automatic suspend/drop after a delay (saves credits)'}
                      onClick={() => { setAutoStopForm({ seconds: 3600, mode: 'suspend' }); setAutoStopTarget(s); }}
                      deniedReason="Requires the manage-services permission on Intelligence → Container Apps."
                    >
                      <PiTimer className="w-3.5 h-3.5" /> Auto-stop
                    </PermissionGatedButton>
                    <PermissionGatedButton
                      module="cortex"
                      action="manage-services"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-red-600 hover:text-red-700 dark:text-red-400"
                      disabled={!canDelete}
                      title={!canDelete ? "You lack the 'delete' permission on Intelligence → Container Apps. Ask an administrator to grant it." : undefined}
                      onClick={() => setDropTarget(s)}
                      deniedReason="Requires the manage-services permission on Intelligence → Container Apps."
                    >
                      <PiTrash className="w-3.5 h-3.5" /> Drop
                    </PermissionGatedButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePager page={servicesPager.page} totalPages={servicesPager.totalPages} total={servicesPager.total} onPage={servicesPager.setPage} className="border-t-0" />
      </div>

      {/* Drop service — irreversible, type-to-confirm */}
      <ConfirmDestructiveDialog
        open={!!dropTarget}
        onOpenChange={(open) => { if (!open) setDropTarget(null); }}
        tier="hard"
        title="Drop container service"
        resourceLabel="service"
        resourceName={dropTarget?.name ?? ''}
        body={<>Dropping <span className="font-mono font-semibold">{dropTarget?.name}</span> permanently removes the service and frees all of its compute credits. This cannot be undone.</>}
        irreversibleNote="The running containers are torn down immediately and any in-flight work is lost."
        confirmLabel="Drop service"
        loading={dropping}
        onConfirm={handleDrop}
        onCancel={() => setDropTarget(null)}
      />

      {/* Auto-stop — schedule a delayed suspend or drop */}
      <ConfirmDialog
        open={!!autoStopTarget}
        onOpenChange={(open) => { if (!open) setAutoStopTarget(null); }}
        variant="warning"
        title="Schedule auto-stop"
        confirmLabel="Schedule"
        loading={autoStopBusy}
        onConfirm={handleAutoStop}
        onCancel={() => setAutoStopTarget(null)}
        body={
          <div className="space-y-3">
            <p>
              Automatically {autoStopForm.mode === 'drop' ? 'drop' : 'suspend'}{' '}
              <span className="font-mono font-semibold">{autoStopTarget?.name}</span>{' '}
              after the delay below. Useful for ephemeral or demo workloads so idle credits are never wasted.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Delay (seconds)</label>
                <Input
                  type="number"
                  min={60}
                  value={String(autoStopForm.seconds)}
                  onChange={(e) => setAutoStopForm((f) => ({ ...f, seconds: Math.max(60, parseInt(e.target.value) || 60) }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Action</label>
                <select
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  value={autoStopForm.mode}
                  onChange={(e) => setAutoStopForm((f) => ({ ...f, mode: e.target.value as 'suspend' | 'drop' }))}
                >
                  <option value="suspend">Suspend (resumable)</option>
                  <option value="drop">Drop (irreversible)</option>
                </select>
              </div>
            </div>
          </div>
        }
      />

      {logPanel && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-400 flex items-center gap-2"><PiTerminalWindow className="w-4 h-4" /> Logs: {logPanel.name}</span>
            <Button variant="text" size="sm" className="text-gray-400" onClick={() => setLogPanel(null)}>Close</Button>
          </div>
          {logsLoading ? <Loader size="sm" className="mx-auto" /> : (
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto p-3 bg-black/50 rounded">{logPanel.logs}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Streamlit Apps Sub-Tab ─────────────────────────────────────────────────

function StreamlitAppsPanel() {
  const router = useRouter();
  const [apps, setApps] = useState<StreamlitApp[]>([]);
  const appsPager = usePagedRows(apps, 25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', database: '', schema: 'PUBLIC', main_file: 'streamlit_app.py', warehouse: 'COMPUTE_WH' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await listStreamlitApps(); setApps(r.apps || []); }
    catch (e: any) { setError(toMessage(e, 'Failed to load')); setApps([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cross-user real-time: refresh when another user creates a data app and the
  // backend broadcasts the SNOWPARK_SERVICES cache-key invalidation.
  useCacheInvalidation({
    onInvalidate: (keys) => { if (keys.includes(CACHE_KEYS.SNOWPARK_SERVICES)) load(); },
  });

  const handleCreate = async () => {
    if (!form.name || !form.database) { toast.error('Name and database required'); return; }
    setCreating(true);
    try {
      await createStreamlitApp(form);
      toast.success(`Data app ${form.name} created`);
      setShowCreate(false); load();
    } catch (e: any) { toast.error(toMessage(e, 'Create failed')); }
    finally { setCreating(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <KPIBadge label="Total Apps" value={loading ? '—' : apps.length} />
        </div>
        <div className="flex gap-2">
          <RefreshBtn loading={loading} onClick={() => load()} />
          {/* AI-guided app builder. Lives HERE (Container Apps → Data Apps),
              not as a top-level "Deploy App" menu module — app hosting
              + versioning belong with container services. */}
          <PermissionGatedButton
            module="cortex"
            action="manage-streamlit"
            size="sm"
            variant="outline"
            className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300"
            onClick={() => router.push('/deploy-app')}
            deniedReason="Requires the manage-streamlit permission on Intelligence → Container Apps."
          >
            <PiSparkle className="w-4 h-4" /> Build with AI
          </PermissionGatedButton>
          <PermissionGatedButton
            module="cortex"
            action="manage-streamlit"
            size="sm"
            className="gap-1"
            onClick={() => setShowCreate(!showCreate)}
            deniedReason="Requires the manage-streamlit permission on Intelligence → Container Apps."
          >
            <PiPlus className="w-4 h-4" /> Create App
          </PermissionGatedButton>
        </div>
      </div>

      {showCreate && (
        <div className="p-4 border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-900/20 rounded-lg space-y-3">
          <h4 className="font-medium text-gray-900 dark:text-white">Create Data App</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input label="App Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="MY_APP" />
            <Input label="Database" value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} placeholder="MY_DB" />
            <Input label="Schema" value={form.schema} onChange={(e) => setForm({ ...form, schema: e.target.value })} />
            <Input label="Main File" value={form.main_file} onChange={(e) => setForm({ ...form, main_file: e.target.value })} />
            <Input label="Warehouse" value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating}>{creating ? <Loader size="sm" /> : 'Create'}</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {error && <ErrorBar error={error} onRetry={load} />}

      <div className="overflow-auto max-h-[480px] rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            <tr><TH>Name</TH><TH>Database</TH><TH>Schema</TH><TH>Main File</TH><TH>Warehouse</TH><TH>Created</TH><TH className="text-right">Actions</TH></tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? <SkeletonRows rows={3} cols={7} /> : apps.length === 0 ? (
              <EmptyRow cols={7} msg="No data apps found. Create one to get started." />
            ) : appsPager.visible.map((a) => (
              <tr key={a.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-900 dark:text-gray-200">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3">{a.database_name}</td>
                <td className="px-4 py-3">{a.schema_name}</td>
                <td className="px-4 py-3 font-mono text-xs">{a.main_file || 'streamlit_app.py'}</td>
                <td className="px-4 py-3">{a.query_warehouse}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{a.created_on ? new Date(a.created_on).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {a.url_id && (
                    <a href={`https://app.snowflake.com/streamlit/${a.url_id}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1"><PiArrowSquareOut className="w-3.5 h-3.5" /> Open</Button>
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePager page={appsPager.page} totalPages={appsPager.totalPages} total={appsPager.total} onPage={appsPager.setPage} className="border-t-0" />
      </div>
    </div>
  );
}

// ── Image Repositories Sub-Tab ─────────────────────────────────────────────

function ImageReposPanel() {
  const [repos, setRepos] = useState<ImageRepo[]>([]);
  const reposPager = usePagedRows(repos, 25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await listImageRepos(); setRepos(r.repositories || []); }
    catch (e: any) { setError(toMessage(e, 'Failed to load')); setRepos([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cross-user real-time: refresh when an image repository is created elsewhere
  // and the backend broadcasts the SNOWPARK_SERVICES cache-key invalidation.
  useCacheInvalidation({
    onInvalidate: (keys) => { if (keys.includes(CACHE_KEYS.SNOWPARK_SERVICES)) load(); },
  });

  const copyCmd = (url: string) => {
    navigator.clipboard.writeText(`docker push ${url}/<image>:<tag>`);
    toast.success('Docker push command copied');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <KPIBadge label="Repositories" value={loading ? '—' : repos.length} />
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} aria-label="Refresh"><PiArrowsClockwise className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
      </div>

      {error && <ErrorBar error={error} onRetry={load} />}

      <div className="overflow-auto max-h-[480px] rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            <tr><TH>Name</TH><TH>Database</TH><TH>Schema</TH><TH>Repository URL</TH><TH>Owner</TH><TH>Created</TH><TH className="text-right">Actions</TH></tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? <SkeletonRows rows={3} cols={7} /> : repos.length === 0 ? (
              <EmptyRow cols={7} msg="No image repositories found." />
            ) : reposPager.visible.map((r) => (
              <tr key={r.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-900 dark:text-gray-200">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.database_name}</td>
                <td className="px-4 py-3">{r.schema_name}</td>
                <td className="px-4 py-3 font-mono text-xs max-w-xs truncate">{r.repository_url}</td>
                <td className="px-4 py-3">{r.owner}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.created_on ? new Date(r.created_on).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {r.repository_url && (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => copyCmd(r.repository_url)}>
                      <PiCopy className="w-3.5 h-3.5" /> Push Cmd
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePager page={reposPager.page} totalPages={reposPager.totalPages} total={reposPager.total} onPage={reposPager.setPage} className="border-t-0" />
      </div>

      {repos.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <strong>Push images:</strong> <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded">docker login &lt;repo_url&gt;</code> then <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded">docker push &lt;repo_url&gt;/&lt;image&gt;:&lt;tag&gt;</code>
        </p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SnowparkServicesContent() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('compute-pools');

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'compute-pools' && <ComputePoolsPanel />}
      {activeSubTab === 'services' && <ContainerServicesPanel />}
      {activeSubTab === 'streamlit' && <StreamlitAppsPanel />}
      {activeSubTab === 'image-repos' && <ImageReposPanel />}
    </div>
  );
}
