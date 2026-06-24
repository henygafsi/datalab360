'use client';
import { useState, useMemo } from 'react';
import { Input, Button, Select, Textarea, Badge } from 'rizzui';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { toServiceError } from '@/app/services/_errors';
import {
  AlertTriangle, Clock, Database, RefreshCw, Shield, BarChart3,
  Zap, Sparkles, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DesignDockPanel from './DesignDockPanel';
import { useCacheInvalidationContext } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceTable?: { database: string; schema: string; table: string };
  warehouses?: string[];
  columns?: { name: string; dataType: string }[];
  /** Called after a successful create so the canvas / source list can refresh. */
  onCreated?: () => void;
}

// ── Prebuilt Alert Templates ──────────────────────────────────────
interface AlertTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'data-quality' | 'freshness' | 'security' | 'cost' | 'deployment';
  color: string;
  buildCondition: (db: string, schema: string, table: string, col?: string) => string;
  buildAction: (db: string, schema: string, table: string) => string;
  schedule: string;
  requiresColumn?: boolean;
}

const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    id: 'freshness_stale',
    name: 'Stale Data Alert',
    description: 'Fires when table has not been updated in N hours',
    icon: Clock,
    category: 'freshness',
    color: 'from-amber-500 to-orange-500',
    schedule: '60 MINUTE',
    buildCondition: (db, schema, table) =>
      `SELECT 1 FROM SNOWFLAKE.ACCOUNT_USAGE.TABLE_STORAGE_METRICS\nWHERE TABLE_CATALOG = '${db}' AND TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'\n  AND DATEDIFF('hour', LAST_ALTERED, CURRENT_TIMESTAMP()) > 24`,
    buildAction: (db, schema, table) =>
      `CALL SYSTEM$SEND_EMAIL('data-alerts@company.com', 'Stale Data: ${db}.${schema}.${table}', 'Table has not been updated in 24+ hours')`,
  },
  {
    id: 'null_spike',
    name: 'Null Spike Alert',
    description: 'Fires when null % exceeds threshold on a column',
    icon: BarChart3,
    category: 'data-quality',
    color: 'from-red-500 to-rose-500',
    schedule: '60 MINUTE',
    requiresColumn: true,
    buildCondition: (db, schema, table, col) =>
      `SELECT 1 FROM (\n  SELECT COUNT_IF(${col || 'COLUMN_NAME'} IS NULL) * 100.0 / NULLIF(COUNT(*), 0) AS null_pct\n  FROM ${db}.${schema}.${table}\n) WHERE null_pct > 10`,
    buildAction: (db, schema, table) =>
      `INSERT INTO ${db}.EVENT_STORE.DQ_ALERTS (TABLE_FQN, ALERT_TYPE, SEVERITY, DETECTED_AT)\nVALUES ('${db}.${schema}.${table}', 'NULL_SPIKE', 'HIGH', CURRENT_TIMESTAMP())`,
  },
  {
    id: 'row_count_drop',
    name: 'Row Count Drop Alert',
    description: 'Fires when row count drops by more than 20%',
    icon: Database,
    category: 'data-quality',
    color: 'from-blue-500 to-indigo-500',
    schedule: 'USING CRON 0 6 * * * UTC',
    buildCondition: (db, schema, table) =>
      `SELECT 1 FROM (\n  SELECT COUNT(*) AS current_count,\n    (SELECT COUNT(*) FROM ${db}.${schema}.${table} AT(OFFSET => -86400)) AS prev_count\n  FROM ${db}.${schema}.${table}\n) WHERE current_count < prev_count * 0.8`,
    buildAction: (db, schema, table) =>
      `INSERT INTO ${db}.EVENT_STORE.DQ_ALERTS (TABLE_FQN, ALERT_TYPE, SEVERITY, DETECTED_AT)\nVALUES ('${db}.${schema}.${table}', 'ROW_COUNT_DROP', 'CRITICAL', CURRENT_TIMESTAMP())`,
  },
  {
    id: 'schema_drift',
    name: 'Schema Drift Alert',
    description: 'Fires when columns are added or removed',
    icon: RefreshCw,
    category: 'deployment',
    color: 'from-violet-500 to-purple-500',
    schedule: 'USING CRON 0 * * * * UTC',
    buildCondition: (db, schema, table) =>
      `SELECT 1 FROM (\n  SELECT COUNT(*) AS col_count FROM ${db}.INFORMATION_SCHEMA.COLUMNS\n  WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}'\n) WHERE col_count != (SELECT VALUE FROM ${db}.EVENT_STORE.SCHEMA_BASELINE WHERE TABLE_NAME = '${table}')`,
    buildAction: (db, schema, table) =>
      `INSERT INTO ${db}.EVENT_STORE.DQ_ALERTS (TABLE_FQN, ALERT_TYPE, SEVERITY, DETECTED_AT)\nVALUES ('${db}.${schema}.${table}', 'SCHEMA_DRIFT', 'HIGH', CURRENT_TIMESTAMP())`,
  },
  {
    id: 'policy_coverage',
    name: 'Unmasked PII Alert',
    description: 'Fires when PII columns lack masking policies',
    icon: Shield,
    category: 'security',
    color: 'from-emerald-500 to-teal-500',
    schedule: 'USING CRON 0 8 * * 1 UTC',
    buildCondition: (db, schema, table) =>
      `SELECT 1 FROM ${db}.INFORMATION_SCHEMA.COLUMNS c\nWHERE c.TABLE_SCHEMA = '${schema}' AND c.TABLE_NAME = '${table}'\n  AND (c.COLUMN_NAME ILIKE '%EMAIL%' OR c.COLUMN_NAME ILIKE '%PHONE%' OR c.COLUMN_NAME ILIKE '%SSN%')\n  AND NOT EXISTS (\n    SELECT 1 FROM TABLE(INFORMATION_SCHEMA.POLICY_REFERENCES(REF_ENTITY_NAME => '${db}.${schema}.${table}', REF_ENTITY_DOMAIN => 'TABLE'))\n    WHERE POLICY_KIND = 'MASKING_POLICY' AND REF_COLUMN_NAME = c.COLUMN_NAME\n  )`,
    buildAction: (db, schema, table) =>
      `CALL SYSTEM$SEND_EMAIL('security@company.com', 'PII Alert: ${db}.${schema}.${table}', 'PII columns without masking policy detected')`,
  },
  {
    id: 'ingestion_failure',
    name: 'Ingestion Failure Alert',
    description: 'Fires when COPY INTO has errors in recent loads',
    icon: Zap,
    category: 'data-quality',
    color: 'from-orange-500 to-red-500',
    schedule: '30 MINUTE',
    buildCondition: (db, schema, table) =>
      `SELECT 1 FROM SNOWFLAKE.ACCOUNT_USAGE.COPY_HISTORY\nWHERE TABLE_NAME = '${table}' AND TABLE_SCHEMA_NAME = '${schema}'\n  AND LAST_LOAD_TIME >= DATEADD('hour', -1, CURRENT_TIMESTAMP())\n  AND STATUS = 'LOAD_FAILED'`,
    buildAction: (db, schema, table) =>
      `INSERT INTO ${db}.EVENT_STORE.DQ_ALERTS (TABLE_FQN, ALERT_TYPE, SEVERITY, DETECTED_AT)\nVALUES ('${db}.${schema}.${table}', 'INGESTION_FAILURE', 'CRITICAL', CURRENT_TIMESTAMP())`,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  'data-quality': 'Data Quality',
  'freshness': 'Freshness',
  'security': 'Security',
  'cost': 'Cost',
  'deployment': 'Deployment',
};

