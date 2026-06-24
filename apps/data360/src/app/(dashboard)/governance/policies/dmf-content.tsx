'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Button, Input, Loader, Badge, Textarea, Select } from 'rizzui';
import { ObjectSelector } from './components/ObjectSelector';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import { getColumns } from '@/app/services/governance/policies';
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
  PiTable,
  PiChartBar,
} from 'react-icons/pi';
import apiClient from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import { setDmfThreshold, type DmfThresholdPayload } from '@/app/services/data-quality';
import { useAtomValue } from 'jotai';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';

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


async function setDMFSchedule(body: { table_fqn: string; schedule: string }) {
  const { data } = await apiClient.post(`${PREFIX}/dmf/schedule`, null, { params: body });
  return data;
}

async function getDMFReferences(tableName: string) {
  const { data } = await apiClient.get(`${PREFIX}/dmf/references`, { params: { table_name: tableName } });
  return data;
}

async function getAllDMFReferences() {
  const { data } = await apiClient.get(`${PREFIX}/dmf/all-references`);
  return data;
}

async function getDMFWithTables(name: string, database?: string, schema?: string) {
  const params: Record<string, string> = {};
  if (database) params.database = database;
  if (schema) params.schema = schema;
  const { data } = await apiClient.get(`${PREFIX}/dmf/${encodeURIComponent(name)}/tables`, { params });
  return data;
}

