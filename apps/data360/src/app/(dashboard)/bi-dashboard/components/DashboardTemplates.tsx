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

// ── Template Definitions ───────────────────────────────────────────

const TEMPLATES: DashboardTemplate[] = [
  // ── 1. Retail Sales Dashboard (CP_DATA360.RETAIL_DW) ──
  {
    id: 'retail-sales',
    name: 'Retail Sales Dashboard',
    description: 'Revenue trends, city/store performance, and product analysis using CP_DATA360.RETAIL_DW sample data.',
    icon: ShoppingCart,
    category: 'Retail',
    color: 'from-blue-500 to-cyan-500',
    widgets: [
      {
        type: 'bar',
        widgetType: 'chart',
        title: 'Revenue by City',
        width: 12,
        height: 4,
        config: {
          chartType: 'bar',
          suggestedMeasures: ['TOTAL_REVENUE'],
          suggestedDimension: 'CITY',
          description: 'Total revenue per city from ETL pipeline',
          colors: [PALETTE[0], PALETTE[4]],
          database: 'CP_DATA360',
          schema: 'RETAIL_DW',
          table: 'ETL_RETAIL_CITY_STORE_REVENUE',
          aggregator: 'SUM',
          rowLimit: 15,
        },
      },
      {
        type: 'bar',
        widgetType: 'chart',
        title: 'Top 10 Stores by Revenue',
        width: 12,
        height: 4,
        config: {
          chartType: 'bar',
          suggestedMeasures: ['TOTAL_REVENUE'],
          suggestedDimension: 'STORE_NAME',
          description: 'Store performance ranked by total revenue',
          colors: [PALETTE[1], PALETTE[2]],
          database: 'CP_DATA360',
          schema: 'RETAIL_DW',
          table: 'ETL_RETAIL_CITY_STORE_REVENUE',
          aggregator: 'SUM',
          rowLimit: 10,
        },
      },
      {
        type: 'pie',
        widgetType: 'chart',
        title: 'Revenue Distribution by City',
        width: 12,
        height: 4,
        config: {
          chartType: 'pie',
          suggestedMeasures: ['TOTAL_REVENUE'],
          suggestedDimension: 'CITY',
          description: 'Revenue share per city as pie chart',
          colors: PALETTE,
          database: 'CP_DATA360',
          schema: 'RETAIL_DW',
          table: 'ETL_RETAIL_CITY_STORE_REVENUE',
          aggregator: 'SUM',
          rowLimit: 10,
        },
      },
      {
        type: 'table',
        widgetType: 'table',
        title: 'Store Revenue Details',
        width: 24,
        height: 4,
        config: {
          suggestedMeasures: ['TOTAL_REVENUE', 'STORE_COUNT', 'CITY'],
          suggestedDimension: 'STORE_NAME',
          description: 'Detailed revenue table with all store metrics',
          database: 'CP_DATA360',
          schema: 'RETAIL_DW',
          table: 'ETL_RETAIL_CITY_STORE_REVENUE',
          rowLimit: 50,
        },
      },
    ],
  },

  // ── 2. Inventory Dashboard ──
  {
    id: 'inventory',
    name: 'Inventory Dashboard',
    description: 'Monitor stock levels, reorder alerts, category breakdown, and supplier lead times for inventory management.',
    icon: Package,
    category: 'Retail',
    color: 'from-emerald-500 to-green-600',
    widgets: [
      {
        type: 'bar',
        widgetType: 'chart',
        title: 'Stock Levels',
        width: 12,
        height: 4,
        config: {
          chartType: 'bar',
          suggestedMeasures: ['CURRENT_STOCK', 'REORDER_POINT'],
          suggestedDimension: 'PRODUCT_NAME',
          description: 'Current stock vs reorder point by product',
          colors: [PALETTE[1], PALETTE[3]],
        },
      },
      {
        type: 'table',
        widgetType: 'table',
        title: 'Reorder Alerts',
        width: 12,
        height: 4,
        config: {
          suggestedMeasures: ['CURRENT_STOCK', 'REORDER_POINT', 'DAYS_UNTIL_STOCKOUT'],
          suggestedDimension: 'PRODUCT_NAME',
          description: 'Products below reorder threshold requiring immediate action',
        },
      },
      {
        type: 'pie',
        widgetType: 'chart',
        title: 'Category Breakdown',
        width: 12,
        height: 4,
        config: {
          chartType: 'pie',
          suggestedMeasures: ['TOTAL_VALUE'],
          suggestedDimension: 'CATEGORY',
          description: 'Inventory value distribution by product category',
          colors: PALETTE,
        },
      },
      {
        type: 'bar',
        widgetType: 'chart',
        title: 'Supplier Lead Times',
        width: 12,
        height: 4,
        config: {
          chartType: 'bar',
          suggestedMeasures: ['AVG_LEAD_TIME_DAYS', 'ORDER_COUNT'],
          suggestedDimension: 'SUPPLIER_NAME',
          description: 'Average lead time by supplier for supply chain planning',
          colors: [PALETTE[6], PALETTE[7]],
        },
      },
    ],
  },

  // ── 3. Customer Analytics ──
  {
    id: 'customer-analytics',
    name: 'Customer Analytics',
    description: 'Analyze customer segments, loyalty tiers, repeat purchase behavior, and geographic distribution.',
    icon: Users,
    category: 'Retail',
    color: 'from-violet-500 to-purple-600',
    widgets: [
      {
        type: 'pie',
        widgetType: 'chart',
        title: 'Customer Segments',
        width: 12,
        height: 4,
        config: {
          chartType: 'pie',
          suggestedMeasures: ['CUSTOMER_COUNT'],
          suggestedDimension: 'SEGMENT',
          description: 'Customer distribution across behavioral segments',
          colors: [PALETTE[0], PALETTE[1], PALETTE[4], PALETTE[5]],
        },
      },
      {
        type: 'bar',
        widgetType: 'chart',
        title: 'Loyalty Tier Distribution',
        width: 12,
        height: 4,
        config: {
          chartType: 'bar',
          suggestedMeasures: ['CUSTOMER_COUNT', 'AVG_SPEND'],
          suggestedDimension: 'LOYALTY_TIER',
          description: 'Customer counts and average spend per loyalty tier',
          colors: [PALETTE[2], PALETTE[4]],
        },
      },
      {
        type: 'line',
        widgetType: 'chart',
        title: 'Repeat Purchase Rate',
        width: 12,
        height: 4,
        config: {
          chartType: 'line',
          suggestedMeasures: ['REPEAT_RATE', 'NEW_CUSTOMER_RATE'],
          suggestedDimension: 'MONTH',
          description: 'Monthly trend of repeat vs new customer purchase rates',
          colors: [PALETTE[1], PALETTE[3]],
        },
      },
      {
        type: 'heatmap',
        widgetType: 'chart',
        title: 'Geographic Distribution',
        width: 12,
        height: 4,
        config: {
          chartType: 'heatmap',
          suggestedMeasures: ['CUSTOMER_COUNT'],
          suggestedDimension: 'REGION',
          description: 'Customer concentration by geographic region (heatmap)',
          colors: PALETTE,
        },
      },
    ],
  },
  // ── 4. CRM Coverage & Client Focus ──
  {
    id: 'crm-coverage',
    name: 'CRM Coverage & Client Focus',
    description: 'Analyze CRM pipeline coverage, client engagement scores, segment penetration, and account health without exposing PII.',
    icon: Target,
    category: 'CRM',
    color: 'from-indigo-500 to-violet-600',
    widgets: [
      {
        type: 'bar',
        widgetType: 'chart',
        title: 'Pipeline Coverage by Segment',
        width: 12,
        height: 4,
        config: {
          chartType: 'bar',
          suggestedMeasures: ['PIPELINE_VALUE', 'TARGET_VALUE', 'COVERAGE_RATIO'],
          suggestedDimension: 'SEGMENT',
          description: 'Pipeline value vs target by client segment (Enterprise, Mid-Market, SMB)',
          colors: [PALETTE[0], PALETTE[4]],
        },
      },
      {
        type: 'area',
        widgetType: 'chart',
        title: 'Engagement Score Trend',
        width: 12,
        height: 4,
        config: {
          chartType: 'area',
          suggestedMeasures: ['AVG_ENGAGEMENT_SCORE', 'TOUCHPOINT_COUNT'],
          suggestedDimension: 'MONTH',
          description: 'Monthly engagement score evolution across all accounts',
          colors: [PALETTE[1], PALETTE[6]],
        },
      },
      {
        type: 'pie',
        widgetType: 'chart',
        title: 'Account Health Distribution',
        width: 12,
        height: 4,
        config: {
          chartType: 'pie',
          suggestedMeasures: ['ACCOUNT_COUNT'],
          suggestedDimension: 'HEALTH_STATUS',
          description: 'Accounts by health status (Healthy, At Risk, Churning, New)',
          colors: [PALETTE[1], PALETTE[2], PALETTE[3], PALETTE[0]],
        },
      },
      {
        type: 'bar',
        widgetType: 'chart',
        title: 'Win Rate by Industry',
        width: 12,
        height: 4,
        config: {
          chartType: 'bar',
          suggestedMeasures: ['WIN_RATE', 'DEAL_COUNT'],
          suggestedDimension: 'INDUSTRY',
          description: 'Conversion rate and deal volume per industry vertical',
          colors: [PALETTE[4], PALETTE[5]],
        },
      },
      {
        type: 'line',
        widgetType: 'chart',
        title: 'Retention & Expansion Revenue',
        width: 12,
        height: 4,
        config: {
          chartType: 'line',
          suggestedMeasures: ['RETENTION_REVENUE', 'EXPANSION_REVENUE', 'CHURN_REVENUE'],
          suggestedDimension: 'QUARTER',
          description: 'Quarterly retention, expansion, and churn revenue trends',
          colors: [PALETTE[1], PALETTE[0], PALETTE[3]],
        },
      },
      {
        type: 'table',
        widgetType: 'table',
        title: 'Segment Penetration Summary',
        width: 24,
        height: 5,
        config: {
          suggestedMeasures: [
            'TOTAL_ACCOUNTS', 'ACTIVE_ACCOUNTS', 'PENETRATION_RATE',
            'AVG_DEAL_SIZE', 'AVG_CYCLE_DAYS', 'NPS_SCORE',
          ],
          suggestedDimension: 'SEGMENT',
          description: 'Aggregated CRM metrics per segment — no PII, only ratios and averages',
        },
      },
    ],
  },
];

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
