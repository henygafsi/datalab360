'use client';
// Data journey: dashboard → hooks (gouvernance) + projectsApi/exploreDesignApi/workflowApi/GouvernanceService → GET projects, deployments, approve/reject/activate
// ////dependency//// page → hooks.use-gouvernance, hooks.useCache*, services.explore-design, services.workflow, services.gouvernance, services.cortex, lib.api-client
import Link from 'next/link';
import { Badge, Button, Select, Modal, Text } from 'rizzui';
import { useClientDashboard, useStageStorageInfo, useClientDashboardAll } from '@/hooks/use-gouvernance';
import { PiDatabase, PiUsers, PiChartLine, PiCheckCircle, PiXCircle, PiWarning, PiClock, PiEye, PiPlayCircle, PiCalendarCheck, PiRocketLaunch, PiClockCountdown, PiPackage } from 'react-icons/pi';
import { HiOutlineRefresh } from 'react-icons/hi';
import { RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useCacheInvalidationWatcher } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useSession } from 'next-auth/react';
import KPICard from '@/components/analytics/KPICard';
import axios from 'axios';
import * as ExploreDesignService from '@/app/services/explore-design';
import * as projectsApi from '@/app/services/api/projectsApi';
import toast from 'react-hot-toast';
import DataEngineerHub from '@/app/shared/data-engineer-hub/DataEngineerHub';
import { routes } from '@/config/routes';
import * as GouvernanceService from '@/app/services/gouvernance';
import { getCortexRecommend } from '@/app/services/cortex';
import { redirectToLogin, shouldRedirectToLoginOnError } from '@/lib/api-client';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://www.api.datalab360.io:8443';

/** Links to all platform modules for Account Overview "Features across modules" section */
const MODULE_FEATURES: { href: string; name: string; description: string; eventKey?: string }[] = [
  { href: routes.connexion.dataSourceConnection, name: 'Connect Data', description: 'Data source connection and stages', eventKey: 'INGESTION' },
  { href: routes.exploreDesign.view, name: 'Explore & Design', description: 'Explore and design data models', eventKey: 'EXPLORE_DESIGN' },
  { href: routes.mapping.viewMap, name: 'Mapping', description: 'View and manage mappings', eventKey: 'MAPPING' },
  { href: routes.workflow.ViewWorkflow, name: 'Workflow', description: 'Workflow and ETL pipelines', eventKey: 'WORKFLOW' },
  { href: routes.gouvernance.users, name: 'Governance', description: 'Users, roles, and policies', eventKey: 'GOUVERNANCE' },
  { href: routes.dataQuality.viewReports, name: 'Data Health', description: 'Data quality reports', eventKey: 'DATA_QUALITY' },
  { href: routes.intelligent.dashboard, name: 'AI Intelligence', description: 'Cortex AI and semantic models', eventKey: 'CORTEX' },
  { href: routes.observability.dashboard, name: 'Observability', description: 'System monitoring', eventKey: 'OBSERVABILITY' },
  { href: routes.biReporting.viewReporting, name: 'Business Reporting', description: 'BI reports and dashboards', eventKey: 'BI_REPORTING' },
  { href: routes.clientAccounts.dashboard, name: 'Client Accounts', description: 'Manage client Snowflake accounts' },
];

interface ScheduledWorkflow {
  workflow_name: string;
  scheduled_date?: string;
  deployment_method?: string;
  project_id?: string;
  deployment_id?: string; // For new API approve/reject/execute calls
  created_by: string;
  created_at?: string;
  status?: string; // PENDING_APPROVAL, APPROVED, ACTIVE, REJECTED
  cron_schedule?: string;
  schedule_interval_str?: string;
  source?: 'workflow' | 'mapping' | 'explore_design';
  schedule_id?: string;
  event_id?: string;
  workflow_id?: string;
  module?: 'WORKFLOW' | 'MAPPING' | 'EXPLORE_DESIGN';
  config?: Record<string, unknown> | null; // Deployment config (contains events, sql_queries, etc.)
}

