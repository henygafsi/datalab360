'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Badge } from 'rizzui';
import {
  HiOutlinePresentationChartBar,
  HiOutlineSparkles,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineCalendarDays,
  HiOutlineEye,
  HiOutlineCog6Tooth,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineDocumentDuplicate,
  HiOutlineArrowDownTray,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';
import PageBuilder from './components/page-builder';
import { SaveAllIcon } from 'lucide-react';
import ChartCard, { CHART_OPTIONS, DynamicChart } from './components/chart-components';
import { ComponentConfig } from './components/configuration-modal';
import ChatWidget from './components/chat-widget';
import {
  createDashboard,
  updateDashboard,
  getDashboards,
  deleteDashboard,
  duplicateDashboard,
  exportDashboard,
  setCurrentUser,
  type Dashboard,
} from '@/app/services/bi-reporting/dashboards-local';

interface DashboardItem {
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
      {count !== undefined && count > 0 && (
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
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('builder');
  const [savedLayouts, setSavedLayouts] = useState<DashboardItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [currentDashboardId, setCurrentDashboardId] = useState<string | null>(null);
  const [dashboardName, setDashboardName] = useState('My Dashboard');
  const [dashboardDescription, setDashboardDescription] = useState('');
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [showDashboardList, setShowDashboardList] = useState(false);

  // Set current user and load dashboards on mount
  useEffect(() => {
    if (session?.user?.username) {
      setCurrentUser(session.user.username as string);
    }
    loadDashboards();
  }, [session]);

  const loadDashboards = async () => {
    try {
      const data = await getDashboards();
      setDashboards(data);

      // Load the first dashboard if available
      if (data.length > 0 && !currentDashboardId) {
        const firstDashboard = data[0];
        setCurrentDashboardId(firstDashboard.id);
        setDashboardName(firstDashboard.name);
        setDashboardDescription(firstDashboard.description || '');
        setSavedLayouts(firstDashboard.items);
        toast.success(`📊 Loaded: ${firstDashboard.name}`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load dashboards');
    }
  };

  const handleLayoutChange = (items: DashboardItem[]) => {
    setSavedLayouts(items);
  };

  const saveLayout = async () => {
    if (savedLayouts.length === 0) {
      toast.error('Please add at least one chart to save the dashboard');
      return;
    }

    setIsSaving(true);
    try {
      const dashboardData = {
        name: dashboardName,
        description: dashboardDescription,
        items: savedLayouts,
        isPublic: false,
      };

      if (currentDashboardId) {
        // Update existing dashboard
        await updateDashboard(currentDashboardId, dashboardData);
        toast.success('✅ Dashboard updated successfully!');
      } else {
        // Create new dashboard
        const created = await createDashboard(dashboardData);
        setCurrentDashboardId(created.id);
        toast.success('🎉 Dashboard saved successfully!');
      }

      // Reload dashboards list
      await loadDashboards();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save dashboard');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewDashboard = () => {
    setCurrentDashboardId(null);
    setDashboardName('My Dashboard');
    setDashboardDescription('');
    setSavedLayouts([]);
    setActiveTab('builder');
    toast.success('📝 New dashboard created! Start adding charts.');
  };

  const handleLoadDashboard = async (id: string) => {
    try {
      const dashboards = await getDashboards();
      const dashboard = dashboards.find((d) => d.id === id);

      if (dashboard) {
        setCurrentDashboardId(dashboard.id);
        setDashboardName(dashboard.name);
        setDashboardDescription(dashboard.description || '');
        setSavedLayouts(dashboard.items);
        setShowDashboardList(false);
        setActiveTab('builder');
        toast.success(`📊 Loaded: ${dashboard.name}`);
      }
    } catch (error: any) {
      toast.error('Failed to load dashboard');
    }
  };

  const handleDeleteDashboard = async (id: string) => {
    const dashboard = dashboards.find((d) => d.id === id);
    if (!confirm(`Are you sure you want to delete "${dashboard?.name}"?`)) return;

    try {
      await deleteDashboard(id);
      toast.success('🗑️ Dashboard deleted successfully');

      // If we deleted the current dashboard, create new
      if (currentDashboardId === id) {
        handleNewDashboard();
      }

      // Reload dashboards list
      await loadDashboards();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete dashboard');
    }
  };

  const handleDuplicateDashboard = async (id: string) => {
    try {
      const duplicate = await duplicateDashboard(id);
      toast.success(`📋 Duplicated: ${duplicate.name}`);
      await loadDashboards();
    } catch (error: any) {
      toast.error(error.message || 'Failed to duplicate dashboard');
    }
  };

  const handleExportDashboard = async (id: string) => {
    try {
      const jsonData = await exportDashboard(id);
      const dashboard = dashboards.find((d) => d.id === id);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dashboard?.name || 'dashboard'}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('📥 Dashboard exported successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to export dashboard');
    }
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
                {dashboardName}
              </h1>
              <p className="text-xl text-slate-600 dark:text-slate-400 mt-2 max-w-2xl leading-relaxed">
                Build custom dashboards with drag-and-drop components
              </p>

              <div className="flex items-center space-x-6 mt-4">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-slate-600 dark:text-slate-400">LocalStorage Caching</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <HiOutlineCalendarDays className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600 dark:text-slate-400">{dashboards.length} Saved Dashboards</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <Button
            onClick={handleNewDashboard}
            className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-600/60 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-3 rounded-2xl"
          >
            <HiOutlinePlus className="w-5 h-5 mr-2" />
            New
          </Button>
          <Button
            onClick={() => setShowDashboardList(!showDashboardList)}
            className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-600/60 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-3 rounded-2xl"
          >
            <HiOutlineEye className="w-5 h-5 mr-2" />
            My Dashboards ({dashboards.length})
          </Button>
          <Button
            onClick={saveLayout}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
            disabled={savedLayouts.length === 0 || isSaving}
            isLoading={isSaving}
          >
            {!isSaving && <SaveAllIcon className="w-5 h-5 mr-2" />}
            {isSaving ? 'Saving...' : currentDashboardId ? 'Update' : 'Save'}
          </Button>
          <Badge className="bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 dark:from-blue-900/30 dark:to-purple-900/30 dark:text-blue-400 px-4 py-2 text-sm font-semibold border border-blue-200/60 dark:border-blue-800/60">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
            {savedLayouts.length} Charts
          </Badge>
        </div>
      </div>

      {/* Dashboard List */}
      {showDashboardList && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-8">
          <h2 className="text-2xl font-bold mb-6">Your Dashboards</h2>
          <div className="grid grid-cols-3 gap-6">
            {dashboards.map((dashboard) => (
              <div
                key={dashboard.id}
                className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
              >
                <h3 className="text-lg font-semibold mb-2">{dashboard.name}</h3>
                <p className="text-sm text-slate-500 mb-4">{dashboard.items.length} charts</p>
                <div className="flex space-x-2">
                  <Button size="sm" onClick={() => handleLoadDashboard(dashboard.id)}>
                    Load
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDuplicateDashboard(dashboard.id)}>
                    <HiOutlineDocumentDuplicate className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleExportDashboard(dashboard.id)}>
                    <HiOutlineArrowDownTray className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 hover:bg-red-50"
                    onClick={() => handleDeleteDashboard(dashboard.id)}
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Tab Navigation */}
      <div className="flex justify-center">
        <div className="bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm p-2 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg">
          <div className="flex space-x-2">
            <TabButton
              active={activeTab === 'builder'}
              onClick={() => setActiveTab('builder')}
              icon={<HiOutlineCog6Tooth className="w-5 h-5" />}
              label="Dashboard Builder"
              count={savedLayouts.filter(i => i.type === 'chart').length}
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
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {dashboardName}
                  </h2>
                  {dashboardDescription && (
                    <p className="text-sm text-slate-500 mt-1">{dashboardDescription}</p>
                  )}
                </div>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {savedLayouts.length} Components
                </Badge>
              </div>

              <div className="space-y-8">
                {savedLayouts.filter(item => item.type === 'chart').length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                      Analytics Charts
                    </h3>
                    <div className="grid grid-cols-6 gap-6 auto-rows-[10rem] min-w-[1024px]">
                      {(() => {
                        const chartItems = savedLayouts
                        .filter(item => item.type === 'chart')
                          .sort((a, b) => (a.position || 0) - (b.position || 0));

                        const maxPosition = chartItems.length > 0 ? Math.max(...chartItems.map(item => item.position || 0)) : -1;
                        const totalSlots = Math.max(30, maxPosition + 1);

                        const elements = [];

                        for (let pos = 0; pos < totalSlots; pos++) {
                          const chartAtPosition = chartItems.find(item => (item.position || 0) === pos);

                          if (chartAtPosition) {
                            const defaultConfig = CHART_OPTIONS.find(option => option.id === chartAtPosition.componentId);
                            if (!defaultConfig) continue;

                            const finalConfig = chartAtPosition.config ? {
                            ...defaultConfig,
                              title: chartAtPosition.config.title || defaultConfig.title,
                          } : defaultConfig;

                            const row = Math.floor(pos / 6);
                            const col = pos % 6;
                            const w = chartAtPosition.w || 1;
                            const heightUnits = chartAtPosition.hUnits || chartAtPosition.h || 1;
                            const heightRows = Math.max(1, Math.round(heightUnits * 2));

                            elements.push(
                              <div
                                key={chartAtPosition.id}
                                style={{
                                  gridColumn: `${col + 1} / span ${w}`,
                                  gridRow: `${row + 1} / span ${heightRows}`,
                                }}
                              >
                            <ChartCard
                                  id={String((finalConfig as any).id || chartAtPosition.id)}
                                  title={String((finalConfig as any).title || 'Chart')}
                                  description=""
                                  badge={String((finalConfig as any).badge || 'Dynamic')}
                                  badgeColor={String((finalConfig as any).badgeColor || 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400')}
                                  heightRem={heightUnits * 10}
                                >
                                  <DynamicChart config={{ ...chartAtPosition.config, componentId: chartAtPosition.componentId }} enabled={activeTab === 'preview'} fontScale={chartAtPosition.fontScale || 1} />
                            </ChartCard>
                              </div>
                            );
                          }
                        }

                        return elements;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  );
}
