'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Input, Select, Modal, Text, Badge } from 'rizzui';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import { ChartRequest, ChartDataResponse } from '@/app/services/charts/types';
import { 
  HiOutlineXMark, 
  HiOutlineChartBarSquare,
  HiOutlineCog6Tooth,
  HiOutlineTableCells,
} from 'react-icons/hi2';
import { ColorWheelIcon } from '@radix-ui/react-icons';

export interface ComponentConfig {
  id: string;
  title: string;
  description?: string;
  subtitle?: string;
  database?: string;
  schema?: string;
  table?: string;
  xAxisColumn?: string;
  yAxisColumn?: string;
  measures?: { 
    column: string; 
    aggregator?: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';
    seuils?: Array<{
      operator: '<' | '>' | '>=' | '<=' | '=' | '!=' | 'between';
      value: number | [number, number];
      label: string;
      color: string;
    }>;
  }[];
  colorScheme?: string;
  chartType?: string;
  customColors?: string[];
  aggregator?: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';
  groupBy?: string[] | string;
  limit?: number;
  // Optional prefetched result to immediately render after save
  prefetched?: ChartDataResponse;
}

interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ComponentConfig) => void;
  componentType: 'stat' | 'chart';
  initialConfig?: ComponentConfig;
  chartType?: string; // Add chart type to determine specific configurations
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue', color: '#3B82F6' },
  { value: 'green', label: 'Green', color: '#10B981' },
  { value: 'purple', label: 'Purple', color: '#8B5CF6' },
  { value: 'amber', label: 'Amber', color: '#F59E0B' },
  { value: 'red', label: 'Red', color: '#EF4444' },
  { value: 'indigo', label: 'Indigo', color: '#6366F1' },
];

// Chart type is inferred automatically; no manual selection needed

const AGGREGATORS = [
  { value: 'SUM', label: 'SUM' },
  { value: 'AVG', label: 'AVG' },
  { value: 'MIN', label: 'MIN' },
  { value: 'MAX', label: 'MAX' },
  { value: 'COUNT', label: 'COUNT' },
];

