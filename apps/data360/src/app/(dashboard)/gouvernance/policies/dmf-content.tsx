'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Loader, Badge, Modal, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiPlus,
  PiTrash,
  PiInfo,
  PiLink,
  PiLinkBreak,
  PiCalendar,
  PiArrowsClockwise,
  PiChartLineUp,
} from 'react-icons/pi';
import apiClient from '@/lib/api-client';

const PREFIX = '/gouvernance/policies';

// API Functions
async function listDMFs(database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.get(`${PREFIX}/dmf/list`, { params });
  return data;
}

async function createDMF(body: { name: string; table_args: string; expression: string; database?: string; schema?: string; comment?: string }) {
  const { data } = await apiClient.post(`${PREFIX}/dmf`, body);
  return data;
}

async function describeDMF(name: string, database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.get(`${PREFIX}/dmf/${encodeURIComponent(name)}/details`, { params });
  return data;
}

async function deleteDMF(name: string, database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.delete(`${PREFIX}/dmf/${encodeURIComponent(name)}`, { params });
  return data;
}

async function associateDMF(body: { table_fqn: string; dmf_name: string; columns: string[]; database?: string; schema?: string }) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/associate`, body);
  return data;
}

async function disassociateDMF(body: { table_fqn: string; dmf_name: string; columns: string[] }) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/disassociate`, body);
  return data;
}

