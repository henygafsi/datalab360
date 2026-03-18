'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Input, Button, Checkbox, Text, Badge, Loader, Tooltip } from 'rizzui';
import { Database, Layers, Server, HardDrive, Plus, Trash2, RefreshCw, Play, Pause, Copy, Settings, X, AlertTriangle, RotateCw, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const _errMsg = (e: any) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : d?.message || e?.message || 'Unknown error'; };
import {
  listProvisionedDatabases,
  createDatabase,
  alterDatabase,
  dropDatabase,
  listSchemasInDb,
  createSchema,
  dropSchema,
  cloneSchema,
  listWarehouses,
  createWarehouse,
  alterWarehouse,
  resumeWarehouse,
  suspendWarehouse,
  dropWarehouse,
  listStorageIntegrations,
  dropStorageIntegration,
  listPostgresInstances,
  createPostgresInstance,
  dropPostgresInstance,
} from './connectionServices';

type ProvisionTab = 'databases' | 'warehouses' | 'integrations' | 'postgres';
type CreateModal = 'database' | 'schema' | 'warehouse' | 'clone-schema' | 'postgres' | null;

function StatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase() || '';
  if (['STARTED', 'RUNNING', 'ACTIVE', 'RESUMED'].includes(s))
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-300 dark:border-green-700">{status}</Badge>;
  if (['SUSPENDED', 'PAUSED', 'STOPPED'].includes(s))
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700">{status}</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600">{status || 'N/A'}</Badge>;
}

const tableWrap = 'overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700';
const tbl = 'w-full text-sm';
const thead = 'bg-slate-50 dark:bg-slate-800/80';
const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400';
const td = 'px-4 py-3 text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800';
const trH = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';
const formCard = "mx-auto w-full max-w-lg rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-8 shadow-xl border border-slate-200/50 dark:border-slate-700/50";