export default function ConfigurationModal({ 
  isOpen, 
  onClose, 
  onSave, 
  componentType,
  initialConfig,
  chartType 
}: ConfigurationModalProps) {
  const [config, setConfig] = useState<ComponentConfig>({
    id: '',
    title: '',
    description: '',
    subtitle: '',
    database: '',
    schema: '',
    table: '',
    xAxisColumn: '',
    colorScheme: 'blue',
    chartType: undefined,
    customColors: [],
    aggregator: undefined,
    groupBy: [],
    limit: 100,
    ...initialConfig
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [dbOptions, setDbOptions] = useState<{ value: string; label: string }[]>([]);
  const [schemaOptions, setSchemaOptions] = useState<{ value: string; label: string }[]>([]);
  const [tableOptions, setTableOptions] = useState<{ value: string; label: string }[]>([]);
  const [columnOptions, setColumnOptions] = useState<{ value: string; label: string }[]>([]);
  const [measures, setMeasures] = useState<{ 
    column: string; 
    aggregator?: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT';
    seuils?: Array<{
      operator: '<' | '>' | '>=' | '<=' | '=' | '!=' | 'between';
      value: number | [number, number];
      label: string;
      color: string;
    }>;
  }[]>(initialConfig?.measures || []);

  // Reset modal state when initialConfig changes (for new charts)
  useEffect(() => {
    if (isOpen) {
      const defaultConfig = {
        id: '',
        title: '',
        description: '',
        subtitle: '',
        database: '',
        schema: '',
        table: '',
        xAxisColumn: '',
        colorScheme: 'blue',
        chartType: undefined,
        customColors: [],
        aggregator: undefined,
        groupBy: [],
        limit: 100,
      };
      
      setConfig({
        ...defaultConfig,
        ...initialConfig
      });
      setMeasures(initialConfig?.measures || []);
      setSaveError(null);
    }
  }, [isOpen, initialConfig]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConfig({
        id: '',
        title: '',
        description: '',
        subtitle: '',
        database: '',
        schema: '',
        table: '',
        xAxisColumn: '',
        colorScheme: 'blue',
        chartType: undefined,
        customColors: [],
        aggregator: undefined,
        groupBy: [],
        limit: 100,
      });
      setMeasures([]);
      setSaveError(null);
    }
  }, [isOpen]);

  // Chart-specific configuration options
  const getChartSpecificConfig = (chartType: string) => {
    switch (chartType) {
      case 'bar':
        return {
          showXAxis: true,
          showYAxis: true,
          showMeasures: true,
          showGroupBy: true,
          showLimit: true,
          description: 'Configure bar chart with categories and values'
        };
      case 'line':
        return {
          showXAxis: true,
          showYAxis: true,
          showMeasures: true,
          showGroupBy: true,
          showLimit: true,
          description: 'Configure line chart with time series or continuous data'
        };
      case 'pie':
        return {
          showXAxis: false,
          showYAxis: false,
          showMeasures: true,
          showGroupBy: false,
          showLimit: true,
          description: 'Configure pie chart with categorical data'
        };
      case 'scatter':
        return {
          showXAxis: true,
          showYAxis: true,
          showMeasures: true,
          showGroupBy: true,
          showLimit: true,
          description: 'Configure scatter plot with X and Y coordinates'
        };
      case 'card':
        return {
          showXAxis: false,
          showYAxis: false,
          showMeasures: true,
          showGroupBy: false,
          showLimit: false,
          description: 'Configure KPI card with single metric'
        };
      default:
        return {
          showXAxis: true,
          showYAxis: true,
          showMeasures: true,
          showGroupBy: true,
          showLimit: true,
          description: 'Configure chart settings'
        };
    }
  };

  const chartConfig = getChartSpecificConfig(chartType || 'bar');

  useEffect(() => {
    getDatabases().then(dbs => setDbOptions(dbs.map(d => ({ value: d, label: d }))));
  }, []);

  useEffect(() => {
    if (!config.database) return;
    getSchemas(config.database).then(schemas => setSchemaOptions(schemas.map(s => ({ value: s, label: s }))));
    setTableOptions([]);
    setColumnOptions([]);
    setConfig(prev => ({ ...prev, schema: '', table: '', xAxisColumn: '', yAxisColumn: '' }));
  }, [config.database]);

  useEffect(() => {
    if (!config.database || !config.schema) return;
    getTables(config.database, config.schema).then(tables => setTableOptions(tables.map(t => ({ value: t, label: t }))));
    setColumnOptions([]);
    setConfig(prev => ({ ...prev, table: '', xAxisColumn: '', yAxisColumn: '' }));
  }, [config.database, config.schema]);

  useEffect(() => {
    if (!config.database || !config.schema || !config.table) return;
    getTableColumns(config.database, config.schema, config.table).then(cols => {
      const names = cols.map(c => (c.name || c.COLUMN_NAME || '')).filter(Boolean) as string[];
      setColumnOptions(names.map(n => ({ value: n, label: n })));
    });
  }, [config.database, config.schema, config.table]);

  useEffect(() => {
    if (initialConfig) {
      setConfig({ ...initialConfig });
      setMeasures(initialConfig.measures || []);
    }
  }, [initialConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    
    // Chart-specific validation
    if (chartType) {
      if (chartType !== 'card' && chartType !== 'pie' && !config.xAxisColumn) {
        setSaveError('X-axis column is required for this chart type');
        setSaving(false);
        return;
      }
      
      if (measures.length === 0 || !measures.some(m => m.column)) {
        setSaveError('At least one measure is required');
        setSaving(false);
        return;
      }
      
      if (chartType === 'card' && measures.length > 1) {
        setSaveError('Card charts work best with a single metric');
        setSaving(false);
        return;
      }
    }
    
    try {
      // Prefetch/validate by hitting /charts/data before saving
      const measuresToSend = (measures && measures.length)
        ? measures.map(m => ({ column: m.column, aggregator: (m.aggregator as any) || 'SUM' }))
        : (config.yAxisColumn ? [{ column: config.yAxisColumn, aggregator: (config.aggregator as any) || 'SUM' }] : []);
      const req: ChartRequest = {
        database: config.database || '',
        schema: config.schema || '',
        table: config.table || '',
        x: (!config.xAxisColumn || config.xAxisColumn === '') ? null : (config.xAxisColumn || null),
        measures: measuresToSend,
        groupBy: Array.isArray(config.groupBy)
          ? config.groupBy
          : (typeof config.groupBy === 'string' && config.groupBy.length > 0 ? config.groupBy.split(',').map(s => s.trim()) : []),
        limit: typeof config.limit === 'number' ? config.limit : null,
      };
      // Require required fields; if any missing, show error and stop
      if (!req.database || !req.schema || !req.table) {
        setSaveError('Please select database, schema, and table before saving.');
        setSaving(false);
        return;
      }
      // If no measure, create COUNT(*) style fallback
      if (!measuresToSend.length) {
        req.measures = [{ column: req.x || '*', aggregator: 'COUNT' }];
      }
      // Always validate/prefetch
      const apiResponse = await fetchChartData(req);
      // Debug: log the request and response payloads after successful validation
      // eslint-disable-next-line no-console
      console.log('[BI] Saved chart configuration payload and response:', {  response: apiResponse.data.forEach(r => console.log(r)) });
      onSave({ ...config, measures, prefetched: { data: apiResponse.data } });
    onClose();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to fetch chart data with the given configuration.');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (field: keyof ComponentConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const normalizeSelectValue = (val: any): string => {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object' && 'value' in val) return (val as any).value as string;
    return '';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <HiOutlineCog6Tooth className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Configure {componentType === 'stat' ? 'Stat Card' : 'Chart'}
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Customize appearance, data sources, and display options
              </p>
            </div>
          </div>
          <Button onClick={onClose} className="p-2" variant="outline">
            <HiOutlineXMark className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-8">
          {/* Basic Configuration */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <HiOutlineChartBarSquare className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Basic Configuration
              </h3>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Title"
                placeholder="Enter component title"
                value={config.title}
                onChange={(e) => updateConfig('title', e.target.value)}
                className="w-full"
              />
              
              {componentType === 'stat' && (
                <Input
                  label="Subtitle"
                  placeholder="e.g., Monthly, YTD"
                  value={config.subtitle || ''}
                  onChange={(e) => updateConfig('subtitle', e.target.value)}
                  className="w-full"
                />
              )}
              
              {/* Chart type removed; inferred automatically in renderer */}
            </div>

            {componentType === 'chart' && (
              <Input
                label="Description"
                placeholder="Enter chart description"
                value={config.description || ''}
                onChange={(e) => updateConfig('description', e.target.value)}
                className="w-full"
              />
            )}
          </div>

          {/* Data Source Configuration */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <HiOutlineTableCells className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Data Source
              </h3>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Database"
                value={config.database}
                onChange={(value) => updateConfig('database', normalizeSelectValue(value))}
                options={dbOptions}
                placeholder="Select database"
              />
              <Select
                label="Schema"
                value={config.schema}
                onChange={(value) => updateConfig('schema', normalizeSelectValue(value))}
                options={schemaOptions}
                placeholder="Select schema"
              />
              <Select
                label="Table"
                value={config.table}
                onChange={(value) => updateConfig('table', normalizeSelectValue(value))}
                options={tableOptions}
                placeholder="Select table"
              />
              {componentType === 'chart' && chartConfig.showXAxis && (
                <>
                  <Select
                    label="X-Axis Column"
                    value={config.xAxisColumn}
                    onChange={(value) => updateConfig('xAxisColumn', normalizeSelectValue(value))}
                    options={columnOptions}
                    placeholder={chartType === 'card' ? "Not needed for cards" : "Select X-axis column"}
                    disabled={chartType === 'card'}
                  />
                </>
              )}
            </div>
          </div>

          {/* Appearance Configuration */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <ColorWheelIcon className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Appearance
              </h3>
            </div>
            
            <div>
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Color Scheme
              </Text>
              <div className="grid grid-cols-3 gap-3">
                {COLOR_SCHEMES.map((scheme) => (
                  <button
                    key={scheme.value}
                    onClick={() => updateConfig('colorScheme', scheme.value)}
                    className={`flex items-center space-x-3 p-3 rounded-xl border-2 transition-all duration-200 ${
                      config.colorScheme === scheme.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div 
                      className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: scheme.color }}
                    />
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {scheme.label}
                    </span>
                    {config.colorScheme === scheme.value && (
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs ml-auto">
                        Selected
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Measures & Advanced Options */}
          {componentType === 'chart' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-4">
                <HiOutlineCog6Tooth className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {chartType === 'card' ? 'Metric Configuration' : 'Measures & Options'}
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                {chartConfig.description}
              </p>

              {/* Chart-specific tips */}
              {chartType && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    {chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart Tips:
                  </h4>
                  <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                    {chartType === 'bar' && (
                      <>
                        <li>• Use categorical data for X-axis (e.g., product names, regions)</li>
                        <li>• Use numerical data for measures (e.g., sales, quantities)</li>
                        <li>• Group by additional categories to create stacked or grouped bars</li>
                      </>
                    )}
                    {chartType === 'line' && (
                      <>
                        <li>• Use time-based data for X-axis (e.g., dates, months)</li>
                        <li>• Perfect for showing trends over time</li>
                        <li>• Multiple measures create multiple lines</li>
                      </>
                    )}
                    {chartType === 'pie' && (
                      <>
                        <li>• Use categorical data for pie segments</li>
                        <li>• Only one measure is recommended for clarity</li>
                        <li>• Best for showing proportions of a whole</li>
                      </>
                    )}
                    {chartType === 'scatter' && (
                      <>
                        <li>• Use numerical data for both X and Y axes</li>
                        <li>• Perfect for showing correlations between variables</li>
                        <li>• Each point represents one data record</li>
                      </>
                    )}
                    {chartType === 'card' && (
                      <>
                        <li>• Use a single measure for the main metric</li>
                        <li>• Perfect for KPIs and summary statistics</li>
                        <li>• No X-axis or grouping needed</li>
                      </>
                    )}
                  </ul>
                </div>
              )}

              {/* Measures list */}
              <div className="space-y-6">
                {measures.map((m, idx) => (
                  <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-3 items-end">
                      <Select
                        label={`${chartType === 'card' ? 'Metric' : 'Measure'} ${idx + 1} Column`}
                        value={m.column}
                        onChange={(value) => {
                          const v = normalizeSelectValue(value);
                          setMeasures(prev => prev.map((mm, i) => i === idx ? { ...mm, column: v } : mm));
                        }}
                        options={columnOptions}
                        placeholder="Select column"
                      />
                      <Select
                        label="Aggregator"
                        value={m.aggregator}
                        onChange={(value) => {
                          const v = normalizeSelectValue(value) as any;
                          setMeasures(prev => prev.map((mm, i) => i === idx ? { ...mm, aggregator: v } : mm));
                        }}
                        options={AGGREGATORS}
                      />
                      {measures.length > 1 && (
                        <Button
                          onClick={() => setMeasures(prev => prev.filter((_, i) => i !== idx))}
                          variant="outline"
                          className="text-red-600 border-red-200"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    
                    {/* Thresholds Configuration */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Thresholds (Seuils)
                        </Text>
                        <Button
                          onClick={() => {
                            const newThreshold = {
                              operator: '<' as const,
                              value: 0,
                              label: '',
                              color: '#3B82F6'
                            };
                            setMeasures(prev => prev.map((mm, i) => 
                              i === idx 
                                ? { ...mm, seuils: [...(mm.seuils || []), newThreshold] }
                                : mm
                            ));
                          }}
                          variant="outline"
                          size="sm"
                        >
                          Add Threshold
                        </Button>
                      </div>
                      
                      {m.seuils?.map((threshold: any, tIdx: number) => (
                        <div key={tIdx} className="grid gap-2 md:grid-cols-5 items-end bg-slate-50 dark:bg-slate-800 p-3 rounded">
                          <Select
                            label="Operator"
                            value={threshold.operator}
                            onChange={(value) => {
                              const v = normalizeSelectValue(value) as any;
                              setMeasures(prev => prev.map((mm, i) => 
                                i === idx 
                                  ? { 
                                      ...mm, 
                                      seuils: mm.seuils?.map((t: any, ti: number) => 
                                        ti === tIdx ? { ...t, operator: v } : t
                                      ) || []
                                    }
                                  : mm
                              ));
                            }}
                            options={[
                              { value: '<', label: 'Less than' },
                              { value: '>', label: 'Greater than' },
                              { value: '<=', label: 'Less or equal' },
                              { value: '>=', label: 'Greater or equal' },
                              { value: '=', label: 'Equal' },
                              { value: '!=', label: 'Not equal' },
                              { value: 'between', label: 'Between' }
                            ]}
                          />
                          <Input
                            label={threshold.operator === 'between' ? 'Min Value' : 'Value'}
                            type="number"
                            value={Array.isArray(threshold.value) ? threshold.value[0] : threshold.value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setMeasures(prev => prev.map((mm, i) => 
                                i === idx 
                                  ? { 
                                      ...mm, 
                                      seuils: mm.seuils?.map((t: any, ti: number) => 
                                        ti === tIdx 
                                          ? { 
                                              ...t, 
                                              value: threshold.operator === 'between' 
                                                ? [val, Array.isArray(t.value) ? t.value[1] : val]
                                                : val
                                            }
                                          : t
                                      ) || []
                                    }
                                  : mm
                              ));
                            }}
                          />
                          {threshold.operator === 'between' && (
                            <Input
                              label="Max Value"
                              type="number"
                              value={Array.isArray(threshold.value) ? threshold.value[1] : threshold.value}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setMeasures(prev => prev.map((mm, i) => 
                                  i === idx 
                                    ? { 
                                        ...mm, 
                                        seuils: mm.seuils?.map((t: any, ti: number) => 
                                          ti === tIdx 
                                            ? { 
                                                ...t, 
                                                value: [Array.isArray(t.value) ? t.value[0] : 0, val]
                                              }
                                            : t
                                        ) || []
                                      }
                                    : mm
                                ));
                              }}
                            />
                          )}
                          <Input
                            label="Label"
                            value={threshold.label}
                            onChange={(e) => {
                              setMeasures(prev => prev.map((mm, i) => 
                                i === idx 
                                  ? { 
                                      ...mm, 
                                      seuils: mm.seuils?.map((t: any, ti: number) => 
                                        ti === tIdx ? { ...t, label: e.target.value } : t
                                      ) || []
                                    }
                                  : mm
                              ));
                            }}
                            placeholder="e.g., Critical"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={threshold.color}
                              onChange={(e) => {
                                setMeasures(prev => prev.map((mm, i) => 
                                  i === idx 
                                    ? { 
                                        ...mm, 
                                        seuils: mm.seuils?.map((t: any, ti: number) => 
                                          ti === tIdx ? { ...t, color: e.target.value } : t
                                        ) || []
                                      }
                                    : mm
                                ));
                              }}
                              className="w-8 h-8 rounded border border-slate-300 dark:border-slate-600"
                            />
                            <Button
                              onClick={() => {
                                setMeasures(prev => prev.map((mm, i) => 
                                  i === idx 
                                    ? { 
                                        ...mm, 
                                        seuils: mm.seuils?.filter((_: any, ti: number) => ti !== tIdx) || []
                                      }
                                    : mm
                                ));
                              }}
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-200"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(chartType !== 'card' || measures.length === 0) && (
                  <Button
                    onClick={() => setMeasures(prev => [...prev, { column: '' }])}
                    className="bg-slate-800 text-white"
                    disabled={chartType === 'card' && measures.length >= 1}
                  >
                    {chartType === 'card' ? 'Add Metric' : 'Add Measure'}
                  </Button>
                )}
                {chartType === 'card' && measures.length >= 1 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Card charts work best with a single metric
                  </p>
                )}
              </div>

              {/* Options */}
              <div className="grid gap-4 md:grid-cols-3">
                {chartConfig.showGroupBy && (
                  <Input
                    label="Group By (comma separated)"
                    placeholder="e.g. category,region"
                    value={Array.isArray(config.groupBy) ? config.groupBy.join(',') : (config.groupBy || '')}
                    onChange={(e) => updateConfig('groupBy', e.target.value)}
                  />
                )}
                {chartConfig.showLimit && (
                  <Input
                    type="number"
                    label="Limit"
                    value={config.limit ?? 100}
                    onChange={(e) => updateConfig('limit', Number(e.target.value || 100))}
                  />
                )}
              </div>
            </div>
          )}

          {/* Data Preview */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6">
            <h4 className="text-md font-semibold text-slate-900 dark:text-white mb-4">
              Configuration Preview
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Title:</span>
                <span className="text-slate-900 dark:text-white font-medium">
                  {config.title || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Database.Schema.Table:</span>
                <span className="text-slate-900 dark:text-white font-medium">
                  {(config.database && config.schema && config.table) ? `${config.database}.${config.schema}.${config.table}` : 'Not selected'}
                </span>
              </div>
              {componentType === 'chart' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Inferred Type:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {(!config.xAxisColumn || config.xAxisColumn === '') ? 'Card' : 'Bar'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">X-Axis:</span>
                    <span className="text-slate-900 dark:text-white font-medium">{config.xAxisColumn || '(none for Card)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Y-Axis:</span>
                    <span className="text-slate-900 dark:text-white font-medium">{config.yAxisColumn || 'Not selected'}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Color Scheme:</span>
                <span className="text-slate-900 dark:text-white font-medium">
                  {COLOR_SCHEMES.find(cs => cs.value === config.colorScheme)?.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-4 mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            className="bg-blue-500 hover:bg-blue-600 text-white"
            disabled={!config.title.trim() || saving}
          >
            {saving ? 'Saving…' : 'Save Configuration'}
          </Button>
        </div>
        {saveError && (
          <div className="mt-3 text-sm text-red-600">{saveError}</div>
        )}
      </div>
    </Modal>
  );
}