async function setDMFSchedule(body: { table_fqn: string; schedule: string }) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/schedule`, body);
  return data;
}

async function getDMFReferences(tableName: string) {
  const { data } = await apiClient.get(`${PREFIX}/dmf/references`, { params: { table_name: tableName } });
  return data;
}

export default function DMFContent() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', table_args: '', expression: '', comment: '' });
  const [creating, setCreating] = useState(false);

  // Associate modal
  const [showAssociate, setShowAssociate] = useState(false);
  const [assocForm, setAssocForm] = useState({ table_fqn: '', dmf_name: '', columns: '' });
  const [associating, setAssociating] = useState(false);

  // Schedule modal
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedForm, setSchedForm] = useState({ table_fqn: '', schedule: '' });

  // References
  const [showRefs, setShowRefs] = useState(false);
  const [refs, setRefs] = useState<any[]>([]);
  const [refsTable, setRefsTable] = useState('');
  const [refsLoading, setRefsLoading] = useState(false);

  // Detail
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listDMFs(database || undefined, schema || undefined);
      setItems(result.data || result.functions || result || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load DMFs');
    } finally {
      setLoading(false);
    }
  }, [database, schema]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCreate = async () => {
    if (!createForm.name || !createForm.table_args || !createForm.expression) {
      toast.error('Name, table args, and expression are required');
      return;
    }
    setCreating(true);
    try {
      await createDMF({ ...createForm, database: database || undefined, schema: schema || undefined });
      toast.success('Data Metric Function created');
      setShowCreate(false);
      setCreateForm({ name: '', table_args: '', expression: '', comment: '' });
      loadItems();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create DMF');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Drop Data Metric Function "${name}"?`)) return;
    try {
      await deleteDMF(name, database || undefined, schema || undefined);
      toast.success(`DMF "${name}" dropped`);
      loadItems();
    } catch (err: any) {
      toast.error(err.message || 'Failed to drop DMF');
    }
  };

  const handleDescribe = async (name: string) => {
    try {
      const result = await describeDMF(name, database || undefined, schema || undefined);
      setDetail(result.data || result);
      setShowDetail(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to describe DMF');
    }
  };

  const handleAssociate = async () => {
    if (!assocForm.table_fqn || !assocForm.dmf_name || !assocForm.columns) {
      toast.error('All fields are required');
      return;
    }
    setAssociating(true);
    try {
      await associateDMF({
        table_fqn: assocForm.table_fqn,
        dmf_name: assocForm.dmf_name,
        columns: assocForm.columns.split(',').map(c => c.trim()),
        database: database || undefined,
        schema: schema || undefined,
      });
      toast.success('DMF associated with table');
      setShowAssociate(false);
      setAssocForm({ table_fqn: '', dmf_name: '', columns: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to associate DMF');
    } finally {
      setAssociating(false);
    }
  };

  const handleSchedule = async () => {
    if (!schedForm.table_fqn || !schedForm.schedule) {
      toast.error('Table and schedule are required');
      return;
    }
    try {
      await setDMFSchedule(schedForm);
      toast.success('DMF schedule set');
      setShowSchedule(false);
      setSchedForm({ table_fqn: '', schedule: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to set schedule');
    }
  };

  const handleViewRefs = async () => {
    if (!refsTable) { toast.error('Enter a table name'); return; }
    setRefsLoading(true);
    try {
      const result = await getDMFReferences(refsTable);
      setRefs(result.data || result.references || result || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load references');
    } finally {
      setRefsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Input placeholder="Database" value={database} onChange={(e) => setDatabase(e.target.value)} className="w-40" />
          <Input placeholder="Schema" value={schema} onChange={(e) => setSchema(e.target.value)} className="w-40" />
          <Button variant="outline" onClick={loadItems} className="gap-2">
            <PiArrowsClockwise className="w-4 h-4" /> Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAssociate(true)} className="gap-2">
            <PiLink className="w-4 h-4" /> Associate
          </Button>
          <Button variant="outline" onClick={() => setShowSchedule(true)} className="gap-2">
            <PiCalendar className="w-4 h-4" /> Schedule
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-teal-600 text-white hover:bg-teal-700">
            <PiPlus className="w-4 h-4" /> Create DMF
          </Button>
        </div>
      </div>

      {/* References lookup */}
      <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <PiChartLineUp className="w-5 h-5 text-teal-600" />
        <Input placeholder="Table name (e.g. DB.SCHEMA.TABLE)" value={refsTable} onChange={(e) => setRefsTable(e.target.value)} className="flex-1" />
        <Button variant="outline" onClick={handleViewRefs} disabled={refsLoading} className="gap-2">
          {refsLoading ? <Loader variant="spinner" size="sm" /> : <PiInfo className="w-4 h-4" />} View References
        </Button>
      </div>

      {showRefs && refs.length > 0 && (
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="font-semibold mb-3 text-slate-900 dark:text-white">DMF References for {refsTable}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">DMF Name</th>
                <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Columns</th>
                <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Schedule</th>
              </tr></thead>
              <tbody>
                {refs.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-2 px-3 text-slate-900 dark:text-white">{r.metric_name || r.METRIC_NAME || '-'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{r.ref_columns || r.REF_COLUMNS || '-'}</td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{r.schedule || r.SCHEDULE || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader variant="spinner" size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <PiChartLineUp className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-lg">No Data Metric Functions found</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Create one to start monitoring data quality metrics</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item: any, idx: number) => (
            <div key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white">{item.name || item.NAME || 'Unnamed'}</h4>
                  <p className="text-xs text-slate-500 mt-1">{item.schema_name || item.SCHEMA_NAME || ''}</p>
                </div>
                <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">DMF</Badge>
              </div>
              {(item.comment || item.COMMENT) && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{item.comment || item.COMMENT}</p>
              )}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                <Button variant="outline" size="sm" onClick={() => handleDescribe(item.name || item.NAME)} className="gap-1">
                  <PiInfo className="w-3.5 h-3.5" /> Details
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(item.name || item.NAME)} className="gap-1 text-red-600 hover:bg-red-50">
                  <PiTrash className="w-3.5 h-3.5" /> Drop
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Data Metric Function</h3>
          <Input label="Name" placeholder="e.g. my_null_check" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          <Input label="Table Arguments" placeholder="e.g. TABLE_ARG TABLE(col1 NUMBER)" value={createForm.table_args} onChange={(e) => setCreateForm({ ...createForm, table_args: e.target.value })} />
          <Textarea label="Expression" placeholder="e.g. SELECT COUNT_IF(col1 IS NULL) FROM TABLE_ARG" value={createForm.expression} onChange={(e) => setCreateForm({ ...createForm, expression: e.target.value })} rows={4} />
          <Input label="Comment (optional)" placeholder="Description" value={createForm.comment} onChange={(e) => setCreateForm({ ...createForm, comment: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-teal-600 text-white hover:bg-teal-700">
              {creating ? <Loader variant="spinner" size="sm" /> : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Associate Modal */}
      <Modal isOpen={showAssociate} onClose={() => setShowAssociate(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Associate DMF with Table</h3>
          <Input label="Table (FQN)" placeholder="DB.SCHEMA.TABLE" value={assocForm.table_fqn} onChange={(e) => setAssocForm({ ...assocForm, table_fqn: e.target.value })} />
          <Input label="DMF Name" placeholder="my_null_check" value={assocForm.dmf_name} onChange={(e) => setAssocForm({ ...assocForm, dmf_name: e.target.value })} />
          <Input label="Columns (comma-separated)" placeholder="col1, col2" value={assocForm.columns} onChange={(e) => setAssocForm({ ...assocForm, columns: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowAssociate(false)}>Cancel</Button>
            <Button onClick={handleAssociate} disabled={associating} className="bg-teal-600 text-white hover:bg-teal-700">
              {associating ? <Loader variant="spinner" size="sm" /> : 'Associate'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Schedule Modal */}
      <Modal isOpen={showSchedule} onClose={() => setShowSchedule(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Set DMF Schedule</h3>
          <Input label="Table (FQN)" placeholder="DB.SCHEMA.TABLE" value={schedForm.table_fqn} onChange={(e) => setSchedForm({ ...schedForm, table_fqn: e.target.value })} />
          <Input label="Schedule" placeholder="e.g. TRIGGER_ON_CHANGES or 5 MINUTE" value={schedForm.schedule} onChange={(e) => setSchedForm({ ...schedForm, schedule: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancel</Button>
            <Button onClick={handleSchedule} className="bg-teal-600 text-white hover:bg-teal-700">Set Schedule</Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">DMF Details</h3>
          {detail ? (
            <pre className="text-sm bg-slate-50 dark:bg-slate-800 p-4 rounded-lg overflow-auto max-h-96 text-slate-700 dark:text-slate-300">
              {JSON.stringify(detail, null, 2)}
            </pre>
          ) : (
            <p className="text-slate-500">No details available</p>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowDetail(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
