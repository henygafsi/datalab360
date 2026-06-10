'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button, Badge, Text, Modal } from 'rizzui';
import {
  ShoppingCart, Package, Users, LayoutTemplate,
  TrendingUp, BarChart3, PieChart, LineChart,
  AlertTriangle, MapPin,
  ChevronRight, X, Sparkles, Target, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardChartType, WidgetType, DashboardTemplateAPI } from '@/app/services/api/types';
import { listTemplates } from '@/app/services/api/biDashboardApi';
import {
  DASHBOARD_TEMPLATES,
  type DashboardTemplateDef,
  type TemplateWidgetDef,
} from './reporting-catalog-grounding';

// ── Color Palette ──────────────────────────────────────────────────
const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

// ── Template Widget Definition ─────────────────────────────────────
export interface TemplateWidget {
  type: DashboardChartType | 'table';
  widgetType: WidgetType;
  title: string;
  width: number;   // grid columns (out of 24)
  height: number;   // grid rows
  config: {
    chartType?: DashboardChartType;
    suggestedMeasures?: string[];
    suggestedDimension?: string;
    description?: string;
    colors?: string[];
    /** Pre-configured data source for instant rendering */
    database?: string;
    schema?: string;
    table?: string;
    aggregator?: string;
    rowLimit?: number;
  };
}

// ── Template Definition ────────────────────────────────────────────
export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  color: string;
  widgets: TemplateWidget[];
}

// ── Template Definitions (sourced from reporting-catalog.json) ──────
//
// The curated templates are no longer hand-coded here — reporting-catalog.json
// is the single source of truth. We adapt the catalog's `dashboard_templates`
// into the rich local `DashboardTemplate` shape this component renders.

// String icon name (catalog) → lucide component.
const TEMPLATE_ICON_BY_NAME: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingCart,
  Package,
  Users,
  Target,
  LayoutTemplate,
};

// Adapt one catalog template into the rich local DashboardTemplate shape.
function adaptCatalogTemplate(def: DashboardTemplateDef): DashboardTemplate {
  return {
    id: def.id,
    name: def.label,
    description: def.description,
    icon: TEMPLATE_ICON_BY_NAME[def.icon] || LayoutTemplate,
    category: def.category,
    color: def.color,
    widgets: def.widgets.map((w: TemplateWidgetDef, i: number) => ({
      type: w.widget_type === 'table'
        ? 'table'
        : ((w.chart_type as DashboardChartType) || 'bar'),
      widgetType: w.widget_type as WidgetType,
      title: w.title,
      width: w.position.w,
      height: w.position.h,
      config: {
        chartType: w.chart_type ? (w.chart_type as DashboardChartType) : undefined,
        suggestedMeasures: w.measures,
        suggestedDimension: w.dimension || undefined,
        description: w.description,
        colors: [PALETTE[i % PALETTE.length]],
        database: def.data_source?.database,
        schema: def.data_source?.schema,
        table: def.data_source?.table,
        aggregator: w.aggregator,
        rowLimit: w.row_limit,
      },
    })),
  };
}

const TEMPLATES: DashboardTemplate[] = DASHBOARD_TEMPLATES.map(adaptCatalogTemplate);

// ── Widget Type Icon Map ───────────────────────────────────────────

function getWidgetIcon(type: string) {
  switch (type) {
    case 'area': return TrendingUp;
    case 'bar': return BarChart3;
    case 'pie': return PieChart;
    case 'line': return LineChart;
    case 'table': return AlertTriangle;
    case 'heatmap': return MapPin;
    default: return BarChart3;
  }
}

// ── Template Card ──────────────────────────────────────────────────

function TemplateCard({
  template,
  onSelect,
}: {
  template: DashboardTemplate;
  onSelect: (template: DashboardTemplate) => void;
}) {
  const Icon = template.icon;

  return (
    <button
      onClick={() => onSelect(template)}
      className="group relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg dark:hover:shadow-gray-900/40 transition-all duration-200 overflow-hidden text-left"
    >
      {/* Gradient Header */}
      <div className={cn('h-24 bg-gradient-to-br flex items-center justify-center', template.color)}>
        <Icon className="h-10 w-10 text-white/90" />
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <Text className="font-semibold text-gray-900 dark:text-white text-sm">
            {template.name}
          </Text>
          <Badge size="sm" className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px]">
            {template.category}
          </Badge>
        </div>
        <Text className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
          {template.description}
        </Text>

        {/* Widget preview pills */}
        <div className="flex flex-wrap gap-1 mt-auto">
          {template.widgets.map((w, i) => {
            const WIcon = getWidgetIcon(w.type);
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px]"
              >
                <WIcon className="h-2.5 w-2.5" />
                {w.title}
              </span>
            );
          })}
        </div>

        {/* Hover indicator */}
        <div className="flex items-center gap-1 mt-3 text-blue-600 dark:text-blue-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          Use template <ChevronRight className="h-3 w-3" />
        </div>
      </div>
    </button>
  );
}

