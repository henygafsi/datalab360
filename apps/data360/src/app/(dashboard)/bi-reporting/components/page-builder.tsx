'use client';

import { useState, useEffect, DragEvent } from 'react';
import { Button } from 'rizzui';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineArrowsPointingOut,
  HiOutlineChartBarSquare,
  HiOutlineSparkles,
  HiOutlineChartBar,
  HiOutlineChartPie,
  HiOutlineRectangleStack,
} from 'react-icons/hi2';
import { FcScatterPlot } from "react-icons/fc";
import { FaChartLine } from "react-icons/fa6";

import ChartCard, { CHART_OPTIONS, DynamicChart } from './chart-components';
import ConfigurationModal, { ComponentConfig } from './configuration-modal';

interface DashboardItem {
  id: string;
  type: 'chart';
  componentId: string;
  position: number;
  config?: ComponentConfig;
  w?: number; // grid column span (1-3)
  h?: number; // legacy integer height
  hUnits?: number; // fractional height units (0.5 step)
  fontScale?: number; // 0.75 - 1.5
}

interface PageBuilderProps {
  onLayoutChange?: (items: DashboardItem[]) => void;
  initialItems?: DashboardItem[];
}

export default function PageBuilder({ onLayoutChange, initialItems = [] }: PageBuilderProps) {
  const [dashboardItems, setDashboardItems] = useState<DashboardItem[]>(initialItems);
  const [draggedItem, setDraggedItem] = useState<{ type: 'chart', id: string } | null>(null);
  const [draggedDashboardItemId, setDraggedDashboardItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<number | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DashboardItem | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Grid positioning helpers
  const findNextAvailablePosition = () => {
    const chartItems = dashboardItems.filter(item => item.type === 'chart');
    if (chartItems.length === 0) return 0;
    
    // Find the highest position and add 1
    const maxPosition = Math.max(...chartItems.map(item => item.position || 0));
    return maxPosition + 1;
  };

  const getGridPosition = (position: number) => {
    // Convert position to grid coordinates
    const row = Math.floor(position / 6); // 6 columns
    const col = position % 6;
    return { row, col };
  };

  const getChartIcon = (chartType: string) => {
    switch (chartType) {
      case 'bar':
        return <HiOutlineChartBar className="w-6 h-6 text-blue-500" />;
      case 'line':
        return <FaChartLine className="w-6 h-6 text-green-500" />;
      case 'pie':
        return <HiOutlineChartPie className="w-6 h-6 text-purple-500" />;
      case 'scatter':
        return <FcScatterPlot className="w-6 h-6 text-orange-500" />;
      case 'card':
        return <HiOutlineRectangleStack className="w-6 h-6 text-red-500" />;
      default:
        return <HiOutlineChartBarSquare className="w-6 h-6 text-slate-500" />;
    }
  };

  const renderDropZone = (position: number) => {
    const { row, col } = getGridPosition(position);
    const isHighlighted = dragOverPosition === position && (draggedItem || draggedDashboardItemId);
    
    return (
      <div
        key={`dropzone-${position}`}
        className={`border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl transition-all duration-200 ${
          isHighlighted ? 'border-green-500 bg-green-50/50 dark:bg-green-900/20' : ''
        }`}
        style={{
          gridColumn: `${col + 1} / span 1`,
          gridRow: `${row + 1} / span 1`,
          minHeight: '10rem',
        }}
        onDragOver={(e) => handleDropZoneDragOver(e, position)}
        onDrop={(e) => handleDropZoneDrop(e, position)}
      >
        <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
          <div className="text-center">
            <div className="w-8 h-8 mx-auto mb-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg"></div>
            <span className="text-xs">Drop here</span>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    setDashboardItems(initialItems);
  }, [initialItems]);

  const handleDragStart = (e: DragEvent, type: 'chart', id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: DragEvent, zone: 'charts') => {
    e.preventDefault();
    
    // Check if we're dragging from library (new item) or reordering existing item
    if (draggedItem) {
      // Adding new chart from library
      const maxItems = 5;
      const currentItems = dashboardItems.filter(item => item.type === 'chart');

    if (currentItems.length >= maxItems) {
      alert(`Maximum ${maxItems} ${zone} allowed`);
      return;
    }

      // Use specific position if dropping on a position, otherwise find next available
      const position = dragOverPosition !== null ? dragOverPosition : findNextAvailablePosition();

    const newItem: DashboardItem = {
      id: `${draggedItem.type}-${Date.now()}`,
        type: 'chart',
      componentId: draggedItem.id,
        position: position,
        w: 1,
        hUnits: 1,
        fontScale: 1,
      };

      // If dropping at a specific position, shift other items
      let updatedItems;
      if (dragOverPosition !== null) {
        updatedItems = dashboardItems.map(item => {
          if (item.type === 'chart' && (item.position || 0) >= dragOverPosition) {
            return { ...item, position: (item.position || 0) + 1 };
          }
          return item;
        });
        updatedItems.push(newItem);
      } else {
        updatedItems = [...dashboardItems, newItem];
      }

    setDashboardItems(updatedItems);
    onLayoutChange?.(updatedItems);
    setDraggedItem(null);
      setDragOverPosition(null);
    } else if (draggedDashboardItemId) {
      // Reordering existing chart
      if (dragOverPosition !== null) {
        const items = [...dashboardItems];
        const draggedItem = items.find(i => i.id === draggedDashboardItemId);
        if (draggedItem) {
          const oldPosition = draggedItem.position || 0;
          
          // Shift items between old and new position
          const updated = items.map(item => {
            if (item.id === draggedDashboardItemId) {
              return { ...item, position: dragOverPosition };
            } else if (item.type === 'chart') {
              const pos = item.position || 0;
              if (oldPosition < dragOverPosition && pos > oldPosition && pos <= dragOverPosition) {
                return { ...item, position: pos - 1 };
              } else if (oldPosition > dragOverPosition && pos < oldPosition && pos >= dragOverPosition) {
                return { ...item, position: pos + 1 };
              }
            }
            return item;
          });
          
          setDashboardItems(updated);
          onLayoutChange?.(updated);
        }
      }
      setDraggedDashboardItemId(null);
      setDragOverPosition(null);
    }
  };

  const handleItemDragStart = (e: DragEvent, itemId: string) => {
    e.stopPropagation();
    setDraggedDashboardItemId(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleItemDragEnd = () => {
    setDraggedDashboardItemId(null);
    setDragOverItemId(null);
    setDragOverPosition(null);
  };

  const handleDropZoneDragOver = (e: DragEvent, position: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPosition(position);
  };

  const handleDropZoneDrop = (e: DragEvent, position: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPosition(position);
    handleDrop(e, 'charts');
  };

  const handleItemDragOver = (e: DragEvent, itemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItemId(itemId);
  };

  const handleItemDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedDashboardItemId || draggedDashboardItemId === targetId) return;
    
    const items = [...dashboardItems];
    const draggedItem = items.find(i => i.id === draggedDashboardItemId);
    const targetItem = items.find(i => i.id === targetId);
    
    if (!draggedItem || !targetItem) return;
    
    // Swap positions
    const draggedPosition = draggedItem.position || 0;
    const targetPosition = targetItem.position || 0;
    
    const updated = items.map(item => {
      if (item.id === draggedDashboardItemId) {
        return { ...item, position: targetPosition };
      } else if (item.id === targetId) {
        return { ...item, position: draggedPosition };
      }
      return item;
    });
    
    setDashboardItems(updated);
    onLayoutChange?.(updated);
    setDraggedDashboardItemId(null);
    setDragOverItemId(null);
  };

  const removeItem = (itemId: string) => {
    const updatedItems = dashboardItems.filter(item => item.id !== itemId);
    setDashboardItems(updatedItems);
    onLayoutChange?.(updatedItems);
  };

  const clearAll = () => {
    setDashboardItems([]);
    onLayoutChange?.([]);
  };

  const openConfiguration = (item: DashboardItem) => {
    setEditingItem(item);
    setConfigModalOpen(true);
  };

  const handleConfigSave = (config: ComponentConfig) => {
    if (!editingItem) return;
    
    const updatedItems = dashboardItems.map(item => 
      item.id === editingItem.id 
        ? { ...item, config: { ...config, id: editingItem.id } }
        : item
    );
    
    setDashboardItems(updatedItems);
    onLayoutChange?.(updatedItems);
    setEditingItem(null);
  };

  const closeConfigModal = () => {
    setConfigModalOpen(false);
    setEditingItem(null);
  };

  // Stat cards removed

  const setItemSize = (itemId: string, wDelta: number, hDelta: number) => {
    setDashboardItems(prev => {
      const updated = prev.map(i => {
        if (i.id !== itemId) return i;
        const nextW = Math.min(3, Math.max(1, (i.w || 1) + wDelta));
        const currentHUnits = typeof i.hUnits === 'number' ? i.hUnits : (typeof i.h === 'number' ? i.h : 1);
        const nextHUnits = Math.min(4, Math.max(0.5, currentHUnits + hDelta));
        return { ...i, w: nextW, hUnits: Number(nextHUnits.toFixed(1)) };
      });
      onLayoutChange?.(updated);
      return updated;
    });
  };

  const setItemFontScale = (itemId: string, delta: number) => {
    setDashboardItems(prev => {
      const updated = prev.map(i => {
        if (i.id !== itemId) return i;
        const current = typeof i.fontScale === 'number' ? i.fontScale : 1;
        const next = Math.min(1.5, Math.max(0.75, Number((current + delta).toFixed(2))));
        return { ...i, fontScale: next };
      });
      onLayoutChange?.(updated);
      return updated;
    });
  };

  const selectedItem = selectedItemId ? (dashboardItems.find(i => i.id === selectedItemId) || null) : null;
  const configureSelected = () => { if (selectedItem) openConfiguration(selectedItem); };
  const removeSelected = () => { if (!selectedItem) return; removeItem(selectedItem.id); setSelectedItemId(null); };

  const renderChart = (item: DashboardItem) => {
    const defaultConfig = CHART_OPTIONS.find(option => option.id === item.componentId);
    if (!defaultConfig) return null;

    const finalConfig = item.config ? {
      ...defaultConfig,
      title: item.config.title || defaultConfig.title,
    } : defaultConfig;

    const { row, col } = getGridPosition(item.position || 0);
    const width = item.w || 1;
    const heightUnits = item.hUnits || item.h || 1;
    const heightRows = Math.max(1, Math.round(heightUnits * 2)); // 0.5 -> 1 row, 1.0 -> 2 rows

    return (
      <div
        key={item.id}
        className={`relative group cursor-pointer transition-all duration-200 ${selectedItemId === item.id ? 'ring-2 ring-blue-400 rounded-2xl' : ''} ${draggedDashboardItemId === item.id ? 'opacity-50 scale-95' : ''} ${dragOverItemId === item.id && draggedDashboardItemId && draggedDashboardItemId !== item.id ? 'ring-2 ring-green-400 rounded-2xl bg-green-50/50 dark:bg-green-900/20' : ''}`}
        style={{
          gridColumn: `${col + 1} / span ${width}`,
          gridRow: `${row + 1} / span ${heightRows}`,
        }}
        draggable
        onDragStart={(e) => handleItemDragStart(e, item.id)}
        onDragOver={(e) => handleItemDragOver(e, item.id)}
        onDrop={(e) => handleItemDrop(e, item.id)}
        onDragEnd={handleItemDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedItemId(item.id);
        }}
        >
        <ChartCard
          id={String((finalConfig as any).id || item.id)}
          title={String((finalConfig as any).title || 'Chart')}
          description={String((finalConfig as any).description || '')}
          badge={String((finalConfig as any).badge || 'Dynamic')}
          badgeColor={String((finalConfig as any).badgeColor || 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400')}
          heightRem={((item.hUnits || item.h || 1) * 10)}
        >
          <DynamicChart config={{ ...item.config, componentId: item.componentId }} enabled={true} fontScale={item.fontScale || 1} />
        </ChartCard>
        <div className="absolute top-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={() => openConfiguration(item)}
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
            title="Configure"
          >
            <HiOutlineSparkles className="w-4 h-4" />
          </button>
          <button
            onClick={() => removeItem(item.id)}
            className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
            title="Remove"
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-blue-600 dark:from-white dark:via-slate-200 dark:to-blue-400 bg-clip-text text-transparent">
            Dashboard Builder
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Drag and drop components to build your custom dashboard
          </p>
        </div>
        <Button
          onClick={clearAll}
          className="bg-red-500 hover:bg-red-600 text-white"
          disabled={dashboardItems.length === 0}
        >
          <HiOutlineTrash className="w-4 h-4 mr-2" />
          Clear All
        </Button>
      </div>

      <div className="grid lg:grid-cols-4 gap-8">
        {/* Component Library */}
        <div className="lg:col-span-1 space-y-6">
          {/* Charts Library */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <HiOutlineChartBarSquare className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Charts
              </h3>
              <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">
                Max 5
              </span>
            </div>
            <div className="space-y-3">
              {CHART_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'chart', option.id)}
                  className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl cursor-grab hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getChartIcon(option.id)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {option.title}
                    </p>
                     
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div className="lg:col-span-3 space-y-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <HiOutlineChartBarSquare className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Charts ({dashboardItems.filter(item => item.type === 'chart').length}/5)
              </h3>
            </div>
            {/* Global control panel for selected chart */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-slate-400 mr-2">
                {selectedItem ? `Selected: ${selectedItem.config?.title || selectedItem.componentId}` : 'Select a chart to edit'}
              </span>
              <Button onClick={() => selectedItemId && setItemSize(selectedItemId, -1, 0)} variant="outline" disabled={!selectedItemId}>W-</Button>
              <Button onClick={() => selectedItemId && setItemSize(selectedItemId, +1, 0)} variant="outline" disabled={!selectedItemId}>W+</Button>
              <Button onClick={() => selectedItemId && setItemSize(selectedItemId, 0, -0.5)} variant="outline" disabled={!selectedItemId}>H-</Button>
              <Button onClick={() => selectedItemId && setItemSize(selectedItemId, 0, +0.5)} variant="outline" disabled={!selectedItemId}>H+</Button>
              <Button onClick={() => selectedItemId && setItemFontScale(selectedItemId, -0.1)} variant="outline" disabled={!selectedItemId}>A-</Button>
              <Button onClick={() => selectedItemId && setItemFontScale(selectedItemId, +0.1)} variant="outline" disabled={!selectedItemId}>A+</Button>
              <Button onClick={configureSelected} variant="outline" disabled={!selectedItemId}>
                <HiOutlineSparkles className="w-4 h-4 mr-1" /> Configure
              </Button>
              <Button onClick={removeSelected} variant="outline" disabled={!selectedItemId} className="text-red-600 border-red-200">
                <HiOutlineTrash className="w-4 h-4 mr-1" /> Remove
              </Button>
            </div>

            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'charts')}
              className={`h-[80vh] overflow-auto border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-6 transition-colors ${
                draggedItem?.type === 'chart' ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : ''
              }`}
            >
              {dashboardItems.filter(item => item.type === 'chart').length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
                  <HiOutlineArrowsPointingOut className="w-12 h-12 mb-2" />
                  <p>Drop charts here (max 5)</p>
                </div>
              ) : (
                <div className={`grid grid-cols-6 gap-6 auto-rows-[10rem] min-w-[1024px] ${draggedDashboardItemId ? 'bg-blue-50/50 dark:bg-blue-900/10 rounded-lg' : ''}`}>
                  {(() => {
                    const chartItems = dashboardItems
                    .filter(item => item.type === 'chart')
                      .sort((a, b) => (a.position || 0) - (b.position || 0));
                    
                    const maxPosition = chartItems.length > 0 ? Math.max(...chartItems.map(item => item.position || 0)) : -1;
                    const totalSlots = Math.max(30, maxPosition + 1); // At least 30 slots (5 rows)
                    
                    const elements = [];
                    
                    for (let pos = 0; pos < totalSlots; pos++) {
                      const chartAtPosition = chartItems.find(item => (item.position || 0) === pos);
                      
                      if (chartAtPosition) {
                        elements.push(renderChart(chartAtPosition));
                      } else if (draggedItem || draggedDashboardItemId) {
                        // Show drop zones when dragging
                        elements.push(renderDropZone(pos));
                      }
                    }
                    
                    return elements;
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Modal */}
      <ConfigurationModal
        key={editingItem?.id || 'new-chart'}
        isOpen={configModalOpen}
        onClose={closeConfigModal}
        onSave={handleConfigSave}
        componentType={'chart'}
        initialConfig={editingItem?.config}
        chartType={editingItem?.componentId}
      />
    </div>
  );
}