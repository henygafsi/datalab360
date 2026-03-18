'use client';

import { useState, useCallback, FormEvent } from 'react';
import { Input, Button, Checkbox, Badge, Loader, Tooltip, Password } from 'rizzui';
import { Server, Database, Layers, Cpu, Plus, Trash2, Play, Pause, X, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const _errMsg = (e: any) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : d?.message || e?.message || 'Unknown error'; };
import {
  dbxCheckStatus, dbxListSqlWarehouses, dbxCreateSqlWarehouse, dbxStartSqlWarehouse, dbxStopSqlWarehouse, dbxDeleteSqlWarehouse,
  dbxListCatalogs, dbxCreateCatalog, dbxDeleteCatalog,
  dbxListSchemas, dbxCreateSchema, dbxDeleteSchema,
  dbxListClusters, dbxCreateCluster, dbxStartCluster, dbxTerminateCluster,
  type DbxCreds,
} from './connectionServices';

type DbxTab = 'sql-warehouses' | 'catalogs' | 'clusters';
type CreateForm = 'sql-warehouse' | 'catalog' | 'schema' | 'cluster' | null;

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  if (['RUNNING', 'STARTED', 'ACTIVE'].includes(s))
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-300 dark:border-green-700">{status}</Badge>;
  if (['STOPPED', 'TERMINATED', 'STOPPING', 'TERMINATING', 'DELETED', 'DELETING'].includes(s))
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-300 dark:border-red-700">{status}</Badge>;
  if (['STARTING', 'PENDING', 'RESIZING', 'RESTARTING'].includes(s))
    return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700">{status}</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600">{status || 'N/A'}</Badge>;
}

const tw = 'overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700';
const tbl = 'w-full text-sm';
const thd = 'bg-slate-50 dark:bg-slate-800/80';
const thc = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400';
const tdc = 'px-4 py-3 text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800';
const trh = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors';
const fc = "mx-auto w-full max-w-lg rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-8 shadow-xl border border-slate-200/50 dark:border-slate-700/50";
const lbl = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

