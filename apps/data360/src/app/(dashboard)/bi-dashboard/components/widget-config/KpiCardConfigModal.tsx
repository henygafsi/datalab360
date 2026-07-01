'use client';

import { useState } from 'react';
import { Input, Select, Button } from 'rizzui';
import ConfigShell, { type ConfigVariant } from './ConfigShell';
import { Gauge, X, Plus, Trash2 } from 'lucide-react';
import { useDataSourcePicker } from '../../hooks/useDataSourcePicker';
import DataSourceSection from './DataSourceSection';
import type { BIDashboardChartConfig } from '@/app/services/api/types';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import { AGGREGATORS } from './aggregators';

const SEUIL_OPERATORS = [
  { value: '<', label: '<' },
  { value: '>', label: '>' },
  { value: '<=', label: '<=' },
  { value: '>=', label: '>=' },
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: 'between', label: 'Between' },
];

interface Seuil {
  operator: string;
  value: number | [number, number];
  label: string;
  color: string;
}

interface KpiCardConfigModalProps {
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
   * ADD-mode preselect — seeds the data-source picker (and so the measure-column
   * list) when there is no `initialConfig`. Ignored in EDIT mode.
   */
  defaultSource?: { database?: string; schema?: string; table?: string };
  /** 'modal' (popup) or 'panel' (docked in the BI right bar). Default 'modal'. */
  variant?: ConfigVariant;
}

export default function KpiCardConfigModal({
  isOpen,
  onClose,
  onSave,
  initialConfig,
  defaultSource,
  variant = 'modal',
}: KpiCardConfigModalProps) {
  const initCfg = initialConfig?.chartConfig;
  // EDIT seeds from the widget's chart_config; ADD falls back to defaultSource.
  const seedSource = initCfg
    ? { database: initCfg.database, schema: initCfg.schema, table: initCfg.table }
    : defaultSource?.database && defaultSource.schema && defaultSource.table
      ? { database: defaultSource.database, schema: defaultSource.schema, table: defaultSource.table }
      : undefined;
  const picker = useDataSourcePicker(seedSource);

  const [title, setTitle] = useState(initialConfig?.title || '');
  const [measureColumn, setMeasureColumn] = useState(initCfg?.measures?.[0]?.column || '');
  const [aggregator, setAggregator] = useState(initCfg?.measures?.[0]?.aggregator || 'SUM');
  const [seuils, setSeuils] = useState<Seuil[]>(
    (initCfg?.measures?.[0]?.seuils as Seuil[]) || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Narrow (right-panel) host → collapse multi-column rows to a single column.
  const stacked = variant === 'panel';

  const addSeuil = () => {
    setSeuils((prev) => [...prev, { operator: '>', value: 0, label: '', color: '#22c55e' }]);
  };

  const removeSeuil = (index: number) => {
    setSeuils((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSeuil = (index: number, field: keyof Seuil, value: any) => {
    setSeuils((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
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
    if (!measureColumn) {
      setError('Please select a measure column');
      return;
    }

    setSaving(true);
    setError(null);

    const chartConfig: BIDashboardChartConfig = {
      database: picker.source.database,
      schema: picker.source.schema,
      table: picker.source.table,
      x: null,
      measures: [{
        column: measureColumn,
        aggregator,
        seuils: seuils.length > 0 ? seuils : undefined,
      }],
      filters: [],
      groupBy: [],
      limit: null,
    };

    try {
      const response = await fetchChartData({
        database: chartConfig.database,
        schema: chartConfig.schema,
        table: chartConfig.table,
        measures: [{ column: measureColumn, aggregator: aggregator as any }],
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
            <div className="p-2 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg">
              <Gauge className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Configure KPI Card
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
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
              placeholder="e.g., Total Revenue"
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

          {/* Measure */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Measure
            </div>
            <div className={`grid gap-3 ${stacked ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <Select
                label="Column"
                options={picker.columnOptions}
                value={measureColumn}
                onChange={(opt: any) => setMeasureColumn(opt?.value || '')}
                placeholder="Select column..."
                disabled={!picker.isComplete}
              />
              <Select
                label="Aggregator"
                options={AGGREGATORS}
                value={aggregator}
                onChange={(opt: any) => setAggregator(opt?.value || 'SUM')}
              />
            </div>
          </div>

          {/* Thresholds (Seuils) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Thresholds (Seuils)
              </div>
              <button
                onClick={addSeuil}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                <Plus className="h-3 w-3" /> Add Threshold
              </button>
            </div>

            {seuils.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No thresholds set. KPI will display without status indicators.
              </p>
            )}

            {seuils.map((seuil, i) => (
              <div
                key={i}
                className="flex items-end gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className={`flex-1 grid gap-2 ${stacked ? 'grid-cols-2' : 'grid-cols-4'}`}>
                  <Select
                    label="Operator"
                    options={SEUIL_OPERATORS}
                    value={seuil.operator}
                    onChange={(opt: any) => updateSeuil(i, 'operator', opt?.value || '>')}
                    size="sm"
                  />
                  {seuil.operator === 'between' ? (
                    <div className="col-span-1 flex gap-1">
                      <Input
                        label="Min"
                        type="number"
                        size="sm"
                        value={Array.isArray(seuil.value) ? seuil.value[0] : 0}
                        onChange={(e) =>
                          updateSeuil(i, 'value', [
                            Number(e.target.value),
                            Array.isArray(seuil.value) ? seuil.value[1] : 0,
                          ])
                        }
                      />
                      <Input
                        label="Max"
                        type="number"
                        size="sm"
                        value={Array.isArray(seuil.value) ? seuil.value[1] : 0}
                        onChange={(e) =>
                          updateSeuil(i, 'value', [
                            Array.isArray(seuil.value) ? seuil.value[0] : 0,
                            Number(e.target.value),
                          ])
                        }
                      />
                    </div>
                  ) : (
                    <Input
                      label="Value"
                      type="number"
                      size="sm"
                      value={typeof seuil.value === 'number' ? seuil.value : 0}
                      onChange={(e) => updateSeuil(i, 'value', Number(e.target.value))}
                    />
                  )}
                  <Input
                    label="Label"
                    size="sm"
                    value={seuil.label}
                    onChange={(e) => updateSeuil(i, 'label', e.target.value)}
                    placeholder="e.g., Good"
                  />
                  <div className="flex items-end gap-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Color</label>
                      <input
                        type="color"
                        value={seuil.color}
                        onChange={(e) => updateSeuil(i, 'color', e.target.value)}
                        className="w-8 h-8 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                    </div>
                    <button
                      onClick={() => removeSeuil(i)}
                      aria-label="Remove threshold"
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
              {initialConfig?.chartConfig ? 'Update KPI' : 'Add KPI'}
            </Button>
          </div>
        </div>
      </div>
    </ConfigShell>
  );
}
