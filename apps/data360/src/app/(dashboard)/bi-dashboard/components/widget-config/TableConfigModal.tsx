'use client';

import { useState } from 'react';
import { Input, Select, Button, Checkbox } from 'rizzui';
import ConfigShell, { type ConfigVariant } from './ConfigShell';
import { Table2, X } from 'lucide-react';
import { useDataSourcePicker } from '../../hooks/useDataSourcePicker';
import DataSourceSection from './DataSourceSection';
import type { BIDashboardChartConfig } from '@/app/services/api/types';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import { getApiErrorMessage } from '@/lib/api-client';

interface TableConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: {
    title: string;
    chartConfig: BIDashboardChartConfig;
    prefetchedData?: Record<string, unknown>[];
  }) => void;
  initialConfig?: {
    title?: string;
    chartConfig?: BIDashboardChartConfig;
  };
  /**
   * ADD-mode preselect — seeds the data-source picker (and so the column-checkbox
   * list) when there is no `initialConfig`. Ignored in EDIT mode.
   */
  defaultSource?: { database?: string; schema?: string; table?: string };
  /** 'modal' (popup) or 'panel' (docked in the BI right bar). Default 'modal'. */
  variant?: ConfigVariant;
}

export default function TableConfigModal({
  isOpen,
  onClose,
  onSave,
  initialConfig,
  defaultSource,
  variant = 'modal',
}: TableConfigModalProps) {
  const initCfg = initialConfig?.chartConfig;
  // EDIT seeds from the widget's chart_config; ADD falls back to defaultSource.
  const seedSource = initCfg
    ? { database: initCfg.database, schema: initCfg.schema, table: initCfg.table }
    : defaultSource?.database && defaultSource.schema && defaultSource.table
      ? { database: defaultSource.database, schema: defaultSource.schema, table: defaultSource.table }
      : undefined;
  const picker = useDataSourcePicker(seedSource);

  const [title, setTitle] = useState(initialConfig?.title || '');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    initCfg?.columns || initCfg?.groupBy || []
  );
  const [limit, setLimit] = useState<number>(initCfg?.limit || 100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Narrow (right-panel) host → stack the data-source selects in one column.
  const stacked = variant === 'panel';

  const toggleColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const selectAll = () => {
    setSelectedColumns(picker.columnOptions.map((c) => c.value));
  };

  const deselectAll = () => {
    setSelectedColumns([]);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!picker.isComplete) {
      setError('Please select database, schema and table');
      return;
    }

    setSaving(true);
    setError(null);

    // Table widgets use mode: "raw" with columns array
    const colsToQuery = selectedColumns.length > 0
      ? selectedColumns
      : picker.columnOptions.map((c) => c.value);

    const chartConfig: BIDashboardChartConfig = {
      database: picker.source.database,
      schema: picker.source.schema,
      table: picker.source.table,
      mode: 'raw',
      columns: colsToQuery,
      filters: [],
      limit: limit || 100,
    };

    try {
      const response = await fetchChartData({
        database: picker.source.database,
        schema: picker.source.schema,
        table: picker.source.table,
        mode: 'raw',
        columns: colsToQuery,
        limit: limit || 100,
      });
      onSave({
        title: title.trim(),
        chartConfig,
        prefetchedData: response.data,
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfigShell variant={variant} isOpen={isOpen} onClose={onClose} customSize="600px">
      <div className={`p-6 ${variant === 'panel' ? '' : 'max-h-[85vh] overflow-y-auto'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-slate-400 to-gray-500 rounded-lg">
              <Table2 className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Configure Data Table
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Title */}
          <div>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sales Overview Table"
            />
          </div>

          {/* Data Source */}
          <DataSourceSection
            database={picker.source.database}
            schema={picker.source.schema}
            table={picker.source.table}
            dbOptions={picker.dbOptions}
            schemaOptions={picker.schemaOptions}
            tableOptions={picker.tableOptions}
            onDatabaseChange={picker.setDatabase}
            onSchemaChange={picker.setSchema}
            onTableChange={picker.setTable}
            stacked={stacked}
          />

          {/* Column Selection */}
          {picker.isComplete && picker.columnOptions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Columns ({selectedColumns.length}/{picker.columnOptions.length} selected)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    onClick={deselectAll}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
                {picker.columnOptions.map((col) => (
                  <label
                    key={col.value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedColumns.includes(col.value)}
                      onChange={() => toggleColumn(col.value)}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {col.label}
                    </span>
                  </label>
                ))}
              </div>
              {selectedColumns.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  No columns selected — all columns will be shown.
                </p>
              )}
            </div>
          )}

          {/* Limit */}
          <div className="w-32">
            <Input
              label="Row Limit"
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 100)}
              min={1}
              max={10000}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={saving}>
              {initialConfig?.chartConfig ? 'Update Table' : 'Add Table'}
            </Button>
          </div>
        </div>
      </div>
    </ConfigShell>
  );
}
