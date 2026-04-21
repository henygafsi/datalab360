'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Button, Input, Loader, Badge, Modal, Textarea, Select } from 'rizzui';
import { ObjectSelector } from './components/ObjectSelector';
import { getColumns } from '@/app/services/gouvernance/policies';
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

// Normalize FastAPI error payloads. Validation errors come as
// `{ detail: [{type, loc, msg, ...}, ...] }` — rendering that array directly
// causes the "Objects are not valid as a React child" crash, and showing
// `err.message` ("Request failed with status 400") hides the real reason.
function errorMessage(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e: any) => {
      const loc = Array.isArray(e?.loc) ? e.loc.join('.') : '';
      return loc ? `${loc}: ${e?.msg || ''}` : (e?.msg || JSON.stringify(e));
    }).join('; ');
  }
  if (detail && typeof detail === 'object') {
    try { return detail.message || JSON.stringify(detail); } catch { /* ignore */ }
  }
  return err?.response?.data?.message || err?.message || fallback;
}

// API Functions
async function listDMFs(database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.get(`${PREFIX}/dmf/list`, { params });
  return data;
}

// All DMF POST/DELETE endpoints take query-string params (not JSON bodies).
// Backend signatures use `... = Query(...)` everywhere in governance_policies.py.
async function createDMF(body: { name: string; table_args: string; expression: string; database?: string; schema?: string; comment?: string }) {
  const params: Record<string, string> = {
    name: body.name,
    table_args: body.table_args,
    expression: body.expression,
  };
  if (body.database) params.database = body.database;
  if (body.schema) params.schema = body.schema;
  if (body.comment) params.comment = body.comment;
  const { data } = await apiClient.post(`${PREFIX}/dmf`, null, { params });
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
  // Backend expects `columns` as a comma-separated string, not a list
  const params: Record<string, string> = {
    table_fqn: body.table_fqn,
    dmf_name: body.dmf_name,
    columns: body.columns.join(','),
  };
  if (body.database) params.database = body.database;
  if (body.schema) params.schema = body.schema;
  const { data } = await apiClient.post(`${PREFIX}/dmf/associate`, null, { params });
  return data;
}

async function disassociateDMF(body: { table_fqn: string; dmf_name: string; columns: string[] }) {
  const params: Record<string, string> = {
    table_fqn: body.table_fqn,
    dmf_name: body.dmf_name,
    columns: body.columns.join(','),
  };
  const { data } = await apiClient.post(`${PREFIX}/dmf/disassociate`, null, { params });
  return data;
}

