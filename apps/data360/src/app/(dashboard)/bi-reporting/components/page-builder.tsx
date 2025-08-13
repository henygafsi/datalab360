'use client';

import { useState, useEffect, DragEvent } from 'react';
import { Button } from 'rizzui';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineArrowsPointingOut,
  HiOutlineSquares2X2,
  HiOutlineChartBarSquare,
  HiOutlineSparkles,
} from 'react-icons/hi2';
import StatCard, { STAT_CARD_OPTIONS } from './stat-cards';
import ChartCard, { CHART_OPTIONS } from './chart-components';
import ConfigurationModal, { ComponentConfig } from './configuration-modal';

interface DashboardItem {
  id: string;
  type: 'stat' | 'chart';
  componentId: string;
  position: number;
  config?: ComponentConfig;
}

interface PageBuilderProps {
  onLayoutChange?: (items: DashboardItem[]) => void;
  initialItems?: DashboardItem[];
}

export default function PageBuilder({ onLayoutChange, initialItems = [] }: PageBuilderProps) {
  const [dashboardItems, setDashboardItems] = useState<DashboardItem[]>(initialItems);
  const [draggedItem, setDraggedItem] = useState<{ type: 'stat' | 'chart', id: string } | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DashboardItem | null>(null);

  useEffect(() => {
    setDashboardItems(initialItems);
  }, [initialItems]);

  const handleDragStart = (e: DragEvent, type: 'stat' | 'chart', id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: DragEvent, zone: 'stats' | 'charts') => {
    e.preventDefault();
    if (!draggedItem) return;

    const maxItems = zone === 'stats' ? 4 : 5;
    const currentItems = dashboardItems.filter(item => 
      zone === 'stats' ? item.type === 'stat' : item.type === 'chart'
    );

    if (currentItems.length >= maxItems) {
      alert(`Maximum ${maxItems} ${zone} allowed`);
      return;
    }

    if (dashboardItems.some(item => item.componentId === draggedItem.id)) {
      alert('This component is already added to the dashboard');
      return;
    }

    const newItem: DashboardItem = {
      id: `${draggedItem.type}-${Date.now()}`,
      type: draggedItem.type,
      componentId: draggedItem.id,
      position: currentItems.length
    };

    const updatedItems = [...dashboardItems, newItem];
    setDashboardItems(updatedItems);
    onLayoutChange?.(updatedItems);
    setDraggedItem(null);
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

  const renderStatCard = (item: DashboardItem) => {
    const defaultConfig = STAT_CARD_OPTIONS.find(option => option.id === item.componentId);
    if (!defaultConfig) return null;
    
    const finalConfig = item.config ? {
      ...defaultConfig,
      title: item.config.title || defaultConfig.title,
      subtitle: item.config.subtitle || defaultConfig.subtitle,
      colorScheme: (item.config.colorScheme as any) || defaultConfig.colorScheme,
    } : defaultConfig;
    
    return (
      <div key={item.id} className="relative group">
        <StatCard {...finalConfig} />
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

  const renderChart = (item: DashboardItem) => {
    const defaultConfig = CHART_OPTIONS.find(option => option.id === item.componentId);
    if (!defaultConfig) return null;

    const finalConfig = item.config ? {
      ...defaultConfig,
      title: item.config.title || defaultConfig.title,
      description: item.config.description || defaultConfig.description,
    } : defaultConfig;

    return (
      <div key={item.id} className="relative group">
        <ChartCard
          id={finalConfig.id}
          title={finalConfig.title}
          description={finalConfig.description}
          badge={finalConfig.badge}
          badgeColor={finalConfig.badgeColor}
        >
          {finalConfig.component}
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
          {/* Stat Cards Library */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <HiOutlineSquares2X2 className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Stat Cards
              </h3>
              <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-full">
                Max 4
              </span>
            </div>
            <div className="space-y-3">
              {STAT_CARD_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'stat', option.id)}
                  className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl cursor-grab hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-blue-500">{option.icon}</div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {option.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {option.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                  className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl cursor-grab hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {option.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {option.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div className="lg:col-span-3 space-y-8">
          {/* Stats Section */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <HiOutlineSquares2X2 className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Statistics ({dashboardItems.filter(item => item.type === 'stat').length}/4)
              </h3>
            </div>
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'stats')}
              className={`min-h-[200px] border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-6 transition-colors ${
                draggedItem?.type === 'stat' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' : ''
              }`}
            >
              {dashboardItems.filter(item => item.type === 'stat').length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400 dark:text-slate-500">
                  <HiOutlinePlus className="w-12 h-12 mb-2" />
                  <p>Drop stat cards here (max 4)</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                  {dashboardItems
                    .filter(item => item.type === 'stat')
                    .map(renderStatCard)}
                </div>
              )}
            </div>
          </div>

          {/* Charts Section */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <HiOutlineChartBarSquare className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Charts ({dashboardItems.filter(item => item.type === 'chart').length}/5)
              </h3>
            </div>
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'charts')}
              className={`min-h-[400px] border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-6 transition-colors ${
                draggedItem?.type === 'chart' ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : ''
              }`}
            >
              {dashboardItems.filter(item => item.type === 'chart').length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
                  <HiOutlineArrowsPointingOut className="w-12 h-12 mb-2" />
                  <p>Drop charts here (max 5)</p>
                </div>
              ) : (
                <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-3">
                  {dashboardItems
                    .filter(item => item.type === 'chart')
                    .map(renderChart)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Modal */}
      <ConfigurationModal
        isOpen={configModalOpen}
        onClose={closeConfigModal}
        onSave={handleConfigSave}
        componentType={editingItem?.type || 'stat'}
        initialConfig={editingItem?.config}
      />
    </div>
  );
}