// ── Template Detail Modal ──────────────────────────────────────────

function TemplateDetailModal({
  template,
  isOpen,
  onClose,
  onApply,
}: {
  template: DashboardTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onApply: (template: DashboardTemplate) => void;
}) {
  if (!template) return null;
  const Icon = template.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} customSize="640px">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={cn('p-3 rounded-xl bg-gradient-to-br', template.color)}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                {template.name}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {template.widgets.length} widgets
              </Text>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <Text className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {template.description}
        </Text>

        {/* Widget List */}
        <div className="space-y-3 mb-6">
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Included Widgets
          </Text>
          {template.widgets.map((widget, i) => {
            const WIcon = getWidgetIcon(widget.type);
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
              >
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${widget.config.colors?.[0] || PALETTE[i]}20` }}
                >
                  <WIcon
                    className="h-4 w-4"
                    style={{ color: widget.config.colors?.[0] || PALETTE[i] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {widget.title}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {widget.config.description}
                  </Text>
                </div>
                <Badge size="sm" className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] flex-shrink-0">
                  {widget.type === 'table' ? 'Table' : widget.type}
                </Badge>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {widget.width}x{widget.height}
                </span>
              </div>
            );
          })}
        </div>

        {/* Suggested Columns Info */}
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 mb-6">
          <Text className="text-xs text-blue-700 dark:text-blue-400">
            After applying this template, each widget will need a data source configured.
            Suggested columns are pre-filled based on common retail data schemas.
          </Text>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            onClick={() => onApply(template)}
            className="gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
          >
            <Sparkles className="h-4 w-4" />
            Apply Template
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Component ─────────────────────────────────────────────────

interface DashboardTemplatesProps {
  onApplyTemplate: (template: DashboardTemplate) => void;
}

// Adapt a backend-served template (minimal shape) into the rich local
// DashboardTemplate so both sources flow through the same UI.
function adaptApiTemplate(t: DashboardTemplateAPI): DashboardTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    icon: LayoutTemplate,
    category: 'Library',
    color: 'from-slate-500 to-slate-700',
    widgets: t.widgets.map((w, i) => ({
      type: (w.chart_type as DashboardChartType) || 'bar',
      widgetType: (w.type as WidgetType) || 'chart',
      title: w.title,
      width: 12,
      height: 4,
      config: {
        chartType: (w.chart_type as DashboardChartType) || undefined,
        description: w.title,
        colors: [PALETTE[i % PALETTE.length]],
      },
    })),
  };
}

export default function DashboardTemplates({ onApplyTemplate }: DashboardTemplatesProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [apiTemplates, setApiTemplates] = useState<DashboardTemplate[]>([]);
  const [loadingApi, setLoadingApi] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingApi(true);
    listTemplates()
      .then((res) => {
        if (cancelled) return;
        setApiTemplates((res.templates || []).map(adaptApiTemplate));
      })
      .catch(() => {
        // Backend gallery is optional; curated list still works without it.
      })
      .finally(() => {
        if (!cancelled) setLoadingApi(false);
      });
    return () => { cancelled = true; };
  }, []);


  const handleSelect = useCallback((template: DashboardTemplate) => {
    setSelectedTemplate(template);
    setDetailOpen(true);
  }, []);

  const handleApply = useCallback(
    (template: DashboardTemplate) => {
      onApplyTemplate(template);
      setDetailOpen(false);
      setSelectedTemplate(null);
    },
    [onApplyTemplate]
  );

  return (
    <div className="space-y-6">
    <div>
      <div className="flex items-center gap-2 mb-4">
        <LayoutTemplate className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Curated Templates
        </Text>
        <Badge size="sm" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px]">
          {TEMPLATES.length} templates
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={handleSelect}
          />
        ))}
      </div>
            </div>

      {(loadingApi || apiTemplates.length > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <LayoutTemplate className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Library
            </Text>
            {loadingApi ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            ) : (
              <Badge size="sm" className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 text-[10px]">
                {apiTemplates.length} templates
              </Badge>
            )}
          </div>

          {apiTemplates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {apiTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <TemplateDetailModal
        template={selectedTemplate}
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedTemplate(null);
        }}
        onApply={handleApply}
      />
    </div>
  );
}

// Export templates for external use
export { TEMPLATES };
export type { DashboardTemplate as Template };