async function getTableDMFs(tableName: string) {
  const { data } = await apiClient.get(`${PREFIX}/dmf/references`, { params: { table_name: tableName } });
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

export default function DMFContent() {
  // System 2 Action-RBAC: dropping a data metric function maps to
  // gouvernance:delete. Fail-open while the allow-set loads (no flash).
  const deletePerm = useCanPerform('gouvernance', 'delete');
  const canDeleteDmf = deletePerm.allowed || deletePerm.loading;
  // Creating a data metric function maps to gouvernance:create — mirror the
  // exact gating every sibling policy-content file uses for its create button.
  const createPerm = useCanPerform('gouvernance', 'create');
  const canCreatePolicy = createPerm.allowed || createPerm.loading;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish a real load failure from a resolved-empty list so the UI shows an
  // inline error+retry instead of a misleading "No Data Metric Functions found".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', table_args: '', expression: '', comment: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Associate modal
  const [showAssociate, setShowAssociate] = useState(false);
  const [assocTarget, setAssocTarget] = useState({ database: '', schema: '', table: '' });
  const [assocDmfName, setAssocDmfName] = useState('');
  const [assocDmfDb, setAssocDmfDb] = useState('');
  const [assocDmfSchema, setAssocDmfSchema] = useState('');
  const [assocColumns, setAssocColumns] = useState<string[]>([]);
  const [assocColumnOptions, setAssocColumnOptions] = useState<string[]>([]);
  const [loadingAssocColumns, setLoadingAssocColumns] = useState(false);
  const [associating, setAssociating] = useState(false);
  const [associateError, setAssociateError] = useState<string | null>(null);

  // Schedule modal
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedTarget, setSchedTarget] = useState({ database: '', schema: '', table: '' });
  const [schedForm, setSchedForm] = useState({ table_fqn: '', schedule: '' });
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Threshold modal — FIX DQ-04: was a dead toast, now calls POST /data-quality/dmf/thresholds
  const [showThreshold, setShowThreshold] = useState(false);
  const [thForm, setThForm] = useState<{
    table_name: string;
    column_name: string;
    metric: string;
    min_value: string;
    max_value: string;
    threshold_type: 'absolute' | 'percentage' | 'range';
  }>({
    table_name: '',
    column_name: '',
    metric: 'completeness',
    min_value: '',
    max_value: '',
    threshold_type: 'percentage',
  });
  const [thSubmitting, setThSubmitting] = useState(false);
  const [thError, setThError] = useState<string | null>(null);

  // References
  const [refs, setRefs] = useState<any[]>([]);

  // Inline confirmations (no popups)
  const [confirmDeleteDmf, setConfirmDeleteDmf] = useState<string | null>(null);
  const [confirmDisassociate, setConfirmDisassociate] = useState<{ fqn: string; dmf: string; cols: string[] } | null>(null);

  // Detail
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  // Table associations modal
  const [showTableDmfs, setShowTableDmfs] = useState(false);
  const [tableDmfsTarget, setTableDmfsTarget] = useState<{ database: string; schema: string; table: string }>({ database: '', schema: '', table: '' });
  const [tableDmfs, setTableDmfs] = useState<any[]>([]);
  const [tableDmfsLoading, setTableDmfsLoading] = useState(false);
  const [disassociating, setDisassociating] = useState(false);

  // DMF refs with table count cache
  const [dmfTableCounts, setDmfTableCounts] = useState<Record<string, number>>({});

  const loadItems = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await listDMFs(database || undefined, schema || undefined);
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
      const msg = errorMessage(err, 'Failed to load DMFs');
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [database, schema]);

  const loadRefs = useCallback(async () => {
    try {
      const result = await getAllDMFReferences();
      const raw = result?.data || result?.references || result;
      const arr = Array.isArray(raw) ? raw : [];
      setRefs(arr);
      const counts: Record<string, number> = {};
      arr.forEach((r: any) => {
        const name = (r.DMF_NAME || r.dmf_name || r.METRIC_NAME || r.metric_name || '').split('.').pop() || '';
        if (name) counts[name] = (counts[name] || 0) + 1;
      });
      setDmfTableCounts(counts);
    } catch { /* silent — refs are auxiliary */ }
  }, []);

  useEffect(() => { loadItems(); loadRefs(); }, [loadItems, loadRefs]);

  // Real-time: the DMF list is SSE-invalidated via CacheKey.POLICIES (and
  // DMF_RESULTS) on create/drop/associate. Every sibling policy tab already
  // refreshes on POLICIES (via useCacheAwareQuery); subscribe here too so another
  // admin's change — or this user's own mutation broadcast — refreshes the list.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const keys = lastInvalidation.keys;
    if (keys.includes(CACHE_KEYS.POLICIES) || keys.includes(CACHE_KEYS.DMF_RESULTS)) {
      loadItems();
      loadRefs();
    }
  }, [lastInvalidation, loadItems, loadRefs]);

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
      setCreateError('Name, table args, and expression are required.');
      return;
    }
    // Validate table_args format: must contain TABLE keyword
    const argsUpper = createForm.table_args.toUpperCase().trim();
    if (!argsUpper.includes('TABLE(') && !argsUpper.includes('TABLE (')) {
      setCreateError('Table arguments must use Snowflake syntax: ARG_NAME TABLE(col_name TYPE). You wrote a table name instead of TABLE keyword.');
      return;
    }
    // Validate name: alphanumeric + underscore only
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(createForm.name.trim())) {
      setCreateError('DMF name must be alphanumeric with underscores (e.g. null_count_check).');
      return;
    }
    // Validate expression references the arg name
    const argName = createForm.table_args.trim().split(/\s+/)[0];
    if (argName && !createForm.expression.toUpperCase().includes(argName.toUpperCase())) {
      setCreateError(`Expression must reference table arg "${argName}" (e.g. SELECT ... FROM ${argName}).`);
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      await createDMF({ ...createForm, database: database || undefined, schema: schema || undefined });
      toast.success('Data Metric Function created');
      setShowCreate(false);
      setCreateForm({ name: '', table_args: '', expression: '', comment: '' });
      loadItems();
    } catch (err: any) {
      const msg = errorMessage(err, 'Failed to create DMF');
      // Surface a SQL hint inline if this looks like a compilation error.
      if (msg.includes('syntax error') || msg.includes('SQL compilation')) {
        setCreateError(`SQL Error: ${msg} — expected Args: ARG TABLE(col_name TYPE), Expr: SELECT COUNT_IF(col_name IS NULL) FROM ARG`);
      } else {
        setCreateError(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const executeDeleteDmf = async (name: string) => {
    try {
      await deleteDMF(name, database || undefined, schema || undefined);
      toast.success(`DMF "${name}" dropped`);
      setConfirmDeleteDmf(null);
      loadItems();
      loadRefs();
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

  const handleOpenTableDmfs = async (db: string, sc: string, tb: string) => {
    setTableDmfsTarget({ database: db, schema: sc, table: tb });
    setTableDmfsLoading(true);
    setShowTableDmfs(true);
    try {
      const result = await getTableDMFs(`${db}.${sc}.${tb}`);
      const raw = result?.data || result?.references || result;
      setTableDmfs(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to load table DMFs'));
      setTableDmfs([]);
    } finally {
      setTableDmfsLoading(false);
    }
  };

  const executeDisassociate = async (tableFqn: string, dmfName: string, columns: string[]) => {
    setDisassociating(true);
    try {
      await disassociateDMF({ table_fqn: tableFqn, dmf_name: dmfName, columns });
      toast.success(`DMF "${dmfName}" disassociated`);
      setConfirmDisassociate(null);
      const result = await getTableDMFs(tableFqn);
      const raw = result?.data || result?.references || result;
      setTableDmfs(Array.isArray(raw) ? raw : []);
      loadRefs();
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to disassociate DMF'));
    } finally {
      setDisassociating(false);
    }
  };

  const handleAssociate = async () => {
    const { database: db, schema: sc, table: tb } = assocTarget;
    if (!db || !sc || !tb) {
      setAssociateError('Select database, schema, and table.');
      return;
    }
    if (!assocDmfName) {
      setAssociateError('Pick a Data Metric Function.');
      return;
    }
    if (!assocColumns.length) {
      setAssociateError('Select at least one column.');
      return;
    }
    setAssociateError(null);
    setAssociating(true);
    try {
      await associateDMF({
        table_fqn: `${db}.${sc}.${tb}`,
        dmf_name: assocDmfName,
        columns: assocColumns,
        database: assocDmfDb || database || undefined,
        schema: assocDmfSchema || schema || undefined,
      });
      toast.success(`DMF associated with ${db}.${sc}.${tb} on columns: ${assocColumns.join(', ')}`);
      setShowAssociate(false);
      setAssocTarget({ database: '', schema: '', table: '' });
      setAssocDmfName('');
      setAssocDmfDb('');
      setAssocDmfSchema('');
      setAssocColumns([]);
      loadRefs();
    } catch (err: any) {
      const msg = errorMessage(err, 'Failed to associate DMF');
      if (msg.includes('does not exist')) {
        setAssociateError(`${msg} — the DMF name must be fully qualified (DB.SCHEMA.NAME); check the function exists in Snowflake.`);
      } else if (msg.includes('SQL compilation')) {
        setAssociateError(`SQL Error: ${msg}`);
      } else {
        setAssociateError(msg);
      }
    } finally {
      setAssociating(false);
    }
  };

  const handleSchedule = async () => {
    const { database: db, schema: sc, table: tb } = schedTarget;
    if (!db || !sc || !tb) {
      setScheduleError('Select database, schema, and table.');
      return;
    }
    if (!schedForm.schedule) {
      setScheduleError('Schedule is required.');
      return;
    }
    setScheduleError(null);
    try {
      await setDMFSchedule({
        table_fqn: `${db}.${sc}.${tb}`,
        schedule: schedForm.schedule,
      });
      toast.success('DMF schedule set');
      setShowSchedule(false);
      setSchedTarget({ database: '', schema: '', table: '' });
      setSchedForm({ table_fqn: '', schedule: '' });
    } catch (err: any) {
      setScheduleError(errorMessage(err, 'Failed to set schedule'));
    }
  };

  // FIX DQ-04: replaced dead-toast stub with a real call to POST /data-quality/dmf/thresholds
  const handleSetThreshold = async () => {
    if (!thForm.table_name.trim() || !thForm.column_name.trim() || !thForm.metric) {
      setThError('Table name, column name, and metric are required.');
      return;
    }
    if (thForm.threshold_type === 'range' && !thForm.min_value && !thForm.max_value) {
      setThError('Provide at least min or max value for range threshold.');
      return;
    }
    setThError(null);
    setThSubmitting(true);
    try {
      const payload: DmfThresholdPayload = {
        table_name: thForm.table_name.trim(),
        column_name: thForm.column_name.trim(),
        metric: thForm.metric,
        threshold_type: thForm.threshold_type,
        ...(thForm.min_value !== '' ? { min_value: parseFloat(thForm.min_value) } : {}),
        ...(thForm.max_value !== '' ? { max_value: parseFloat(thForm.max_value) } : {}),
      };
      await setDmfThreshold(payload);
      toast.success(`Threshold saved for ${thForm.table_name}.${thForm.column_name}`);
      setShowThreshold(false);
      setThForm({
        table_name: '',
        column_name: '',
        metric: 'completeness',
        min_value: '',
        max_value: '',
        threshold_type: 'percentage',
      });
    } catch (err: any) {
      setThError(errorMessage(err, 'Failed to save threshold'));
      toast.error(errorMessage(err, 'Failed to save threshold'));
    } finally {
      setThSubmitting(false);
    }
  };

  // Group refs by table
  const refsByTable: Record<string, any[]> = {};
  refs.forEach((r: any) => {
    const tableKey = r.TABLE_NAME || r.table_name || r.REF_ENTITY_NAME || r.ref_entity_name || '';
    if (!refsByTable[tableKey]) refsByTable[tableKey] = [];
    refsByTable[tableKey].push(r);
  });

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadItems()} className="gap-2">
            <PiArrowsClockwise className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => { setAssociateError(null); setShowAssociate(true); }} className="gap-2">
            <PiLink className="w-4 h-4" /> Associate
          </Button>
          <Button variant="outline" onClick={() => { setScheduleError(null); setShowSchedule(true); }} className="gap-2">
            <PiCalendar className="w-4 h-4" /> Schedule
          </Button>
          <Button variant="outline" onClick={() => { setThError(null); setShowThreshold(true); }} className="gap-2">
            <PiChartBar className="w-4 h-4" /> Set Threshold
          </Button>
          <Button onClick={() => { setCreateError(null); setShowCreate(true); }} disabled={!canCreatePolicy} title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined} className="gap-2 bg-teal-600 text-white hover:bg-teal-700">
            <PiPlus className="w-4 h-4" /> Create DMF
          </Button>
        </div>
      </div>

      {/* Active associations — auto-loaded, click table name to manage */}
      {refs.length > 0 && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PiLink className="w-5 h-5 text-teal-600" />
              <span className="font-medium text-slate-900 dark:text-white">Active Associations</span>
              <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {Object.keys(refsByTable).length} table{Object.keys(refsByTable).length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={loadRefs} className="gap-1">
              <PiArrowsClockwise className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {Object.entries(refsByTable).map(([tableName, tableRefs]: [string, any]) => {
              const refDb = tableRefs[0]?.REF_DATABASE_NAME || tableRefs[0]?.ref_database_name || '';
              const refSc = tableRefs[0]?.REF_SCHEMA_NAME || tableRefs[0]?.ref_schema_name || '';
              return (
                <div key={tableName} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    className="flex items-center gap-2 font-mono text-sm font-semibold text-slate-900 dark:text-white hover:text-teal-600 transition-colors"
                    onClick={() => handleOpenTableDmfs(refDb, refSc, tableName.split('.').pop() || tableName)}
                  >
                    <PiTable className="w-4 h-4 text-slate-400" />
                    {tableName}
                  </button>
                  <div className="flex items-center gap-2">
                    {tableRefs.map((r: any, i: number) => {
                      const dmfName = (r.DMF_NAME || r.dmf_name || r.METRIC_NAME || r.metric_name || '-').split('.').pop();
                      return (
                        <Badge key={i} className="bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 text-xs">
                          {dmfName}
                        </Badge>
                      );
                    })}
                    <Button variant="outline" size="sm"
                      onClick={() => handleOpenTableDmfs(refDb, refSc, tableName.split('.').pop() || tableName)}
                      className="gap-1 text-xs ml-1"
                    >
                      <PiLinkBreak className="w-3 h-3" /> Manage
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader variant="spinner" size="lg" /></div>
      ) : loadError ? (
        <ErrorDisplay error={loadError} onRetry={() => void loadItems()} context="general" />
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <PiChartLineUp className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-lg">No Data Metric Functions found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item: any, idx: number) => {
            const name = item.name || item.NAME || 'Unnamed';
            const tableCount = dmfTableCounts[name] || 0;
            return (
              <div key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white">{name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{item.schema_name || item.SCHEMA_NAME || ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {tableCount > 0 && (
                      <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 cursor-pointer hover:bg-blue-100"
                        onClick={() => {
                          const matchingTables = Object.entries(refsByTable).filter(([, tRefs]) =>
                            tRefs.some((r: any) => {
                              const rn = (r.DMF_NAME || r.dmf_name || r.METRIC_NAME || r.metric_name || '').split('.').pop() || '';
                              return rn === name;
                            })
                          );
                          if (matchingTables.length > 0) {
                            const [tName, tRefs] = matchingTables[0];
                            const refDb = tRefs[0]?.REF_DATABASE_NAME || tRefs[0]?.ref_database_name || '';
                            const refSc = tRefs[0]?.REF_SCHEMA_NAME || tRefs[0]?.ref_schema_name || '';
                            handleOpenTableDmfs(refDb, refSc, tName.split('.').pop() || tName);
                          }
                        }}
                      >
                        <PiTable className="w-3 h-3 mr-1 inline" />{tableCount} table{tableCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">DMF</Badge>
                  </div>
                </div>
                {(item.comment || item.COMMENT) && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{item.comment || item.COMMENT}</p>
                )}
                {confirmDeleteDmf === name && (
                  <div className="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40">
                    <p className="text-xs text-red-800 dark:text-red-200 mb-2">Drop "{name}"? This cannot be undone.</p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => executeDeleteDmf(name)} className="bg-red-600 text-white hover:bg-red-700 text-xs">
                        Confirm
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDeleteDmf(null)} className="text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <Button variant="outline" size="sm" onClick={() => handleDescribe(name)} className="gap-1">
                    <PiInfo className="w-3.5 h-3.5" /> Details
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDeleteDmf(name)} disabled={confirmDeleteDmf === name || !canDeleteDmf} title={!canDeleteDmf ? 'You lack the "delete" permission on governance. Ask an administrator to grant it.' : undefined} className="gap-1 text-red-600 hover:bg-red-50">
                    <PiTrash className="w-3.5 h-3.5" /> Drop
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Panel */}
      <PolicyFormPanel
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Data Metric Function"
        description="Define a quantitative data-quality check"
        accentClassName="bg-teal-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => handleCreate()} disabled={creating || !canCreatePolicy} title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined} className="bg-teal-600 text-white hover:bg-teal-700">
              {creating ? <Loader variant="spinner" size="sm" /> : 'Create'}
            </Button>
          </>
        }
      >
          {/* Template buttons */}
          <div>
            <p className="text-[10px] font-medium text-gray-500 mb-1.5">Quick templates:</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Null count', name: 'null_count_check', args: 'ARG TABLE(COL VARCHAR)', expr: 'SELECT COUNT_IF(COL IS NULL) FROM ARG' },
                { label: 'Distinct count', name: 'distinct_count', args: 'ARG TABLE(COL VARCHAR)', expr: 'SELECT COUNT(DISTINCT COL) FROM ARG' },
                { label: 'Row count', name: 'row_count', args: 'ARG TABLE(COL VARCHAR)', expr: 'SELECT COUNT(*) FROM ARG' },
                { label: 'Freshness (hours)', name: 'freshness_hours', args: 'ARG TABLE(TS TIMESTAMP_LTZ)', expr: 'SELECT TIMESTAMPDIFF(HOUR, MAX(TS), CURRENT_TIMESTAMP()) FROM ARG' },
                { label: 'Duplicate check', name: 'duplicate_count', args: 'ARG TABLE(COL VARCHAR)', expr: 'SELECT COUNT(*) - COUNT(DISTINCT COL) FROM ARG' },
              ].map((t) => (
                <button key={t.label} onClick={() => setCreateForm({ name: t.name, table_args: t.args, expression: t.expr, comment: t.label })}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                >{t.label}</button>
              ))}
            </div>
          </div>
          <Input label="Name" placeholder="e.g. my_null_check" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          <div>
            <Input label="Table Arguments" placeholder="TABLE_ARG TABLE(ID_ITEM NUMBER)" value={createForm.table_args} onChange={(e) => setCreateForm({ ...createForm, table_args: e.target.value })} />
            <p className="text-[10px] text-gray-400 mt-0.5">Snowflake DMF signature. Use: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ARG_NAME TABLE(col_name TYPE, ...)</code></p>
          </div>
          <div>
            <Textarea label="Expression" placeholder="SELECT COUNT_IF(ID_ITEM IS NULL) FROM TABLE_ARG" value={createForm.expression} onChange={(e) => setCreateForm({ ...createForm, expression: e.target.value })} rows={4} />
            <p className="text-[10px] text-gray-400 mt-0.5">SQL body. Reference columns from the table arg. Must return a NUMBER.</p>
          </div>
          <Input label="Comment (optional)" placeholder="Description" value={createForm.comment} onChange={(e) => setCreateForm({ ...createForm, comment: e.target.value })} />
          {createError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {createError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Associate Panel */}
      <PolicyFormPanel
        isOpen={showAssociate}
        onClose={() => setShowAssociate(false)}
        title="Associate DMF with Table"
        description="Attach a data metric function to specific columns so the data warehouse runs it on schedule."
        accentClassName="bg-teal-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAssociate(false)}>Cancel</Button>
            <Button
              onClick={() => handleAssociate()}
              disabled={!canCreatePolicy || associating || !assocTarget.table || !assocDmfName || assocColumns.length === 0}
              title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {associating ? <Loader variant="spinner" size="sm" /> : 'Associate'}
            </Button>
          </>
        }
      >
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
              onChange={(val: any) => {
                const v = typeof val === 'object' ? val?.value || '' : String(val);
                setAssocDmfName(v);
                const match = items.find((item: any) => (item.name || item.NAME || '') === v);
                if (match) {
                  setAssocDmfDb(match.database_name || match.DATABASE_NAME || database || '');
                  setAssocDmfSchema(match.schema_name || match.SCHEMA_NAME || schema || 'GOUVERNANCE');
                }
              }}
              options={items.map((item: any) => {
                const n = item.name || item.NAME || '';
                const db = item.database_name || item.DATABASE_NAME || database || '';
                const sc = item.schema_name || item.SCHEMA_NAME || schema || 'GOUVERNANCE';
                return { label: `${n} (${db}.${sc})`, value: n };
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

          {associateError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {associateError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Schedule Panel */}
      <PolicyFormPanel
        isOpen={showSchedule}
        onClose={() => {
          setShowSchedule(false);
          setSchedTarget({ database: '', schema: '', table: '' });
          setSchedForm({ table_fqn: '', schedule: '' });
        }}
        title="Set DMF Schedule"
        accentClassName="bg-teal-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancel</Button>
            <Button onClick={() => handleSchedule()} disabled={!canCreatePolicy || !schedTarget.table || !schedForm.schedule} title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined} className="bg-teal-600 text-white hover:bg-teal-700">Set Schedule</Button>
          </>
        }
      >
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Target table
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ObjectSelector
                level="database"
                value={schedTarget.database}
                onSelect={(db) => setSchedTarget({ database: db, schema: '', table: '' })}
                label="Database"
              />
              <ObjectSelector
                level="schema"
                database={schedTarget.database}
                value={schedTarget.schema}
                onSelect={(sc) => setSchedTarget((t) => ({ ...t, schema: sc, table: '' }))}
                label="Schema"
                disabled={!schedTarget.database}
              />
              <ObjectSelector
                level="table"
                database={schedTarget.database}
                schema={schedTarget.schema}
                value={schedTarget.table}
                onSelect={(tb) => setSchedTarget((t) => ({ ...t, table: tb }))}
                label="Table"
                disabled={!schedTarget.database || !schedTarget.schema}
              />
            </div>
          </div>

          <Input label="Schedule" placeholder="e.g. TRIGGER_ON_CHANGES or 5 MINUTE" value={schedForm.schedule} onChange={(e) => setSchedForm({ ...schedForm, schedule: e.target.value })} />
          {scheduleError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {scheduleError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Threshold Panel — FIX DQ-04: real POST /data-quality/dmf/thresholds call */}
      <PolicyFormPanel
        isOpen={showThreshold}
        onClose={() => {
          setShowThreshold(false);
          setThError(null);
          setThForm({ table_name: '', column_name: '', metric: 'completeness', min_value: '', max_value: '', threshold_type: 'percentage' });
        }}
        title="Set DMF Threshold"
        description="Define acceptable bounds for a data quality metric on a specific column."
        accentClassName="bg-teal-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowThreshold(false)} disabled={thSubmitting}>Cancel</Button>
            <Button
              onClick={() => handleSetThreshold()}
              disabled={!canCreatePolicy || thSubmitting || !thForm.table_name.trim() || !thForm.column_name.trim()}
              title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined}
              className="bg-teal-600 text-white hover:bg-teal-700 gap-1.5"
            >
              {thSubmitting ? <Loader variant="spinner" size="sm" /> : null}
              {thSubmitting ? 'Saving…' : 'Save Threshold'}
            </Button>
          </>
        }
      >
        <Input
          label="Table name (DB.SCHEMA.TABLE)"
          placeholder="CP_DATA360.PUBLIC.ORDERS"
          value={thForm.table_name}
          onChange={(e) => setThForm({ ...thForm, table_name: e.target.value })}
        />
        <Input
          label="Column name"
          placeholder="EMAIL"
          value={thForm.column_name}
          onChange={(e) => setThForm({ ...thForm, column_name: e.target.value })}
        />
        <Select
          label="Metric"
          value={thForm.metric}
          onChange={(val: any) => {
            const v = typeof val === 'object' ? val?.value || 'completeness' : String(val);
            setThForm({ ...thForm, metric: v });
          }}
          options={[
            { label: 'Completeness', value: 'completeness' },
            { label: 'Uniqueness', value: 'uniqueness' },
            { label: 'Freshness', value: 'freshness' },
            { label: 'Schema match', value: 'schema' },
          ]}
        />
        <Select
          label="Threshold type"
          value={thForm.threshold_type}
          onChange={(val: any) => {
            const v = typeof val === 'object' ? val?.value || 'percentage' : String(val);
            setThForm({ ...thForm, threshold_type: v as DmfThresholdPayload['threshold_type'] });
          }}
          options={[
            { label: 'Percentage', value: 'percentage' },
            { label: 'Absolute', value: 'absolute' },
            { label: 'Range', value: 'range' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Min value"
            type="number"
            placeholder="0"
            value={thForm.min_value}
            onChange={(e) => setThForm({ ...thForm, min_value: e.target.value })}
          />
          <Input
            label="Max value"
            type="number"
            placeholder="100"
            value={thForm.max_value}
            onChange={(e) => setThForm({ ...thForm, max_value: e.target.value })}
          />
        </div>
        {thError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
            {thError}
          </p>
        )}
      </PolicyFormPanel>

      {/* Detail Panel */}
      <PolicyFormPanel
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title="DMF Details"
        accentClassName="bg-teal-500"
        footer={<Button variant="outline" onClick={() => setShowDetail(false)}>Close</Button>}
      >
        <DMFDetailsModalContent detail={detail} />
      </PolicyFormPanel>

      {/* Table DMFs Panel */}
      <PolicyFormPanel
        isOpen={showTableDmfs}
        onClose={() => setShowTableDmfs(false)}
        title="Table DMF Associations"
        description={`${tableDmfsTarget.database}.${tableDmfsTarget.schema}.${tableDmfsTarget.table}`}
        accentClassName="bg-teal-500"
        footer={<Button variant="outline" onClick={() => setShowTableDmfs(false)}>Close</Button>}
      >
          <div className="flex items-center justify-end">
            <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
              {tableDmfs.length} DMF{tableDmfs.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {tableDmfsLoading ? (
            <div className="flex justify-center py-8"><Loader variant="spinner" size="lg" /></div>
          ) : tableDmfs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <PiChartLineUp className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p>No DMFs associated with this table</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tableDmfs.map((r: any, idx: number) => {
                const dmfName = r.DMF_NAME || r.dmf_name || r.METRIC_NAME || r.metric_name || '-';
                const columns = r.REF_ARGUMENTS || r.ref_arguments || r.ARGUMENT_SIGNATURE || r.argument_signature || '-';
                const schedule = r.SCHEDULE || r.schedule || '-';
                const status = r.SCHEDULE_STATUS || r.schedule_status || '-';

                const thisFqn = `${tableDmfsTarget.database}.${tableDmfsTarget.schema}.${tableDmfsTarget.table}`;
                const thisCols = columns === '-' ? [] : [columns];
                const isConfirming = confirmDisassociate?.fqn === thisFqn && confirmDisassociate?.dmf === dmfName;

                return (
                  <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-slate-900 dark:text-white">{dmfName}</h4>
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" onClick={() => executeDisassociate(thisFqn, dmfName, thisCols)}
                            disabled={disassociating} className="bg-red-600 text-white hover:bg-red-700 text-xs">
                            {disassociating ? '…' : 'Confirm'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmDisassociate(null)}
                            disabled={disassociating} className="text-xs">Cancel</Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDisassociate({ fqn: thisFqn, dmf: dmfName, cols: thisCols })}
                          disabled={disassociating || !canDeleteDmf}
                          title={!canDeleteDmf ? 'You lack the "delete" permission on governance. Ask an administrator to grant it.' : undefined}
                          className="gap-1 text-red-600 hover:bg-red-50"
                        >
                          <PiLinkBreak className="w-3.5 h-3.5" /> Disassociate
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Columns</span>
                        <p className="font-mono text-slate-700 dark:text-slate-300 truncate">{columns}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Schedule</span>
                        <p className="font-mono text-slate-700 dark:text-slate-300">{schedule}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Status</span>
                        <Badge className={`text-xs ${status === 'STARTED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                          {status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </PolicyFormPanel>
    </div>
  );
}

// ─── DMF details modal body ───
// Snowflake DESCRIBE FUNCTION returns a list of {property, value} rows.
// We render them as a property grid, pulling out "body" (SQL) into its own
// code block for readability.
function DMFDetailsModalContent({ detail }: { detail: any }) {
  if (!detail) {
    return <p className="text-slate-500">No details available</p>;
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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400">{name}</p>
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
    </div>
  );
}