async function setDMFSchedule(body: { table_fqn: string; schedule: string }) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/schedule`, null, { params: body });
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
  const [assocTarget, setAssocTarget] = useState({ database: '', schema: '', table: '' });
  const [assocDmfName, setAssocDmfName] = useState('');
  const [assocColumns, setAssocColumns] = useState<string[]>([]);
  const [assocColumnOptions, setAssocColumnOptions] = useState<string[]>([]);
  const [loadingAssocColumns, setLoadingAssocColumns] = useState(false);
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
      // eslint-disable-next-line no-console
      console.log('[DMF] List response:', result);
      // Backend returns { dmfs: [...], count: N }. Some proxies wrap in StandardResponse
      // shape { data: { dmfs: [...] } }, so check both before falling back.
      const raw =
        result?.dmfs ??
        result?.data?.dmfs ??
        result?.functions ??
        result?.data ??
        result;
      setItems(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to load DMFs'));
    } finally {
      setLoading(false);
    }
  }, [database, schema]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Load columns for the Associate modal whenever the target table changes.
  useEffect(() => {
    const { database: db, schema: sc, table: tb } = assocTarget;
    if (!db || !sc || !tb) {
      setAssocColumnOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingAssocColumns(true);
    getColumns(db, sc, tb)
      .then((cols) => { if (!cancelled) setAssocColumnOptions(cols); })
      .catch(() => { if (!cancelled) setAssocColumnOptions([]); })
      .finally(() => { if (!cancelled) setLoadingAssocColumns(false); });
    return () => { cancelled = true; };
  }, [assocTarget]);

  // Reset column selection when target table changes so stale selections don't survive.
  useEffect(() => {
    setAssocColumns([]);
  }, [assocTarget.database, assocTarget.schema, assocTarget.table]);

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
      toast.error(errorMessage(err, 'Failed to create DMF'));
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
      toast.error(errorMessage(err, 'Failed to drop DMF'));
    }
  };

  const handleDescribe = async (name: string) => {
    try {
      const result = await describeDMF(name, database || undefined, schema || undefined);
      setDetail(result.data || result);
      setShowDetail(true);
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to describe DMF'));
    }
  };

  const handleAssociate = async () => {
    const { database: db, schema: sc, table: tb } = assocTarget;
    if (!db || !sc || !tb) {
      toast.error('Select database, schema, and table');
      return;
    }
    if (!assocDmfName) {
      toast.error('Pick a Data Metric Function');
      return;
    }
    if (!assocColumns.length) {
      toast.error('Select at least one column');
      return;
    }
    setAssociating(true);
    try {
      await associateDMF({
        table_fqn: `${db}.${sc}.${tb}`,
        dmf_name: assocDmfName,
        columns: assocColumns,
        database: database || undefined,
        schema: schema || undefined,
      });
      toast.success(`DMF "${assocDmfName}" associated with ${db}.${sc}.${tb}`);
      setShowAssociate(false);
      setAssocTarget({ database: '', schema: '', table: '' });
      setAssocDmfName('');
      setAssocColumns([]);
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to associate DMF'));
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
      toast.error(errorMessage(err, 'Failed to set schedule'));
    }
  };

  const handleViewRefs = async () => {
    if (!refsTable) { toast.error('Enter a table name'); return; }
    setRefsLoading(true);
    try {
      const result = await getDMFReferences(refsTable);
      const raw = result?.data || result?.references || result;
      setRefs(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to load references'));
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
        <div className="p-6 space-y-5 max-w-2xl">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Associate DMF with Table</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Attach a data metric function to specific columns so Snowflake runs it on schedule.
            </p>
          </div>

          {/* Target table picker */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Target table
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ObjectSelector
                level="database"
                value={assocTarget.database}
                onSelect={(db) => setAssocTarget({ database: db, schema: '', table: '' })}
                label="Database"
              />
              <ObjectSelector
                level="schema"
                database={assocTarget.database}
                value={assocTarget.schema}
                onSelect={(sc) => setAssocTarget((t) => ({ ...t, schema: sc, table: '' }))}
                label="Schema"
                disabled={!assocTarget.database}
              />
              <ObjectSelector
                level="table"
                database={assocTarget.database}
                schema={assocTarget.schema}
                value={assocTarget.table}
                onSelect={(tb) => setAssocTarget((t) => ({ ...t, table: tb }))}
                label="Table"
                disabled={!assocTarget.database || !assocTarget.schema}
              />
            </div>
          </div>

          {/* DMF picker (from list already loaded) */}
          <div>
            <Select
              label="Data Metric Function"
              value={assocDmfName}
              onChange={(val: any) => setAssocDmfName(typeof val === 'object' ? val?.value || '' : String(val))}
              options={items.map((item: any) => {
                const n = item.name || item.NAME || '';
                return { label: n, value: n };
              }).filter((o: any) => o.value)}
              placeholder={items.length === 0 ? 'No DMFs available — create one first' : 'Choose a DMF'}
              disabled={items.length === 0}
            />
          </div>

          {/* Column multi-select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Columns to monitor
              </label>
              {assocColumns.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  onClick={() => setAssocColumns([])}
                >
                  Clear
                </button>
              )}
            </div>

            {!assocTarget.table ? (
              <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                Pick a table to see its columns
              </div>
            ) : loadingAssocColumns ? (
              <div className="text-sm text-slate-500 text-center py-6">Loading columns...</div>
            ) : assocColumnOptions.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                No columns found
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 divide-y divide-slate-200 dark:divide-slate-700">
                {assocColumnOptions.map((col) => {
                  const checked = assocColumns.includes(col);
                  return (
                    <label
                      key={col}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setAssocColumns((prev) =>
                            prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
                          );
                        }}
                        className="h-4 w-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                      />
                      <span className="font-mono text-xs text-slate-800 dark:text-slate-200">{col}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {assocColumns.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {assocColumns.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 text-xs font-medium"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setAssocColumns((prev) => prev.filter((x) => x !== c))}
                      className="ml-0.5 text-teal-700/60 hover:text-teal-700 dark:text-teal-300/60 dark:hover:text-teal-300"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowAssociate(false)}>Cancel</Button>
            <Button
              onClick={handleAssociate}
              disabled={associating || !assocTarget.table || !assocDmfName || assocColumns.length === 0}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
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
        <DMFDetailsModalContent detail={detail} onClose={() => setShowDetail(false)} />
      </Modal>
    </div>
  );
}

// ─── DMF details modal body ───
// Snowflake DESCRIBE FUNCTION returns a list of {property, value} rows.
// We render them as a property grid, pulling out "body" (SQL) into its own
// code block for readability.
function DMFDetailsModalContent({ detail, onClose }: { detail: any; onClose: () => void }) {
  if (!detail) {
    return (
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">DMF Details</h3>
        <p className="text-slate-500">No details available</p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  const name: string = detail.name || detail.NAME || 'DMF';
  const rawRows: any[] = Array.isArray(detail.details)
    ? detail.details
    : Array.isArray(detail)
    ? detail
    : [];

  // Normalize { property, value } rows; tolerate different casing.
  const rows = rawRows
    .map((r: any) => ({
      property: String(r.property ?? r.PROPERTY ?? r.name ?? '').trim(),
      value: r.value ?? r.VALUE ?? '',
    }))
    .filter((r) => r.property);

  const pick = (key: string) => rows.find((r) => r.property.toLowerCase() === key.toLowerCase())?.value;
  const signature = pick('signature');
  const returns = pick('returns');
  const language = pick('language');
  const body = pick('body');
  const nullHandling = pick('null handling') ?? pick('null_handling');
  const volatility = pick('volatility');

  // "Other" properties that aren't specifically highlighted above.
  const highlighted = new Set(['signature', 'returns', 'language', 'body', 'null handling', 'null_handling', 'volatility']);
  const otherRows = rows.filter((r) => !highlighted.has(r.property.toLowerCase()));

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">DMF Details</h3>
          <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">{name}</p>
        </div>
        <div className="flex items-center gap-2">
          {language && (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium">
              {String(language)}
            </span>
          )}
          {returns && (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-medium">
              → {String(returns)}
            </span>
          )}
        </div>
      </div>

      {/* Signature block */}
      {signature && (
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Signature</div>
          <div className="font-mono text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 break-all">
            {name}<span className="text-slate-500">{String(signature)}</span>
          </div>
        </div>
      )}

      {/* Key/value grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {nullHandling && (
          <>
            <div className="text-slate-500 dark:text-slate-400">Null handling</div>
            <div className="font-mono text-slate-800 dark:text-slate-200">{String(nullHandling)}</div>
          </>
        )}
        {volatility && (
          <>
            <div className="text-slate-500 dark:text-slate-400">Volatility</div>
            <div className="font-mono text-slate-800 dark:text-slate-200">{String(volatility)}</div>
          </>
        )}
        {otherRows.map((r) => (
          <Fragment key={r.property}>
            <div className="text-slate-500 dark:text-slate-400 capitalize">{r.property.toLowerCase().replace(/_/g, ' ')}</div>
            <div className="font-mono text-slate-800 dark:text-slate-200 break-all">
              {typeof r.value === 'string' || typeof r.value === 'number' || typeof r.value === 'boolean'
                ? String(r.value)
                : JSON.stringify(r.value)}
            </div>
          </Fragment>
        ))}
      </div>

      {/* SQL body */}
      {body && (
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Body</div>
          <pre className="font-mono text-xs bg-slate-900 text-slate-100 border border-slate-700 rounded-lg p-4 overflow-auto max-h-64 whitespace-pre-wrap">
            {String(body).trim()}
          </pre>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
