'use client';

import { useState } from 'react';
import { Modal, Input, Select, Button } from 'rizzui';
import { BarChart3, X, Plus, Trash2, Eye } from 'lucide-react';
import { useDataSourcePicker } from '../../hooks/useDataSourcePicker';
import DataSourceSection from './DataSourceSection';
import { DynamicChart } from '../DynamicChart';
import type { BIDashboardChartConfig } from '@/app/services/api/types';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import { getApiErrorMessage } from '@/lib/api-client';

const AGGREGATORS = [
  { value: 'SUM', label: 'SUM' },
  { value: 'AVG', label: 'AVG' },
  { value: 'MIN', label: 'MIN' },
  { value: 'MAX', label: 'MAX' },
  { value: 'COUNT', label: 'COUNT' },
];

/** Shape of a single measure row in the form */
interface MeasureRow {
  column: string;
  aggregator: string;
}

/** Data the modal gives back to its parent on save */
export interface ChartConfigResult {
  title: string;
  chartConfig: BIDashboardChartConfig;
  prefetchedData?: Record<string, unknown>[];
}

/**
 * ComponentConfig — kept for backwards compatibility with AddChartPanel / DashboardEditor
 * converters (toChartConfig / toComponentConfig).
 */
export interface ComponentConfig {
  id?: string;
  title?: string;
  database?: string;
  schema?: string;
  table?: string;
  xAxisColumn?: string;
  measures?: Array<{ column: string; aggregator: string; seuils?: any }>;
  groupBy?: string | string[];
  limit?: number;
  chartType?: string;
  prefetched?: { data: Record<string, unknown>[] };
}

interface ChartConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Legacy callback matching the old ConfigurationModal interface */
  onSave: (config: ComponentConfig) => void;
  componentType?: string;
  chartType?: string;
  initialConfig?: ComponentConfig;
}

export default function ChartConfigModal({
  isOpen,
  onClose,
  onSave,
  chartType,
  initialConfig,
}: ChartConfigModalProps) {
  const initCfg = initialConfig;
  const picker = useDataSourcePicker(
    initCfg?.database
      ? { database: initCfg.database, schema: initCfg.schema, table: initCfg.table }
      : undefined
  );

  const [title, setTitle] = useState(initCfg?.title || '');
  const [xAxisColumn, setXAxisColumn] = useState(initCfg?.xAxisColumn || '');
  const [measures, setMeasures] = useState<MeasureRow[]>(
    initCfg?.measures?.map((m) => ({ column: m.column, aggregator: m.aggregator || 'SUM' })) ||
      [{ column: '', aggregator: 'SUM' }]
  );
  const [groupBy, setGroupBy] = useState<string[]>(
    Array.isArray(initCfg?.groupBy)
      ? initCfg.groupBy
      : initCfg?.groupBy
        ? [initCfg.groupBy]
        : []
  );
  const [limit, setLimit] = useState<number>(initCfg?.limit || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Measures helpers
  const addMeasure = () => setMeasures((prev) => [...prev, { column: '', aggregator: 'SUM' }]);
  const removeMeasure = (i: number) => setMeasures((prev) => prev.filter((_, idx) => idx !== i));
  const updateMeasure = (i: number, field: keyof MeasureRow, value: string) =>
    setMeasures((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  // Build request body
  const buildRequest = () => ({
    database: picker.source.database,
    schema: picker.source.schema,
    table: picker.source.table,
    x: xAxisColumn || undefined,
    measures: measures
      .filter((m) => m.column)
      .map((m) => ({ column: m.column, aggregator: m.aggregator as any })),
    groupBy: groupBy.length > 0 ? groupBy : undefined,
    limit: limit > 0 ? limit : undefined,
  });

  // Preview
  const handlePreview = async () => {
    if (!picker.isComplete || measures.filter((m) => m.column).length === 0) {
      setError('Select data source and at least one measure');
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const res = await fetchChartData(buildRequest());
      setPreviewData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  };

  // Save
  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (!picker.isComplete) { setError('Select database, schema and table'); return; }
    if (measures.filter((m) => m.column).length === 0) { setError('Add at least one measure'); return; }

    setSaving(true);
    setError(null);
    try {
      // Fetch data if not previewed yet
      let data = previewData;
      if (!data) {
        const res = await fetchChartData(buildRequest());
        data = res.data;
      }

      const result: ComponentConfig = {
        title: title.trim(),
        database: picker.source.database,
        schema: picker.source.schema,
        table: picker.source.table,
        xAxisColumn: xAxisColumn || undefined,
        measures: measures.filter((m) => m.column).map((m) => ({
          column: m.column,
          aggregator: m.aggregator,
        })),
        groupBy,
        limit: limit > 0 ? limit : undefined,
        chartType,
        prefetched: data ? { data } : undefined,
      };

      onSave(result);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} customSize="700px">
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Configure {chartType ? chartType.charAt(0).toUpperCase() + chartType.slice(1) : 'Chart'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Title */}
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Revenue by Region"
          />

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
          />

          {/* X-Axis */}
          <Select
            label="X-Axis (Category)"
            options={[{ value: '', label: '— None —' }, ...picker.columnOptions]}
            value={xAxisColumn}
            onChange={(opt: any) => setXAxisColumn(opt?.value || '')}
            placeholder="Select column..."
            disabled={!picker.isComplete}
          />

          {/* Measures */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Measures
              </span>
              <button
                onClick={addMeasure}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="h-3 w-3" /> Add Measure
              </button>
            </div>
            {measures.map((m, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label={i === 0 ? 'Column' : undefined}
                    options={picker.columnOptions}
                    value={m.column}
                    onChange={(opt: any) => updateMeasure(i, 'column', opt?.value || '')}
                    placeholder="Select..."
                    disabled={!picker.isComplete}
                    size="sm"
                  />
                </div>
                <div className="w-28">
                  <Select
                    label={i === 0 ? 'Aggregator' : undefined}
                    options={AGGREGATORS}
                    value={m.aggregator}
                    onChange={(opt: any) => updateMeasure(i, 'aggregator', opt?.value || 'SUM')}
                    size="sm"
                  />
                </div>
                {measures.length > 1 && (
                  <button
                    onClick={() => removeMeasure(i)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded mb-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Group By */}
          <Select
            label="Group By (optional)"
            options={picker.columnOptions}
            value={groupBy[0] || ''}
            onChange={(opt: any) => setGroupBy(opt?.value ? [opt.value] : [])}
            placeholder="— None —"
            disabled={!picker.isComplete}
          />

          {/* Limit */}
          <div className="w-32">
            <Input
              label="Row Limit"
              type="number"
              value={limit || ''}
              onChange={(e) => setLimit(Number(e.target.value) || 0)}
              placeholder="All"
            />
          </div>

          {/* Preview */}
          {previewData && previewData.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden" style={{ height: 220 }}>
              <DynamicChart
                config={{
                  chartType,
                  x: xAxisColumn || undefined,
                  measures: measures.filter((m) => m.column),
                  prefetched: { data: previewData },
                }}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              isLoading={previewing}
              className="gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} isLoading={saving}>
                {initialConfig ? 'Update Chart' : 'Add Chart'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
