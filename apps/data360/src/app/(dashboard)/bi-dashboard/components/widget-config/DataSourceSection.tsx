'use client';

import { useState } from 'react';
import { Select, Badge } from 'rizzui';
import { Database, Table2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchChartData } from '@/app/services/charts/fetchChartData';

interface SelectOption {
  value: string;
  label: string;
}

interface DataSourceSectionProps {
  database: string;
  schema: string;
  table: string;
  dbOptions: SelectOption[];
  schemaOptions: SelectOption[];
  tableOptions: SelectOption[];
  onDatabaseChange: (db: string) => void;
  onSchemaChange: (schema: string) => void;
  onTableChange: (table: string) => void;
}

export default function DataSourceSection({
  database,
  schema,
  table,
  dbOptions,
  schemaOptions,
  tableOptions,
  onDatabaseChange,
  onSchemaChange,
  onTableChange,
}: DataSourceSectionProps) {
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const canPreview = database && schema && table;

  const handleQuickPreview = async () => {
    if (!canPreview) return;
    setLoadingPreview(true);
    try {
      const res = await fetchChartData({
        database,
        schema,
        table,
        measures: [],
        limit: 10,
      });
      setPreviewRows(res.data || []);
    } catch {
      setPreviewRows([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <Database className="h-4 w-4" />
          Data Source
        </div>
        {canPreview && (
          <button
            onClick={handleQuickPreview}
            disabled={loadingPreview}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          >
            <Eye className="h-3 w-3" />
            {loadingPreview ? 'Loading...' : 'Preview 10 rows'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Select
          label="Database"
          options={dbOptions}
          value={database}
          onChange={(opt: any) => {
            onDatabaseChange(opt?.value || '');
            setPreviewRows(null);
          }}
          placeholder="Select..."
        />
        <Select
          label="Schema"
          options={schemaOptions}
          value={schema}
          onChange={(opt: any) => {
            onSchemaChange(opt?.value || '');
            setPreviewRows(null);
          }}
          placeholder="Select..."
          disabled={!database}
        />
        <Select
          label="Table"
          options={tableOptions}
          value={table}
          onChange={(opt: any) => {
            onTableChange(opt?.value || '');
            setPreviewRows(null);
          }}
          placeholder="Select..."
          disabled={!schema}
        />
      </div>

      {/* Quick preview table */}
      {previewRows && previewRows.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <Table2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Preview ({previewRows.length} rows)</span>
          </div>
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800">
                  {Object.keys(previewRows[0]).map((col) => (
                    <th key={col} className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                      {col}
                      <Badge size="sm" variant="flat" className="ml-1 text-[9px] px-1 py-0">
                        {typeof previewRows[0][col] === 'number' ? 'NUM' : typeof previewRows[0][col] === 'boolean' ? 'BOOL' : 'STR'}
                      </Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-2 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                        {val === null ? <span className="text-slate-300 italic">null</span> : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