export default function ProvisioningTab() {
  const [activeTab, setActiveTab] = useState<ProvisionTab>('databases');
  const [createModal, setCreateModal] = useState<CreateModal>(null);
  const [loading, setLoading] = useState(false);

  // --- Data ---
  const [databases, setDatabases] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [pgInstances, setPgInstances] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [expandedDb, setExpandedDb] = useState<string | null>(null);
  const [schemasMap, setSchemasMap] = useState<Record<string, any[]>>({});
  const [schemasLoading, setSchemasLoading] = useState<Record<string, boolean>>({});

  // --- Forms ---
  const [dbForm, setDbForm] = useState({ database_name: '', comment: '', data_retention_time_in_days: 1, transient: false });
  const [schemaForm, setSchemaForm] = useState({ database_name: '', schema_name: '', comment: '', transient: false, data_retention_time_in_days: 1 });
  const [whForm, setWhForm] = useState({ warehouse_name: '', warehouse_size: 'XSMALL', auto_suspend: 60, auto_resume: true, min_cluster_count: 1, max_cluster_count: 1, scaling_policy: 'STANDARD', comment: '' });
  const [cloneForm, setCloneForm] = useState({ source_database: '', source_schema: '', target_database: '', target_schema: '' });
  const [pgForm, setPgForm] = useState({ instance_name: '', compute_family: 'STANDARD_1', storage_size_gb: 10, postgres_version: 16, high_availability: false });

  const fetchDatabases = useCallback(async () => {
    setDataLoading(true);
    try { const r = await listProvisionedDatabases(); setDatabases(Array.isArray(r?.databases) ? r.databases : []); } catch (e: any) { console.warn(e); } finally { setDataLoading(false); }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    setDataLoading(true);
    try { const r = await listWarehouses(); setWarehouses(Array.isArray(r?.warehouses) ? r.warehouses : []); } catch (e: any) { console.warn(e); } finally { setDataLoading(false); }
  }, []);

  const fetchIntegrations = useCallback(async () => {
    setDataLoading(true);
    try { const r = await listStorageIntegrations(); setIntegrations(Array.isArray(r?.integrations) ? r.integrations : []); } catch (e: any) { console.warn(e); } finally { setDataLoading(false); }
  }, []);

  const fetchPgInstances = useCallback(async () => {
    setDataLoading(true);
    try { const r = await listPostgresInstances(); setPgInstances(Array.isArray(r?.instances) ? r.instances : []); } catch (e: any) { console.warn(e); } finally { setDataLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'databases') fetchDatabases();
    else if (activeTab === 'warehouses') fetchWarehouses();
    else if (activeTab === 'integrations') fetchIntegrations();
    else if (activeTab === 'postgres') fetchPgInstances();
  }, [activeTab, fetchDatabases, fetchWarehouses, fetchIntegrations, fetchPgInstances]);

  const handleExpandDb = async (dbName: string) => {
    if (expandedDb === dbName) { setExpandedDb(null); return; }
    setExpandedDb(dbName);
    if (!schemasMap[dbName]) {
      setSchemasLoading(p => ({ ...p, [dbName]: true }));
      try {
        const r = await listSchemasInDb(dbName);
        setSchemasMap(p => ({ ...p, [dbName]: Array.isArray(r?.schemas) ? r.schemas : [] }));
      } catch { setSchemasMap(p => ({ ...p, [dbName]: [] })); }
      finally { setSchemasLoading(p => ({ ...p, [dbName]: false })); }
    }
  };

  const handleCreateDb = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await createDatabase(dbForm);
      toast.success(`Database "${dbForm.database_name}" created`);
      setCreateModal(null); setDbForm({ database_name: '', comment: '', data_retention_time_in_days: 1, transient: false });
      fetchDatabases();
    } catch (err: any) { toast.error(_errMsg(err)); }
    finally { setLoading(false); }
  };

  const handleDropDb = async (name: string) => {
    if (!confirm(`Drop database "${name}"? This cannot be undone.`)) return;
    try { await dropDatabase(name); toast.success(`Database "${name}" dropped`); fetchDatabases(); }
    catch (err: any) { toast.error(_errMsg(err)); }
  };

  const handleCreateSchema = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await createSchema(schemaForm);
      toast.success(`Schema "${schemaForm.database_name}.${schemaForm.schema_name}" created`);
      setCreateModal(null); setSchemaForm({ database_name: '', schema_name: '', comment: '', transient: false, data_retention_time_in_days: 1 });
      if (expandedDb === schemaForm.database_name) {
        const r = await listSchemasInDb(schemaForm.database_name);
        setSchemasMap(p => ({ ...p, [schemaForm.database_name]: r.schemas || [] }));
      }
    } catch (err: any) { toast.error(_errMsg(err)); }
    finally { setLoading(false); }
  };

  const handleDropSchema = async (dbName: string, schemaName: string) => {
    if (!confirm(`Drop schema "${dbName}.${schemaName}"?`)) return;
    try { await dropSchema(dbName, schemaName); toast.success(`Schema dropped`); const r = await listSchemasInDb(dbName); setSchemasMap(p => ({ ...p, [dbName]: r.schemas || [] })); }
    catch (err: any) { toast.error(_errMsg(err)); }
  };

  const handleCloneSchema = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await cloneSchema(cloneForm);
      toast.success(`Schema cloned to "${cloneForm.target_database}.${cloneForm.target_schema}"`);
      setCreateModal(null); setCloneForm({ source_database: '', source_schema: '', target_database: '', target_schema: '' });
      fetchDatabases();
    } catch (err: any) { toast.error(_errMsg(err)); }
    finally { setLoading(false); }
  };

  const handleCreateWh = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await createWarehouse(whForm);
      toast.success(`Warehouse "${whForm.warehouse_name}" created`);
      setCreateModal(null); setWhForm({ warehouse_name: '', warehouse_size: 'XSMALL', auto_suspend: 60, auto_resume: true, min_cluster_count: 1, max_cluster_count: 1, scaling_policy: 'STANDARD', comment: '' });
      fetchWarehouses();
    } catch (err: any) { toast.error(_errMsg(err)); }
    finally { setLoading(false); }
  };

  const handleWhAction = async (name: string, action: 'resume' | 'suspend' | 'drop') => {
    if (action === 'drop' && !confirm(`Drop warehouse "${name}"?`)) return;
    try {
      if (action === 'resume') await resumeWarehouse(name);
      else if (action === 'suspend') await suspendWarehouse(name);
      else await dropWarehouse(name);
      toast.success(`Warehouse ${name} ${action}ed`);
      fetchWarehouses();
    } catch (err: any) { toast.error(_errMsg(err)); }
  };

  const handleDropIntegration = async (name: string) => {
    if (!confirm(`Drop integration "${name}"?`)) return;
    try { await dropStorageIntegration(name); toast.success('Integration dropped'); fetchIntegrations(); }
    catch (err: any) { toast.error(_errMsg(err)); }
  };

  const handleCreatePg = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await createPostgresInstance(pgForm);
      toast.success(`Postgres instance "${pgForm.instance_name}" created`);
      setCreateModal(null); setPgForm({ instance_name: '', compute_family: 'STANDARD_1', storage_size_gb: 10, postgres_version: 16, high_availability: false });
      fetchPgInstances();
    } catch (err: any) { toast.error(_errMsg(err)); }
    finally { setLoading(false); }
  };

  const handleDropPg = async (name: string) => {
    if (!confirm(`Drop Postgres instance "${name}"? This destroys all data.`)) return;
    try { await dropPostgresInstance(name); toast.success('Instance dropped'); fetchPgInstances(); }
    catch (err: any) { toast.error(_errMsg(err)); }
  };

  const tabs: { id: ProvisionTab; label: string; icon: React.ReactNode }[] = [
    { id: 'databases', label: 'Databases & Schemas', icon: <Database className="h-4 w-4" /> },
    { id: 'warehouses', label: 'Warehouses', icon: <Server className="h-4 w-4" /> },
    { id: 'integrations', label: 'Storage Integrations', icon: <HardDrive className="h-4 w-4" /> },
    { id: 'postgres', label: 'Postgres Instances', icon: <Layers className="h-4 w-4" /> },
  ];

  const whSizes = ['XSMALL', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE', '2XLARGE', '3XLARGE', '4XLARGE', '5XLARGE', '6XLARGE'];
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Sub-tabs + Create buttons */}
      <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setCreateModal(null); }}
                className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${activeTab === tab.id ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 py-2">
            {activeTab === 'databases' && (
              <>
                <Button size="sm" onClick={() => setCreateModal('database')} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-3.5 w-3.5 mr-1" />Database</Button>
                <Button size="sm" onClick={() => setCreateModal('schema')} variant="outline" className="border-slate-300 dark:border-slate-600"><Plus className="h-3.5 w-3.5 mr-1" />Schema</Button>
                <Button size="sm" onClick={() => setCreateModal('clone-schema')} variant="outline" className="border-slate-300 dark:border-slate-600"><Copy className="h-3.5 w-3.5 mr-1" />Clone</Button>
              </>
            )}
            {activeTab === 'warehouses' && (
              <Button size="sm" onClick={() => setCreateModal('warehouse')} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-3.5 w-3.5 mr-1" />Warehouse</Button>
            )}
            {activeTab === 'postgres' && (
              <Button size="sm" onClick={() => setCreateModal('postgres')} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-3.5 w-3.5 mr-1" />Instance</Button>
            )}
          </div>
        </div>

        {/* Create Forms */}
        {createModal && (
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
            {createModal === 'database' && (
              <div className={formCard}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Database</h3>
                  <button onClick={() => setCreateModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
                </div>
                <form className="space-y-4" onSubmit={handleCreateDb}>
                  <Input label="Database Name" placeholder="e.g., ANALYTICS_DB" value={dbForm.database_name} onChange={(e) => setDbForm(p => ({ ...p, database_name: e.target.value }))} required disabled={loading} className="w-full" />
                  <Input label="Comment (optional)" placeholder="Purpose of this database" value={dbForm.comment} onChange={(e) => setDbForm(p => ({ ...p, comment: e.target.value }))} disabled={loading} className="w-full" />
                  <Input label="Data Retention (days)" type="number" value={String(dbForm.data_retention_time_in_days)} onChange={(e) => setDbForm(p => ({ ...p, data_retention_time_in_days: parseInt(e.target.value) || 0 }))} disabled={loading} className="w-full" />
                  <Checkbox label="Transient (no Fail-safe — lower cost)" checked={dbForm.transient} onChange={(e) => setDbForm(p => ({ ...p, transient: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" disabled={loading}>{loading ? 'Creating...' : 'Create Database'}</Button>
                </form>
              </div>
            )}

            {createModal === 'schema' && (
              <div className={formCard}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Schema</h3>
                  <button onClick={() => setCreateModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
                </div>
                <form className="space-y-4" onSubmit={handleCreateSchema}>
                  <Input label="Database Name" placeholder="e.g., ANALYTICS_DB" value={schemaForm.database_name} onChange={(e) => setSchemaForm(p => ({ ...p, database_name: e.target.value }))} required disabled={loading} className="w-full" />
                  <Input label="Schema Name" placeholder="e.g., RAW_ZONE" value={schemaForm.schema_name} onChange={(e) => setSchemaForm(p => ({ ...p, schema_name: e.target.value }))} required disabled={loading} className="w-full" />
                  <Input label="Comment (optional)" value={schemaForm.comment} onChange={(e) => setSchemaForm(p => ({ ...p, comment: e.target.value }))} disabled={loading} className="w-full" />
                  <Checkbox label="Transient schema" checked={schemaForm.transient} onChange={(e) => setSchemaForm(p => ({ ...p, transient: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" disabled={loading}>{loading ? 'Creating...' : 'Create Schema'}</Button>
                </form>
              </div>
            )}

            {createModal === 'clone-schema' && (
              <div className={formCard}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Clone Schema (Zero-Copy)</h3>
                  <button onClick={() => setCreateModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
                </div>
                <form className="space-y-4" onSubmit={handleCloneSchema}>
                  <Input label="Source Database" placeholder="e.g., PRODUCTION_DB" value={cloneForm.source_database} onChange={(e) => setCloneForm(p => ({ ...p, source_database: e.target.value }))} required disabled={loading} className="w-full" />
                  <Input label="Source Schema" placeholder="e.g., DWH" value={cloneForm.source_schema} onChange={(e) => setCloneForm(p => ({ ...p, source_schema: e.target.value }))} required disabled={loading} className="w-full" />
                  <Input label="Target Database" placeholder="e.g., DEV_DB" value={cloneForm.target_database} onChange={(e) => setCloneForm(p => ({ ...p, target_database: e.target.value }))} required disabled={loading} className="w-full" />
                  <Input label="Target Schema" placeholder="e.g., DWH_CLONE" value={cloneForm.target_schema} onChange={(e) => setCloneForm(p => ({ ...p, target_schema: e.target.value }))} required disabled={loading} className="w-full" />
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                    <p className="text-xs text-blue-700 dark:text-blue-400">Zero-copy clone: instant, no extra storage cost until data diverges.</p>
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700" disabled={loading}>{loading ? 'Cloning...' : 'Clone Schema'}</Button>
                </form>
              </div>
            )}

            {createModal === 'warehouse' && (
              <div className={formCard}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Warehouse</h3>
                  <button onClick={() => setCreateModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
                </div>
                <form className="space-y-4" onSubmit={handleCreateWh}>
                  <Input label="Warehouse Name" placeholder="e.g., ETL_WH" value={whForm.warehouse_name} onChange={(e) => setWhForm(p => ({ ...p, warehouse_name: e.target.value }))} required disabled={loading} className="w-full" />
                  <div>
                    <label className={labelClass}>Warehouse Size</label>
                    <select value={whForm.warehouse_size} onChange={(e) => setWhForm(p => ({ ...p, warehouse_size: e.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" disabled={loading}>
                      {whSizes.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <Input label="Auto Suspend (seconds)" type="number" value={String(whForm.auto_suspend)} onChange={(e) => setWhForm(p => ({ ...p, auto_suspend: parseInt(e.target.value) || 0 }))} disabled={loading} className="w-full" />
                  <Checkbox label="Auto Resume on query" checked={whForm.auto_resume} onChange={(e) => setWhForm(p => ({ ...p, auto_resume: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Min Clusters" type="number" value={String(whForm.min_cluster_count)} onChange={(e) => setWhForm(p => ({ ...p, min_cluster_count: parseInt(e.target.value) || 1 }))} disabled={loading} className="w-full" />
                    <Input label="Max Clusters" type="number" value={String(whForm.max_cluster_count)} onChange={(e) => setWhForm(p => ({ ...p, max_cluster_count: parseInt(e.target.value) || 1 }))} disabled={loading} className="w-full" />
                  </div>
                  <div>
                    <label className={labelClass}>Scaling Policy</label>
                    <select value={whForm.scaling_policy} onChange={(e) => setWhForm(p => ({ ...p, scaling_policy: e.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" disabled={loading}>
                      <option value="STANDARD">STANDARD</option>
                      <option value="ECONOMY">ECONOMY</option>
                    </select>
                  </div>
                  <Input label="Comment (optional)" value={whForm.comment} onChange={(e) => setWhForm(p => ({ ...p, comment: e.target.value }))} disabled={loading} className="w-full" />
                  <Button type="submit" className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700" disabled={loading}>{loading ? 'Creating...' : 'Create Warehouse'}</Button>
                </form>
              </div>
            )}

            {createModal === 'postgres' && (
              <div className={formCard}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Postgres Instance</h3>
                  <button onClick={() => setCreateModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
                </div>
                <form className="space-y-4" onSubmit={handleCreatePg}>
                  <Input label="Instance Name" placeholder="e.g., my_pg_instance" value={pgForm.instance_name} onChange={(e) => setPgForm(p => ({ ...p, instance_name: e.target.value }))} required disabled={loading} className="w-full" />
                  <div>
                    <label className={labelClass}>Compute Family</label>
                    <select value={pgForm.compute_family} onChange={(e) => setPgForm(p => ({ ...p, compute_family: e.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" disabled={loading}>
                      <option value="STANDARD_1">STANDARD_1 (Small)</option>
                      <option value="STANDARD_2">STANDARD_2 (Medium)</option>
                    </select>
                  </div>
                  <Input label="Storage Size (GB)" type="number" value={String(pgForm.storage_size_gb)} onChange={(e) => setPgForm(p => ({ ...p, storage_size_gb: parseInt(e.target.value) || 10 }))} disabled={loading} className="w-full" />
                  <div>
                    <label className={labelClass}>PostgreSQL Version</label>
                    <select value={pgForm.postgres_version} onChange={(e) => setPgForm(p => ({ ...p, postgres_version: parseInt(e.target.value) }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" disabled={loading}>
                      <option value={16}>PostgreSQL 16</option>
                      <option value={17}>PostgreSQL 17</option>
                      <option value={18}>PostgreSQL 18</option>
                    </select>
                  </div>
                  <Checkbox label="High Availability" checked={pgForm.high_availability} onChange={(e) => setPgForm(p => ({ ...p, high_availability: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                    <p className="text-xs text-blue-700 dark:text-blue-400">Snowflake-managed PostgreSQL instance. Connect from external apps using generated access tokens.</p>
                  </div>
                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700" disabled={loading}>{loading ? 'Creating...' : 'Create Postgres Instance'}</Button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Data Tables */}
        <div className="p-6">
          {dataLoading ? (
            <div className="flex justify-center py-16"><Loader size="lg" /></div>
          ) : (
            <>
              {/* Databases & Schemas */}
              {activeTab === 'databases' && (
                databases.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 dark:text-slate-400">No databases found. Create one to get started.</div>
                ) : (
                  <div className={tableWrap}>
                    <table className={tbl}>
                      <thead className={thead}>
                        <tr>
                          <th className={th}></th>
                          <th className={th}>Database</th>
                          <th className={th}>Owner</th>
                          <th className={th}>Origin</th>
                          <th className={th}>Retention (days)</th>
                          <th className={th}>Created</th>
                          <th className={th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {databases.map((db) => {
                          const name = db.name || db.database_name || '';
                          const isExpanded = expandedDb === name;
                          return (
                            <>
                              <tr key={name} className={`${trH} cursor-pointer`} onClick={() => handleExpandDb(name)}>
                                <td className={td}><ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                                <td className={`${td} font-medium text-slate-900 dark:text-white`}>{name}</td>
                                <td className={td}>{db.owner || '-'}</td>
                                <td className={td}>{db.origin || '-'}</td>
                                <td className={td}>{db.retention_time ?? '-'}</td>
                                <td className={td}><span className="text-xs text-slate-500 dark:text-slate-400">{db.created_on ? new Date(db.created_on).toLocaleDateString() : '-'}</span></td>
                                <td className={td}>
                                  <Tooltip content="Drop database">
                                    <Button size="sm" variant="outline" className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 p-1.5"
                                      onClick={(e) => { e.stopPropagation(); handleDropDb(name); }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </Tooltip>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${name}_schemas`}>
                                  <td colSpan={7} className="px-8 py-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                                    {schemasLoading[name] ? (
                                      <div className="flex justify-center py-4"><Loader size="sm" /></div>
                                    ) : schemasMap[name]?.length === 0 ? (
                                      <p className="text-sm text-slate-500 dark:text-slate-400">No schemas in this database.</p>
                                    ) : (
                                      <div className="space-y-2">
                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Schemas in {name}</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                          {schemasMap[name]?.map((s: any) => (
                                            <div key={s.name || s.schema_name} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                              <div className="flex items-center gap-2">
                                                <Layers className="h-3.5 w-3.5 text-blue-500" />
                                                <span className="text-sm text-slate-900 dark:text-white">{s.name || s.schema_name}</span>
                                              </div>
                                              <button onClick={() => handleDropSchema(name, s.name || s.schema_name)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
                                                <Trash2 className="h-3 w-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* Warehouses */}
              {activeTab === 'warehouses' && (
                warehouses.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 dark:text-slate-400">No warehouses found.</div>
                ) : (
                  <div className={tableWrap}>
                    <table className={tbl}>
                      <thead className={thead}>
                        <tr>
                          <th className={th}>Name</th>
                          <th className={th}>Size</th>
                          <th className={th}>State</th>
                          <th className={th}>Clusters</th>
                          <th className={th}>Auto Suspend</th>
                          <th className={th}>Owner</th>
                          <th className={th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warehouses.map((wh) => (
                          <tr key={wh.name} className={trH}>
                            <td className={`${td} font-medium text-slate-900 dark:text-white`}>{wh.name}</td>
                            <td className={td}><Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-300 dark:border-blue-700">{wh.size || '-'}</Badge></td>
                            <td className={td}><StatusBadge status={wh.state || wh.status || ''} /></td>
                            <td className={td}><span className="font-mono text-sm">{wh.min_cluster_count || 1}-{wh.max_cluster_count || 1}</span></td>
                            <td className={td}>{wh.auto_suspend ? `${wh.auto_suspend}s` : '-'}</td>
                            <td className={td}>{wh.owner || '-'}</td>
                            <td className={td}>
                              <div className="flex items-center space-x-1">
                                <Tooltip content="Resume"><Button size="sm" variant="outline" className="border-green-300 text-green-600 dark:border-green-700 dark:text-green-400 p-1.5" onClick={() => handleWhAction(wh.name, 'resume')}><Play className="h-3.5 w-3.5" /></Button></Tooltip>
                                <Tooltip content="Suspend"><Button size="sm" variant="outline" className="border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400 p-1.5" onClick={() => handleWhAction(wh.name, 'suspend')}><Pause className="h-3.5 w-3.5" /></Button></Tooltip>
                                <Tooltip content="Drop"><Button size="sm" variant="outline" className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 p-1.5" onClick={() => handleWhAction(wh.name, 'drop')}><Trash2 className="h-3.5 w-3.5" /></Button></Tooltip>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* Storage Integrations */}
              {activeTab === 'integrations' && (
                integrations.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 dark:text-slate-400">No storage integrations found.</div>
                ) : (
                  <div className={tableWrap}>
                    <table className={tbl}>
                      <thead className={thead}>
                        <tr>
                          <th className={th}>Name</th>
                          <th className={th}>Type</th>
                          <th className={th}>Category</th>
                          <th className={th}>Enabled</th>
                          <th className={th}>Created</th>
                          <th className={th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {integrations.map((integ) => (
                          <tr key={integ.name} className={trH}>
                            <td className={`${td} font-medium text-slate-900 dark:text-white`}>{integ.name}</td>
                            <td className={td}>{integ.type || '-'}</td>
                            <td className={td}>{integ.category || '-'}</td>
                            <td className={td}>
                              <Badge className={`${integ.enabled === 'true' || integ.enabled === true ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700'} border`}>
                                {integ.enabled === 'true' || integ.enabled === true ? 'Yes' : 'No'}
                              </Badge>
                            </td>
                            <td className={td}><span className="text-xs text-slate-500 dark:text-slate-400">{integ.created_on ? new Date(integ.created_on).toLocaleDateString() : '-'}</span></td>
                            <td className={td}>
                              <Tooltip content="Drop integration">
                                <Button size="sm" variant="outline" className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 p-1.5" onClick={() => handleDropIntegration(integ.name)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </Tooltip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* Postgres Instances */}
              {activeTab === 'postgres' && (
                pgInstances.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <div className="flex justify-center"><Layers className="h-12 w-12 text-slate-300 dark:text-slate-600" /></div>
                    <p className="text-slate-500 dark:text-slate-400">No Snowflake-managed Postgres instances.</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Create one to get a fully managed PostgreSQL database backed by Snowflake.</p>
                  </div>
                ) : (
                  <div className={tableWrap}>
                    <table className={tbl}>
                      <thead className={thead}>
                        <tr>
                          <th className={th}>Name</th>
                          <th className={th}>Status</th>
                          <th className={th}>Version</th>
                          <th className={th}>Compute</th>
                          <th className={th}>Storage</th>
                          <th className={th}>Created</th>
                          <th className={th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pgInstances.map((inst: any) => (
                          <tr key={inst.name || inst.instance_name} className={trH}>
                            <td className={`${td} font-medium text-slate-900 dark:text-white`}>{inst.name || inst.instance_name}</td>
                            <td className={td}><StatusBadge status={inst.status || inst.state || ''} /></td>
                            <td className={td}>{inst.postgres_version || inst.version || '-'}</td>
                            <td className={td}>{inst.compute_family || '-'}</td>
                            <td className={td}>{inst.storage_size_gb ? `${inst.storage_size_gb} GB` : '-'}</td>
                            <td className={td}><span className="text-xs text-slate-500 dark:text-slate-400">{inst.created_on ? new Date(inst.created_on).toLocaleDateString() : '-'}</span></td>
                            <td className={td}>
                              <Tooltip content="Drop instance">
                                <Button size="sm" variant="outline" className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 p-1.5" onClick={() => handleDropPg(inst.name || inst.instance_name)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </Tooltip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
