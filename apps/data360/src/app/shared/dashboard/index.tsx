'use client';

import { Badge, Button, Select, Modal, Text } from 'rizzui';
import { useClientDashboard, useStageStorageInfo, useClientDashboardAll } from '@/hooks/use-gouvernance';
import { PiDatabase, PiUsers, PiChartLine, PiCheckCircle, PiWarning, PiClock, PiEye, PiPlayCircle, PiCalendarCheck, PiRocketLaunch, PiClockCountdown, PiPackage } from 'react-icons/pi';
import { HiOutlineRefresh } from 'react-icons/hi';
import { RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useSession } from 'next-auth/react';
import KPICard from '@/components/analytics/KPICard';
import axios from 'axios';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443';

interface ScheduledWorkflow {
  workflow_name: string;
  scheduled_date?: string;
  deployment_method?: string;
  project_id?: string;
  created_by: string;
  created_at?: string;
  status?: string; // PENDING_APPROVAL, APPROVED, ACTIVE, REJECTED
  cron_schedule?: string; // For backward compatibility with regular workflows
  schedule_interval_str?: string;
}

export default function GouvernanceDashboard() {
  const { data: session } = useSession();
  const currentUsername = session?.user?.username || '';

  const { data: dashboardData, loading: dashboardLoading, refetch: refetchDashboard } = useClientDashboard();
  const { data: stagesData, loading: stagesLoading, refetch: refetchStages } = useStageStorageInfo();

  // SSE cache invalidation
  const { wasInvalidated } = useCacheInvalidationWatcher([
    CACHE_KEYS.DASHBOARD,
    CACHE_KEYS.ACTIVITY,
    CACHE_KEYS.DWH_STORAGE,
  ]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(true);

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

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !dashboardLoading && !stagesLoading) {
      console.log('[SSE] Dashboard cache invalidated - refreshing data...');
      setIsRefreshing(true);
      Promise.all([
        refetchDashboard?.(),
        refetchStages?.(),
      ]).finally(() => {
        if (mountedRef.current) {
          setIsRefreshing(false);
        }
      });
    }
  }, [wasInvalidated, dashboardLoading, stagesLoading, refetchDashboard, refetchStages]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch scheduled workflows and mapping deployments on component mount
  useEffect(() => {
    const fetchScheduledItems = async () => {
      if (!session?.user?.access_token) return;

      setScheduledWorkflowsLoading(true);
      try {
        // Fetch both workflows and mapping deployments in parallel with timeout
        const [workflowsResponse, deploymentsResponse] = await Promise.all([
          axios.get(
            `${API_BASE_URL}/workflow/get_workflows/`,
            {
              headers: {
                Authorization: `Bearer ${session.user.access_token}`,
                'Content-Type': 'application/json',
              },
              timeout: 5000, // 5 second timeout
            }
          ).catch((err: any) => {
            console.warn('Workflows endpoint not available:', err.message);
            return { data: { workflows: [] } };
          }),
          axios.get(
            `${API_BASE_URL}/mapping/get_scheduled_deployments/`,
            {
              headers: {
                Authorization: `Bearer ${session.user.access_token}`,
                'Content-Type': 'application/json',
              },
              timeout: 5000, // 5 second timeout
            }
          ).catch((err: any) => {
            console.warn('Mapping deployments endpoint not available:', err.message);
            return { data: { deployments: [] } };
          })
        ]);

        const allScheduled: ScheduledWorkflow[] = [];

        // Add regular workflows with schedules
        if (workflowsResponse.data?.workflows) {
          const scheduledWorkflows = workflowsResponse.data.workflows.filter(
            (wf: any) => wf.schedule_interval_str
          );
          allScheduled.push(...scheduledWorkflows);
        }

        // Add mapping deployments (remove duplicates by workflow_name)
        if (deploymentsResponse.data?.deployments) {
          allScheduled.push(...deploymentsResponse.data.deployments);
        }

        // Remove duplicates by workflow_name, keeping the most recent one
        const uniqueWorkflows = allScheduled.reduce((acc, workflow) => {
          const existing = acc.find(w => w.workflow_name === workflow.workflow_name);
          if (!existing) {
            acc.push(workflow);
          } else {
            // Keep the one with the most recent created_at or event_timestamp
            const existingTime = new Date(existing.created_at || existing.scheduled_date || 0).getTime();
            const currentTime = new Date(workflow.created_at || workflow.scheduled_date || 0).getTime();
            if (currentTime > existingTime) {
              const index = acc.indexOf(existing);
              acc[index] = workflow;
            }
          }
          return acc;
        }, [] as ScheduledWorkflow[]);

        setScheduledWorkflows(uniqueWorkflows);
      } catch (error: any) {
        console.error('Error fetching scheduled items:', error);
        // Silently fail - don't show error to user as this is a non-critical feature
      } finally {
        setScheduledWorkflowsLoading(false);
      }
    };

    fetchScheduledItems();
  }, [session]);

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

  // Scheduled workflows and mappings state
  const [scheduledWorkflows, setScheduledWorkflows] = useState<ScheduledWorkflow[]>([]);
  const [scheduledWorkflowsLoading, setScheduledWorkflowsLoading] = useState(true);
  const [approvingWorkflow, setApprovingWorkflow] = useState<string | null>(null);
  const [activatingWorkflow, setActivatingWorkflow] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mappings' | 'workflows'>('mappings');
  const [deploymentError, setDeploymentError] = useState<{ workflow: string; message: string } | null>(null);

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

  // Approve scheduled deployment (modeler action)
  const handleApproveDeployment = async (workflowName: string) => {
    if (!session?.user?.access_token) return;

    setApprovingWorkflow(workflowName);
    try {
      await axios.post(
        `${API_BASE_URL}/mapping/approve_deployment/`,
        { workflow_name: workflowName },
        {
          headers: {
            Authorization: `Bearer ${session.user.access_token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      // Update local state to mark as approved
      setScheduledWorkflows((prev) =>
        prev.map((wf) =>
          wf.workflow_name === workflowName ? { ...wf, status: 'APPROVED' } : wf
        )
      );

      alert(`Successfully approved deployment: ${workflowName}`);
    } catch (error: any) {
      console.error('Error approving deployment:', error);
      const errorMsg = error.code === 'ECONNABORTED'
        ? 'Request timed out. The backend endpoint may not be implemented yet.'
        : error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to approve: ${errorMsg}`);
    } finally {
      setApprovingWorkflow(null);
    }
  };

  // Activate approved deployment (final execution)
  const handleActivateDeployment = async (workflowName: string) => {
    if (!session?.user?.access_token) return;

    setActivatingWorkflow(workflowName);
    setDeploymentError(null); // Clear previous errors
    try {
      // Determine if it's a mapping deployment or workflow
      const isMappingDeployment = workflowName.startsWith('mapping_deployment_');
      const endpoint = isMappingDeployment
        ? `${API_BASE_URL}/mapping/activate_deployment/`
        : `${API_BASE_URL}/workflow/activate_workflow/`;

      await axios.post(
        endpoint,
        { workflow_name: workflowName },
        {
          headers: {
            Authorization: `Bearer ${session.user.access_token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout (deployment can take longer)
        }
      );

      // Update local state to mark as active
      setScheduledWorkflows((prev) =>
        prev.map((wf) =>
          wf.workflow_name === workflowName ? { ...wf, status: 'ACTIVE' } : wf
        )
      );

      alert(`Successfully activated ${isMappingDeployment ? 'mapping deployment' : 'workflow'}: ${workflowName}`);
    } catch (error: any) {
      console.error('Error activating deployment:', error);

      // Extract detailed error message
      let errorMsg = 'Unknown error';
      if (error.response?.status === 500) {
        errorMsg = 'Backend Error (500): ';
        if (error.response?.data?.detail) {
          errorMsg += typeof error.response.data.detail === 'string'
            ? error.response.data.detail
            : JSON.stringify(error.response.data.detail);
        } else {
          errorMsg += 'The activate_deployment endpoint encountered an error.';
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMsg = 'Request timed out. The backend endpoint may not be implemented yet or the deployment is taking too long.';
      } else if (error.response?.data?.detail) {
        errorMsg = typeof error.response.data.detail === 'string'
          ? error.response.data.detail
          : JSON.stringify(error.response.data.detail);
      } else if (error.message) {
        errorMsg = error.message;
      }

      // Set error state to display in UI
      setDeploymentError({ workflow: workflowName, message: errorMsg });
    } finally {
      setActivatingWorkflow(null);
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

  // Separate and compute deployment metrics
  const deploymentMetrics = useMemo(() => {
    const mappingDeployments = scheduledWorkflows.filter(wf =>
      wf.workflow_name.startsWith('mapping_deployment_')
    );
    const regularWorkflows = scheduledWorkflows.filter(wf =>
      !wf.workflow_name.startsWith('mapping_deployment_')
    );

    const pendingApprovals = scheduledWorkflows.filter(wf =>
      wf.status === 'PENDING_APPROVAL'
    ).length;

    const activeDeployments = scheduledWorkflows.filter(wf =>
      wf.status === 'ACTIVE'
    ).length;

    const approvedPending = scheduledWorkflows.filter(wf =>
      wf.status === 'APPROVED'
    ).length;

    // Upcoming deployments in next 7 days
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDeployments = scheduledWorkflows.filter(wf => {
      if (!wf.scheduled_date) return false;
      const scheduledDate = new Date(wf.scheduled_date);
      return scheduledDate >= now && scheduledDate <= next7Days;
    }).length;

    return {
      mappingDeployments,
      regularWorkflows,
      pendingApprovals,
      activeDeployments,
      approvedPending,
      upcomingDeployments,
      totalDeployments: scheduledWorkflows.length
    };
  }, [scheduledWorkflows]);

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
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Account Overview
            </h1>
            {isRefreshing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Monitor your platform activity, storage, and performance metrics
          </p>
        </div>
        <Button
          onClick={() => {
            setIsRefreshing(true);
            Promise.all([
              refetchDashboard?.(),
              refetchStages?.(),
            ]).finally(() => setIsRefreshing(false));
          }}
          variant="outline"
          className="gap-2"
          disabled={isRefreshing}
        >
          <HiOutlineRefresh className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
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

        <KPICard
          title="Pending Approvals"
          value={deploymentMetrics.pendingApprovals}
          subtitle="Deployments awaiting review"
          icon={<PiClockCountdown className="w-6 h-6" />}
          color="amber"
          loading={scheduledWorkflowsLoading}
        />

        <KPICard
          title="Active Deployments"
          value={deploymentMetrics.activeDeployments}
          subtitle="Currently running"
          icon={<PiRocketLaunch className="w-6 h-6" />}
          color="green"
          loading={scheduledWorkflowsLoading}
        />

        <KPICard
          title="Upcoming"
          value={deploymentMetrics.upcomingDeployments}
          subtitle="Next 7 days"
          icon={<PiPackage className="w-6 h-6" />}
          color="indigo"
          loading={scheduledWorkflowsLoading}
        />
      </div>

      {/* Deployment Plans Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                <PiCalendarCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Deployment Plans
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Manage mapping deployments and workflow schedules
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 text-base px-3 py-1.5">
                {deploymentMetrics.mappingDeployments.length} Mappings
              </Badge>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-base px-3 py-1.5">
                {deploymentMetrics.regularWorkflows.length} Workflows
              </Badge>
            </div>
          </div>

          {/* Deployment Error Display */}
          {deploymentError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg">
              <div className="flex items-start gap-3">
                <PiWarning className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-base font-semibold text-red-800 dark:text-red-300 mb-2">
                    Activation Failed: {deploymentError.workflow}
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap mb-3">
                    {deploymentError.message}
                  </p>
                  <button
                    onClick={() => setDeploymentError(null)}
                    className="text-xs font-medium text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {scheduledWorkflowsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div>
              {/* Custom Tab Buttons */}
              <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setActiveTab('mappings')}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
                    activeTab === 'mappings'
                      ? 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <PiDatabase className="w-4 h-4" />
                  Mapping Deployments ({deploymentMetrics.mappingDeployments.length})
                </button>
                <button
                  onClick={() => setActiveTab('workflows')}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
                    activeTab === 'workflows'
                      ? 'border-green-600 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <PiPlayCircle className="w-4 h-4" />
                  Scheduled Workflows ({deploymentMetrics.regularWorkflows.length})
                </button>
              </div>

              {/* Tab Content */}
              <div>
                {/* Mapping Deployments Panel */}
                {activeTab === 'mappings' && (
                  <div>
                  {deploymentMetrics.mappingDeployments.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <PiDatabase className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>No mapping deployments scheduled</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {deploymentMetrics.mappingDeployments.map((workflow, index) => {
                        const isApproving = approvingWorkflow === workflow.workflow_name;
                        const isActivating = activatingWorkflow === workflow.workflow_name;
                        const status = workflow.status || 'PENDING_APPROVAL';

                        const statusColor = status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : status === 'APPROVED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';

                        return (
                          <div
                            key={index}
                            className="border-2 border-purple-200 dark:border-purple-700 rounded-xl p-5 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-slate-900"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                  <PiDatabase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                  Mapping
                                </Badge>
                              </div>
                              <Badge className={statusColor}>
                                {status.replace('_', ' ')}
                              </Badge>
                            </div>

                            <h4 className="font-semibold text-slate-900 dark:text-white mb-2 truncate" title={workflow.workflow_name}>
                              {workflow.workflow_name}
                            </h4>

                            <div className="space-y-2 mb-4">
                              {workflow.scheduled_date && (
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                  <PiClock className="w-4 h-4" />
                                  <span className="font-mono text-xs">
                                    {new Date(workflow.scheduled_date).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {workflow.deployment_method && (
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                  <PiCheckCircle className="w-4 h-4" />
                                  <span className="font-medium">{workflow.deployment_method.replace('_', ' ')}</span>
                                </div>
                              )}
                              {workflow.created_by && (
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                  <PiUsers className="w-4 h-4" />
                                  <span>By: {workflow.created_by}</span>
                                </div>
                              )}
                              {workflow.project_id && (
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                  <PiDatabase className="w-4 h-4" />
                                  <span className="truncate text-xs">Project: {workflow.project_id}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {status === 'PENDING_APPROVAL' && (
                                <Button
                                  onClick={() => handleApproveDeployment(workflow.workflow_name)}
                                  disabled={isApproving}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                                  size="sm"
                                >
                                  {isApproving ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                      Approving...
                                    </>
                                  ) : (
                                    <>
                                      <PiCheckCircle className="mr-2 h-4 w-4" />
                                      Approve
                                    </>
                                  )}
                                </Button>
                              )}
                              {status === 'APPROVED' && (
                                <Button
                                  onClick={() => handleActivateDeployment(workflow.workflow_name)}
                                  disabled={isActivating}
                                  className="flex-1 bg-green-600 hover:bg-green-700"
                                  size="sm"
                                >
                                  {isActivating ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                      Activating...
                                    </>
                                  ) : (
                                    <>
                                      <PiPlayCircle className="mr-2 h-4 w-4" />
                                      Activate
                                    </>
                                  )}
                                </Button>
                              )}
                              {status === 'ACTIVE' && (
                                <Button
                                  disabled
                                  className="flex-1 bg-gray-400 cursor-not-allowed"
                                  size="sm"
                                >
                                  <PiCheckCircle className="mr-2 h-4 w-4" />
                                  Active
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                )}

                {/* Scheduled Workflows Panel */}
                {activeTab === 'workflows' && (
                  <div>
                  {deploymentMetrics.regularWorkflows.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <PiPlayCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>No workflows scheduled</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {deploymentMetrics.regularWorkflows.map((workflow, index) => {
                        const isApproving = approvingWorkflow === workflow.workflow_name;
                        const isActivating = activatingWorkflow === workflow.workflow_name;
                        const status = workflow.status || 'PENDING_APPROVAL';

                        const statusColor = status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : status === 'APPROVED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';

                        return (
                          <div
                            key={index}
                            className="border-2 border-green-200 dark:border-green-700 rounded-xl p-5 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-green-50 to-white dark:from-green-900/20 dark:to-slate-900"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                                  <PiPlayCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  Workflow
                                </Badge>
                              </div>
                              <Badge className={statusColor}>
                                {status.replace('_', ' ')}
                              </Badge>
                            </div>

                            <h4 className="font-semibold text-slate-900 dark:text-white mb-2 truncate" title={workflow.workflow_name}>
                              {workflow.workflow_name}
                            </h4>

                            <div className="space-y-2 mb-4">
                              {(workflow.cron_schedule || workflow.schedule_interval_str) && (
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                  <PiClock className="w-4 h-4" />
                                  <span className="font-mono text-xs">
                                    {workflow.cron_schedule || workflow.schedule_interval_str}
                                  </span>
                                </div>
                              )}
                              {workflow.created_by && (
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                  <PiUsers className="w-4 h-4" />
                                  <span>By: {workflow.created_by}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {status === 'PENDING_APPROVAL' && (
                                <Button
                                  onClick={() => handleApproveDeployment(workflow.workflow_name)}
                                  disabled={isApproving}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                                  size="sm"
                                >
                                  {isApproving ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                      Approving...
                                    </>
                                  ) : (
                                    <>
                                      <PiCheckCircle className="mr-2 h-4 w-4" />
                                      Approve
                                    </>
                                  )}
                                </Button>
                              )}
                              {status === 'APPROVED' && (
                                <Button
                                  onClick={() => handleActivateDeployment(workflow.workflow_name)}
                                  disabled={isActivating}
                                  className="flex-1 bg-green-600 hover:bg-green-700"
                                  size="sm"
                                >
                                  {isActivating ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                      Activating...
                                    </>
                                  ) : (
                                    <>
                                      <PiPlayCircle className="mr-2 h-4 w-4" />
                                      Activate
                                    </>
                                  )}
                                </Button>
                              )}
                              {status === 'ACTIVE' && (
                                <Button
                                  disabled
                                  className="flex-1 bg-gray-400 cursor-not-allowed"
                                  size="sm"
                                >
                                  <PiCheckCircle className="mr-2 h-4 w-4" />
                                  Active
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                )}
              </div>
            </div>
          )}
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