export default function GouvernanceDashboard() {
  const { data: session, update: updateSession } = useSession();
  const currentUsername = session?.user?.username || '';

  // Helper to get auth headers with Snowflake account context
  // Backend handles the uchsfvb- prefix internally
  const getAuthHeaders = () => {
    if (!session?.user?.access_token) return null;
    const snowflakeAccount = session.user.account_name || '';
    return {
      Authorization: `Bearer ${session.user.access_token}`,
      'Content-Type': 'application/json',
      'X-Account-Name': snowflakeAccount,
      'X-Username': session.user.username || '',
    };
  };

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
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  // Admin / data modeler view: no default user filter so all users' activity is shown

  // Auto-refresh when SSE cache invalidation event is received
  useEffect(() => {
    if (wasInvalidated && !dashboardLoading && !stagesLoading) {
      setIsRefreshing(true);
      Promise.all([
        refetchDashboard?.(),
        refetchStages?.(),
        // Also refresh scheduled deployments silently
        fetchScheduledItems(false),
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

  // Track previous deployment count for smart refresh
  const prevDeploymentCountRef = useRef(0);
  // Track if we've already fetched to prevent infinite loops
  const hasFetchedRef = useRef(false);
  // Store access token as stable reference
  const accessToken = session?.user?.access_token;

  // Fetch deployments across all projects using new v1 APIs.
  // 1. listProjects() → get all project IDs
  // 2. For each project, fetch explore-design + workflow deployments in parallel
  // 3. Merge and deduplicate
  const fetchScheduledItems = async (showLoadingIndicator = true) => {
    const token = session?.user?.access_token ?? accessToken;
    if (!token) return;

    if (showLoadingIndicator) {
      setScheduledWorkflowsLoading(true);
    }
    try {
      // Fetch all projects
      const projectsRes = await projectsApi.listProjects().catch((err: any) => {
        if (shouldRedirectToLoginOnError(err)) { redirectToLogin(); }
        console.warn('Failed to list projects:', err?.message);
        return { projects: [], total: 0, limit: 100, offset: 0 };
      });

      const projects = projectsRes.projects || [];
      const allScheduled: ScheduledWorkflow[] = [];

      // Fetch deployments for each project in parallel
      const deploymentPromises = projects.map(async (project) => {
        const pid = project.project_id;
        const items: ScheduledWorkflow[] = [];

        // Fetch project deployments (project_deployments table)
        try {
          const depRes = await projectsApi.listDeployments(pid);
          (depRes.deployments || []).forEach((d) => {
            items.push({
              workflow_name: project.project_name || `deployment_${d.deployment_id}`,
              deployment_id: d.deployment_id,
              project_id: d.project_id || pid,
              scheduled_date: d.deployed_at || d.scheduled_at || d.created_at,
              deployment_method: d.deployment_method || undefined,
              created_by: d.requested_by || '',
              created_at: d.created_at,
              status: d.status?.toUpperCase(),
              source: 'explore_design',
              schedule_id: d.deployment_id,
              config: d.config,
            });
          });
        } catch (err: any) {
          if (shouldRedirectToLoginOnError(err)) { redirectToLogin(); return items; }
          // Silently skip projects without deployments
        }

        return items;
      });

      const results = await Promise.allSettled(deploymentPromises);
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          allScheduled.push(...r.value);
        }
      });

      // Remove duplicates by deployment_id, keeping the most recent one
      const uniqueWorkflows = allScheduled.reduce((acc, workflow) => {
        const key = workflow.deployment_id || workflow.workflow_name;
        const existing = acc.find(w => (w.deployment_id || w.workflow_name) === key);
        if (!existing) {
          acc.push(workflow);
        } else {
          const existingTime = new Date(existing.created_at || existing.scheduled_date || 0).getTime();
          const currentTime = new Date(workflow.created_at || workflow.scheduled_date || 0).getTime();
          if (currentTime > existingTime) {
            const index = acc.indexOf(existing);
            acc[index] = workflow;
          }
        }
        return acc;
      }, [] as ScheduledWorkflow[]);

      prevDeploymentCountRef.current = uniqueWorkflows.length;
      setScheduledWorkflows(uniqueWorkflows);
      hasFetchedScheduledRef.current = true;

      // Fetch recent deployment errors (no new API equivalent yet)
      try {
        const errRes = await ExploreDesignService.getRecentDeploymentErrors(20);
        setRecentDeploymentErrors(errRes.errors || []);
      } catch (e) {
        setRecentDeploymentErrors([]);
      }
    } catch (error: any) {
      console.error('Error fetching scheduled items:', error);
    } finally {
      if (showLoadingIndicator) {
        setScheduledWorkflowsLoading(false);
      }
    }
  };

  // Refetch scheduled deployments when SSE invalidation fires (e.g. after schedule/approve/reject/activate from workflow or explore-design).
  // So approval/schedule/execute handling is identical: backend invalidates → we refetch so list stays in sync.
  const hasFetchedScheduledRef = useRef(false);
  useEffect(() => {
    if (wasInvalidated && accessToken) {
      fetchScheduledItems(false);
    }
  }, [wasInvalidated, accessToken]);

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
    if (statusFilter) filters.status = statusFilter;

    return filters;
  }, [defaultStartDate, defaultEndDate, userFilter, moduleFilter, eventTypeFilter, queryStatusFilter, statusFilter]);

  const { data: activityData, loading: activityLoading, error: activityError } = useClientDashboardAll(apiFilters);

  // Modal state for query text
  const [selectedQuery, setSelectedQuery] = useState<{ text: string; id: string } | null>(null);
  const [isQueryModalOpen, setIsQueryModalOpen] = useState(false);

  // Scheduled workflows and mappings state (lazy-loaded when user opens deployments section)
  const [scheduledWorkflows, setScheduledWorkflows] = useState<ScheduledWorkflow[]>([]);
  const [scheduledWorkflowsLoading, setScheduledWorkflowsLoading] = useState(false);
  const [approvingWorkflow, setApprovingWorkflow] = useState<string | null>(null);
  const [rejectingWorkflow, setRejectingWorkflow] = useState<string | null>(null);
  const [activatingWorkflow, setActivatingWorkflow] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'deployments' | 'modeling'>('deployments');
  const [deploymentError, setDeploymentError] = useState<{ workflow: string; message: string } | null>(null);
  const [recentDeploymentErrors, setRecentDeploymentErrors] = useState<ExploreDesignService.RecentDeploymentError[]>([]);
  const [recommendationsForError, setRecommendationsForError] = useState<{ id: string; text: string } | null>(null);
  const [deploymentRecommendationsLoading, setDeploymentRecommendationsLoading] = useState(false);

  // Model preview modal state (shows deployment config: events + SQL)
  const [modelPreview, setModelPreview] = useState<{
    workflowName: string;
    config: Record<string, unknown>;
  } | null>(null);

  // Quick filter presets
  const applyQuickFilter = (preset: string) => {
    switch (preset) {
      case 'workflow':
        setModuleFilter('WORKFLOW');
        setQueryStatusFilter('');
        setStatusFilter('');
        break;
      case 'auth':
        setModuleFilter('AUTH');
        setQueryStatusFilter('');
        setStatusFilter('');
        break;
      case 'errors':
        setStatusFilter('ERROR');
        setModuleFilter('');
        setQueryStatusFilter('');
        break;
      case 'query-failed':
        setModuleFilter('');
        setQueryStatusFilter('FAILED');
        setStatusFilter('');
        break;
      case 'query-success':
        setModuleFilter('');
        setQueryStatusFilter('SUCCESS');
        setStatusFilter('');
        break;
      default:
        break;
    }
  };

  const fetchRecommendations = async () => {
    setRecommendationsLoading(true);
    setRecommendations(null);
    try {
      const { errors } = await GouvernanceService.getDashboardErrors({ limit: 20 });
      if (errors.length === 0) {
        setRecommendations('No recent errors to analyze. The platform is healthy.');
        return;
      }
      const result = await getCortexRecommend({ events: errors });
      setRecommendations(result?.response ?? 'No recommendations generated.');
    } catch (err: any) {
      setRecommendations(`Failed to get recommendations: ${err?.message || err}. Ensure Cortex LLM is available.`);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  // Helper: extract error message from API errors
  const extractErrorMsg = (error: any): string => {
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) return detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      return JSON.stringify(detail);
    }
    return error.message || 'Unknown error';
  };

  // Approve deployment using new v1 API
  const handleApproveDeployment = async (workflowName: string, scheduleId?: string, source?: string, _eventId?: string) => {
    // Find the workflow to get project_id + deployment_id
    const wf = scheduledWorkflows.find(w => w.workflow_name === workflowName);
    if (!wf?.project_id || !wf?.deployment_id) {
      toast.error('Missing project or deployment ID');
      return;
    }

    setApprovingWorkflow(workflowName);
    try {
      await projectsApi.approveDeployment(wf.project_id, wf.deployment_id);

      setScheduledWorkflows((prev) =>
        prev.map((w) => w.workflow_name === workflowName ? { ...w, status: 'APPROVED' } : w)
      );
      await fetchScheduledItems(false);
      toast.success(`Deployment approved: ${workflowName}`);
    } catch (error: any) {
      console.error('Error approving deployment:', error);
      toast.error(`Failed to approve: ${extractErrorMsg(error)}`);
    } finally {
      setApprovingWorkflow(null);
    }
  };

  // Reject deployment using new v1 API
  const handleRejectDeployment = async (workflowName: string, scheduleId?: string, source?: string, _eventId?: string) => {
    const wf = scheduledWorkflows.find(w => w.workflow_name === workflowName);
    if (!wf?.project_id || !wf?.deployment_id) {
      toast.error('Missing project or deployment ID');
      return;
    }

    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    setRejectingWorkflow(workflowName);
    try {
      await projectsApi.rejectDeployment(wf.project_id, wf.deployment_id, { reason });

      setScheduledWorkflows((prev) =>
        prev.map((w) => w.workflow_name === workflowName ? { ...w, status: 'REJECTED' } : w)
      );
      await fetchScheduledItems(false);
      toast.success(`Deployment rejected: ${workflowName}`);
    } catch (error: any) {
      console.error('Error rejecting deployment:', error);
      toast.error(`Failed to reject: ${extractErrorMsg(error)}`);
    } finally {
      setRejectingWorkflow(null);
    }
  };

  // Execute/activate approved deployment using new v1 API
  const handleActivateDeployment = async (workflowName: string, scheduleId?: string, source?: string, _eventId?: string) => {
    const wf = scheduledWorkflows.find(w => w.workflow_name === workflowName);
    if (!wf?.project_id || !wf?.deployment_id) {
      toast.error('Missing project or deployment ID');
      return;
    }

    setActivatingWorkflow(workflowName);
    setDeploymentError(null);
    try {
      await projectsApi.executeDeployment(wf.project_id, wf.deployment_id);

      setScheduledWorkflows((prev) =>
        prev.map((w) => w.workflow_name === workflowName ? { ...w, status: 'ACTIVE' } : w)
      );
      await fetchScheduledItems(false);
      toast.success(`Deployment activated: ${workflowName}`);
    } catch (error: any) {
      console.error('Error activating deployment:', error);
      const errorMsg = extractErrorMsg(error);
      setDeploymentError({ workflow: workflowName, message: errorMsg });
      toast.error(`Failed to activate: ${errorMsg}`);
    } finally {
      setActivatingWorkflow(null);
    }
  };

  // View model for a deployment (reads from deployment config — no API call needed)
  const handleViewModel = (workflow: ScheduledWorkflow) => {
    if (!workflow.config) {
      toast.error('No deployment config available');
      return;
    }
    setModelPreview({
      workflowName: workflow.workflow_name,
      config: workflow.config,
    });
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

  // Compute deployment metrics (Explore & Design only — workflows don't have approval)
  const deploymentMetrics = useMemo(() => {
    const mappingDeployments = scheduledWorkflows.filter(wf =>
      wf.source === 'mapping' || wf.source === 'explore_design'
    );

    const pendingApprovals = scheduledWorkflows.filter(wf =>
      wf.status === 'PENDING_APPROVAL' || wf.status === 'pending_approval'
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

  // Event status (for audit: SUCCESS / ERROR)
  const uniqueEventStatuses = useMemo(() => [
    { value: '', label: 'All' },
    { value: 'SUCCESS', label: 'Success' },
    { value: 'ERROR', label: 'Error' },
  ], []);

  // No client-side filtering needed - API handles all filtering
  const filteredActivityData = activityData || [];

  // Errors count in current period (for Account Overview KPI)
  const errorsCount = useMemo(() => {
    if (!activityData || !Array.isArray(activityData)) return 0;
    return activityData.filter(a => a.EVENT_STATUS === 'ERROR').length;
  }, [activityData]);

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
          onClick={async () => {
            setIsRefreshing(true);
            try {
              await updateSession();
              await Promise.all([
                refetchDashboard?.(),
                refetchStages?.(),
                fetchScheduledItems(false),
              ]);
            } finally {
              setIsRefreshing(false);
            }
          }}
          variant="outline"
          className="gap-2"
          disabled={isRefreshing}
        >
          <HiOutlineRefresh className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Features across modules - single view to all platform capabilities */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg p-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Features across modules</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Access all platform capabilities from one place
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {MODULE_FEATURES.map((mod) => {
            const eventCount = mod.eventKey && dashboardData?.events_by_module?.[mod.eventKey];
            return (
              <Link key={mod.href} href={mod.href}>
                <div className="group p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all cursor-pointer h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{mod.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{mod.description}</p>
                    </div>
                    {typeof eventCount === 'number' && eventCount > 0 && (
                      <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 shrink-0" size="sm">{eventCount}</Badge>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Data Modeler / Data Engineer quick access */}
      <DataEngineerHub />

      {/* Account Info Card */}
      {session?.user && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <PiUsers className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{session.user.username}</h2>
                <p className="text-blue-100 text-sm">
                  Account: <span className="font-medium">uchsfvb-{session.user.account_name}</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge className="bg-white/20 text-white border-white/30 px-3 py-1">
                {session.user.role || 'User'}
              </Badge>
              <p className="text-blue-100 text-xs mt-2">
                Snowflake Organization: uchsfvb
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <KPICard
          title="Total Events"
          value={dashboardData?.total_events || 0}
          subtitle={dashboardData?.period_days ? `Last ${dashboardData.period_days} days` : 'All platform activities'}
          icon={<PiChartLine className="w-6 h-6" />}
          color="blue"
          loading={dashboardLoading}
        />

        <KPICard
          title="Active Users (7d)"
          value={dashboardData?.active_users_7d ?? dashboardData?.active_users_30d ?? 0}
          subtitle="Distinct users in period"
          icon={<PiUsers className="w-6 h-6" />}
          color="indigo"
          loading={dashboardLoading}
        />

        <KPICard
          title="Events trend (7d)"
          value={dashboardData?.events_trend_pct != null ? `${dashboardData.events_trend_pct > 0 ? '+' : ''}${dashboardData.events_trend_pct}%` : '—'}
          subtitle="vs previous 7 days"
          change={dashboardData?.events_trend_pct != null ? {
            value: Math.abs(dashboardData.events_trend_pct),
            trend: (dashboardData.events_trend_pct ?? 0) >= 0 ? 'up' : 'down',
            label: 'week over week',
          } : undefined}
          icon={<PiChartLine className="w-6 h-6" />}
          color="blue"
          loading={dashboardLoading}
        />

        <KPICard
          title="Credits (7d)"
          value={dashboardData?.credits_7d ?? dashboardData?.credits_30d ?? 0}
          subtitle="Snowflake warehouse credits"
          icon={<PiDatabase className="w-6 h-6" />}
          color="blue"
          loading={dashboardLoading}
        />

        <KPICard
          title="Est. cost (7d)"
          value={dashboardData?.estimated_cost_usd_7d != null ? `$${dashboardData.estimated_cost_usd_7d.toFixed(2)}` : dashboardData?.estimated_cost_usd_30d != null ? `$${dashboardData.estimated_cost_usd_30d.toFixed(2)} (30d)` : '—'}
          subtitle="Approx. USD from credits"
          icon={<PiChartLine className="w-6 h-6" />}
          color="purple"
          loading={dashboardLoading}
        />

        <KPICard
          title="Errors (period)"
          value={errorsCount}
          subtitle="Events with status ERROR in selected period"
          icon={<PiWarning className="w-6 h-6" />}
          color="red"
          loading={activityLoading}
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

      {/* Latest activity (from dashboard summary) */}
      {dashboardData?.recent_activity_preview && dashboardData.recent_activity_preview.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Latest activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-600 dark:text-slate-400">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Module</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.recent_activity_preview.map((a: any, i: number) => (
                  <tr key={a.EVENT_ID || i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4 font-medium">{a.USERNAME ?? '—'}</td>
                    <td className="py-2 pr-4">{a.MODULE_NAME ?? '—'}</td>
                    <td className="py-2 pr-4">{a.EVENT_TYPE ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <Badge size="sm" color={a.STATUS === 'SUCCESS' ? 'success' : a.STATUS === 'FAILED' || a.STATUS === 'ERROR' ? 'danger' : 'secondary'}>
                        {a.STATUS ?? '—'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{a.EVENT_DATE ? new Date(a.EVENT_DATE).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  Manage Explore & Design deployments and workflow schedules
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchScheduledItems(true)}
                disabled={scheduledWorkflowsLoading}
              >
                {scheduledWorkflowsLoading ? (
                  <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading...</span>
                ) : (
                  <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Load deployments</span>
                )}
              </Button>
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 text-base px-3 py-1.5">
                {deploymentMetrics.mappingDeployments.length} Explore & Design
              </Badge>
            </div>
          </div>

          {/* Deployment Error Display (activation failed) */}
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

          {/* Recent deployment errors (schema deploy, etc.) with Cortex recommendations */}
          {recentDeploymentErrors.length > 0 && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-3 flex items-center gap-2">
                <PiWarning className="w-5 h-5" />
                Recent deployment errors
              </h4>
              <div className="space-y-3">
                {recentDeploymentErrors.slice(0, 5).map((err) => (
                  <div key={err.id} className="rounded-lg bg-white dark:bg-slate-800/50 p-3 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-mono break-all mb-2">
                      {err.error_message}
                    </p>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs text-slate-500">
                        {err.project_id && <span>Project: {err.project_id}</span>}
                        {err.created_at && <span className="ml-2">{new Date(err.created_at).toLocaleString()}</span>}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-amber-700 border-amber-400 hover:bg-amber-100 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-900/30"
                        disabled={deploymentRecommendationsLoading}
                        onClick={async () => {
                          setDeploymentRecommendationsLoading(true);
                          setRecommendationsForError(null);
                          try {
                            const res = await getCortexRecommend({ error_context: err.error_message });
                            setRecommendationsForError({ id: err.id, text: res?.response ?? 'No recommendations.' });
                          } catch (e) {
                            setRecommendationsForError({ id: err.id, text: 'Failed to load recommendations.' });
                          } finally {
                            setDeploymentRecommendationsLoading(false);
                          }
                        }}
                      >
                        {deploymentRecommendationsLoading ? 'Loading...' : 'Get Cortex recommendations'}
                      </Button>
                    </div>
                    {recommendationsForError?.id === err.id && (
                      <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Recommendations:</p>
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{recommendationsForError.text}</p>
                        <button
                          onClick={() => setRecommendationsForError(null)}
                          className="text-xs text-slate-500 hover:text-slate-700 mt-2"
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {scheduledWorkflowsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div>
              {/* Explore & Design Deployments */}
              <div>
                  <div>
                  {deploymentMetrics.mappingDeployments.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <PiDatabase className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>No Explore & Design deployments</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {deploymentMetrics.mappingDeployments.map((workflow, index) => {
                        const isApproving = approvingWorkflow === workflow.workflow_name;
                        const isRejecting = rejectingWorkflow === workflow.workflow_name;
                        const isActivating = activatingWorkflow === workflow.workflow_name;
                        const status = workflow.status || 'PENDING_APPROVAL';

                        const statusColor = status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : status === 'APPROVED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : status === 'REJECTED' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
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
                                  Explore & Design
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

                            {/* View Model Button */}
                            {workflow.config && (
                              <Button
                                onClick={() => handleViewModel(workflow)}
                                variant="outline"
                                className="w-full mb-2 border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-600 dark:text-purple-400 dark:hover:bg-purple-900/20"
                                size="sm"
                              >
                                <PiEye className="mr-2 h-4 w-4" />
                                View Model
                              </Button>
                            )}

                            {/* Explore & Design Deployment Actions */}
                            <div className="flex flex-col gap-2">
                              {/* Go to Project — always visible so approvers can review before deciding */}
                              {workflow.project_id && (
                                <Link
                                  href={`${routes.exploreDesign.view}?project_id=${workflow.project_id}`}
                                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 transition-colors"
                                >
                                  <PiRocketLaunch className="h-4 w-4" />
                                  Go to Project
                                </Link>
                              )}
                              {status === 'PENDING_APPROVAL' && (
                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => handleApproveDeployment(workflow.workflow_name, workflow.schedule_id, workflow.source, workflow.event_id)}
                                    disabled={isApproving || isRejecting}
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
                                  <Button
                                    onClick={() => handleRejectDeployment(workflow.workflow_name, workflow.schedule_id, workflow.source, workflow.event_id)}
                                    disabled={isRejecting || isApproving}
                                    className="flex-1 bg-red-600 hover:bg-red-700"
                                    size="sm"
                                  >
                                    {isRejecting ? (
                                      <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                        Rejecting...
                                      </>
                                    ) : (
                                      <>
                                        <PiXCircle className="mr-2 h-4 w-4" />
                                        Reject
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
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
            variant={statusFilter === 'ERROR' ? 'solid' : 'outline'}
            onClick={() => applyQuickFilter('errors')}
            className={statusFilter === 'ERROR' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            Errors only
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
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

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
              Status
            </label>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={uniqueEventStatuses}
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
                setStatusFilter('');
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
                  Error
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
                  <td colSpan={11} className="px-4 py-8 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                      <Text className="text-sm text-slate-500">Loading activity data...</Text>
                    </div>
                  </td>
                </tr>
              ) : activityError ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 max-w-2xl">
                        <h4 className="text-red-800 dark:text-red-400 font-semibold mb-2 flex items-center gap-2">
                          <PiWarning className="w-5 h-5" />
                          Erreur chargement activité
                        </h4>
                        <p className="text-red-700 dark:text-red-300 text-sm mb-3">
                          {activityError.message || 'Impossible de charger les activités. Vérifiez la connexion et les droits.'}
                        </p>
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
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-[200px]">
                      {(activity as any).EVENT_ERROR ? (
                        <span title={(activity as any).EVENT_ERROR} className="block truncate text-red-600 dark:text-red-400">
                          {String((activity as any).EVENT_ERROR).slice(0, 80)}
                          {String((activity as any).EVENT_ERROR).length > 80 ? '…' : ''}
                        </span>
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
                  <td colSpan={11} className="px-4 py-8 text-center">
                    <div className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      <p className="font-medium">Aucune activité sur la période sélectionnée</p>
                      <p className="text-sm mt-2">
                        Les événements sont enregistrés lorsque les utilisateurs exécutent des workflows, des mappings, Explore &amp; Design, ou se connectent. Vérifiez le filtre (utilisateur, module, dates) ou que la base <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">EVENT_STORE.USER_ACTIVITY</code> contient des données (variable <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">SNOWFLAKE_METADATA_DATABASE</code> côté backend).
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* AI Recommendations (Cortex LLM) */}
        <div className="mt-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">AI Recommendations</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Analyze recent platform errors and get resolution suggestions from Cortex LLM.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRecommendations}
            disabled={recommendationsLoading}
          >
            {recommendationsLoading ? 'Analyzing…' : 'Get AI recommendations'}
          </Button>
          {recommendations != null && (
            <div className="mt-4 p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {recommendations}
            </div>
          )}
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

      {/* Model Preview Modal (deployment config: events + SQL) */}
      <Modal
        isOpen={!!modelPreview}
        onClose={() => setModelPreview(null)}
        size="xl"
      >
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Deployment Model
            </h3>
            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 font-mono text-xs">
              {modelPreview?.workflowName}
            </Badge>
          </div>

          {(() => {
            const cfg = modelPreview?.config;
            if (!cfg) return null;
            const events = (cfg.events as any[]) || [];
            const sqlQueries = (cfg.sql_queries as string[]) || [];
            const createdBy = cfg.created_by as string | undefined;
            const deploymentMethod = cfg.deployment_method as string | undefined;
            const approvers = (cfg.approvers as string[]) || [];

            const tables = events.filter((e: any) => e.event_type === 'TABLE_CREATED');
            const mappings = events.filter((e: any) => e.event_type === 'COLUMN_MAPPING_CREATED');
            const foreignKeys = events.filter((e: any) => e.event_type === 'FOREIGN_KEY_ADDED');
            const otherEvents = events.filter((e: any) =>
              !['TABLE_CREATED', 'COLUMN_MAPPING_CREATED', 'FOREIGN_KEY_ADDED'].includes(e.event_type)
            );

            return (
              <div className="space-y-5">
                {/* Deployment Info */}
                <div className="flex flex-wrap gap-3 text-sm">
                  {createdBy && (
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      By: {createdBy}
                    </Badge>
                  )}
                  {deploymentMethod && (
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {deploymentMethod.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {approvers.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Approvers: {approvers.join(', ')}
                    </Badge>
                  )}
                </div>

                {/* Tables */}
                {tables.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <PiDatabase className="w-4 h-4" />
                      Tables ({tables.length})
                    </h4>
                    <div className="space-y-2">
                      {tables.map((t: any, i: number) => {
                        const target = t.target || {};
                        const cols = t.payload?.columns || [];
                        const pks = t.payload?.primaryKeys || [];
                        return (
                          <div key={i} className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                            <div className="font-mono text-sm font-semibold text-green-800 dark:text-green-400">
                              {target.database}.{target.schema}.{target.table || t.payload?.tableName}
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-1">
                              {cols.map((col: any, ci: number) => (
                                <div key={ci} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                  <span className={`font-mono ${pks.includes(col.name) ? 'font-bold text-amber-700 dark:text-amber-400' : ''}`}>
                                    {col.name}
                                  </span>
                                  <span className="text-slate-400">{col.dataType}</span>
                                  {pks.includes(col.name) && <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1 py-0">PK</Badge>}
                                  {col.nullable === false && !pks.includes(col.name) && <span className="text-red-400 text-[10px]">NOT NULL</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mappings */}
                {mappings.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <PiChartLine className="w-4 h-4" />
                      Column Mappings ({mappings.length})
                    </h4>
                    <div className="space-y-1">
                      {mappings.map((m: any, i: number) => {
                        const src = m.payload?.source || {};
                        const tgt = m.payload?.target || {};
                        return (
                          <div key={i} className="p-2 bg-blue-50 dark:bg-blue-900/10 rounded border border-blue-200 dark:border-blue-800 text-xs font-mono">
                            <span className="text-blue-700 dark:text-blue-400">{src.database}.{src.schema}.{src.table}</span>
                            <span className="text-slate-400 mx-1">({(src.columns || []).join(', ')})</span>
                            <span className="text-slate-500 mx-1">&rarr;</span>
                            <span className="text-purple-700 dark:text-purple-400">{tgt.database}.{tgt.schema}.{tgt.table}</span>
                            <span className="text-slate-400 mx-1">({tgt.column})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Foreign Keys */}
                {foreignKeys.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <PiRocketLaunch className="w-4 h-4" />
                      Foreign Keys ({foreignKeys.length})
                    </h4>
                    <div className="space-y-1">
                      {foreignKeys.map((fk: any, i: number) => {
                        const p = fk.payload || {};
                        const ref = p.referencedTable || {};
                        const target = fk.target || {};
                        return (
                          <div key={i} className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded border border-amber-200 dark:border-amber-800 text-xs font-mono">
                            <span className="font-semibold text-amber-800 dark:text-amber-400">{p.constraintName}</span>
                            <span className="text-slate-500 ml-2">
                              {target.table}.({(p.columns || []).join(', ')}) &rarr; {ref.table}.({(p.referencedColumns || []).join(', ')})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Other Events */}
                {otherEvents.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Other Events ({otherEvents.length})
                    </h4>
                    <div className="space-y-1">
                      {otherEvents.map((e: any, i: number) => (
                        <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs">
                          <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-[10px]">
                            {e.event_type?.replace(/_/g, ' ')}
                          </Badge>
                          {e.payload && (
                            <span className="ml-2 text-slate-500 font-mono">
                              {JSON.stringify(e.payload).slice(0, 120)}
                              {JSON.stringify(e.payload).length > 120 ? '...' : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SQL Queries */}
                {sqlQueries.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      SQL Queries ({sqlQueries.length})
                    </h4>
                    <div className="space-y-2">
                      {sqlQueries.map((sql: string, i: number) => (
                        <pre key={i} className="text-xs text-slate-700 dark:text-slate-300 bg-slate-900 dark:bg-slate-950 text-green-400 rounded p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                          {sql}
                        </pre>
                      ))}
                    </div>
                  </div>
                )}

                {events.length === 0 && sqlQueries.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <PiDatabase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No model data in deployment config</p>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex justify-end mt-4">
            <Button onClick={() => setModelPreview(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
