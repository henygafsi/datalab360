'use client';

import { useState, useCallback } from 'react';
import { Button } from 'rizzui';
import { Plus, Trash2, GripVertical, BarChart3, Table2, Gauge } from 'lucide-react';
import { DynamicChart } from '../bi-dashboard/components/DynamicChart';
import ChartConfigModal, { ComponentConfig } from '../bi-dashboard/components/widget-config/ChartConfigModal';

interface QualityReportItem {
  id: string;
  type: 'chart' | 'metric' | 'table';
  componentId: string;
  position: number;
  config?: ComponentConfig;
  w?: number;
  h?: number;
  hUnits?: number;
  fontScale?: number;
}

interface PageBuilderProps {
  onLayoutChange: (items: QualityReportItem[]) => void;
  initialItems?: QualityReportItem[];
}

export default function PageBuilder({ onLayoutChange, initialItems = [] }: PageBuilderProps) {
  const [items, setItems] = useState<QualityReportItem[]>(initialItems);
  const [showChartModal, setShowChartModal] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addItem = useCallback(
    (config: ComponentConfig) => {
      const newItem: QualityReportItem = {
        id: `item-${Date.now()}`,
        type: 'chart',
        componentId: config.chartType || 'bar',
        position: items.length,
        config,
        w: 12,
        h: 4,
      };
      const updated = [...items, newItem];
      setItems(updated);
      onLayoutChange(updated);
      setShowChartModal(false);
    },
    [items, onLayoutChange]
  );

  const removeItem = useCallback(
    (id: string) => {
      const updated = items.filter((i) => i.id !== id).map((i, idx) => ({ ...i, position: idx }));
      setItems(updated);
      onLayoutChange(updated);
    },
    [items, onLayoutChange]
  );

  // Simple drag reorder
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    const updated = reordered.map((item, i) => ({ ...item, position: i }));
    setItems(updated);
    setDragIdx(idx);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    onLayoutChange(items);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200/60 dark:border-slate-800/60 p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Report Builder
        </h2>
        <Button
          onClick={() => setShowChartModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" /> Add Chart
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <BarChart3 className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            No charts yet. Add one to get started.
          </p>
          <Button
            onClick={() => setShowChartModal(true)}
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Add Chart
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`group border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden transition-all ${
                dragIdx === idx ? 'opacity-50 scale-95' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-slate-400 cursor-grab" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                    {item.config?.title || `Chart ${idx + 1}`}
                  </span>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Chart */}
              <div style={{ height: 250 }}>
                {item.config?.prefetched?.data ? (
                  <DynamicChart
                    config={{
                      chartType: item.config.chartType || item.componentId,
                      x: item.config.xAxisColumn,
                      measures: item.config.measures,
                      prefetched: item.config.prefetched,
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    No data — configure and preview to load
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart Config Modal */}
      {showChartModal && (
        <ChartConfigModal
          isOpen
          onClose={() => setShowChartModal(false)}
          onSave={addItem}
          chartType="bar"
        />
      )}
    </div>
  );
}
