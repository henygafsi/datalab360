'use client';

import { Badge, Button, Select, Modal, Text } from 'rizzui';
import { useClientDashboard, useStageStorageInfo, useClientDashboardAll } from '@/hooks/use-gouvernance';
import { PiDatabase, PiUsers, PiChartLine, PiCheckCircle, PiWarning, PiClock, PiEye } from 'react-icons/pi';
import { HiOutlineRefresh } from 'react-icons/hi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useMemo, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import KPICard from '@/components/analytics/KPICard';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

export default function GouvernanceDashboard() {
  const { data: session } = useSession();
  const currentUsername = session?.user?.username || '';

  const { data: dashboardData, loading: dashboardLoading, refetch: refetchDashboard } = useClientDashboard();
  const { data: stagesData, loading: stagesLoading } = useStageStorageInfo();

  // Default to last 30 days to avoid loading too much data
  const defaultStartDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString();
  }, []);

  const defaultEndDate = useMemo(() => {
    return new Date().toISOString();
  }, []);

  // Activity filters state - default to current user
  const [userFilter, setUserFilter] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
  const [queryStatusFilter, setQueryStatusFilter] = useState<string>('');

  // Set current user as default filter when session loads
  useEffect(() => {
    if (currentUsername && !userFilter) {
      setUserFilter(currentUsername);
    }
  }, [currentUsername]);

  // Build complete filters object for API call
  const apiFilters = useMemo(() => {
    const filters: any = {
      start_date: defaultStartDate,
      end_date: defaultEndDate,
    };

    if (userFilter) filters.username = userFilter;
    if (moduleFilter) filters.module_name = moduleFilter;
    if (eventTypeFilter) filters.event_type = eventTypeFilter;
    if (queryStatusFilter) filters.query_status = queryStatusFilter;

    return filters;
  }, [defaultStartDate, defaultEndDate, userFilter, moduleFilter, eventTypeFilter, queryStatusFilter]);

  const { data: activityData, loading: activityLoading, error: activityError } = useClientDashboardAll(apiFilters);

  // Modal state for query text
  const [selectedQuery, setSelectedQuery] = useState<{ text: string; id: string } | null>(null);
  const [isQueryModalOpen, setIsQueryModalOpen] = useState(false);

  // Quick filter presets
  const applyQuickFilter = (preset: string) => {
    switch (preset) {
      case 'workflow':
        setModuleFilter('WORKFLOW');
        setQueryStatusFilter('');
        break;
      case 'auth':
        setModuleFilter('AUTH');
        setQueryStatusFilter('');
        break;
      case 'query-failed':
        setModuleFilter('');
        setQueryStatusFilter('FAILED');
        break;
      case 'query-success':
        setModuleFilter('');
        setQueryStatusFilter('SUCCESS');
        break;
      default:
        break;
    }
  };

  // Transform events_by_module for pie chart
  const moduleData = useMemo(() => {
    if (!dashboardData?.events_by_module) return [];
    return Object.entries(dashboardData.events_by_module).map(([name, value]) => ({
      name,
      value,
    }));
  }, [dashboardData]);

  // Transform storage data for bar chart
  const storageData = useMemo(() => {
    if (!stagesData || !Array.isArray(stagesData)) return [];

    // Filter out stages with errors and show accessible ones
    return stagesData
      .filter(stage => stage.total_mb !== null && !stage.error)
      .slice(0, 10) // Top 10
      .map(stage => ({
        name: stage.stage_name,
        storage_mb: stage.total_mb,
      }));
  }, [stagesData]);

  // Count inaccessible stages
  const inaccessibleStages = useMemo(() => {
    if (!stagesData || !Array.isArray(stagesData)) return 0;
    return stagesData.filter(stage => stage.error || stage.total_mb === null).length;
  }, [stagesData]);

  // Group activities by date for timeline
  const activityTimeline = useMemo(() => {
    if (!activityData || !Array.isArray(activityData)) return [];

    const grouped = activityData.reduce((acc, activity) => {
      const date = new Date(activity.EVENT_DATE).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = { date, count: 0 };
      }
      acc[date].count++;
      return acc;
    }, {} as Record<string, { date: string; count: number }>);

    return Object.values(grouped).slice(0, 7); // Last 7 days
  }, [activityData]);

  const isLoading = dashboardLoading || stagesLoading || activityLoading;

  // Extract unique values for filter dropdowns
  const uniqueUsers = useMemo(() => {
    if (!activityData || !Array.isArray(activityData)) return [];
    const users = Array.from(new Set(activityData.map(a => a.USERNAME)));
    return users.filter(Boolean).sort();
  }, [activityData]);

  // Common module names with dynamic values
  const uniqueModules = useMemo(() => {
    if (!activityData || !Array.isArray(activityData)) return [];
    const modules = Array.from(new Set(activityData.map(a => a.MODULE_NAME)));
    const filteredModules = modules.filter(Boolean);

    // Ensure common modules are included even if not in data
    const commonModules = ['WORKFLOW', 'AUTH', 'MAPPING', 'INGESTION'];
    const allModules = Array.from(new Set([...commonModules, ...filteredModules]));

    return allModules.sort();
  }, [activityData]);

  // Common event types
  const uniqueEventTypes = useMemo(() => {
    if (!activityData || !Array.isArray(activityData)) return [];
    const eventTypes = Array.from(new Set(activityData.map(a => a.EVENT_TYPE)));
    const filteredEventTypes = eventTypes.filter(Boolean);

    // Ensure common event types are included
    const commonEventTypes = ['LOGIN_AUTH', 'EXECUTE_WORKFLOW', 'EXECUTE_MAPPING', 'DATA_INGESTION'];
    const allEventTypes = Array.from(new Set([...commonEventTypes, ...filteredEventTypes]));

    return allEventTypes.sort();
  }, [activityData]);


  // Query statuses
  const uniqueQueryStatuses = useMemo(() => {
    if (!activityData || !Array.isArray(activityData)) return [];
    const queryStatuses = Array.from(new Set(activityData.map(a => a.QUERY_STATUS).filter(Boolean)));

    // Ensure common query statuses are included
    const commonQueryStatuses = ['SUCCESS', 'FAILED', 'RUNNING'];
    const allQueryStatuses = Array.from(new Set([...commonQueryStatuses, ...queryStatuses]));

    return allQueryStatuses.sort();
  }, [activityData]);

  // No client-side filtering needed - API handles all filtering
  const filteredActivityData = activityData || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Account Overview
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monitor your platform activity, storage, and performance metrics
          </p>
        </div>
        <Button
          onClick={() => {
            refetchDashboard();
          }}
          variant="outline"
          className="gap-2"
        >
          <HiOutlineRefresh className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <KPICard
          title="Total Events"
          value={dashboardData?.total_events || 0}
          subtitle="All platform activities"
          icon={<PiChartLine className="w-6 h-6" />}
          color="blue"
          loading={dashboardLoading}
        />

        <KPICard
          title="Success Rate"
          value={`${dashboardData?.success_rate || 0}%`}
          subtitle="Event completion rate"
          change={{
            value: dashboardData?.success_rate ? dashboardData.success_rate - 90 : 0,
            trend: (dashboardData?.success_rate || 0) > 90 ? 'up' : 'down',
            label: 'vs target',
          }}
          icon={<PiCheckCircle className="w-6 h-6" />}
          color="green"
          loading={dashboardLoading}
        />

        <KPICard
          title="Failed Events"
          value={dashboardData?.failed_events || 0}
          subtitle="Requires attention"
          icon={<PiWarning className="w-6 h-6" />}
          color="red"
          loading={dashboardLoading}
        />

        <KPICard
          title="Last Login"
          value={dashboardData?.last_login ? new Date(dashboardData.last_login).toLocaleTimeString() : 'N/A'}
          subtitle={dashboardData?.last_login ? new Date(dashboardData.last_login).toLocaleDateString() : ''}
          icon={<PiUsers className="w-6 h-6" />}
          color="purple"
          loading={dashboardLoading}
        />

        <KPICard
          title="Last Ingestion"
          value={dashboardData?.last_ingestion ? new Date(dashboardData.last_ingestion).toLocaleTimeString() : 'N/A'}
          subtitle={dashboardData?.last_ingestion ? new Date(dashboardData.last_ingestion).toLocaleDateString() : ''}
          icon={<PiDatabase className="w-6 h-6" />}
          color="indigo"
          loading={dashboardLoading}
        />

        <KPICard
          title="Last Mapping"
          value={dashboardData?.last_mapping ? new Date(dashboardData.last_mapping).toLocaleTimeString() : 'N/A'}
          subtitle={dashboardData?.last_mapping ? new Date(dashboardData.last_mapping).toLocaleDateString() : ''}
          icon={<PiClock className="w-6 h-6" />}
          color="amber"
          loading={dashboardLoading}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events by Module - Pie Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Events by Module
            </h3>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {moduleData.reduce((sum, item) => sum + item.value, 0)} Total
            </Badge>
          </div>
          <div className="h-80">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
              </div>
            ) : moduleData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={moduleData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {moduleData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Stage Storage - Bar Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Top Stage Storage
            </h3>
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {storageData.length} Accessible
              </Badge>
              {inaccessibleStages > 0 && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  {inaccessibleStages} Inaccessible
                </Badge>
              )}
            </div>
          </div>
          <div className="h-80">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
              </div>
            ) : storageData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis label={{ value: 'Storage (MB)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Bar dataKey="storage_mb" fill="#10B981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            Activity Timeline (Last 7 Days)
          </h3>
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
            {activityData?.length || 0} Events
          </Badge>
        </div>
        <div className="h-80">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
            </div>
          ) : activityTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityTimeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis label={{ value: 'Events', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#8B5CF6"
                  strokeWidth={3}
                  dot={{ fill: '#8B5CF6', r: 6 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">
              No activity data available
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Recent Activities
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {filteredActivityData.length} {filteredActivityData.length === 1 ? 'activity' : 'activities'} found
            </p>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 self-center">
            Quick Filters:
          </span>
          <Button
            size="sm"
            variant={moduleFilter === 'WORKFLOW' ? 'solid' : 'outline'}
            onClick={() => applyQuickFilter('workflow')}
          >
            Workflow
          </Button>
          <Button
            size="sm"
            variant={moduleFilter === 'AUTH' ? 'solid' : 'outline'}
            onClick={() => applyQuickFilter('auth')}
          >
            Auth
          </Button>
          <Button
            size="sm"
            variant={queryStatusFilter === 'SUCCESS' ? 'solid' : 'outline'}
            onClick={() => applyQuickFilter('query-success')}
            className={queryStatusFilter === 'SUCCESS' ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            Success
          </Button>
          <Button
            size="sm"
            variant={queryStatusFilter === 'FAILED' ? 'solid' : 'outline'}
            onClick={() => applyQuickFilter('query-failed')}
            className={queryStatusFilter === 'FAILED' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            Failed
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
              User
            </label>
            <Select
              value={userFilter}
              onChange={setUserFilter}
              options={[
                { value: '', label: 'All' },
                ...uniqueUsers.map(user => ({ value: user, label: user }))
              ]}
              placeholder="All"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
              Module
            </label>
            <Select
              value={moduleFilter}
              onChange={setModuleFilter}
              options={[
                { value: '', label: 'All' },
                ...uniqueModules.map(module => ({ value: module, label: module }))
              ]}
              placeholder="All"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
              Event Type
            </label>
            <Select
              value={eventTypeFilter}
              onChange={setEventTypeFilter}
              options={[
                { value: '', label: 'All' },
                ...uniqueEventTypes.map(type => ({ value: type, label: type }))
              ]}
              placeholder="All"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
              Query Status
            </label>
            <Select
              value={queryStatusFilter}
              onChange={setQueryStatusFilter}
              options={[
                { value: '', label: 'All' },
                ...uniqueQueryStatuses.map(status => ({ value: status, label: status }))
              ]}
              placeholder="All"
            />
          </div>

          <div className="flex items-end">
            <Button
              onClick={() => {
                setUserFilter('');
                setModuleFilter('');
                setEventTypeFilter('');
                setQueryStatusFilter('');
              }}
              variant="outline"
              size="sm"
              className="w-full"
            >
              Clear
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Module
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Event Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Event Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Query ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Query Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Execution Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {activityLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                      <Text className="text-sm text-slate-500">Loading activity data...</Text>
                    </div>
                  </td>
                </tr>
              ) : activityError ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 max-w-2xl">
                        <h4 className="text-red-800 dark:text-red-400 font-semibold mb-2 flex items-center gap-2">
                          <PiWarning className="w-5 h-5" />
                          API Error - Backend Issue
                        </h4>
                        <p className="text-red-700 dark:text-red-300 text-sm mb-3">
                          {activityError.message || 'Failed to load activity data'}
                        </p>
                        <div className="bg-white dark:bg-slate-900 p-3 rounded border border-red-200 dark:border-red-800">
                          <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mb-2">
                            <strong>Backend Python Fix Required:</strong>
                          </p>
                          <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
{`# Fix the .upper() error in the backend:
if username:
    query += " AND UPPER(e.USERNAME) = UPPER(%s)"
    params.append(username)  # Don't use .upper() here

# Apply same fix for module_name, event_type, query_status`}
                          </pre>
                        </div>
                        <Button
                          onClick={() => window.location.reload()}
                          className="mt-3 bg-red-600 hover:bg-red-700 text-white"
                          size="sm"
                        >
                          Retry
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredActivityData && filteredActivityData.length > 0 ? (
                filteredActivityData.slice(0, 20).map((activity, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                      {activity.USERNAME}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {activity.MODULE_NAME}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {activity.EVENT_TYPE}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge
                        className={
                          activity.EVENT_STATUS === 'SUCCESS'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }
                      >
                        {activity.EVENT_STATUS}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(activity.EVENT_DATE).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">
                      {activity.QUERY_ID ? (
                        <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          {activity.QUERY_ID.substring(0, 12)}...
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {activity.QUERY_STATUS ? (
                        <Badge
                          className={
                            activity.QUERY_STATUS === 'SUCCESS'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : activity.QUERY_STATUS === 'FAILED' || activity.QUERY_STATUS === 'FAIL'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                          }
                        >
                          {activity.QUERY_STATUS}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {activity.EXECUTION_TIME_SEC !== null && activity.EXECUTION_TIME_SEC !== undefined ? (
                        <span className="font-mono">
                          {activity.EXECUTION_TIME_SEC.toFixed(2)}s
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {activity.QUERY_TEXT ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedQuery({
                              text: activity.QUERY_TEXT || '',
                              id: activity.QUERY_ID || 'N/A'
                            });
                            setIsQueryModalOpen(true);
                          }}
                          className="flex items-center gap-1"
                        >
                          <PiEye className="w-4 h-4" />
                          View SQL
                        </Button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No recent activities
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Query Text Modal */}
      <Modal
        isOpen={isQueryModalOpen}
        onClose={() => {
          setIsQueryModalOpen(false);
          setSelectedQuery(null);
        }}
        size="xl"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Query Details
            </h3>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 font-mono text-xs">
              {selectedQuery?.id}
            </Badge>
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 block">
              SQL Query Text
            </label>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <pre className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono overflow-x-auto">
                {selectedQuery?.text || 'No query text available'}
              </pre>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (selectedQuery?.text) {
                  navigator.clipboard.writeText(selectedQuery.text);
                }
              }}
            >
              Copy to Clipboard
            </Button>
            <Button
              onClick={() => {
                setIsQueryModalOpen(false);
                setSelectedQuery(null);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
