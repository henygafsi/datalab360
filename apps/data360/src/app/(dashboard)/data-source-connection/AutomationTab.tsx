'use client';

import { useState, FormEvent } from 'react';
import { Input, Button, Checkbox, Text, Badge, Loader } from 'rizzui';
import { Plus, FileText, Table, Activity, Zap, Clock, ChevronDown, ChevronUp, X } from 'lucide-react';
import toast from 'react-hot-toast';

const _errMsg = (e: any) => { const d = e?.response?.data?.detail; return typeof d === 'string' ? d : d?.message || e?.message || 'Unknown error'; };
import {
  createFileFormat,
  createExternalTable,
  createStream,
  createDynamicTable,
  createTask,
  resumeTask,
  suspendTask,
} from './connectionServices';
import { PipesTab, StreamsTab, DynamicTablesTab, ExternalTablesTab } from './InfrastructureTabs';

type InfraSubTab = 'pipes' | 'streams' | 'dynamic-tables' | 'external-tables';
type CreateForm = 'file-format' | 'external-table' | 'stream' | 'dynamic-table' | 'task' | null;

export default function AutomationTab() {
  const [activeSubTab, setActiveSubTab] = useState<InfraSubTab>('pipes');
  const [showCreateForm, setShowCreateForm] = useState<CreateForm>(null);
  const [loading, setLoading] = useState(false);

  // --- File Format Form ---
  const [fileFormatData, setFileFormatData] = useState({
    format_name: '', format_type: 'CSV' as 'CSV' | 'JSON' | 'AVRO' | 'ORC' | 'PARQUET' | 'XML',
    field_delimiter: ',', skip_header: 1, field_optionally_enclosed_by: '',
    strip_outer_array: false, compression: 'AUTO', comment: '',
  });

  // --- External Table Form ---
  const [extTableData, setExtTableData] = useState({
    table_name: '', stage_name: '', file_format_name: '', file_format_type: '',
    location: '', pattern: '', auto_refresh: true,
  });

  // --- Stream Form ---
  const [streamData, setStreamData] = useState({
    stream_name: '', source_object: '', append_only: false, show_initial_rows: false, comment: '',
  });

  // --- Dynamic Table Form ---
  const [dynTableData, setDynTableData] = useState({
    table_name: '', target_lag: '1 hour', warehouse: 'COMPUTE_WH', query: '', comment: '',
  });

  // --- Task Form ---
  const [taskData, setTaskData] = useState({
    task_name: '', warehouse: 'COMPUTE_WH', schedule: '', sql_statement: '',
    after: '', when_condition: '', comment: '',
  });

  const handleCreateFileFormat = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createFileFormat({
        format_name: fileFormatData.format_name,
        format_type: fileFormatData.format_type,
        field_delimiter: fileFormatData.format_type === 'CSV' ? fileFormatData.field_delimiter : undefined,
        skip_header: fileFormatData.format_type === 'CSV' ? fileFormatData.skip_header : undefined,
        field_optionally_enclosed_by: fileFormatData.format_type === 'CSV' && fileFormatData.field_optionally_enclosed_by ? fileFormatData.field_optionally_enclosed_by : undefined,
        strip_outer_array: fileFormatData.format_type === 'JSON' ? fileFormatData.strip_outer_array : undefined,
        compression: fileFormatData.compression || undefined,
        comment: fileFormatData.comment || undefined,
      });
      toast.success(`File format "${fileFormatData.format_name}" created!`);
      setShowCreateForm(null);
      setFileFormatData({ format_name: '', format_type: 'CSV', field_delimiter: ',', skip_header: 1, field_optionally_enclosed_by: '', strip_outer_array: false, compression: 'AUTO', comment: '' });
    } catch (err: any) {
      toast.error(_errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExternalTable = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createExternalTable({
        table_name: extTableData.table_name,
        stage_name: extTableData.stage_name,
        file_format_name: extTableData.file_format_name || undefined,
        file_format_type: extTableData.file_format_type || undefined,
        location: extTableData.location || undefined,
        pattern: extTableData.pattern || undefined,
        auto_refresh: extTableData.auto_refresh,
      });
      toast.success(`External table "${extTableData.table_name}" created!`);
      setShowCreateForm(null);
      setExtTableData({ table_name: '', stage_name: '', file_format_name: '', file_format_type: '', location: '', pattern: '', auto_refresh: true });
    } catch (err: any) {
      toast.error(_errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStream = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createStream({
        stream_name: streamData.stream_name,
        source_object: streamData.source_object,
        append_only: streamData.append_only,
        show_initial_rows: streamData.show_initial_rows,
        comment: streamData.comment || undefined,
      });
      toast.success(`Stream "${streamData.stream_name}" created!`);
      setShowCreateForm(null);
      setStreamData({ stream_name: '', source_object: '', append_only: false, show_initial_rows: false, comment: '' });
    } catch (err: any) {
      toast.error(_errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDynamicTable = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createDynamicTable({
        table_name: dynTableData.table_name,
        target_lag: dynTableData.target_lag,
        warehouse: dynTableData.warehouse,
        query: dynTableData.query,
        comment: dynTableData.comment || undefined,
      });
      toast.success(`Dynamic table "${dynTableData.table_name}" created!`);
      setShowCreateForm(null);
      setDynTableData({ table_name: '', target_lag: '1 hour', warehouse: 'COMPUTE_WH', query: '', comment: '' });
    } catch (err: any) {
      toast.error(_errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createTask({
        task_name: taskData.task_name,
        warehouse: taskData.warehouse,
        schedule: taskData.schedule || undefined,
        sql_statement: taskData.sql_statement,
        after: taskData.after || undefined,
        when_condition: taskData.when_condition || undefined,
        comment: taskData.comment || undefined,
      });
      toast.success(`Task "${taskData.task_name}" created (suspended). Resume it to start.`);
      setShowCreateForm(null);
      setTaskData({ task_name: '', warehouse: 'COMPUTE_WH', schedule: '', sql_statement: '', after: '', when_condition: '', comment: '' });
    } catch (err: any) {
      toast.error(_errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const subTabs: { id: InfraSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'pipes', label: 'Pipes', icon: <Zap className="h-4 w-4" /> },
    { id: 'streams', label: 'Streams', icon: <Activity className="h-4 w-4" /> },
    { id: 'dynamic-tables', label: 'Dynamic Tables', icon: <Table className="h-4 w-4" /> },
    { id: 'external-tables', label: 'External Tables', icon: <FileText className="h-4 w-4" /> },
  ];

  const createActions: { id: CreateForm; label: string; description: string; icon: React.ReactNode }[] = [
    { id: 'file-format', label: 'File Format', description: 'Define how to parse staged files (CSV, JSON, Parquet...)', icon: <FileText className="h-5 w-5" /> },
    { id: 'external-table', label: 'External Table', description: 'Query data in cloud storage without loading', icon: <Table className="h-5 w-5" /> },
    { id: 'stream', label: 'Stream (CDC)', description: 'Change data capture on a table or view', icon: <Activity className="h-5 w-5" /> },
    { id: 'dynamic-table', label: 'Dynamic Table', description: 'Auto-refreshing materialized query result', icon: <Table className="h-5 w-5" /> },
    { id: 'task', label: 'Scheduled Task', description: 'Schedule SQL execution with CRON or interval', icon: <Clock className="h-5 w-5" /> },
  ];

  const formCardClass = "mx-auto w-full max-w-lg rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-8 shadow-xl border border-slate-200/50 dark:border-slate-700/50";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Quick Create Actions */}
      <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-blue-500" />
          Create Snowflake Objects
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {createActions.map((action) => (
            <button
              key={action.id}
              onClick={() => setShowCreateForm(showCreateForm === action.id ? null : action.id)}
              className={`flex flex-col items-start gap-2 p-4 rounded-xl border transition-all text-left ${
                showCreateForm === action.id
                  ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30 shadow-md'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              <div className={`p-2 rounded-lg ${showCreateForm === action.id ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                {action.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{action.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{action.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Creation Forms */}
      {showCreateForm && (
        <div className="animate-fade-in-up">
          {showCreateForm === 'file-format' && (
            <div className={formCardClass}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create File Format</h3>
                <button onClick={() => setShowCreateForm(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleCreateFileFormat}>
                <Input label="Format Name" placeholder="e.g., my_csv_format" value={fileFormatData.format_name} onChange={(e) => setFileFormatData(p => ({ ...p, format_name: e.target.value }))} required disabled={loading} className="w-full" />
                <div>
                  <label className={labelClass}>Format Type</label>
                  <select value={fileFormatData.format_type} onChange={(e) => setFileFormatData(p => ({ ...p, format_type: e.target.value as any }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" disabled={loading}>
                    {['CSV', 'JSON', 'AVRO', 'ORC', 'PARQUET', 'XML'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {fileFormatData.format_type === 'CSV' && (
                  <>
                    <Input label="Field Delimiter" value={fileFormatData.field_delimiter} onChange={(e) => setFileFormatData(p => ({ ...p, field_delimiter: e.target.value }))} disabled={loading} className="w-full" />
                    <Input label="Skip Header Rows" type="number" value={String(fileFormatData.skip_header)} onChange={(e) => setFileFormatData(p => ({ ...p, skip_header: parseInt(e.target.value) || 0 }))} disabled={loading} className="w-full" />
                    <Input label="Field Enclosed By (optional)" placeholder='e.g., "' value={fileFormatData.field_optionally_enclosed_by} onChange={(e) => setFileFormatData(p => ({ ...p, field_optionally_enclosed_by: e.target.value }))} disabled={loading} className="w-full" />
                  </>
                )}
                {fileFormatData.format_type === 'JSON' && (
                  <Checkbox label="Strip outer JSON array" checked={fileFormatData.strip_outer_array} onChange={(e) => setFileFormatData(p => ({ ...p, strip_outer_array: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                )}
                <Input label="Compression" placeholder="AUTO, GZIP, BZ2, BROTLI, ZSTD, NONE" value={fileFormatData.compression} onChange={(e) => setFileFormatData(p => ({ ...p, compression: e.target.value }))} disabled={loading} className="w-full" />
                <Input label="Comment (optional)" value={fileFormatData.comment} onChange={(e) => setFileFormatData(p => ({ ...p, comment: e.target.value }))} disabled={loading} className="w-full" />
                <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" disabled={loading}>
                  {loading ? 'Creating...' : 'Create File Format'}
                </Button>
              </form>
            </div>
          )}

          {showCreateForm === 'external-table' && (
            <div className={formCardClass}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create External Table</h3>
                <button onClick={() => setShowCreateForm(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleCreateExternalTable}>
                <Input label="Table Name" placeholder="e.g., ext_sales_data" value={extTableData.table_name} onChange={(e) => setExtTableData(p => ({ ...p, table_name: e.target.value }))} required disabled={loading} className="w-full" />
                <Input label="Stage Name" placeholder="e.g., my_s3_stage" helperText="The stage containing data files" value={extTableData.stage_name} onChange={(e) => setExtTableData(p => ({ ...p, stage_name: e.target.value }))} required disabled={loading} className="w-full" />
                <Input label="File Format Name (optional)" placeholder="e.g., my_csv_format" helperText="Named file format to use" value={extTableData.file_format_name} onChange={(e) => setExtTableData(p => ({ ...p, file_format_name: e.target.value }))} disabled={loading} className="w-full" />
                <Input label="Inline File Format Type (optional)" placeholder="CSV, JSON, PARQUET" helperText="Use instead of named format" value={extTableData.file_format_type} onChange={(e) => setExtTableData(p => ({ ...p, file_format_type: e.target.value }))} disabled={loading} className="w-full" />
                <Input label="Location (optional)" placeholder="e.g., /data/2024/" helperText="Subpath within stage" value={extTableData.location} onChange={(e) => setExtTableData(p => ({ ...p, location: e.target.value }))} disabled={loading} className="w-full" />
                <Input label="File Pattern (optional)" placeholder="e.g., .*\.parquet" helperText="Regex to filter files" value={extTableData.pattern} onChange={(e) => setExtTableData(p => ({ ...p, pattern: e.target.value }))} disabled={loading} className="w-full" />
                <Checkbox label="Enable auto-refresh from cloud events" checked={extTableData.auto_refresh} onChange={(e) => setExtTableData(p => ({ ...p, auto_refresh: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700" disabled={loading}>
                  {loading ? 'Creating...' : 'Create External Table'}
                </Button>
              </form>
            </div>
          )}

          {showCreateForm === 'stream' && (
            <div className={formCardClass}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create Stream (CDC)</h3>
                <button onClick={() => setShowCreateForm(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleCreateStream}>
                <Input label="Stream Name" placeholder="e.g., orders_stream" value={streamData.stream_name} onChange={(e) => setStreamData(p => ({ ...p, stream_name: e.target.value }))} required disabled={loading} className="w-full" />
                <Input label="Source Object" placeholder="e.g., CP_DATA360.RAW.ORDERS" helperText="Fully qualified table/view name (DB.SCHEMA.TABLE)" value={streamData.source_object} onChange={(e) => setStreamData(p => ({ ...p, source_object: e.target.value }))} required disabled={loading} className="w-full" />
                <Checkbox label="Append-only (track inserts only, no deletes/updates)" checked={streamData.append_only} onChange={(e) => setStreamData(p => ({ ...p, append_only: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                <Checkbox label="Show initial rows (include existing rows on creation)" checked={streamData.show_initial_rows} onChange={(e) => setStreamData(p => ({ ...p, show_initial_rows: (e.target as HTMLInputElement).checked }))} disabled={loading} />
                <Input label="Comment (optional)" value={streamData.comment} onChange={(e) => setStreamData(p => ({ ...p, comment: e.target.value }))} disabled={loading} className="w-full" />
                <Button type="submit" className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Stream'}
                </Button>
              </form>
            </div>
          )}

          {showCreateForm === 'dynamic-table' && (
            <div className={formCardClass}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create Dynamic Table</h3>
                <button onClick={() => setShowCreateForm(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleCreateDynamicTable}>
                <Input label="Table Name" placeholder="e.g., daily_revenue_summary" value={dynTableData.table_name} onChange={(e) => setDynTableData(p => ({ ...p, table_name: e.target.value }))} required disabled={loading} className="w-full" />
                <Input label="Target Lag" placeholder="e.g., 5 minutes, 1 hour, downstream" helperText="How fresh the data should be" value={dynTableData.target_lag} onChange={(e) => setDynTableData(p => ({ ...p, target_lag: e.target.value }))} required disabled={loading} className="w-full" />
                <Input label="Warehouse" placeholder="COMPUTE_WH" helperText="Warehouse used for refresh compute" value={dynTableData.warehouse} onChange={(e) => setDynTableData(p => ({ ...p, warehouse: e.target.value }))} required disabled={loading} className="w-full" />
                <div>
                  <label className={labelClass}>SQL Query</label>
                  <textarea
                    value={dynTableData.query}
                    onChange={(e) => setDynTableData(p => ({ ...p, query: e.target.value }))}
                    placeholder="SELECT col1, SUM(amount) FROM my_table GROUP BY col1"
                    required
                    disabled={loading}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">SELECT query defining the dynamic table content</p>
                </div>
                <Input label="Comment (optional)" value={dynTableData.comment} onChange={(e) => setDynTableData(p => ({ ...p, comment: e.target.value }))} disabled={loading} className="w-full" />
                <Button type="submit" className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Dynamic Table'}
                </Button>
              </form>
            </div>
          )}

          {showCreateForm === 'task' && (
            <div className={formCardClass}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create Scheduled Task</h3>
                <button onClick={() => setShowCreateForm(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleCreateTask}>
                <Input label="Task Name" placeholder="e.g., daily_etl_job" value={taskData.task_name} onChange={(e) => setTaskData(p => ({ ...p, task_name: e.target.value }))} required disabled={loading} className="w-full" />
                <Input label="Warehouse" placeholder="COMPUTE_WH" value={taskData.warehouse} onChange={(e) => setTaskData(p => ({ ...p, warehouse: e.target.value }))} required disabled={loading} className="w-full" />
                <Input label="Schedule" placeholder="e.g., USING CRON 0 3 * * * UTC  or  5 MINUTE" helperText="CRON expression or interval" value={taskData.schedule} onChange={(e) => setTaskData(p => ({ ...p, schedule: e.target.value }))} disabled={loading} className="w-full" />
                <div>
                  <label className={labelClass}>SQL Statement</label>
                  <textarea
                    value={taskData.sql_statement}
                    onChange={(e) => setTaskData(p => ({ ...p, sql_statement: e.target.value }))}
                    placeholder="INSERT INTO target_table SELECT * FROM source_stream"
                    required
                    disabled={loading}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <Input label="After (optional)" placeholder="e.g., parent_task_name" helperText="Parent task for DAG chains" value={taskData.after} onChange={(e) => setTaskData(p => ({ ...p, after: e.target.value }))} disabled={loading} className="w-full" />
                <Input label="When Condition (optional)" placeholder="e.g., SYSTEM$STREAM_HAS_DATA('mystream')" helperText="Boolean condition to decide execution" value={taskData.when_condition} onChange={(e) => setTaskData(p => ({ ...p, when_condition: e.target.value }))} disabled={loading} className="w-full" />
                <Input label="Comment (optional)" value={taskData.comment} onChange={(e) => setTaskData(p => ({ ...p, comment: e.target.value }))} disabled={loading} className="w-full" />
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400">Tasks are created in SUSPENDED state. Use the resume action to start execution.</p>
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Task (Suspended)'}
                </Button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Infrastructure Browser */}
      <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
        {/* Sub-tabs */}
        <div className="border-b border-slate-200 dark:border-slate-700 px-4">
          <div className="flex space-x-1 overflow-x-auto">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap border-b-2 ${
                  activeSubTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeSubTab === 'pipes' && <PipesTab />}
          {activeSubTab === 'streams' && <StreamsTab />}
          {activeSubTab === 'dynamic-tables' && <DynamicTablesTab />}
          {activeSubTab === 'external-tables' && <ExternalTablesTab />}
        </div>
      </div>
    </div>
  );
}