export default function AlertModal({ isOpen, onClose, sourceTable, warehouses = [], columns = [], onCreated }: Props) {
  const { markStale } = useCacheInvalidationContext();
  const [mode, setMode] = useState<'templates' | 'custom'>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedColumn, setSelectedColumn] = useState('');
  const [name, setName] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [schedule, setSchedule] = useState('60 MINUTE');
  const [condition, setCondition] = useState('');
  const [action, setAction] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const db = sourceTable?.database || 'CP_DATA360';
  const schema = sourceTable?.schema || 'PUBLIC';
  const table = sourceTable?.table || 'MY_TABLE';

  const activeTemplate = useMemo(
    () => ALERT_TEMPLATES.find(t => t.id === selectedTemplate),
    [selectedTemplate]
  );

  const applyTemplate = (tmpl: AlertTemplate) => {
    setSelectedTemplate(tmpl.id);
    setName(`${tmpl.id}_${table}`.toLowerCase());
    setSchedule(tmpl.schedule);
    setCondition(tmpl.buildCondition(db, schema, table, selectedColumn || undefined));
    setAction(tmpl.buildAction(db, schema, table));
    setComment(tmpl.description);
    setMode('custom'); // switch to custom view to show generated SQL
  };

  const handleCreate = async () => {
    if (!name || !warehouse || !condition || !action) {
      toast.error('Name, warehouse, condition, and action are required');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/explore-design/alerts', {
        name, warehouse, schedule, condition, action,
        comment: comment || undefined,
        database: sourceTable?.database,
        schema: sourceTable?.schema,
      });
      toast.success(`Alert "${name}" created`);
      markStale([CACHE_KEYS.ALERTS]);
      onCreated?.();
      onClose();
    } catch (e: any) {
      toast.error(toServiceError(e, 'Failed to create alert').message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Create Alert"
      subtitle={sourceTable ? `on ${sourceTable.database}.${sourceTable.schema}.${sourceTable.table}` : 'Scheduled condition monitoring'}
      widthClass="max-w-2xl"
      icon={
        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
          <AlertTriangle className="h-5 w-5 text-white" />
        </div>
      }
      footer={
        <div className="flex justify-between items-center">
          {mode === 'custom' && activeTemplate ? (
            <button
              onClick={() => setMode('templates')}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              ← Back to templates
            </button>
          ) : <div className="flex-1" />}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              isLoading={loading}
              onClick={handleCreate}
              disabled={loading || mode === 'templates' || !name || !warehouse}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md"
            >
              Create Alert
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center justify-end">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setMode('templates')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                mode === 'templates' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'
              )}
            >
              <Sparkles className="h-3 w-3 inline mr-1" />
              Templates
            </button>
            <button
              onClick={() => setMode('custom')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                mode === 'custom' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'
              )}
            >
              Custom SQL
            </button>
          </div>
        </div>

        {mode === 'templates' ? (
          /* ── Template Gallery ── */
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a prebuilt alert template — SQL is auto-generated for your table.
            </p>
            {columns.length > 0 && (
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">
                  Target Column (for column-level alerts)
                </label>
                <select
                  value={selectedColumn}
                  onChange={(e) => setSelectedColumn(e.target.value)}
                  className="w-full p-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="">All columns</option>
                  {columns.map(c => (
                    <option key={c.name} value={c.name}>{c.name} ({c.dataType})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto">
              {ALERT_TEMPLATES.map((tmpl) => {
                const Icon = tmpl.icon;
                const isSelected = selectedTemplate === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-900/20 ring-1 ring-amber-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    )}
                  >
                    <div className={cn('p-2 rounded-lg bg-gradient-to-br text-white shadow-sm', tmpl.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{tmpl.name}</span>
                        <Badge size="sm" className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                          {CATEGORY_LABELS[tmpl.category]}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tmpl.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Custom / Generated SQL ── */
          <div className="space-y-3">
            {activeTemplate && (
              <div className={cn('p-3 rounded-lg border bg-gradient-to-r text-white text-sm', activeTemplate.color)}>
                <span className="font-medium">Template: {activeTemplate.name}</span>
                <span className="ml-2 text-white/80">— SQL generated for {table}</span>
              </div>
            )}
            <Input
              label="Alert Name"
              placeholder="my_freshness_alert"
              value={name}
              onChange={(e) => setName(e.target.value)}
              inputClassName="dark:bg-slate-800 dark:border-slate-700"
            />
            <Select
              label="Warehouse"
              options={warehouses.length > 0 ? warehouses.map(w => ({ label: w, value: w })) : [{ label: 'COMPUTE_WH', value: 'COMPUTE_WH' }]}
              value={warehouse}
              onChange={(v: any) => setWarehouse(v?.value || v)}
              placeholder="Select warehouse"
            />
            <Input
              label="Schedule"
              placeholder="60 MINUTE or USING CRON 0 * * * * UTC"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              inputClassName="dark:bg-slate-800 dark:border-slate-700"
            />
            <Textarea
              label="Condition (SQL)"
              placeholder="SELECT 1 FROM ... WHERE ..."
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              rows={4}
              className="font-mono text-xs"
              textareaClassName="dark:bg-slate-800 dark:border-slate-700"
            />
            <Textarea
              label="Action (SQL)"
              placeholder="INSERT INTO alerts_log ... or CALL SYSTEM$SEND_EMAIL(...)"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              rows={3}
              className="font-mono text-xs"
              textareaClassName="dark:bg-slate-800 dark:border-slate-700"
            />
            <Input
              label="Comment (optional)"
              placeholder="Description"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              inputClassName="dark:bg-slate-800 dark:border-slate-700"
            />
          </div>
        )}
      </div>
    </DesignDockPanel>
  );
}
