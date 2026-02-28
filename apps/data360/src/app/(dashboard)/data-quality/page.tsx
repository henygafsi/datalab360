'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader } from 'rizzui';
import {
  CheckCircle2, AlertTriangle, Database, Clock,
  Shield, DollarSign, FileSearch, BarChart3,
  RefreshCw, Upload, Table2, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';

// ── Types ──

interface KpiCard {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: string;
}

interface TabDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MetricRow {
  [key: string]: unknown;
}

// ── Tabs ──

const TABS: TabDef[] = [
  { id: 'completeness', label: 'Completeness', icon: CheckCircle2 },
  { id: 'freshness', label: 'Freshness', icon: Clock },
  { id: 'ingestion', label: 'Ingestion', icon: Upload },
  { id: 'schema', label: 'Schema', icon: Table2 },
  { id: 'classification', label: 'Classification', icon: Tag },
  { id: 'cost', label: 'Cost', icon: DollarSign },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'dmf', label: 'DMF Results', icon: FileSearch },
];

// ── API helpers ──

async function fetchQualityData(endpoint: string): Promise<any> {
  try {
    const res = await apiClient.get(`/data-quality/${endpoint}`);
    return res.data;
  } catch {
    return null;
  }
}

// ── Shared components ──

function MetricTable({ columns, data, emptyMsg }: {
  columns: { key: string; label: string; format?: (v: unknown) => string }[];
  data: MetricRow[];
  emptyMsg?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
        {emptyMsg || 'No data available'}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {col.format ? col.format(row[col.key]) : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className }: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden', className)}>
      {title && (
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-blue-500" />}
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">{title}</h3>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Tab content components ──

function CompletenessTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="Column Completeness" icon={CheckCircle2}>
      <p className="text-xs text-slate-500 mb-3">NULL counts and completeness percentage per column. Data from DMF NULL_COUNT checks.</p>
      <MetricTable
        columns={[
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'COLUMN_NAME', label: 'Column' },
          { key: 'TOTAL_ROWS', label: 'Total Rows', format: (v) => Number(v || 0).toLocaleString() },
          { key: 'NULL_COUNT', label: 'Nulls', format: (v) => Number(v || 0).toLocaleString() },
          { key: 'COMPLETENESS_PCT', label: 'Complete', format: (v) => `${Number(v || 0).toFixed(1)}%` },
        ]}
        data={data || []}
        emptyMsg="Run DMF NULL_COUNT checks to see completeness data"
      />
    </SectionCard>
  );
}

function FreshnessTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="Data Freshness" icon={Clock}>
      <p className="text-xs text-slate-500 mb-3">Time since last update for each table. SLA violations highlighted.</p>
      <MetricTable
        columns={[
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'SCHEMA_NAME', label: 'Schema' },
          { key: 'LAST_ALTERED', label: 'Last Altered' },
          { key: 'AGE_HOURS', label: 'Age (hours)', format: (v) => Number(v || 0).toFixed(1) },
          { key: 'ROW_COUNT', label: 'Rows', format: (v) => Number(v || 0).toLocaleString() },
        ]}
        data={data || []}
        emptyMsg="No freshness data available"
      />
    </SectionCard>
  );
}

function IngestionTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="Ingestion Metrics" icon={Upload}>
      <p className="text-xs text-slate-500 mb-3">COPY_HISTORY success rates and failed load tracking.</p>
      <MetricTable
        columns={[
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'FILE_NAME', label: 'File' },
          { key: 'STATUS', label: 'Status' },
          { key: 'ROW_COUNT', label: 'Rows Loaded', format: (v) => Number(v || 0).toLocaleString() },
          { key: 'ERRORS_SEEN', label: 'Errors', format: (v) => Number(v || 0).toLocaleString() },
          { key: 'LAST_LOAD_TIME', label: 'Loaded At' },
        ]}
        data={data || []}
        emptyMsg="No ingestion history available"
      />
    </SectionCard>
  );
}

function SchemaTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="Schema Quality" icon={Table2}>
      <p className="text-xs text-slate-500 mb-3">Missing primary keys, undocumented tables and columns from INFORMATION_SCHEMA.</p>
      <MetricTable
        columns={[
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'COLUMN_COUNT', label: 'Columns', format: (v) => Number(v || 0).toLocaleString() },
          { key: 'HAS_PK', label: 'Has PK', format: (v) => v ? 'Yes' : 'No' },
          { key: 'DOCUMENTED_PCT', label: 'Documented', format: (v) => `${Number(v || 0).toFixed(0)}%` },
          { key: 'TABLE_TYPE', label: 'Type' },
        ]}
        data={data || []}
        emptyMsg="No schema quality data available"
      />
    </SectionCard>
  );
}

function ClassificationTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="Classification Coverage" icon={Tag}>
      <p className="text-xs text-slate-500 mb-3">Tag coverage and privacy category classification from Snowflake classification.</p>
      <MetricTable
        columns={[
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'COLUMN_NAME', label: 'Column' },
          { key: 'TAG_NAME', label: 'Tag' },
          { key: 'TAG_VALUE', label: 'Value' },
          { key: 'CATEGORY', label: 'Category' },
        ]}
        data={data || []}
        emptyMsg="No classification tags found. Run SYSTEM$CLASSIFY to tag sensitive columns."
      />
    </SectionCard>
  );
}

function CostTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="Storage & Cost" icon={DollarSign}>
      <p className="text-xs text-slate-500 mb-3">Storage usage per table and estimated credit costs from ACCOUNT_USAGE.</p>
      <MetricTable
        columns={[
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'SCHEMA_NAME', label: 'Schema' },
          { key: 'ACTIVE_BYTES', label: 'Active Storage', format: (v) => `${(Number(v || 0) / 1024 / 1024).toFixed(1)} MB` },
          { key: 'TIME_TRAVEL_BYTES', label: 'Time Travel', format: (v) => `${(Number(v || 0) / 1024 / 1024).toFixed(1)} MB` },
          { key: 'FAILSAFE_BYTES', label: 'Failsafe', format: (v) => `${(Number(v || 0) / 1024 / 1024).toFixed(1)} MB` },
          { key: 'ROW_COUNT', label: 'Rows', format: (v) => Number(v || 0).toLocaleString() },
        ]}
        data={data || []}
        emptyMsg="No storage data available"
      />
    </SectionCard>
  );
}

function SecurityTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="Security & Compliance" icon={Shield}>
      <p className="text-xs text-slate-500 mb-3">Access controls, masking policies, and RLS coverage.</p>
      <MetricTable
        columns={[
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'HAS_MASKING', label: 'Masking', format: (v) => v ? 'Applied' : '—' },
          { key: 'HAS_RLS', label: 'RLS', format: (v) => v ? 'Active' : '—' },
          { key: 'GRANTS_COUNT', label: 'Grants', format: (v) => Number(v || 0).toLocaleString() },
          { key: 'LAST_GRANT_AT', label: 'Last Grant' },
        ]}
        data={data || []}
        emptyMsg="No security posture data available"
      />
    </SectionCard>
  );
}

function DmfTab({ data }: { data: MetricRow[] | null }) {
  return (
    <SectionCard title="DMF Check Results" icon={FileSearch}>
      <p className="text-xs text-slate-500 mb-3">Data Metric Function history and threshold violation tracking.</p>
      <MetricTable
        columns={[
          { key: 'METRIC_NAME', label: 'DMF' },
          { key: 'TABLE_NAME', label: 'Table' },
          { key: 'COLUMN_NAME', label: 'Column' },
          { key: 'VALUE', label: 'Result', format: (v) => Number(v || 0).toLocaleString() },
          { key: 'MEASUREMENT_TIME', label: 'Checked At' },
          { key: 'STATUS', label: 'Status' },
        ]}
        data={data || []}
        emptyMsg="No DMF results. Associate DMFs to tables via Governance > Policies."
      />
    </SectionCard>
  );
}

// ── Main page ──

export default function DataQualityPage() {
  const [activeTab, setActiveTab] = useState('completeness');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab data state
  const [tabData, setTabData] = useState<Record<string, MetricRow[] | null>>({});
  const [summary, setSummary] = useState<{
    health_score: number;
    total_tables: number;
    freshness_violations: number;
    classification_coverage: number;
  } | null>(null);

  const loadSummary = useCallback(async () => {
    const data = await fetchQualityData('quality-summary');
    if (data) setSummary(data);
  }, []);

  const loadTabData = useCallback(async (tab: string) => {
    if (tabData[tab] !== undefined) return; // Already loaded
    const endpointMap: Record<string, string> = {
      completeness: 'completeness-metrics',
      freshness: 'freshness-metrics',
      ingestion: 'ingestion-metrics',
      schema: 'schema-quality',
      classification: 'classification-coverage',
      cost: 'cost-metrics',
      security: 'security-posture',
      dmf: 'dmf-results',
    };
    const data = await fetchQualityData(endpointMap[tab] || tab);
    setTabData((prev) => ({ ...prev, [tab]: data?.rows || data?.results || data?.metrics || data || [] }));
  }, [tabData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setTabData({}); // Clear cache
    await loadSummary();
    await loadTabData(activeTab);
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  useEffect(() => {
    setLoading(true);
    loadSummary().then(() => loadTabData('completeness')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab]);

  const kpis: KpiCard[] = [
    {
      label: 'Health Score',
      value: summary ? `${summary.health_score}%` : '—',
      icon: BarChart3,
      color: 'from-green-400 to-emerald-500',
    },
    {
      label: 'Total Tables',
      value: summary?.total_tables ?? '—',
      icon: Database,
      color: 'from-blue-400 to-indigo-500',
    },
    {
      label: 'Freshness Violations',
      value: summary?.freshness_violations ?? '—',
      icon: AlertTriangle,
      color: 'from-amber-400 to-orange-500',
    },
    {
      label: 'Classification Coverage',
      value: summary ? `${summary.classification_coverage}%` : '—',
      icon: Tag,
      color: 'from-purple-400 to-violet-500',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Data Quality</h1>
          <p className="text-sm text-slate-500 mt-1">Automated quality monitoring from DWH metadata tables</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-4"
            >
              <div className={cn('p-3 rounded-xl bg-gradient-to-br', kpi.color)}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{kpi.label}</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{kpi.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader size="lg" />
            </div>
          ) : (
            <>
              {activeTab === 'completeness' && <CompletenessTab data={tabData.completeness ?? null} />}
              {activeTab === 'freshness' && <FreshnessTab data={tabData.freshness ?? null} />}
              {activeTab === 'ingestion' && <IngestionTab data={tabData.ingestion ?? null} />}
              {activeTab === 'schema' && <SchemaTab data={tabData.schema ?? null} />}
              {activeTab === 'classification' && <ClassificationTab data={tabData.classification ?? null} />}
              {activeTab === 'cost' && <CostTab data={tabData.cost ?? null} />}
              {activeTab === 'security' && <SecurityTab data={tabData.security ?? null} />}
              {activeTab === 'dmf' && <DmfTab data={tabData.dmf ?? null} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
