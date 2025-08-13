'use client';

import { useState } from 'react';
import { Button, Badge } from 'rizzui';
import {
  HiOutlinePresentationChartBar,
  HiOutlineSparkles,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineCalendarDays,
  HiOutlineEye,
  HiOutlineCog6Tooth,
} from 'react-icons/hi2';
import PageBuilder from './components/page-builder';
import { SaveAllIcon } from 'lucide-react';
import StatCard, { STAT_CARD_OPTIONS } from './components/stat-cards';
import ChartCard, { CHART_OPTIONS } from './components/chart-components';
import { ComponentConfig } from './components/configuration-modal';

interface DashboardItem {
  id: string;
  type: 'stat' | 'chart';
  componentId: string;
  position: number;
  config?: ComponentConfig;
}

function Breadcrumb() {
  return (
    <nav className="mb-10">
      <div className="flex items-center space-x-3 text-sm">
        <span className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer transition-colors font-medium">Home</span>
        <div className="w-1 h-1 bg-slate-400 rounded-full" />
        <span className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer transition-colors font-medium">Analytics</span>
        <div className="w-1 h-1 bg-slate-400 rounded-full" />
        <span className="text-slate-900 dark:text-slate-200 font-semibold">BI Reporting</span>
      </div>
    </nav>
  );
}

function TabButton({ 
  active, 
  onClick, 
  icon, 
  label, 
  count 
}: { 
  active: boolean, 
  onClick: () => void, 
  icon: React.ReactNode, 
  label: string,
  count?: number 
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-8 py-4 rounded-2xl font-semibold transition-all duration-300 flex items-center space-x-3 ${
        active
          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-lg shadow-blue-500/20 border border-blue-200/60 dark:border-blue-800/60'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className={`${active ? 'text-blue-600 dark:text-blue-400' : ''} transition-colors duration-300`}>
        {icon}
      </div>
      <span>{label}</span>
      {count && (
        <Badge className={`${active ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'} text-xs font-bold min-w-[20px] h-5 flex items-center justify-center`}>
          {count}
        </Badge>
      )}
      
      {active && (
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-pink-500/10 rounded-2xl" />
      )}
    </button>
  );
}

export default function BIReportingPage() {
  const [activeTab, setActiveTab] = useState('builder');
  const [savedLayouts, setSavedLayouts] = useState<DashboardItem[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const handleLayoutChange = (items: DashboardItem[]) => {
    setSavedLayouts(items);
  };

  const saveLayout = () => {
    console.log('Layout saved:', savedLayouts);
    alert('Dashboard layout saved successfully!');
  };

  return (
    <div className="space-y-10">
      <Breadcrumb />
      
      {/* Enhanced Header Section */}
      <div className="flex items-start justify-between">
        <div className="space-y-6">
          <div className="flex items-center space-x-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-blue-500/25">
                <HiOutlinePresentationChartBar className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
                <HiOutlineSparkles className="w-3 h-3 text-white" />
              </div>
            </div>
            
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-blue-600 dark:from-white dark:via-slate-200 dark:to-blue-400 bg-clip-text text-transparent leading-tight">
                Power BI Dashboard
              </h1>
              <p className="text-xl text-slate-600 dark:text-slate-400 mt-2 max-w-2xl leading-relaxed">
                Build custom dashboards with drag-and-drop components
              </p>
              
              <div className="flex items-center space-x-6 mt-4">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-slate-600 dark:text-slate-400">Interactive Builder</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <HiOutlineCalendarDays className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600 dark:text-slate-400">Real-time Preview</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Button 
            onClick={() => setShowFilters(!showFilters)}
            className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-600/60 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-3 rounded-2xl"
          >
            <HiOutlineAdjustmentsHorizontal className="w-5 h-5 mr-2" />
            Settings
          </Button>
          <Button
            onClick={saveLayout}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
            disabled={savedLayouts.length === 0}
          >
            <SaveAllIcon className="w-5 h-5 mr-2" />
            Save Dashboard
          </Button>
          <Badge className="bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 dark:from-blue-900/30 dark:to-purple-900/30 dark:text-blue-400 px-4 py-2 text-sm font-semibold border border-blue-200/60 dark:border-blue-800/60">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
            Builder Mode
          </Badge>
        </div>
      </div>

      {/* Enhanced Tab Navigation */}
      <div className="flex justify-center">
        <div className="bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm p-2 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg">
          <div className="flex space-x-2">
            <TabButton
              active={activeTab === 'builder'}
              onClick={() => setActiveTab('builder')}
              icon={<HiOutlineCog6Tooth className="w-5 h-5" />}
              label="Dashboard Builder"
              count={savedLayouts.length}
            />
            <TabButton
              active={activeTab === 'preview'}
              onClick={() => setActiveTab('preview')}
              icon={<HiOutlineEye className="w-5 h-5" />}
              label="Preview Mode"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'builder' && (
        <PageBuilder onLayoutChange={handleLayoutChange} initialItems={savedLayouts} />
      )}

      {activeTab === 'preview' && (
        <div className="space-y-8">
          {savedLayouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
              <HiOutlineEye className="w-16 h-16 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Dashboard Created Yet</h3>
              <p>Switch to Builder mode to create your dashboard</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Dashboard Preview
                </h2>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {savedLayouts.length} Components
                </Badge>
              </div>
              
              <div className="space-y-8">
                {savedLayouts.filter(item => item.type === 'stat').length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                      Key Metrics
                    </h3>
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                      {savedLayouts
                        .filter(item => item.type === 'stat')
                        .map((item) => {
                          const defaultConfig = STAT_CARD_OPTIONS.find(option => option.id === item.componentId);
                          if (!defaultConfig) return null;
                          
                          const finalConfig = item.config ? {
                            ...defaultConfig,
                            title: item.config.title || defaultConfig.title,
                            subtitle: item.config.subtitle || defaultConfig.subtitle,
                            colorScheme: (item.config.colorScheme as any) || defaultConfig.colorScheme,
                          } : defaultConfig;
                          
                          return (
                            <StatCard key={item.id} {...finalConfig} />
                          );
                        })}
                    </div>
                  </div>
                )}
                
                {savedLayouts.filter(item => item.type === 'chart').length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                      Analytics Charts
                    </h3>
                    <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-3">
                      {savedLayouts
                        .filter(item => item.type === 'chart')
                        .map((item) => {
                          const defaultConfig = CHART_OPTIONS.find(option => option.id === item.componentId);
                          if (!defaultConfig) return null;
                          
                          const finalConfig = item.config ? {
                            ...defaultConfig,
                            title: item.config.title || defaultConfig.title,
                            description: item.config.description || defaultConfig.description,
                          } : defaultConfig;
                          
                          return (
                            <ChartCard
                              key={item.id}
                              id={finalConfig.id}
                              title={finalConfig.title}
                              description={finalConfig.description}
                              badge={finalConfig.badge}
                              badgeColor={finalConfig.badgeColor}
                            >
                              {finalConfig.component}
                            </ChartCard>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}