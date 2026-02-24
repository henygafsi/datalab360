'use client';

import { useState, useCallback, useEffect } from 'react';
import { Modal, Input } from 'rizzui';
import {
  BarChart3, LineChart, PieChart, ScatterChart as ScatterIcon,
  Table2, Type, X, TrendingUp, CircleDot, Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ChartConfigModal, { ComponentConfig } from './widget-config/ChartConfigModal';
import KpiCardConfigModal from './widget-config/KpiCardConfigModal';
import TableConfigModal from './widget-config/TableConfigModal';
import { createWidget } from '@/app/services/api/biDashboardApi';
import type {
  DashboardWidget, BIDashboardChartConfig, WidgetType, DashboardChartType,
} from '@/app/services/api/types';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';

// Widget type options for the picker
const WIDGET_TYPES = [
  {
    category: 'Charts',
    items: [
      { widgetType: 'chart' as WidgetType, chartType: 'bar' as DashboardChartType, title: 'Bar', icon: BarChart3, color: 'from-green-400 to-emerald-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'line' as DashboardChartType, title: 'Line', icon: LineChart, color: 'from-purple-400 to-violet-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'area' as DashboardChartType, title: 'Area', icon: TrendingUp, color: 'from-sky-400 to-blue-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'pie' as DashboardChartType, title: 'Pie', icon: PieChart, color: 'from-amber-400 to-orange-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'donut' as DashboardChartType, title: 'Donut', icon: CircleDot, color: 'from-rose-400 to-pink-500' },
      { widgetType: 'chart' as WidgetType, chartType: 'scatter' as DashboardChartType, title: 'Scatter', icon: ScatterIcon, color: 'from-blue-400 to-cyan-500' },
    ],
  },
  {
    category: 'Data',
    items: [
      { widgetType: 'kpi_card' as WidgetType, chartType: null, title: 'KPI Card', icon: Gauge, color: 'from-indigo-400 to-purple-500' },
      { widgetType: 'table' as WidgetType, chartType: null, title: 'Data Table', icon: Table2, color: 'from-slate-400 to-gray-500' },
    ],
  },
  {
    category: 'Content',
    items: [
      { widgetType: 'text' as WidgetType, chartType: null, title: 'Text / Title', icon: Type, color: 'from-teal-400 to-emerald-500' },
    ],
  },
];

interface AddWidgetPanelProps {
  projectId: string;
  pageId: string;
  existingWidgets: DashboardWidget[];
  isOpen: boolean;
  onClose: () => void;
  onWidgetAdded: (widget: DashboardWidget, prefetchedData?: Record<string, unknown>[]) => void;
}

/** Convert ComponentConfig (from ConfigurationModal) to BIDashboardChartConfig (for API) */
function toChartConfig(cfg: ComponentConfig): BIDashboardChartConfig {
  return {
    database: cfg.database || '',
    schema: cfg.schema || '',
    table: cfg.table || '',
    x: cfg.xAxisColumn || null,
    measures: (cfg.measures || []).map((m) => ({
      column: m.column,
      aggregator: m.aggregator || 'SUM',
      seuils: m.seuils,
    })),
    filters: [],
    groupBy: Array.isArray(cfg.groupBy) ? cfg.groupBy : cfg.groupBy ? [cfg.groupBy] : [],
    limit: cfg.limit || null,
  };
}

/** Calculate next free position below existing widgets */
function nextPosition(widgets: DashboardWidget[]) {
  if (widgets.length === 0) return { x: 0, y: 0 };
  const maxY = Math.max(...widgets.map((w) => w.position_y + w.height));
  return { x: 0, y: maxY };
}

type ActiveModal = 'picker' | 'chart' | 'kpi' | 'table' | 'text' | null;

export default function AddWidgetPanel({
  projectId,
  pageId,
  existingWidgets,
  isOpen,
  onClose,
  onWidgetAdded,
}: AddWidgetPanelProps) {
  const [selectedItem, setSelectedItem] = useState<{
    widgetType: WidgetType;
    chartType: DashboardChartType | null;
  } | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>('picker');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleItemSelect = (widgetType: WidgetType, chartType: DashboardChartType | null) => {
    setSelectedItem({ widgetType, chartType });
    if (widgetType === 'text') {
      setActiveModal('text');
    } else if (widgetType === 'kpi_card') {
      setActiveModal('kpi');
    } else if (widgetType === 'table') {
      setActiveModal('table');
    } else {
      setActiveModal('chart');
    }
  };

  /** Create widget via API and notify parent */
  const createAndNotify = useCallback(async (
    widgetType: WidgetType,
    chartType: DashboardChartType | null,
    title: string,
    chartConfig: BIDashboardChartConfig,
    prefetchedData?: Record<string, unknown>[],
    overrides?: { width?: number; height?: number; text_content?: string },
  ) => {
    const isKpi = widgetType === 'kpi_card';
    const isTable = widgetType === 'table';
    const width = overrides?.width ?? (isKpi ? 4 : isTable ? 12 : 12);
    const height = overrides?.height ?? (isKpi ? 2 : 4);
    const pos = nextPosition(existingWidgets);

    const response = await createWidget(projectId, {
      page_id: pageId,
      widget_type: widgetType,
      chart_type: chartType,
      title,
      chart_config: chartConfig,
      text_content: overrides?.text_content,
      position_x: pos.x,
      position_y: pos.y,
      width,
      height,
    });

    const newWidget: DashboardWidget = {
      widget_id: response.widget_id,
      page_id: pageId,
      widget_type: widgetType,
      chart_type: chartType,
      title,
      chart_config: chartConfig,
      text_content: overrides?.text_content,
      position_x: pos.x,
      position_y: pos.y,
      width,
      height,
    };

    onWidgetAdded(newWidget, prefetchedData);
    toast.success('Widget added');
    resetAndClose();
  }, [projectId, pageId, existingWidgets, onWidgetAdded]);

  // ─── Chart widget save (from ConfigurationModal) ───────────────────
  const handleChartConfigSave = useCallback(async (config: ComponentConfig) => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const chartConfig = toChartConfig(config);
      await createAndNotify(
        selectedItem.widgetType,
        selectedItem.chartType,
        config.title || `${selectedItem.chartType || 'chart'} widget`,
        chartConfig,
        config.prefetched?.data,
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [selectedItem, createAndNotify]);

  // ─── KPI Card save (from KpiCardConfigModal) ──────────────────────
  const handleKpiSave = useCallback(async (result: {
    title: string;
    chartConfig: BIDashboardChartConfig;
    prefetchedData?: Record<string, unknown>[];
  }) => {
    console.log('[BI] KPI save — chartConfig:', result.chartConfig, 'prefetchedData:', result.prefetchedData);
    setSaving(true);
    try {
      await createAndNotify('kpi_card', null, result.title, result.chartConfig, result.prefetchedData);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [createAndNotify]);

  // ─── Table save (from TableConfigModal) ────────────────────────────
  const handleTableSave = useCallback(async (result: {
    title: string;
    chartConfig: BIDashboardChartConfig;
    prefetchedData?: Record<string, unknown>[];
  }) => {
    console.log('[BI] Table save — chartConfig:', result.chartConfig, 'prefetchedData:', result.prefetchedData);
    setSaving(true);
    try {
      await createAndNotify('table', null, result.title, result.chartConfig, result.prefetchedData, { width: 12, height: 4 });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [createAndNotify]);

  // ─── Text save ─────────────────────────────────────────────────────
  const handleTextSave = async () => {
    setSaving(true);
    const pos = nextPosition(existingWidgets);
    try {
      const response = await createWidget(projectId, {
        page_id: pageId,
        widget_type: 'text',
        title: textTitle.trim() || 'Text',
        text_content: textContent,
        position_x: pos.x,
        position_y: pos.y,
        width: 24,
        height: 1,
      });

      const newWidget: DashboardWidget = {
        widget_id: response.widget_id,
        page_id: pageId,
        widget_type: 'text',
        title: textTitle.trim() || 'Text',
        text_content: textContent,
        position_x: pos.x,
        position_y: pos.y,
        width: 24,
        height: 1,
      };

      onWidgetAdded(newWidget);
      toast.success('Text widget added');
      resetAndClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resetAndClose = () => {
    setSelectedItem(null);
    setActiveModal(null);
    setTextTitle('');
    setTextContent('');
    onClose();
  };

  // Reset to picker when panel re-opens
  useEffect(() => {
    if (isOpen && activeModal === null) {
      setActiveModal('picker');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* ── Widget Type Picker ── */}
      <Modal isOpen={activeModal === 'picker'} onClose={onClose} customSize="600px">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add Widget</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {WIDGET_TYPES.map((group) => (
            <div key={group.category} className="mb-5">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {group.category}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${item.widgetType}-${item.chartType}`}
                      onClick={() => handleItemSelect(item.widgetType, item.chartType)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all"
                    >
                      <div className={cn('p-3 rounded-xl bg-gradient-to-br', item.color)}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {item.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* ── Chart Config ── */}
      {activeModal === 'chart' && (
        <ChartConfigModal
          isOpen
          onClose={resetAndClose}
          onSave={handleChartConfigSave}
          chartType={selectedItem?.chartType || undefined}
        />
      )}

      {/* ── KPI Card Config ── */}
      {activeModal === 'kpi' && (
        <KpiCardConfigModal
          isOpen
          onClose={resetAndClose}
          onSave={handleKpiSave}
        />
      )}

      {/* ── Data Table Config ── */}
      {activeModal === 'table' && (
        <TableConfigModal
          isOpen
          onClose={resetAndClose}
          onSave={handleTableSave}
        />
      )}

      {/* ── Text Widget Form ── */}
      <Modal isOpen={activeModal === 'text'} onClose={resetAndClose} customSize="500px">
        <div className="p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Add Text Widget</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Title</label>
              <Input
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="e.g., Section Header"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                Content (supports Markdown)
              </label>
              <textarea
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm min-h-[120px]"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="## My Section&#10;Some description text..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                onClick={resetAndClose}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                onClick={handleTextSave}
                disabled={saving}
              >
                {saving ? 'Adding...' : 'Add Widget'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
