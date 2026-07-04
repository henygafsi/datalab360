'use client';

/**
 * AddWidgetSection — the bar's "Add" axis (hosted in BiSmartRightBar).
 *
 * Replaces the AddWidgetPanel portal drawer (the grid's "+ Add widget"
 * buttons) with a docked picker: widget-type tiles route into the SAME
 * docked config flow the left palette uses (onStartAdd → Configure section),
 * and the template gallery is embedded compact below (Add → Templates).
 * No portals, no modals.
 */
import { useState } from 'react';
import { LayoutTemplate, Loader2, Shapes } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';
import type { WidgetType, DashboardChartType } from '@/app/services/api/types';
import { WIDGET_TILE_GROUPS } from './ChartPaletteRail';
import DashboardTemplates, { type DashboardTemplate } from './DashboardTemplates';

interface AddWidgetSectionProps {
  /** Same chokepoint the left palette uses — config opens docked (Configure). */
  onStartAdd: (widgetType: WidgetType, chartType: DashboardChartType | null) => void;
  /** The editor's existing persist-template path (POST /widgets per widget). */
  onApplyTemplate: (template: DashboardTemplate) => void;
  applyingTemplate: boolean;
}

export default function AddWidgetSection({
  onStartAdd,
  onApplyTemplate,
  applyingTemplate,
}: AddWidgetSectionProps) {
  // Action-RBAC gate (System 2): every path ends in POST /widgets
  // (require_action 'bi_reporting','create'). Fail-open while loading.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  const createDeniedReason = 'Requires the "create" permission on Business Reporting.';

  const [tab, setTab] = useState<'widgets' | 'templates'>('widgets');

  return (
    <div className="space-y-3">
      {/* Sub-tabs: Widgets | Templates */}
      <div
        role="tablist"
        aria-label="Add widgets or templates"
        className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
      >
        {([
          { id: 'widgets', label: 'Widgets', icon: Shapes },
          { id: 'templates', label: 'Templates', icon: LayoutTemplate },
        ] as const).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'widgets' && (
        <div>
          <p className="mb-2 text-[11px] text-gray-400 dark:text-gray-500">
            Pick a widget type — its configuration opens right here (Configure), never a popup.
          </p>
          {WIDGET_TILE_GROUPS.map((group) => (
            <div key={group.category} className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group.category}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {group.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={`${it.widgetType}-${it.chartType}`}
                      type="button"
                      onClick={() => onStartAdd(it.widgetType, it.chartType)}
                      disabled={!canCreate}
                      title={canCreate ? it.title : createDeniedReason}
                      className="group flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:shadow-sm"
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br transition-transform group-hover:scale-110',
                          it.color,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </span>
                      <span className="w-full truncate text-center text-[9px] font-medium text-gray-700 dark:text-gray-300">
                        {it.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'templates' && (
        <div>
          {applyingTemplate && (
            <p className="mb-2 flex items-center gap-1.5 text-[11px] text-cyan-600 dark:text-cyan-400" role="status">
              <Loader2 className="h-3 w-3 animate-spin" /> Applying template…
            </p>
          )}
          <DashboardTemplates compact onApplyTemplate={onApplyTemplate} />
        </div>
      )}
    </div>
  );
}
