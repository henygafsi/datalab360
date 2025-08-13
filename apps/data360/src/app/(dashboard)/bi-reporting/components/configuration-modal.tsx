'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Select, Modal, Text, Badge } from 'rizzui';
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
  dataSource?: string;
  xAxisColumn?: string;
  yAxisColumn?: string;
  colorScheme?: string;
  chartType?: string;
  customColors?: string[];
}

interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ComponentConfig) => void;
  componentType: 'stat' | 'chart';
  initialConfig?: ComponentConfig;
}

const COLOR_SCHEMES = [
  { value: 'blue', label: 'Blue', color: '#3B82F6' },
  { value: 'green', label: 'Green', color: '#10B981' },
  { value: 'purple', label: 'Purple', color: '#8B5CF6' },
  { value: 'amber', label: 'Amber', color: '#F59E0B' },
  { value: 'red', label: 'Red', color: '#EF4444' },
  { value: 'indigo', label: 'Indigo', color: '#6366F1' },
];

const CHART_TYPES = [
  { value: 'area', label: 'Area Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'line', label: 'Line Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'multibar', label: 'Multi-Bar Chart' },
  { value: 'radial', label: 'Radial Chart' },
];

const DATA_SOURCES = [
  { value: 'sales_data', label: 'Sales Data' },
  { value: 'user_analytics', label: 'User Analytics' },
  { value: 'revenue_metrics', label: 'Revenue Metrics' },
  { value: 'marketing_data', label: 'Marketing Data' },
  { value: 'performance_data', label: 'Performance Data' },
  { value: 'custom_api', label: 'Custom API Endpoint' },
];

const SAMPLE_COLUMNS = [
  { value: 'date', label: 'Date' },
  { value: 'month', label: 'Month' },
  { value: 'category', label: 'Category' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'users', label: 'Users' },
  { value: 'orders', label: 'Orders' },
  { value: 'conversions', label: 'Conversions' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'impressions', label: 'Impressions' },
  { value: 'growth_rate', label: 'Growth Rate' },
];

export default function ConfigurationModal({ 
  isOpen, 
  onClose, 
  onSave, 
  componentType,
  initialConfig 
}: ConfigurationModalProps) {
  const [config, setConfig] = useState<ComponentConfig>({
    id: '',
    title: '',
    description: '',
    subtitle: '',
    dataSource: '',
    xAxisColumn: '',
    yAxisColumn: '',
    colorScheme: 'blue',
    chartType: 'area',
    customColors: [],
    ...initialConfig
  });

  useEffect(() => {
    if (initialConfig) {
      setConfig({ ...initialConfig });
    }
  }, [initialConfig]);

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const updateConfig = (field: keyof ComponentConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
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
              
              {componentType === 'chart' && (
                <Select
                  label="Chart Type"
                  value={config.chartType}
                  onChange={(value) => updateConfig('chartType', value)}
                  options={CHART_TYPES}
                />
              )}
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
                label="Data Source"
                value={config.dataSource}
                onChange={(value) => updateConfig('dataSource', value)}
                options={DATA_SOURCES}
                placeholder="Select data source"
              />
              
              {componentType === 'chart' && (
                <>
                  <Select
                    label="X-Axis Column"
                    value={config.xAxisColumn}
                    onChange={(value) => updateConfig('xAxisColumn', value)}
                    options={SAMPLE_COLUMNS}
                    placeholder="Select X-axis data"
                  />
                  <Select
                    label="Y-Axis Column"
                    value={config.yAxisColumn}
                    onChange={(value) => updateConfig('yAxisColumn', value)}
                    options={SAMPLE_COLUMNS}
                    placeholder="Select Y-axis data"
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
                <span className="text-slate-600 dark:text-slate-400">Data Source:</span>
                <span className="text-slate-900 dark:text-white font-medium">
                  {DATA_SOURCES.find(ds => ds.value === config.dataSource)?.label || 'Not selected'}
                </span>
              </div>
              {componentType === 'chart' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Chart Type:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {CHART_TYPES.find(ct => ct.value === config.chartType)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">X-Axis:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {SAMPLE_COLUMNS.find(col => col.value === config.xAxisColumn)?.label || 'Not selected'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Y-Axis:</span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {SAMPLE_COLUMNS.find(col => col.value === config.yAxisColumn)?.label || 'Not selected'}
                    </span>
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
            disabled={!config.title.trim()}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </Modal>
  );
}