export default function DatabricksProvisionTab() {
  // Credentials
  const [creds, setCreds] = useState<DbxCreds>({ host: '', token: '' });
  const [connected, setConnected] = useState(false);
  const [userName, setUserName] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Data
  const [activeTab, setActiveTab] = useState<DbxTab>('sql-warehouses');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(null);

  // Expanded catalog schemas
  const [expandedCatalog, setExpandedCatalog] = useState<string | null>(null);
  const [schemasMap, setSchemasMap] = useState<Record<string, any[]>>({});
  const [schemasLoading, setSchemasLoading] = useState<Record<string, boolean>>({});

  // Forms
  const [whForm, setWhForm] = useState({ name: '', cluster_size: '2X-Small', min_num_clusters: 1, max_num_clusters: 1, auto_stop_mins: 10, warehouse_type: 'PRO', enable_serverless: false });
  const [catForm, setCatForm] = useState({ name: '', comment: '' });
  const [schForm, setSchForm] = useState({ catalog_name: '', name: '', comment: '' });
  const [clForm, setClForm] = useState({ cluster_name: '', spark_version: '14.3.x-scala2.12', node_type_id: 'Standard_DS3_v2', num_workers: 1, autotermination_minutes: 30 });

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault(); setConnecting(true);
    try {
      const r = await dbxCheckStatus(creds);
      setConnected(true); setUserName(r.user);
      toast.success(`Connected as ${r.user}`);
      loadTab('sql-warehouses');
    } catch (err: any) { toast.error(_errMsg(err)); }
    finally { setConnecting(false); }
  };

  const loadTab = useCallback(async (tab: DbxTab) => {
    if (!connected) return;
    setLoading(true);
    try {
      if (tab === 'sql-warehouses') { const r = await dbxListSqlWarehouses(creds); setWarehouses(Array.isArray(r?.warehouses) ? r.warehouses : []); }
      else if (tab === 'catalogs') { const r = await dbxListCatalogs(creds); setCatalogs(Array.isArray(r?.catalogs) ? r.catalogs : []); }
      else if (tab === 'clusters') { const r = await dbxListClusters(creds); setClusters(Array.isArray(r?.clusters) ? r.clusters : []); }
    } catch (err: any) { console.warn(err); }
    finally { setLoading(false); }
  }, [connected, creds]);

  const handleTabChange = (tab: DbxTab) => { setActiveTab(tab); setCreateForm(null); loadTab(tab); };

  const handleExpandCatalog = async (catName: string) => {
    if (expandedCatalog === catName) { setExpandedCatalog(null); return; }
    setExpandedCatalog(catName);
    if (!schemasMap[catName]) {
      setSchemasLoading(p => ({ ...p, [catName]: true }));
      try { const r = await dbxListSchemas(creds, catName); setSchemasMap(p => ({ ...p, [catName]: r.schemas || [] })); }
      catch { setSchemasMap(p => ({ ...p, [catName]: [] })); }
      finally { setSchemasLoading(p => ({ ...p, [catName]: false })); }
    }
  };

  // --- Create handlers ---
  const handleCreateWh = async (e: FormEvent) => {
    e.preventDefault(); setFormLoading(true);
    try { await dbxCreateSqlWarehouse({ ...creds, ...whForm }); toast.success(`SQL warehouse "${whForm.name}" created`); setCreateForm(null); loadTab('sql-warehouses'); }
    catch (err: any) { toast.error(_errMsg(err)); }
    finally { setFormLoading(false); }
  };

  const handleCreateCat = async (e: FormEvent) => {
    e.preventDefault(); setFormLoading(true);
    try { await dbxCreateCatalog({ ...creds, ...catForm }); toast.success(`Catalog "${catForm.name}" created`); setCreateForm(null); loadTab('catalogs'); }
    catch (err: any) { toast.error(_errMsg(err)); }
    finally { setFormLoading(false); }
  };

  const handleCreateSch = async (e: FormEvent) => {
    e.preventDefault(); setFormLoading(true);
    try { await dbxCreateSchema({ ...creds, ...schForm }); toast.success(`Schema "${schForm.catalog_name}.${schForm.name}" created`); setCreateForm(null); if (expandedCatalog === schForm.catalog_name) { const r = await dbxListSchemas(creds, schForm.catalog_name); setSchemasMap(p => ({ ...p, [schForm.catalog_name]: r.schemas || [] })); } }
    catch (err: any) { toast.error(_errMsg(err)); }
    finally { setFormLoading(false); }
  };

  const handleCreateCluster = async (e: FormEvent) => {
    e.preventDefault(); setFormLoading(true);
    try { await dbxCreateCluster({ ...creds, ...clForm }); toast.success(`Cluster "${clForm.cluster_name}" created`); setCreateForm(null); loadTab('clusters'); }
    catch (err: any) { toast.error(_errMsg(err)); }
    finally { setFormLoading(false); }
  };

  // Not connected yet — show credentials form
  if (!connected) {
    return (
      <div className="animate-fade-in-up flex justify-center py-8">
        <div className={fc}>
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30"><Cpu className="h-6 w-6 text-orange-600 dark:text-orange-400" /></div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Connect to Databricks</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Enter workspace credentials to manage resources</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleConnect}>
            <Input label="Workspace Host" placeholder="e.g., adb-7474646015732205.azuredatabricks.net" helperText="Your Databricks workspace URL (without https://)" value={creds.host} onChange={(e) => setCreds(p => ({ ...p, host: e.target.value }))} required disabled={connecting} className="w-full" />
            <Password label="Access Token" placeholder="dapi..." helperText="Personal access token or OAuth token" value={creds.token} onChange={(e) => setCreds(p => ({ ...p, token: e.target.value }))} required disabled={connecting} className="w-full" />
            <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect to Workspace'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: { id: DbxTab; label: string; icon: React.ReactNode }[] = [
    { id: 'sql-warehouses', label: 'SQL Warehouses', icon: <Server className="h-4 w-4" /> },
    { id: 'catalogs', label: 'Unity Catalog', icon: <Database className="h-4 w-4" /> },
    { id: 'clusters', label: 'Clusters', icon: <Cpu className="h-4 w-4" /> },
  ];

  const whSizes = ['2X-Small', 'X-Small', 'Small', 'Medium', 'Large', 'X-Large', '2X-Large', '3X-Large', '4X-Large'];

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Connection status */}
      <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/20 rounded-xl px-5 py-3 border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-3">
          <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-800 dark:text-green-300">Connected to <strong>{creds.host}</strong> as <strong>{userName}</strong></span>
        </div>
        <Button size="sm" variant="outline" className="border-green-300 dark:border-green-700 text-green-700 dark:text-green-400" onClick={() => { setConnected(false); setUserName(''); }}>Disconnect</Button>
      </div>

      {/* Tabs + create buttons */}
      <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${activeTab === tab.id ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 py-2">
            <Button size="sm" variant="outline" className="border-slate-300 dark:border-slate-600" onClick={() => loadTab(activeTab)}><RefreshCw className="h-3.5 w-3.5" /></Button>
            {activeTab === 'sql-warehouses' && <Button size="sm" onClick={() => setCreateForm('sql-warehouse')} className="bg-orange-600 hover:bg-orange-700 text-white"><Plus className="h-3.5 w-3.5 mr-1" />Warehouse</Button>}
            {activeTab === 'catalogs' && (
              <>
                <Button size="sm" onClick={() => setCreateForm('catalog')} className="bg-orange-600 hover:bg-orange-700 text-white"><Plus className="h-3.5 w-3.5 mr-1" />Catalog</Button>
                <Button size="sm" onClick={() => setCreateForm('schema')} variant="outline" className="border-slate-300 dark:border-slate-600"><Plus className="h-3.5 w-3.5 mr-1" />Schema</Button>
              </>
            )}
            {activeTab === 'clusters' && <Button size="sm" onClick={() => setCreateForm('cluster')} className="bg-orange-600 hover:bg-orange-700 text-white"><Plus className="h-3.5 w-3.5 mr-1" />Cluster</Button>}
          </div>
        </div>

        {/* Create Forms */}
        {createForm && (
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
            {createForm === 'sql-warehouse' && (
              <div className={fc}>
                <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Create SQL Warehouse</h3><button onClick={() => setCreateForm(null)}><X className="h-5 w-5 text-slate-400" /></button></div>
                <form className="space-y-4" onSubmit={handleCreateWh}>
                  <Input label="Warehouse Name" placeholder="e.g., data360_warehouse" value={whForm.name} onChange={(e) => setWhForm(p => ({ ...p, name: e.target.value }))} required disabled={formLoading} className="w-full" />
                  <div><label className={lbl}>Cluster Size</label><select value={whForm.cluster_size} onChange={(e) => setWhForm(p => ({ ...p, cluster_size: e.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" disabled={formLoading}>{whSizes.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <Input label="Auto Stop (minutes)" type="number" value={String(whForm.auto_stop_mins)} onChange={(e) => setWhForm(p => ({ ...p, auto_stop_mins: parseInt(e.target.value) || 10 }))} disabled={formLoading} className="w-full" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Min Clusters" type="number" value={String(whForm.min_num_clusters)} onChange={(e) => setWhForm(p => ({ ...p, min_num_clusters: parseInt(e.target.value) || 1 }))} disabled={formLoading} className="w-full" />
                    <Input label="Max Clusters" type="number" value={String(whForm.max_num_clusters)} onChange={(e) => setWhForm(p => ({ ...p, max_num_clusters: parseInt(e.target.value) || 1 }))} disabled={formLoading} className="w-full" />
                  </div>
                  <div><label className={lbl}>Warehouse Type</label><select value={whForm.warehouse_type} onChange={(e) => setWhForm(p => ({ ...p, warehouse_type: e.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" disabled={formLoading}><option value="CLASSIC">CLASSIC</option><option value="PRO">PRO</option></select></div>
                  <Checkbox label="Enable serverless compute" checked={whForm.enable_serverless} onChange={(e) => setWhForm(p => ({ ...p, enable_serverless: (e.target as HTMLInputElement).checked }))} disabled={formLoading} />
                  <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" disabled={formLoading}>{formLoading ? 'Creating...' : 'Create SQL Warehouse'}</Button>
                </form>
              </div>
            )}

            {createForm === 'catalog' && (
              <div className={fc}>
                <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Unity Catalog</h3><button onClick={() => setCreateForm(null)}><X className="h-5 w-5 text-slate-400" /></button></div>
                <form className="space-y-4" onSubmit={handleCreateCat}>
                  <Input label="Catalog Name" placeholder="e.g., analytics" value={catForm.name} onChange={(e) => setCatForm(p => ({ ...p, name: e.target.value }))} required disabled={formLoading} className="w-full" />
                  <Input label="Comment (optional)" value={catForm.comment} onChange={(e) => setCatForm(p => ({ ...p, comment: e.target.value }))} disabled={formLoading} className="w-full" />
                  <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" disabled={formLoading}>{formLoading ? 'Creating...' : 'Create Catalog'}</Button>
                </form>
              </div>
            )}

            {createForm === 'schema' && (
              <div className={fc}>
                <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Schema in Catalog</h3><button onClick={() => setCreateForm(null)}><X className="h-5 w-5 text-slate-400" /></button></div>
                <form className="space-y-4" onSubmit={handleCreateSch}>
                  <Input label="Catalog Name" placeholder="e.g., analytics" value={schForm.catalog_name} onChange={(e) => setSchForm(p => ({ ...p, catalog_name: e.target.value }))} required disabled={formLoading} className="w-full" />
                  <Input label="Schema Name" placeholder="e.g., raw_zone" value={schForm.name} onChange={(e) => setSchForm(p => ({ ...p, name: e.target.value }))} required disabled={formLoading} className="w-full" />
                  <Input label="Comment (optional)" value={schForm.comment} onChange={(e) => setSchForm(p => ({ ...p, comment: e.target.value }))} disabled={formLoading} className="w-full" />
                  <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" disabled={formLoading}>{formLoading ? 'Creating...' : 'Create Schema'}</Button>
                </form>
              </div>
            )}

            {createForm === 'cluster' && (
              <div className={fc}>
                <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Create Compute Cluster</h3><button onClick={() => setCreateForm(null)}><X className="h-5 w-5 text-slate-400" /></button></div>
                <form className="space-y-4" onSubmit={handleCreateCluster}>
                  <Input label="Cluster Name" placeholder="e.g., etl-cluster" value={clForm.cluster_name} onChange={(e) => setClForm(p => ({ ...p, cluster_name: e.target.value }))} required disabled={formLoading} className="w-full" />
                  <Input label="Spark Version" value={clForm.spark_version} onChange={(e) => setClForm(p => ({ ...p, spark_version: e.target.value }))} disabled={formLoading} className="w-full" />
                  <Input label="Node Type" placeholder="e.g., Standard_DS3_v2" value={clForm.node_type_id} onChange={(e) => setClForm(p => ({ ...p, node_type_id: e.target.value }))} disabled={formLoading} className="w-full" />
                  <Input label="Workers" type="number" value={String(clForm.num_workers)} onChange={(e) => setClForm(p => ({ ...p, num_workers: parseInt(e.target.value) || 1 }))} disabled={formLoading} className="w-full" />
                  <Input label="Auto-termination (minutes)" type="number" value={String(clForm.autotermination_minutes)} onChange={(e) => setClForm(p => ({ ...p, autotermination_minutes: parseInt(e.target.value) || 30 }))} disabled={formLoading} className="w-full" />
                  <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" disabled={formLoading}>{formLoading ? 'Creating...' : 'Create Cluster'}</Button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Data */}
        <div className="p-6">
          {loading ? <div className="flex justify-center py-16"><Loader size="lg" /></div> : (
            <>
              {/* SQL Warehouses */}
              {activeTab === 'sql-warehouses' && (
                warehouses.length === 0 ? <div className="text-center py-16 text-slate-500 dark:text-slate-400">No SQL warehouses found. Create one to get started.</div> : (
                  <div className={tw}><table className={tbl}><thead className={thd}><tr><th className={thc}>Name</th><th className={thc}>Size</th><th className={thc}>State</th><th className={thc}>Type</th><th className={thc}>Clusters</th><th className={thc}>Auto Stop</th><th className={thc}>Actions</th></tr></thead><tbody>
                    {warehouses.map((wh) => (
                      <tr key={wh.id} className={trh}>
                        <td className={`${tdc} font-medium text-slate-900 dark:text-white`}>{wh.name}</td>
                        <td className={tdc}><Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-300 dark:border-orange-700">{wh.cluster_size || '-'}</Badge></td>
                        <td className={tdc}><StatusBadge status={wh.state || ''} /></td>
                        <td className={tdc}>{wh.warehouse_type || '-'}</td>
                        <td className={tdc}><span className="font-mono text-sm">{wh.min_num_clusters || 1}-{wh.max_num_clusters || 1}</span></td>
                        <td className={tdc}>{wh.auto_stop_mins ? `${wh.auto_stop_mins}m` : '-'}</td>
                        <td className={tdc}>
                          <div className="flex items-center space-x-1">
                            <Tooltip content="Start"><Button size="sm" variant="outline" className="border-green-300 text-green-600 dark:border-green-700 dark:text-green-400 p-1.5" onClick={async () => { try { await dbxStartSqlWarehouse(wh.id, creds); toast.success('Starting...'); loadTab('sql-warehouses'); } catch (e: any) { toast.error(_errMsg(e)); } }}><Play className="h-3.5 w-3.5" /></Button></Tooltip>
                            <Tooltip content="Stop"><Button size="sm" variant="outline" className="border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400 p-1.5" onClick={async () => { try { await dbxStopSqlWarehouse(wh.id, creds); toast.success('Stopping...'); loadTab('sql-warehouses'); } catch (e: any) { toast.error(_errMsg(e)); } }}><Pause className="h-3.5 w-3.5" /></Button></Tooltip>
                            <Tooltip content="Delete"><Button size="sm" variant="outline" className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 p-1.5" onClick={async () => { if (!confirm(`Delete warehouse "${wh.name}"?`)) return; try { await dbxDeleteSqlWarehouse(wh.id, creds.host, creds.token); toast.success('Deleted'); loadTab('sql-warehouses'); } catch (e: any) { toast.error(_errMsg(e)); } }}><Trash2 className="h-3.5 w-3.5" /></Button></Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody></table></div>
                )
              )}

              {/* Catalogs */}
              {activeTab === 'catalogs' && (
                catalogs.length === 0 ? <div className="text-center py-16 text-slate-500 dark:text-slate-400">No Unity catalogs found.</div> : (
                  <div className={tw}><table className={tbl}><thead className={thd}><tr><th className={thc}></th><th className={thc}>Catalog</th><th className={thc}>Owner</th><th className={thc}>Type</th><th className={thc}>Comment</th><th className={thc}>Actions</th></tr></thead><tbody>
                    {catalogs.map((cat) => {
                      const name = cat.name || '';
                      const isExpanded = expandedCatalog === name;
                      return (
                        <>
                          <tr key={name} className={`${trh} cursor-pointer`} onClick={() => handleExpandCatalog(name)}>
                            <td className={tdc}><Layers className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90 text-orange-500' : 'text-slate-400'}`} /></td>
                            <td className={`${tdc} font-medium text-slate-900 dark:text-white`}>{name}</td>
                            <td className={tdc}>{cat.owner || '-'}</td>
                            <td className={tdc}>{cat.catalog_type || cat.securable_type || '-'}</td>
                            <td className={tdc}><span className="text-xs text-slate-500 dark:text-slate-400">{cat.comment || '-'}</span></td>
                            <td className={tdc}>
                              <Tooltip content="Delete catalog"><Button size="sm" variant="outline" className="border-red-300 text-red-600 dark:border-red-700 dark:text-red-400 p-1.5" onClick={async (e) => { e.stopPropagation(); if (!confirm(`Delete catalog "${name}"?`)) return; try { await dbxDeleteCatalog(name, creds.host, creds.token, true); toast.success('Deleted'); loadTab('catalogs'); } catch (er: any) { toast.error(er?.message || 'Failed'); } }}><Trash2 className="h-3.5 w-3.5" /></Button></Tooltip>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${name}_schemas`}>
                              <td colSpan={6} className="px-8 py-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                                {schemasLoading[name] ? <div className="flex justify-center py-4"><Loader size="sm" /></div> :
                                  schemasMap[name]?.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No schemas</p> : (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Schemas in {name}</p>
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                        {schemasMap[name]?.map((s: any) => (
                                          <div key={s.name || s.full_name} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            <div className="flex items-center gap-2">
                                              <Database className="h-3.5 w-3.5 text-orange-500" />
                                              <span className="text-sm text-slate-900 dark:text-white">{s.name}</span>
                                            </div>
                                            <button onClick={async () => { if (!confirm(`Delete schema "${s.full_name || `${name}.${s.name}`}"?`)) return; try { await dbxDeleteSchema(s.full_name || `${name}.${s.name}`, creds.host, creds.token); toast.success('Deleted'); const r = await dbxListSchemas(creds, name); setSchemasMap(p => ({ ...p, [name]: r.schemas || [] })); } catch (e: any) { toast.error(_errMsg(e)); } }} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
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
                  </tbody></table></div>
                )
              )}

              {/* Clusters */}
              {activeTab === 'clusters' && (
                clusters.length === 0 ? <div className="text-center py-16 text-slate-500 dark:text-slate-400">No clusters found.</div> : (
                  <div className={tw}><table className={tbl}><thead className={thd}><tr><th className={thc}>Name</th><th className={thc}>State</th><th className={thc}>Spark Version</th><th className={thc}>Node Type</th><th className={thc}>Workers</th><th className={thc}>Actions</th></tr></thead><tbody>
                    {clusters.map((cl) => (
                      <tr key={cl.cluster_id} className={trh}>
                        <td className={`${tdc} font-medium text-slate-900 dark:text-white`}>{cl.cluster_name}</td>
                        <td className={tdc}><StatusBadge status={cl.state || ''} /></td>
                        <td className={tdc}><span className="text-xs font-mono">{cl.spark_version || '-'}</span></td>
                        <td className={tdc}>{cl.node_type_id || '-'}</td>
                        <td className={tdc}>{cl.autoscale ? `${cl.autoscale.min_workers}-${cl.autoscale.max_workers}` : cl.num_workers || '-'}</td>
                        <td className={tdc}>
                          <div className="flex items-center space-x-1">
                            <Tooltip content="Start"><Button size="sm" variant="outline" className="border-green-300 text-green-600 dark:border-green-700 dark:text-green-400 p-1.5" onClick={async () => { try { await dbxStartCluster(cl.cluster_id, creds); toast.success('Starting...'); loadTab('clusters'); } catch (e: any) { toast.error(_errMsg(e)); } }}><Play className="h-3.5 w-3.5" /></Button></Tooltip>
                            <Tooltip content="Terminate"><Button size="sm" variant="outline" className="border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400 p-1.5" onClick={async () => { try { await dbxTerminateCluster(cl.cluster_id, creds); toast.success('Terminating...'); loadTab('clusters'); } catch (e: any) { toast.error(_errMsg(e)); } }}><Pause className="h-3.5 w-3.5" /></Button></Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody></table></div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
