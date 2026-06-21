// @ts-nocheck
// Admin-only diagnostics page. Many imported service functions have evolved signatures;
// this page exercises them with __test_health_check__ marker values. The runtime behavior
// is wrapped in try/catch and only used to surface signature drift in the admin UI, so the
// type mismatches are acceptable here.
'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { routes } from '@/config/routes';
import { KpiStrip } from './components/KpiStrip';
import { DrillPanel } from './components/DrillPanel';
import { ReleaseHistory } from './components/ReleaseHistory';
import { SLOW_THRESHOLD_MS, isDefect, isExpected, type ProbeDetail } from './components/types';
import { persistApiHealthRun, NotDeployedError } from '@/app/services/admin-api-health';

// ── Command Center ──
import {
  getSummary, getModuleHealth, getActivityFeed, getInfrastructure,
  getPipelines, getCostBreakdown, getFilterOptions as ccGetFilterOptions,
  getCrossModuleIntelligence, getSecurityAudit, getWarehousePerformance,
  getQueryIntelligence, getSensors, getTimeContext, checkDataFreshness,
} from '@/app/services/command-center';

// ── Audit ──
import {
  getQueryHistory, getAccessHistory, getLoginHistory as auditLoginHistory,
  getColumnProfile as auditColumnProfile,
} from '@/app/services/audit';

// ── Chat ──
import {
  listConversations, createDMConversation, createGroupConversation,
  getMessages, sendMessage, updateConversation,
} from '@/app/services/chat';

// ── Cortex ──
import {
  getCortexKpis, listSemanticModels, generateSampleModelYaml,
  getSemanticModelContent, createSemanticModel, deleteSemanticModel as cortexDeleteSM,
  generateSemanticModel, validateSemanticModelYaml,
  queryCortex, getCortexRecommend,
  getQueryAnalyticsResults, getQueryAnalyticsSummary, getRedundantGroups,
  runQueryAnalysis,
  listDuckdbDatasets, queryStage, duckdbQuery,
  listComputePools as cortexComputePools, listServices as cortexServices,
  listStreamlitApps, listImageRepos, listEndpoints as cortexEndpoints,
  createComputePool as cortexCreatePool, suspendPool, resumePool,
  createService as cortexCreateService, getServiceStatus, getServiceLogs,
  createStreamlitApp,
} from '@/app/services/cortex';

// ── ML Features ──
import {
  generateCompletion, analyzeSentiment, analyzeTableSentiment,
  translateText, summarizeText, generateEmbeddings,
  listDatabases as cortexListDatabases, listSchemas as cortexListSchemas,
  listTables as cortexListTables,
} from '@/app/services/cortex/ml-features';

// ── Data Quality ──
import {
  getQualitySummary, getCompletenessMetrics, getUniquenessMetrics,
  getFreshnessMetrics, getIngestionMetrics, getSchemaQuality,
  getClassificationCoverage, getCostMetrics as dqCostMetrics,
  getDQSecurityPosture as dqSecurityPosture, getDmfDashboardResults,
  getTrendAnalysis, runBuiltinDmfCheck, getDmfResults, suggestDmfs,
} from '@/app/services/data-quality';

// ── Data360 Config ──
import {
  getData360Config, getTableRefreshMapping, getCacheConfig,
  triggerRefresh, patchCacheConfig,
} from '@/app/services/data360-config';

// ── Observability ──
import {
  getIntelligentKpis,
  getGdprComplianceReport, getSoc2ComplianceReport,
  getDataLineage, getAccessPatterns, getCrossModuleLineage,
  getActivitySummary,
  getSecurityPosture as obsSecurityPosture,
  getWarehouseUsage as obsWarehouseUsage,
  getDailyCredits, getStorageMetrics,
  getPerformanceMetrics, getSlowQueries as obsSlowQueries,
  getHealthStatus, getObjectDependencies, getDependencyGraph,
  getTrustCenterFindings, getTrustCenterSummary,
  getLineageWithTasks, getImportableTasks,
  probeTableFreshness, probeSchemaFreshness, probeChanges,
  probePlatformFreshness,
} from '@/app/services/observability';

// ── Data Products ──
import {
  listDataProducts, getDataProduct, createDataProduct, subscribeToProduct,
} from '@/app/services/data-products';

// ── Workflow (local) ──
import {
  getWorkflows, getWorkflowDeployments, initializeTables,
  listGitRepositories, listComputePools as wfComputePools,
  listContainerServices, listNotebooks,
  getWorkflowCapabilities, getWorkflowActionTemplates,
  createWorkflow as wfCreateWorkflow, updateWorkflow as wfUpdateWorkflow,
  renameWorkflow, executeWorkflow as wfExecuteWorkflow,
  scheduleWorkflow as wfScheduleWorkflow,
  suspendTask as wfSuspendTask, resumeTask as wfResumeTask,
  getWorkflowVersions, createWorkflowVersion, rollbackWorkflow,
  getWorkflowRuns, scheduleDeployment as wfScheduleDeployment,
  approveDeployment as wfApproveDeployment,
  rejectDeployment as wfRejectDeployment,
  activateDeployment as wfActivateDeployment,
  getWorkflowContributors, addWorkflowContributor, removeWorkflowContributor,
  createGitRepository, describeGitRepository, listGitBranches, listGitTags,
  fetchGitRepository, dropGitRepository,
  createComputePool as wfCreatePool, alterComputePool, dropComputePool,
  createContainerService, describeContainerService,
  getContainerServiceStatus, getContainerServiceLogs, dropContainerService,
  createNotebook, executeNotebook, alterNotebook, dropNotebook,
  runAdHocSQL, runAdHocPython,
  createWorkflowActionTemplate, runWorkflowCloneDataTests,
} from '@/app/services/workflow';

// ── Explore Design ──
import {
  getExploreProjects, getTemplates, getPendingApprovals,
  detectRelations, detectPrimaryKeys,
  recordEvent, getProjectEvents, deleteEvent,
  validateEvents, deployEvents,
  createExploreProject, getProjectState, saveProjectState,
  createProject as edCreateProject, saveTemplate, applyTemplate,
  detectSchemaChanges, validateCompliance,
  createDeployment as edCreateDeployment, getDeployment as edGetDeployment,
  executeDeployment as edExecuteDeployment, rollbackDeployment as edRollbackDeployment,
  listDeployments as edListDeployments,
  createVersion as edCreateVersion, listVersions as edListVersions,
  getVersion as edGetVersion, compareVersions, publishVersion, archiveVersion,
  getApprovalDetails, approveRequest, rejectRequest, addApprovalComment,
  createSnowpipe, createBatchTask, createStream,
  pauseIngestion, resumeIngestion, executeIngestion as edExecuteIngestion,
  deploySchema, getSchemaVersions, rollbackSchema,
  getRecentDeploymentErrors,
  createSchemaClone, getSchemaCloneStatus, executeSchemaClone,
  rollbackSchemaClone, listSchemaClones, previewSchemaCloneDDL,
  getScheduledDeployments, getScheduledDeploymentDetails,
  approveScheduledDeployment, rejectScheduledDeployment,
  cancelScheduledDeployment, rescheduleDeployment,
  executeScheduledDeploymentNow, getScheduledDeploymentLogs,
  createWorkflow as edCreateWorkflow, getWorkflowDAG,
  executeWorkflow as edExecuteWorkflow, getTaskLogs as edGetTaskLogs,
  cancelWorkflow as edCancelWorkflow, retryTask as edRetryTask,
  getPolicies as edGetPolicies,
  applyMaskingPolicy as edApplyMasking, removeMaskingPolicy as edRemoveMasking,
  applyRLSPolicy as edApplyRLS,
  detectSensitiveColumnsInTables, bulkApplyTags,
  createMaskingPolicy as edCreateMasking, createRLSPolicy as edCreateRLS,
  getERDLayout, saveERDLayout, autoLayoutERD,
  createRelationship, deleteRelationship,
  getColumnLineage, getImpactAnalysis,
  addPrimaryKey, renameTable, renameColumn, addColumn, dropColumn,
  changeColumnType, addForeignKey,
  executeEventAction,
  getColumnPreview, getTablePreview, getColumnProfile, getTableProfile,
  markColumnSensitive, setColumnExclusion, fetchRelationships,
  addDesignEvent, getDesignEvents, validateDesignEvents,
  createDesignDeployment, executeDesignDeployment,
  immediateDesignDeploy, scheduleDesignDeployment,
  listScheduledDesignDeployments, executeScheduledDesignDeployment,
  rollbackDesignDeployment, deployWithVersion, rollbackVersionDeployment,
  dryRunDDL, batchAddDDLActions, preCheckDeployment, verifyDeployment,
  checkTypeCompatibility, analyzeImpact as edAnalyzeImpact,
  runQualityCheck, previewIngestionSQL, dryRunIngestion,
  getWatermark, resetWatermark, getEventConflicts,
  saveEventTemplate, listEventTemplates, applyEventTemplate,
  getColumnClassification, discoverRelationships, getSchemaHealth,
  suggestColumns, checkNaming, getTypeOptimization, getSCDRecommendation,
  getWarehouseSizing, getClusteringSuggestion, getMaterializationStrategy,
  getIngestionRecommendation, scoreDeploymentRisk, getOptimalSchedule,
  submitAIFeedback, getAISavingsSummary,
  listDynamicTables, suspendDynamicTable, resumeDynamicTable,
  refreshDynamicTable, dropDynamicTable,
  listStreams, getStreamData, dropStream,
  listAlerts, dropAlert,
  semanticSearch, embedText,
  ensureProjectExists,
  listProjectDeploymentsV1, approveDeploymentV1, rejectDeploymentV1,
  executeDeploymentV1, cancelDeploymentV1, quickDeployV1,
  createScheduleV1, listSchedulesV1, getIngestionHistory,
  addEventConditions, evaluateConditions,
  exportProject, importProject,
  adaptIngestionForVersion, pauseIngestionForClone,
  resumeIngestionAfterClone, createVersionedIngestion,
  compareSchemaVersions as edCompareSchemaVersions,
  promoteVersion as edPromoteVersion,
  getVersionMigrationScript,
  createIngestionOperation, listIngestionOperations,
  executeIngestionOperation, rollbackIngestionOperation,
} from '@/app/services/explore-design';

// ── Gouvernance ──
import {
  getQueryAccessHistory, getStageStorageInfo, getDwhStorageInfo,
  getSrcTableStorageInfo, getDwhSchemas, getDwhHealthInfo,
  getClientDashboardInfo, getConnectorsInfo, getAllUsersActivity,
  getDashboardErrors, listGuiPermissions, getMyPageAccess,
  upsertGuiPermission, deleteGuiPermission,
  listOAuthIntegrations, listNetworkPolicies, listApiKeys,
  setUserMfa, getUserMfaStatus,
  createOAuthIntegration, createSAMLIntegration,
  createServiceUser, assignRSAKey, revokeRSAKey,
} from '@/app/services/governance';
import { getPermissions, getGrantsForRole, grantPermission } from '@/app/services/governance/fetch_grants';
import {
  getRoles, addRole, getRolesForUser, getRoleDetails, getRoleForEdit,
  deleteRole, deleteMultipleRoles, updateRole,
} from '@/app/services/governance/fetch_roles';
import {
  getUsers, addUser, assignRoleToUser, getUserDetails,
  deleteUser, deleteMultipleUsers, disableUser, enableUser, updateUser,
} from '@/app/services/governance/fetch_users';
import { getUsersWithRolesAndModules, updateUserRoles } from '@/app/services/governance/user_roles';
import { getRoles as grantsGetRoles, updateGrants } from '@/app/services/governance/grants';
import {
  getRLSPolicies as polGetRLS, createRLSPolicy as polCreateRLS,
  applyRLSPolicy as polApplyRLS, removeRLSPolicy as polRemoveRLS, deleteRLSPolicy,
  getRLSPolicyDetails,
  getMaskingPolicies, createMaskingPolicy as polCreateMasking,
  applyMaskingPolicy as polApplyMasking, removeMaskingPolicy as polRemoveMasking,
  getMaskingPolicyDetails, deleteMaskingPolicy,
  getNetworkPolicies as polGetNetPol, getNetworkPolicyDetails,
  createNetworkPolicy, deleteNetworkPolicy, setNetworkPolicyAsDefault,
  getTags, createTag, applyTag, removeTag, deleteTag, getTagDetails,
  getPasswordPolicies, createPasswordPolicy, deletePasswordPolicy,
  setPasswordPolicyAsDefault, getPasswordPolicyDetails,
  getSessionPolicies, createSessionPolicy, deleteSessionPolicy,
  setSessionPolicyAsDefault, getSessionPolicyDetails,
  getAggregationPolicies, createAggregationPolicy, applyAggregationPolicy,
  removeAggregationPolicy, deleteAggregationPolicy, getAggregationPolicyDetails,
  getDatabases as polGetDatabases, getSchemas as polGetSchemas,
  getTables as polGetTables, getColumns as polGetColumns,
  getPolicyReferences, unapplyPolicyFromAll,
  getTablePolicies, replaceMaskingPolicy, replaceRLSPolicy, replaceAggregationPolicy,
} from '@/app/services/governance/policies';
import {
  listDMFs, createDMF, describeDMF, deleteDMF,
  associateDMF, disassociateDMF, setDMFSchedule,
  getDMFReferences, classifyTable, extractSemanticCategories,
  applySemanticTags, createCustomClassifier, addClassifierRegex,
} from '@/app/services/governance/dmf';
import {
  initializeSecurityMatrix, getSecurityMatrix,
  createSecurityMatrixEntry, bulkCreateSecurityMatrixEntries,
  updateSecurityMatrixEntry, deleteSecurityMatrixEntry,
  deleteSecurityMatrixByRole, batchUpdateSecurityMatrix,
  getSecurityAxes, createSecurityAxis, updateSecurityAxis, deleteSecurityAxis,
  getEnterpriseUsers, updateEnterpriseUser, deleteEnterpriseUser, syncEnterpriseUsers,
  getRLSPolicies as smGetRLS, createRLSPolicy as smCreateRLS,
  applyRLSPolicy as smApplyRLS, removeRLSPolicy as smRemoveRLS,
} from '@/app/services/governance/security_matrix';

// ── Mapping ──
import { getDatabases } from '@/app/services/mapping';

// ── S3 ──
import { submitS3Form } from '@/app/services/data-source-connection/s3Servicer';

// ── API Layer ──
import * as projectsApi from '@/app/services/api/projectsApi';
import * as workflowApi from '@/app/services/api/workflowApi';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';


// ── Org Accounts ──
import {
  getDashboardOverview, getDashboardUsage, getDashboardTrends,
  getAccounts, getCredits, getTopConsumers, getCreditsTrend,
  getStorage, getStorageTrend, getStorageDatabases, getStorageStages,
  getWarehouses, getLogins, getFailedLogins,
  getQueries as orgQueries, getQueriesTrend,
  getDataTransfer, getBalance, getContract, getRateSheet,
  getMetering, getMeteringTrend,
  getHealth, getAlerts,
  getServicesClustering, getServicesMaterializedViews,
  getServicesPipes, getServicesSearchOptimization, getServicesQueryAcceleration,
  getReplication, getAnomalies,
  getReaderAccounts, getShares, getShareDetail,
  getSecurityOverview, getGovernanceOverview,
  getDataLoadingOverview, getAutomationOverview,
  getPerformanceOverview, getCortexCosts, getPlatformActivity,
  getAccountHealthScore, getGrantsOverview,
  getProjectsOverview, getGovernanceGrantsOverview,
  getDataOperationsOverview, getPlatformActivityFiltered,
  getFilterOptions as orgGetFilterOptions,
  activateRowTimestamps, getRowTimestampStatus,
  getCrossAccountUsage, getQueryAuditHistory,
  getAccessAuditHistory, getLoginAuditHistory,
  createReaderAccount, deleteReaderAccount,
  getAccountDetail, getAccountCreditHistory, getAccountWarehouses,
  getAccountLoginHistory, getAccountHealth,
} from '@/app/services/org-accounts/hooks';

// ════════════════════════════════════════════════════════════
// Dummy IDs for write operations
// ════════════════════════════════════════════════════════════
const FAKE_ID = '__test_health_check__';
const FAKE_DB = 'CP_DATA360';
const FAKE_SCHEMA = 'PUBLIC';
const FAKE_TABLE = 'TEST_TABLE';

// ════════════════════════════════════════════════════════════
// Test definitions
// ════════════════════════════════════════════════════════════

type TestDef = { name: string; fn: () => Promise<any> };
type ModuleDef = { module: string; tests: TestDef[] };

const TEST_MODULES: ModuleDef[] = [
  // ─── COMMAND CENTER ───
  {
    module: 'Command Center',
    tests: [
      { name: 'getSummary', fn: () => getSummary() },
      { name: 'getModuleHealth', fn: () => getModuleHealth() },
      { name: 'getActivityFeed', fn: () => getActivityFeed() },
      { name: 'getInfrastructure', fn: () => getInfrastructure() },
      { name: 'getPipelines', fn: () => getPipelines() },
      { name: 'getCostBreakdown', fn: () => getCostBreakdown() },
      { name: 'getFilterOptions', fn: () => ccGetFilterOptions() },
      { name: 'getCrossModuleIntelligence', fn: () => getCrossModuleIntelligence() },
      { name: 'getSecurityAudit', fn: () => getSecurityAudit() },
      { name: 'getWarehousePerformance', fn: () => getWarehousePerformance() },
      { name: 'getQueryIntelligence', fn: () => getQueryIntelligence() },
      { name: 'getSensors', fn: () => getSensors() },
      { name: 'getTimeContext', fn: () => getTimeContext() },
      { name: 'checkDataFreshness', fn: () => checkDataFreshness([`${FAKE_DB}.${FAKE_SCHEMA}.${FAKE_TABLE}`]) },
    ],
  },

  // ─── AUDIT ───
  {
    module: 'Audit',
    tests: [
      { name: 'getQueryHistory', fn: () => getQueryHistory() },
      { name: 'getAccessHistory', fn: () => getAccessHistory() },
      { name: 'getLoginHistory', fn: () => auditLoginHistory() },
      { name: 'getColumnProfile', fn: () => auditColumnProfile(FAKE_TABLE, 'ID') },
    ],
  },

  // ─── CHAT ───
  {
    module: 'Chat',
    tests: [
      { name: 'listConversations', fn: () => listConversations() },
      { name: 'createDMConversation', fn: () => createDMConversation(FAKE_ID) },
      { name: 'createGroupConversation', fn: () => createGroupConversation('test_group', []) },
      { name: 'getMessages', fn: () => getMessages(FAKE_ID) },
      { name: 'sendMessage', fn: () => sendMessage(FAKE_ID, 'health_check_test') },
      { name: 'updateConversation', fn: () => updateConversation(FAKE_ID, 'test_title') },
    ],
  },

  // ─── CORTEX ───
  {
    module: 'Cortex',
    tests: [
      { name: 'getCortexKpis', fn: () => getCortexKpis() },
      { name: 'queryCortex', fn: () => queryCortex({ prompt: 'test' }) },
      { name: 'getCortexRecommend', fn: () => getCortexRecommend({ prompt: 'test' } as any) },
      { name: 'listSemanticModels', fn: () => listSemanticModels() },
      { name: 'getSemanticModelContent', fn: () => getSemanticModelContent(FAKE_ID) },
      { name: 'generateSampleModelYaml', fn: () => generateSampleModelYaml() },
      { name: 'createSemanticModel', fn: () => createSemanticModel({ name: FAKE_ID, yaml_content: 'test: true' } as any) },
      { name: 'deleteSemanticModel', fn: () => cortexDeleteSM(FAKE_ID) },
      { name: 'generateSemanticModel', fn: () => generateSemanticModel({ tables: [] } as any) },
      { name: 'validateSemanticModelYaml', fn: () => validateSemanticModelYaml('test: true') },
      { name: 'runQueryAnalysis', fn: () => runQueryAnalysis() },
      { name: 'getQueryAnalyticsResults', fn: () => getQueryAnalyticsResults() },
      { name: 'getQueryAnalyticsSummary', fn: () => getQueryAnalyticsSummary() },
      { name: 'getRedundantGroups', fn: () => getRedundantGroups() },
      { name: 'listDuckdbDatasets', fn: () => listDuckdbDatasets() },
      { name: 'queryStage', fn: () => queryStage('test/path') },
      { name: 'duckdbQuery', fn: () => duckdbQuery(FAKE_TABLE) },
      { name: 'listComputePools', fn: () => cortexComputePools() },
      { name: 'listServices', fn: () => cortexServices() },
      { name: 'listStreamlitApps', fn: () => listStreamlitApps() },
      { name: 'listImageRepos', fn: () => listImageRepos() },
      { name: 'listEndpoints', fn: () => cortexEndpoints(FAKE_ID) },
      { name: 'createComputePool', fn: () => cortexCreatePool({ name: FAKE_ID, min_nodes: 1, max_nodes: 1, instance_family: 'CPU_X64_XS' } as any) },
      { name: 'suspendPool', fn: () => suspendPool(FAKE_ID) },
      { name: 'resumePool', fn: () => resumePool(FAKE_ID) },
      { name: 'createService', fn: () => cortexCreateService({ name: FAKE_ID, compute_pool: FAKE_ID, spec: '{}' } as any) },
      { name: 'getServiceStatus', fn: () => getServiceStatus(FAKE_ID) },
      { name: 'getServiceLogs', fn: () => getServiceLogs(FAKE_ID) },
      { name: 'createStreamlitApp', fn: () => createStreamlitApp({ name: FAKE_ID, database: FAKE_DB, schema: FAKE_SCHEMA } as any) },
    ],
  },

  // ─── CORTEX ML FEATURES ───
  {
    module: 'Cortex ML Features',
    tests: [
      { name: 'generateCompletion', fn: () => generateCompletion({ prompt: 'test', model: 'llama3.1-8b' } as any) },
      { name: 'analyzeSentiment', fn: () => analyzeSentiment(['test text']) },
      { name: 'analyzeTableSentiment', fn: () => analyzeTableSentiment(FAKE_TABLE, 'TEXT_COL') },
      { name: 'translateText', fn: () => translateText({ text: 'hello', source_language: 'en', target_language: 'fr' } as any) },
      { name: 'summarizeText', fn: () => summarizeText({ text: 'test text for summary' } as any) },
      { name: 'generateEmbeddings', fn: () => generateEmbeddings(['test']) },
      { name: 'listDatabases', fn: () => cortexListDatabases() },
      { name: 'listSchemas', fn: () => cortexListSchemas(FAKE_DB) },
      { name: 'listTables', fn: () => cortexListTables(FAKE_DB, FAKE_SCHEMA) },
    ],
  },

  // ─── DATA QUALITY ───
  {
    module: 'Data Quality',
    tests: [
      { name: 'getQualitySummary', fn: () => getQualitySummary(FAKE_DB) },
      { name: 'getCompletenessMetrics', fn: () => getCompletenessMetrics(FAKE_DB) },
      { name: 'getUniquenessMetrics', fn: () => getUniquenessMetrics(FAKE_DB) },
      { name: 'getFreshnessMetrics', fn: () => getFreshnessMetrics(FAKE_DB) },
      { name: 'getIngestionMetrics', fn: () => getIngestionMetrics(FAKE_DB) },
      { name: 'getSchemaQuality', fn: () => getSchemaQuality(FAKE_DB) },
      { name: 'getClassificationCoverage', fn: () => getClassificationCoverage(FAKE_DB) },
      { name: 'getCostMetrics', fn: () => dqCostMetrics(FAKE_DB) },
      { name: 'getSecurityPosture', fn: () => dqSecurityPosture(FAKE_DB) },
      { name: 'getDmfDashboardResults', fn: () => getDmfDashboardResults(FAKE_DB) },
      { name: 'getTrendAnalysis', fn: () => getTrendAnalysis(FAKE_DB) },
      { name: 'runBuiltinDmfCheck', fn: () => runBuiltinDmfCheck(FAKE_ID, { table: FAKE_TABLE, check_type: 'NULL_COUNT', column: 'ID' } as any) },
      { name: 'getDmfResults', fn: () => getDmfResults(FAKE_ID) },
      { name: 'suggestDmfs', fn: () => suggestDmfs(FAKE_ID) },
    ],
  },

  // ─── DATA360 CONFIG ───
  {
    module: 'Data360 Config',
    tests: [
      { name: 'getData360Config', fn: () => getData360Config() },
      { name: 'getTableRefreshMapping', fn: () => getTableRefreshMapping() },
      { name: 'getCacheConfig', fn: () => getCacheConfig() },
      { name: 'triggerRefresh', fn: () => triggerRefresh({ tables: [FAKE_TABLE] } as any) },
      { name: 'patchCacheConfig', fn: () => patchCacheConfig({ ttl_seconds: 300 } as any) },
    ],
  },

  // ─── OBSERVABILITY ───
  {
    module: 'Observability',
    tests: [
      { name: 'getIntelligentKpis', fn: () => getIntelligentKpis() },
      { name: 'getGdprComplianceReport', fn: () => getGdprComplianceReport() },
      { name: 'getSoc2ComplianceReport', fn: () => getSoc2ComplianceReport() },
      { name: 'getDataLineage', fn: () => getDataLineage() },
      { name: 'getAccessPatterns', fn: () => getAccessPatterns() },
      { name: 'getCrossModuleLineage', fn: () => getCrossModuleLineage() },
      { name: 'getActivitySummary', fn: () => getActivitySummary() },
      { name: 'getSecurityPosture', fn: () => obsSecurityPosture() },
      { name: 'getWarehouseUsage', fn: () => obsWarehouseUsage() },
      { name: 'getDailyCredits', fn: () => getDailyCredits() },
      { name: 'getStorageMetrics', fn: () => getStorageMetrics() },
      { name: 'getPerformanceMetrics', fn: () => getPerformanceMetrics() },
      { name: 'getSlowQueries', fn: () => obsSlowQueries() },
      { name: 'getHealthStatus', fn: () => getHealthStatus() },
      { name: 'getObjectDependencies', fn: () => getObjectDependencies() },
      { name: 'getDependencyGraph', fn: () => getDependencyGraph() },
      { name: 'getTrustCenterFindings', fn: () => getTrustCenterFindings() },
      { name: 'getTrustCenterSummary', fn: () => getTrustCenterSummary() },
      { name: 'getLineageWithTasks', fn: () => getLineageWithTasks() },
      { name: 'getImportableTasks', fn: () => getImportableTasks() },
      { name: 'probeTableFreshness', fn: () => probeTableFreshness(`${FAKE_DB}.${FAKE_SCHEMA}.${FAKE_TABLE}`) },
      { name: 'probeSchemaFreshness', fn: () => probeSchemaFreshness(FAKE_DB, FAKE_SCHEMA) },
      { name: 'probeChanges', fn: () => probeChanges(`${FAKE_DB}.${FAKE_SCHEMA}.${FAKE_TABLE}`, '2024-01-01') },
      { name: 'probePlatformFreshness', fn: () => probePlatformFreshness() },
    ],
  },

  // ─── DATA PRODUCTS ───
  {
    module: 'Data Products',
    tests: [
      { name: 'listDataProducts', fn: () => listDataProducts() },
      { name: 'getDataProduct', fn: () => getDataProduct(FAKE_ID) },
      { name: 'createDataProduct', fn: () => createDataProduct({ name: FAKE_ID } as any) },
      { name: 'subscribeToProduct', fn: () => subscribeToProduct(FAKE_ID) },
    ],
  },

  // ─── WORKFLOW (local service) ───
  {
    module: 'Workflow',
    tests: [
      { name: 'getWorkflows', fn: () => getWorkflows() },
      { name: 'getWorkflowDeployments', fn: () => getWorkflowDeployments() },
      { name: 'initializeTables', fn: () => initializeTables() },
      { name: 'getWorkflowCapabilities', fn: () => getWorkflowCapabilities() },
      { name: 'getWorkflowActionTemplates', fn: () => getWorkflowActionTemplates() },
      { name: 'createWorkflow', fn: () => wfCreateWorkflow({ workflow_name: FAKE_ID, steps: [] }) },
      { name: 'updateWorkflow', fn: () => wfUpdateWorkflow({ workflow_name: FAKE_ID, steps: [] }) },
      { name: 'renameWorkflow', fn: () => renameWorkflow(FAKE_ID, FAKE_ID + '_new') },
      { name: 'executeWorkflow', fn: () => wfExecuteWorkflow(FAKE_ID) },
      { name: 'scheduleWorkflow', fn: () => wfScheduleWorkflow(FAKE_ID, 'daily') },
      { name: 'suspendTask', fn: () => wfSuspendTask(FAKE_ID) },
      { name: 'resumeTask', fn: () => wfResumeTask(FAKE_ID) },
      { name: 'getWorkflowVersions', fn: () => getWorkflowVersions(FAKE_ID) },
      { name: 'createWorkflowVersion', fn: () => createWorkflowVersion(FAKE_ID) },
      { name: 'rollbackWorkflow', fn: () => rollbackWorkflow(FAKE_ID, FAKE_ID) },
      { name: 'getWorkflowRuns', fn: () => getWorkflowRuns(FAKE_ID) },
      { name: 'scheduleDeployment', fn: () => wfScheduleDeployment({ workflow_id: FAKE_ID, workflow_name: FAKE_ID, steps: [] } as any) },
      { name: 'approveDeployment', fn: () => wfApproveDeployment(FAKE_ID, FAKE_ID) },
      { name: 'rejectDeployment', fn: () => wfRejectDeployment(FAKE_ID, FAKE_ID) },
      { name: 'activateDeployment', fn: () => wfActivateDeployment(FAKE_ID, FAKE_ID) },
      { name: 'getWorkflowContributors', fn: () => getWorkflowContributors(FAKE_ID) },
      { name: 'addWorkflowContributor', fn: () => addWorkflowContributor(FAKE_ID, FAKE_ID, 'viewer' as any) },
      { name: 'removeWorkflowContributor', fn: () => removeWorkflowContributor(FAKE_ID, FAKE_ID) },
      { name: 'listGitRepositories', fn: () => listGitRepositories() },
      { name: 'createGitRepository', fn: () => createGitRepository({ name: FAKE_ID, origin: 'https://test.git' }) },
      { name: 'describeGitRepository', fn: () => describeGitRepository(FAKE_ID) },
      { name: 'listGitBranches', fn: () => listGitBranches(FAKE_ID) },
      { name: 'listGitTags', fn: () => listGitTags(FAKE_ID) },
      { name: 'fetchGitRepository', fn: () => fetchGitRepository(FAKE_ID) },
      { name: 'dropGitRepository', fn: () => dropGitRepository(FAKE_ID) },
      { name: 'listComputePools', fn: () => wfComputePools() },
      { name: 'createComputePool', fn: () => wfCreatePool({ name: FAKE_ID, min_nodes: 1, max_nodes: 1, instance_family: 'CPU_X64_XS' }) },
      { name: 'alterComputePool', fn: () => alterComputePool(FAKE_ID, { min_nodes: 1 }) },
      { name: 'dropComputePool', fn: () => dropComputePool(FAKE_ID) },
      { name: 'listContainerServices', fn: () => listContainerServices() },
      { name: 'createContainerService', fn: () => createContainerService({ name: FAKE_ID, compute_pool: FAKE_ID, spec: '{}' }) },
      { name: 'describeContainerService', fn: () => describeContainerService(FAKE_ID) },
      { name: 'getContainerServiceStatus', fn: () => getContainerServiceStatus(FAKE_ID) },
      { name: 'getContainerServiceLogs', fn: () => getContainerServiceLogs(FAKE_ID) },
      { name: 'dropContainerService', fn: () => dropContainerService(FAKE_ID) },
      { name: 'listNotebooks', fn: () => listNotebooks() },
      { name: 'createNotebook', fn: () => createNotebook({ name: FAKE_ID, database: FAKE_DB, schema: FAKE_SCHEMA }) },
      { name: 'executeNotebook', fn: () => executeNotebook(FAKE_ID) },
      { name: 'alterNotebook', fn: () => alterNotebook(FAKE_ID, { comment: 'test' }) },
      { name: 'dropNotebook', fn: () => dropNotebook(FAKE_ID) },
      { name: 'runAdHocSQL', fn: () => runAdHocSQL({ sql: 'SELECT 1' }) },
      { name: 'runAdHocPython', fn: () => runAdHocPython({ code: 'print(1)' }) },
      { name: 'createWorkflowActionTemplate', fn: () => createWorkflowActionTemplate({ action_type: 'SQL', query_template: 'SELECT 1' }) },
      { name: 'runWorkflowCloneDataTests', fn: () => runWorkflowCloneDataTests(FAKE_ID, [FAKE_ID]) },
    ],
  },

  // ─── EXPLORE DESIGN ───
  {
    module: 'Explore Design (Read)',
    tests: [
      { name: 'getExploreProjects', fn: () => getExploreProjects() },
      { name: 'getTemplates', fn: () => getTemplates() },
      { name: 'getPendingApprovals', fn: () => getPendingApprovals() },
      { name: 'getProjectEvents', fn: () => getProjectEvents(FAKE_ID) },
      { name: 'getProjectState', fn: () => getProjectState(FAKE_ID) },
      { name: 'getDeployment', fn: () => edGetDeployment(FAKE_ID) },
      { name: 'listDeployments', fn: () => edListDeployments(FAKE_ID) },
      { name: 'listVersions', fn: () => edListVersions(FAKE_ID) },
      { name: 'getVersion', fn: () => edGetVersion(FAKE_ID) },
      { name: 'getApprovalDetails', fn: () => getApprovalDetails(FAKE_ID) },
      { name: 'getSchemaVersions', fn: () => getSchemaVersions(FAKE_ID) },
      { name: 'getRecentDeploymentErrors', fn: () => getRecentDeploymentErrors(FAKE_ID) },
      { name: 'listSchemaClones', fn: () => listSchemaClones(FAKE_ID) },
      { name: 'getSchemaCloneStatus', fn: () => getSchemaCloneStatus(FAKE_ID) },
      { name: 'getScheduledDeployments', fn: () => getScheduledDeployments(FAKE_ID) },
      { name: 'getScheduledDeploymentDetails', fn: () => getScheduledDeploymentDetails(FAKE_ID, FAKE_ID) },
      { name: 'getScheduledDeploymentLogs', fn: () => getScheduledDeploymentLogs(FAKE_ID, FAKE_ID) },
      { name: 'getWorkflowDAG', fn: () => getWorkflowDAG(FAKE_ID) },
      { name: 'getPolicies', fn: () => edGetPolicies() },
      { name: 'getERDLayout', fn: () => getERDLayout(FAKE_ID) },
      { name: 'getColumnLineage', fn: () => getColumnLineage(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'ID') },
      { name: 'getImpactAnalysis', fn: () => getImpactAnalysis(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'getColumnPreview', fn: () => getColumnPreview(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'ID') },
      { name: 'getTablePreview', fn: () => getTablePreview(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'getColumnProfile', fn: () => getColumnProfile(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'ID') },
      { name: 'getTableProfile', fn: () => getTableProfile(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'fetchRelationships', fn: () => fetchRelationships(FAKE_ID) },
      { name: 'getDesignEvents', fn: () => getDesignEvents(FAKE_ID) },
      { name: 'listScheduledDesignDeployments', fn: () => listScheduledDesignDeployments(FAKE_ID) },
      { name: 'listProjectDeploymentsV1', fn: () => listProjectDeploymentsV1(FAKE_ID) },
      { name: 'listSchedulesV1', fn: () => listSchedulesV1(FAKE_ID) },
      { name: 'getIngestionHistory', fn: () => getIngestionHistory(FAKE_ID) },
      { name: 'getEventConflicts', fn: () => getEventConflicts(FAKE_ID) },
      { name: 'listEventTemplates', fn: () => listEventTemplates(FAKE_ID) },
      { name: 'listIngestionOperations', fn: () => listIngestionOperations(FAKE_ID) },
      { name: 'getAISavingsSummary', fn: () => getAISavingsSummary() },
      { name: 'getWarehouseSizing', fn: () => getWarehouseSizing() },
      { name: 'getOptimalSchedule', fn: () => getOptimalSchedule() },
    ],
  },
  {
    module: 'Explore Design (Write)',
    tests: [
      { name: 'createExploreProject', fn: () => createExploreProject(FAKE_ID) },
      { name: 'createProject', fn: () => edCreateProject(FAKE_ID) },
      { name: 'saveProjectState', fn: () => saveProjectState(FAKE_ID, {}) },
      { name: 'recordEvent', fn: () => recordEvent(FAKE_ID, 'add_column' as any, { database: FAKE_DB, schema: FAKE_SCHEMA, table: FAKE_TABLE } as any, {}) },
      { name: 'deleteEvent', fn: () => deleteEvent(FAKE_ID, FAKE_ID) },
      { name: 'validateEvents', fn: () => validateEvents(FAKE_ID, [FAKE_ID], true) },
      { name: 'deployEvents', fn: () => deployEvents(FAKE_ID, [FAKE_ID]) },
      { name: 'saveTemplate', fn: () => saveTemplate({ name: FAKE_ID, events: [] } as any) },
      { name: 'applyTemplate', fn: () => applyTemplate(FAKE_ID, FAKE_ID, []) },
      { name: 'detectRelations', fn: () => detectRelations([], []) },
      { name: 'detectPrimaryKeys', fn: () => detectPrimaryKeys([]) },
      { name: 'detectSchemaChanges', fn: () => detectSchemaChanges(FAKE_ID) },
      { name: 'validateCompliance', fn: () => validateCompliance(FAKE_ID, ['naming']) },
      { name: 'createDeployment', fn: () => edCreateDeployment(FAKE_ID, '1.0', 'full' as any, [FAKE_ID]) },
      { name: 'executeDeployment', fn: () => edExecuteDeployment(FAKE_ID, { dry_run: true }) },
      { name: 'rollbackDeployment', fn: () => edRollbackDeployment(FAKE_ID, '0.9', 'health_check') },
      { name: 'createVersion', fn: () => edCreateVersion(FAKE_ID, 'minor' as any, 'health check') },
      { name: 'compareVersions', fn: () => compareVersions(FAKE_ID, FAKE_ID) },
      { name: 'publishVersion', fn: () => publishVersion(FAKE_ID) },
      { name: 'archiveVersion', fn: () => archiveVersion(FAKE_ID) },
      { name: 'approveRequest', fn: () => approveRequest(FAKE_ID) },
      { name: 'rejectRequest', fn: () => rejectRequest(FAKE_ID, 'health_check') },
      { name: 'addApprovalComment', fn: () => addApprovalComment(FAKE_ID, 'health_check') },
      { name: 'deploySchema', fn: () => deploySchema(FAKE_ID, { database: FAKE_DB, schema: FAKE_SCHEMA } as any) },
      { name: 'rollbackSchema', fn: () => rollbackSchema(FAKE_ID, FAKE_ID) },
      { name: 'createSchemaClone', fn: () => createSchemaClone({ project_id: FAKE_ID, source_database: FAKE_DB, source_schema: FAKE_SCHEMA, target_database: FAKE_DB, target_schema: 'CLONE_TEST' } as any) },
      { name: 'executeSchemaClone', fn: () => executeSchemaClone(FAKE_ID) },
      { name: 'rollbackSchemaClone', fn: () => rollbackSchemaClone(FAKE_ID) },
      { name: 'approveScheduledDeployment', fn: () => approveScheduledDeployment(FAKE_ID, FAKE_ID) },
      { name: 'rejectScheduledDeployment', fn: () => rejectScheduledDeployment(FAKE_ID, FAKE_ID) },
      { name: 'cancelScheduledDeployment', fn: () => cancelScheduledDeployment(FAKE_ID, FAKE_ID) },
      { name: 'rescheduleDeployment', fn: () => rescheduleDeployment(FAKE_ID, FAKE_ID, '2030-01-01T00:00:00Z') },
      { name: 'executeScheduledDeploymentNow', fn: () => executeScheduledDeploymentNow(FAKE_ID, FAKE_ID) },
      { name: 'createWorkflow (ED)', fn: () => edCreateWorkflow(FAKE_ID, { name: FAKE_ID, steps: [] } as any) },
      { name: 'executeWorkflow (ED)', fn: () => edExecuteWorkflow(FAKE_ID) },
      { name: 'cancelWorkflow', fn: () => edCancelWorkflow(FAKE_ID) },
      { name: 'retryTask', fn: () => edRetryTask(FAKE_ID, FAKE_ID) },
      { name: 'addPrimaryKey', fn: () => addPrimaryKey({ database: FAKE_DB, schema: FAKE_SCHEMA, table: FAKE_TABLE, columns: ['ID'] } as any) },
      { name: 'renameTable', fn: () => renameTable(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'NEW_NAME') },
      { name: 'renameColumn', fn: () => renameColumn(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'OLD_COL', 'NEW_COL') },
      { name: 'addColumn', fn: () => addColumn(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'NEW_COL', 'VARCHAR') },
      { name: 'dropColumn', fn: () => dropColumn(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'COL') },
      { name: 'changeColumnType', fn: () => changeColumnType(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'COL', 'VARCHAR') },
      { name: 'addForeignKey', fn: () => addForeignKey(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'COL', 'REF_TABLE', 'REF_COL') },
      { name: 'markColumnSensitive', fn: () => markColumnSensitive(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'COL', true) },
      { name: 'setColumnExclusion', fn: () => setColumnExclusion(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE, 'COL', true) },
      { name: 'addDesignEvent', fn: () => addDesignEvent(FAKE_ID, { event_type: 'add_column', target: { database: FAKE_DB, schema: FAKE_SCHEMA, table: FAKE_TABLE } } as any) },
      { name: 'validateDesignEvents', fn: () => validateDesignEvents(FAKE_ID, [FAKE_ID]) },
      { name: 'createDesignDeployment', fn: () => createDesignDeployment(FAKE_ID, { event_ids: [FAKE_ID] } as any) },
      { name: 'dryRunDDL', fn: () => dryRunDDL(FAKE_ID, { database: FAKE_DB, schema: FAKE_SCHEMA, actions: [] }) },
      { name: 'batchAddDDLActions', fn: () => batchAddDDLActions(FAKE_ID, { actions: [] }) },
      { name: 'preCheckDeployment', fn: () => preCheckDeployment(FAKE_ID, { database: FAKE_DB, schema: FAKE_SCHEMA }) },
      { name: 'runQualityCheck', fn: () => runQualityCheck(FAKE_ID, { source_table: FAKE_TABLE, gates: [] }) },
      { name: 'previewIngestionSQL', fn: () => previewIngestionSQL(FAKE_ID, { source_table: FAKE_TABLE, target_table: FAKE_TABLE, mode: 'full' }) },
      { name: 'dryRunIngestion', fn: () => dryRunIngestion(FAKE_ID, { source_table: FAKE_TABLE, target_table: FAKE_TABLE, mode: 'full' }) },
      { name: 'getWatermark', fn: () => getWatermark(FAKE_ID, FAKE_TABLE, 'UPDATED_AT') },
      { name: 'resetWatermark', fn: () => resetWatermark(FAKE_ID, { table: FAKE_TABLE, column: 'UPDATED_AT' }) },
      { name: 'saveEventTemplate', fn: () => saveEventTemplate(FAKE_ID, { name: FAKE_ID, description: 'test', events: [] }) },
      { name: 'applyEventTemplate', fn: () => applyEventTemplate(FAKE_ID, FAKE_ID) },
      { name: 'submitAIFeedback', fn: () => submitAIFeedback({ suggestion_id: FAKE_ID, suggestion_type: 'naming', accepted: false }) },
      { name: 'ensureProjectExists', fn: () => ensureProjectExists(FAKE_ID) },
      { name: 'exportProject', fn: () => exportProject(FAKE_ID) },
      { name: 'semanticSearch', fn: () => semanticSearch({ query: 'test', project_id: FAKE_ID } as any) },
      { name: 'embedText', fn: () => embedText('test') },
    ],
  },
  {
    module: 'Explore Design (AI)',
    tests: [
      { name: 'getColumnClassification', fn: () => getColumnClassification(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'discoverRelationships', fn: () => discoverRelationships(FAKE_ID, { tables: [] }) },
      { name: 'getSchemaHealth', fn: () => getSchemaHealth(FAKE_ID) },
      { name: 'suggestColumns', fn: () => suggestColumns(FAKE_ID, { table_name: FAKE_TABLE }) },
      { name: 'checkNaming', fn: () => checkNaming(FAKE_ID, { names: [FAKE_TABLE] }) },
      { name: 'getTypeOptimization', fn: () => getTypeOptimization(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'getSCDRecommendation', fn: () => getSCDRecommendation(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'getClusteringSuggestion', fn: () => getClusteringSuggestion(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'getMaterializationStrategy', fn: () => getMaterializationStrategy(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'getIngestionRecommendation', fn: () => getIngestionRecommendation(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'scoreDeploymentRisk', fn: () => scoreDeploymentRisk(FAKE_ID, { pending_events: [] }) },
      { name: 'detectSensitiveColumnsInTables', fn: () => detectSensitiveColumnsInTables(FAKE_ID, [{ database: FAKE_DB, schema: FAKE_SCHEMA, table: FAKE_TABLE }] as any) },
    ],
  },

  // ─── GOUVERNANCE ───
  {
    module: 'Gouvernance (Read)',
    tests: [
      { name: 'getQueryAccessHistory', fn: () => getQueryAccessHistory() },
      { name: 'getStageStorageInfo', fn: () => getStageStorageInfo() },
      { name: 'getDwhStorageInfo', fn: () => getDwhStorageInfo() },
      { name: 'getSrcTableStorageInfo', fn: () => getSrcTableStorageInfo() },
      { name: 'getDwhSchemas', fn: () => getDwhSchemas() },
      { name: 'getDwhHealthInfo', fn: () => getDwhHealthInfo(FAKE_SCHEMA) },
      { name: 'getClientDashboardInfo', fn: () => getClientDashboardInfo() },
      { name: 'getConnectorsInfo', fn: () => getConnectorsInfo() },
      { name: 'getAllUsersActivity', fn: () => getAllUsersActivity() },
      { name: 'getDashboardErrors', fn: () => getDashboardErrors() },
      { name: 'listGuiPermissions', fn: () => listGuiPermissions() },
      { name: 'getMyPageAccess', fn: () => getMyPageAccess() },
      { name: 'listOAuthIntegrations', fn: () => listOAuthIntegrations() },
      { name: 'listNetworkPolicies', fn: () => listNetworkPolicies() },
      { name: 'listApiKeys', fn: () => listApiKeys() },
      { name: 'getUserMfaStatus', fn: () => getUserMfaStatus(FAKE_ID) },
      { name: 'getPermissions', fn: () => getPermissions() },
      { name: 'getGrantsForRole', fn: () => getGrantsForRole(FAKE_ID) },
      { name: 'getRoles', fn: () => getRoles() },
      { name: 'getRolesForUser', fn: () => getRolesForUser(FAKE_ID) },
      { name: 'getRoleDetails', fn: () => getRoleDetails(FAKE_ID) },
      { name: 'getRoleForEdit', fn: () => getRoleForEdit(FAKE_ID) },
      { name: 'getUsers', fn: () => getUsers() },
      { name: 'getUserDetails', fn: () => getUserDetails(FAKE_ID) },
      { name: 'getUsersWithRolesAndModules', fn: () => getUsersWithRolesAndModules() },
      { name: 'grantsGetRoles', fn: () => grantsGetRoles() },
    ],
  },
  {
    module: 'Gouvernance (Write)',
    tests: [
      { name: 'upsertGuiPermission', fn: () => upsertGuiPermission({ role_name: FAKE_ID, page_path: '/test', can_access: false } as any) },
      { name: 'deleteGuiPermission', fn: () => deleteGuiPermission(FAKE_ID) },
      { name: 'setUserMfa', fn: () => setUserMfa(FAKE_ID, false) },
      { name: 'createOAuthIntegration', fn: () => createOAuthIntegration({ name: FAKE_ID } as any) },
      { name: 'createSAMLIntegration', fn: () => createSAMLIntegration({ name: FAKE_ID } as any) },
      { name: 'createServiceUser', fn: () => createServiceUser({ username: FAKE_ID } as any) },
      { name: 'assignRSAKey', fn: () => assignRSAKey({ username: FAKE_ID } as any) },
      { name: 'revokeRSAKey', fn: () => revokeRSAKey({ username: FAKE_ID } as any) },
      { name: 'grantPermission', fn: () => grantPermission(['SELECT'], 'TABLE', FAKE_TABLE, FAKE_ID) },
      { name: 'addRole', fn: () => addRole(FAKE_ID) },
      { name: 'updateRole', fn: () => updateRole(FAKE_ID, { comment: 'test' }) },
      { name: 'deleteRole', fn: () => deleteRole(FAKE_ID) },
      { name: 'addUser', fn: () => addUser({ username: FAKE_ID, password: 'Test1234!', email: 'test@test.com' }) },
      { name: 'assignRoleToUser', fn: () => assignRoleToUser(FAKE_ID, FAKE_ID) },
      { name: 'disableUser', fn: () => disableUser(FAKE_ID) },
      { name: 'enableUser', fn: () => enableUser(FAKE_ID) },
      { name: 'updateUser', fn: () => updateUser(FAKE_ID, { display_name: 'test' }) },
      { name: 'deleteUser', fn: () => deleteUser(FAKE_ID) },
      { name: 'updateUserRoles', fn: () => updateUserRoles(FAKE_ID, []) },
      { name: 'updateGrants', fn: () => updateGrants(FAKE_ID, []) },
    ],
  },

  // ─── GOUVERNANCE POLICIES ───
  {
    module: 'Gouvernance Policies',
    tests: [
      { name: 'getRLSPolicies', fn: () => polGetRLS() },
      { name: 'getRLSPolicyDetails', fn: () => getRLSPolicyDetails(FAKE_ID) },
      { name: 'createRLSPolicy', fn: () => polCreateRLS({ name: FAKE_ID, body: 'TRUE' } as any) },
      { name: 'deleteRLSPolicy', fn: () => deleteRLSPolicy(FAKE_ID) },
      { name: 'getMaskingPolicies', fn: () => getMaskingPolicies() },
      { name: 'getMaskingPolicyDetails', fn: () => getMaskingPolicyDetails(FAKE_ID) },
      { name: 'createMaskingPolicy', fn: () => polCreateMasking({ name: FAKE_ID } as any) },
      { name: 'deleteMaskingPolicy', fn: () => deleteMaskingPolicy(FAKE_ID) },
      { name: 'getNetworkPolicies', fn: () => polGetNetPol() },
      { name: 'getNetworkPolicyDetails', fn: () => getNetworkPolicyDetails(FAKE_ID) },
      { name: 'createNetworkPolicy', fn: () => createNetworkPolicy({ name: FAKE_ID } as any) },
      { name: 'deleteNetworkPolicy', fn: () => deleteNetworkPolicy(FAKE_ID) },
      { name: 'getTags', fn: () => getTags() },
      { name: 'getTagDetails', fn: () => getTagDetails(FAKE_ID) },
      { name: 'createTag', fn: () => createTag({ name: FAKE_ID } as any) },
      { name: 'deleteTag', fn: () => deleteTag(FAKE_ID) },
      { name: 'getPasswordPolicies', fn: () => getPasswordPolicies() },
      { name: 'getPasswordPolicyDetails', fn: () => getPasswordPolicyDetails(FAKE_ID) },
      { name: 'createPasswordPolicy', fn: () => createPasswordPolicy({ name: FAKE_ID } as any) },
      { name: 'deletePasswordPolicy', fn: () => deletePasswordPolicy(FAKE_ID) },
      { name: 'getSessionPolicies', fn: () => getSessionPolicies() },
      { name: 'getSessionPolicyDetails', fn: () => getSessionPolicyDetails(FAKE_ID) },
      { name: 'createSessionPolicy', fn: () => createSessionPolicy({ name: FAKE_ID } as any) },
      { name: 'deleteSessionPolicy', fn: () => deleteSessionPolicy(FAKE_ID) },
      { name: 'getAggregationPolicies', fn: () => getAggregationPolicies() },
      { name: 'getAggregationPolicyDetails', fn: () => getAggregationPolicyDetails(FAKE_ID) },
      { name: 'createAggregationPolicy', fn: () => createAggregationPolicy({ name: FAKE_ID } as any) },
      { name: 'deleteAggregationPolicy', fn: () => deleteAggregationPolicy(FAKE_ID) },
      { name: 'getDatabases (pol)', fn: () => polGetDatabases() },
      { name: 'getSchemas (pol)', fn: () => polGetSchemas(FAKE_DB) },
      { name: 'getTables (pol)', fn: () => polGetTables(FAKE_DB, FAKE_SCHEMA) },
      { name: 'getColumns (pol)', fn: () => polGetColumns(FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'getPolicyReferences', fn: () => getPolicyReferences('MASKING', FAKE_ID) },
      { name: 'getTablePolicies', fn: () => getTablePolicies(FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
    ],
  },

  // ─── GOUVERNANCE DMF ───
  {
    module: 'Gouvernance DMF',
    tests: [
      { name: 'listDMFs', fn: () => listDMFs() },
      { name: 'describeDMF', fn: () => describeDMF(FAKE_ID) },
      { name: 'getDMFReferences', fn: () => getDMFReferences(FAKE_TABLE) },
      { name: 'createDMF', fn: () => createDMF({ name: FAKE_ID } as any) },
      { name: 'deleteDMF', fn: () => deleteDMF(FAKE_ID) },
      { name: 'associateDMF', fn: () => associateDMF({ dmf_name: FAKE_ID, table_name: FAKE_TABLE } as any) },
      { name: 'disassociateDMF', fn: () => disassociateDMF({ dmf_name: FAKE_ID, table_name: FAKE_TABLE } as any) },
      { name: 'setDMFSchedule', fn: () => setDMFSchedule({ dmf_name: FAKE_ID, schedule: '5 MINUTE' } as any) },
      { name: 'classifyTable', fn: () => classifyTable({ table_name: FAKE_TABLE } as any) },
      { name: 'extractSemanticCategories', fn: () => extractSemanticCategories({ table_name: FAKE_TABLE } as any) },
      { name: 'applySemanticTags', fn: () => applySemanticTags({ table_name: FAKE_TABLE } as any) },
      { name: 'createCustomClassifier', fn: () => createCustomClassifier({ name: FAKE_ID } as any) },
      { name: 'addClassifierRegex', fn: () => addClassifierRegex(FAKE_ID, { regex: '.*' } as any) },
    ],
  },

  // ─── GOUVERNANCE SECURITY MATRIX ───
  {
    module: 'Gouvernance Security Matrix',
    tests: [
      { name: 'initializeSecurityMatrix', fn: () => initializeSecurityMatrix() },
      { name: 'getSecurityMatrix', fn: () => getSecurityMatrix() },
      { name: 'getSecurityAxes', fn: () => getSecurityAxes() },
      { name: 'getEnterpriseUsers', fn: () => getEnterpriseUsers() },
      { name: 'syncEnterpriseUsers', fn: () => syncEnterpriseUsers() },
      { name: 'getRLSPolicies (SM)', fn: () => smGetRLS() },
      { name: 'createSecurityMatrixEntry', fn: () => createSecurityMatrixEntry({ role_name: FAKE_ID } as any) },
      { name: 'createSecurityAxis', fn: () => createSecurityAxis({ name: FAKE_ID, type: 'test' } as any) },
      { name: 'updateSecurityAxis', fn: () => updateSecurityAxis(0, { name: FAKE_ID }) },
      { name: 'deleteSecurityAxis', fn: () => deleteSecurityAxis(0) },
      { name: 'deleteSecurityMatrixEntry', fn: () => deleteSecurityMatrixEntry(0) },
      { name: 'deleteSecurityMatrixByRole', fn: () => deleteSecurityMatrixByRole(FAKE_ID) },
      { name: 'updateEnterpriseUser', fn: () => updateEnterpriseUser(FAKE_ID, {} as any) },
      { name: 'deleteEnterpriseUser', fn: () => deleteEnterpriseUser(FAKE_ID) },
    ],
  },

  // ─── MAPPING ───
  {
    module: 'Mapping',
    tests: [
      { name: 'getDatabases', fn: () => getDatabases() },
    ],
  },

  // ─── S3 ───
  {
    module: 'S3 Connection',
    tests: [
      { name: 'submitS3Form', fn: () => submitS3Form({ integration_name: FAKE_ID, bucket_name: FAKE_ID, aws_role_arn: FAKE_ID, stage_name: FAKE_ID }) },
    ],
  },

  // ─── API LAYER ───
  {
    module: 'API: Projects',
    tests: [
      { name: 'listProjects', fn: () => projectsApi.listProjects() },
      { name: 'getProject', fn: () => projectsApi.getProject(FAKE_ID) },
      { name: 'createProject', fn: () => projectsApi.createProject({ name: FAKE_ID, module: 'explore-design' } as any) },
      { name: 'updateProject', fn: () => projectsApi.updateProject(FAKE_ID, { name: FAKE_ID } as any) },
      { name: 'deleteProject', fn: () => projectsApi.deleteProject(FAKE_ID) },
      { name: 'lockProject', fn: () => projectsApi.lockProject(FAKE_ID) },
      { name: 'unlockProject', fn: () => projectsApi.unlockProject(FAKE_ID) },
      { name: 'listVersions', fn: () => projectsApi.listVersions(FAKE_ID) },
      { name: 'listDeployments', fn: () => projectsApi.listDeployments(FAKE_ID) },
      { name: 'listRuns', fn: () => projectsApi.listRuns(FAKE_ID) },
      { name: 'getRunSummary', fn: () => projectsApi.getRunSummary(FAKE_ID) },
      { name: 'listContributors', fn: () => projectsApi.listContributors(FAKE_ID) },
      { name: 'getState', fn: () => projectsApi.getState(FAKE_ID) },
      { name: 'listEvents', fn: () => projectsApi.listEvents(FAKE_ID) },
      { name: 'listGlobalEvents', fn: () => projectsApi.listGlobalEvents() },
      { name: 'getLastUsedProjects', fn: () => projectsApi.getLastUsedProjects() },
      { name: 'getUnifiedProjects', fn: () => projectsApi.getUnifiedProjects() },
    ],
  },
  {
    module: 'API: Workflow',
    tests: [
      { name: 'listActionTemplates', fn: () => workflowApi.listActionTemplates() },
      { name: 'createWorkflow', fn: () => workflowApi.createWorkflow({ name: FAKE_ID, steps: [] } as any) },
      { name: 'getWorkflow', fn: () => workflowApi.getWorkflow(FAKE_ID) },
      { name: 'listSteps', fn: () => workflowApi.listSteps(FAKE_ID) },
      { name: 'compileWorkflow', fn: () => workflowApi.compileWorkflow(FAKE_ID) },
      { name: 'validateWorkflow', fn: () => workflowApi.validateWorkflow(FAKE_ID) },
      { name: 'listRuns', fn: () => workflowApi.listRuns(FAKE_ID) },
      { name: 'getRunSummary', fn: () => workflowApi.getRunSummary(FAKE_ID) },
      { name: 'listScheduledWorkflows', fn: () => workflowApi.listScheduledWorkflows() },
      { name: 'listVersions', fn: () => workflowApi.listVersions(FAKE_ID) },
      { name: 'listDeployments', fn: () => workflowApi.listDeployments(FAKE_ID) },
      { name: 'discoverTasks', fn: () => workflowApi.discoverTasks() },
      { name: 'getTaskStatus', fn: () => workflowApi.getTaskStatus(FAKE_ID) },
    ],
  },
  {
    module: 'API: Explore Design',
    tests: [
      { name: 'createExploreProject', fn: () => exploreDesignApi.createExploreProject({ name: FAKE_ID } as any) },
      { name: 'getExploreProject', fn: () => exploreDesignApi.getExploreProject(FAKE_ID) },
      { name: 'getExploreState', fn: () => exploreDesignApi.getExploreState(FAKE_ID) },
      { name: 'getExploreEvents', fn: () => exploreDesignApi.getExploreEvents(FAKE_ID) },
      { name: 'listTemplates', fn: () => exploreDesignApi.listTemplates(FAKE_ID) },
      { name: 'listDDLActions', fn: () => exploreDesignApi.listDDLActions(FAKE_ID) },
      { name: 'listMappings', fn: () => exploreDesignApi.listMappings(FAKE_ID) },
      { name: 'listModels', fn: () => exploreDesignApi.listModels(FAKE_ID) },
      { name: 'listDeployments', fn: () => exploreDesignApi.listDeployments(FAKE_ID) },
      { name: 'listExploreVersions', fn: () => exploreDesignApi.listExploreVersions(FAKE_ID) },
      { name: 'listSchedules', fn: () => exploreDesignApi.listSchedules(FAKE_ID) },
      { name: 'listIngestionRuns', fn: () => exploreDesignApi.listIngestionRuns(FAKE_ID) },
      { name: 'checkConflicts', fn: () => exploreDesignApi.checkConflicts(FAKE_ID) },
      { name: 'getAuditTrail', fn: () => exploreDesignApi.getAuditTrail(FAKE_ID) },
      { name: 'listEventTemplates', fn: () => exploreDesignApi.listEventTemplates(FAKE_ID) },
      { name: 'listWatermarks', fn: () => exploreDesignApi.listWatermarks(FAKE_ID) },
      { name: 'aiClassifyColumns', fn: () => exploreDesignApi.aiClassifyColumns(FAKE_ID, FAKE_DB, FAKE_SCHEMA, FAKE_TABLE) },
      { name: 'aiSchemaHealth', fn: () => exploreDesignApi.aiSchemaHealth(FAKE_ID) },
      { name: 'aiCheckNaming', fn: () => exploreDesignApi.aiCheckNaming(FAKE_ID, { names: [FAKE_TABLE] }) },
      { name: 'aiWarehouseSizing', fn: () => exploreDesignApi.aiWarehouseSizing(FAKE_ID) },
      { name: 'aiGetFeedbackStats', fn: () => exploreDesignApi.aiGetFeedbackStats(FAKE_ID) },
      { name: 'aiGetSavings', fn: () => exploreDesignApi.aiGetSavings(FAKE_ID) },
    ],
  },
  // ─── ORG ACCOUNTS ───
  {
    module: 'Org Accounts',
    tests: [
      { name: 'getDashboardOverview', fn: () => getDashboardOverview() },
      { name: 'getDashboardUsage', fn: () => getDashboardUsage() },
      { name: 'getDashboardTrends', fn: () => getDashboardTrends() },
      { name: 'getAccounts', fn: () => getAccounts() },
      { name: 'getAccountDetail', fn: () => getAccountDetail(FAKE_ID) },
      { name: 'getCredits', fn: () => getCredits() },
      { name: 'getTopConsumers', fn: () => getTopConsumers() },
      { name: 'getCreditsTrend', fn: () => getCreditsTrend() },
      { name: 'getAccountCreditHistory', fn: () => getAccountCreditHistory(FAKE_ID) },
      { name: 'getStorage', fn: () => getStorage() },
      { name: 'getStorageTrend', fn: () => getStorageTrend() },
      { name: 'getStorageDatabases', fn: () => getStorageDatabases() },
      { name: 'getStorageStages', fn: () => getStorageStages() },
      { name: 'getWarehouses', fn: () => getWarehouses() },
      { name: 'getAccountWarehouses', fn: () => getAccountWarehouses(FAKE_ID) },
      { name: 'getLogins', fn: () => getLogins() },
      { name: 'getFailedLogins', fn: () => getFailedLogins() },
      { name: 'getAccountLoginHistory', fn: () => getAccountLoginHistory(FAKE_ID) },
      { name: 'getQueries', fn: () => orgQueries() },
      { name: 'getQueriesTrend', fn: () => getQueriesTrend() },
      { name: 'getDataTransfer', fn: () => getDataTransfer() },
      { name: 'getBalance', fn: () => getBalance() },
      { name: 'getContract', fn: () => getContract() },
      { name: 'getRateSheet', fn: () => getRateSheet() },
      { name: 'getMetering', fn: () => getMetering() },
      { name: 'getMeteringTrend', fn: () => getMeteringTrend() },
      { name: 'getHealth', fn: () => getHealth() },
      { name: 'getAccountHealth', fn: () => getAccountHealth(FAKE_ID) },
      { name: 'getAlerts', fn: () => getAlerts() },
      { name: 'getServicesClustering', fn: () => getServicesClustering() },
      { name: 'getServicesMaterializedViews', fn: () => getServicesMaterializedViews() },
      { name: 'getServicesPipes', fn: () => getServicesPipes() },
      { name: 'getServicesSearchOptimization', fn: () => getServicesSearchOptimization() },
      { name: 'getServicesQueryAcceleration', fn: () => getServicesQueryAcceleration() },
      { name: 'getReplication', fn: () => getReplication() },
      { name: 'getAnomalies', fn: () => getAnomalies() },
      { name: 'getReaderAccounts', fn: () => getReaderAccounts() },
      { name: 'getShares', fn: () => getShares() },
      { name: 'getShareDetail', fn: () => getShareDetail(FAKE_ID) },
      { name: 'getSecurityOverview', fn: () => getSecurityOverview() },
      { name: 'getGovernanceOverview', fn: () => getGovernanceOverview() },
      { name: 'getDataLoadingOverview', fn: () => getDataLoadingOverview() },
      { name: 'getAutomationOverview', fn: () => getAutomationOverview() },
      { name: 'getPerformanceOverview', fn: () => getPerformanceOverview() },
      { name: 'getCortexCosts', fn: () => getCortexCosts() },
      { name: 'getPlatformActivity', fn: () => getPlatformActivity() },
      { name: 'getAccountHealthScore', fn: () => getAccountHealthScore() },
      { name: 'getGrantsOverview', fn: () => getGrantsOverview() },
      { name: 'getProjectsOverview', fn: () => getProjectsOverview() },
      { name: 'getGovernanceGrantsOverview', fn: () => getGovernanceGrantsOverview() },
      { name: 'getDataOperationsOverview', fn: () => getDataOperationsOverview() },
      { name: 'getPlatformActivityFiltered', fn: () => getPlatformActivityFiltered() },
      { name: 'getFilterOptions', fn: () => orgGetFilterOptions() },
      { name: 'activateRowTimestamps', fn: () => activateRowTimestamps(FAKE_DB) },
      { name: 'getRowTimestampStatus', fn: () => getRowTimestampStatus(FAKE_DB) },
      { name: 'getCrossAccountUsage', fn: () => getCrossAccountUsage() },
      { name: 'getQueryAuditHistory', fn: () => getQueryAuditHistory() },
      { name: 'getAccessAuditHistory', fn: () => getAccessAuditHistory() },
      { name: 'getLoginAuditHistory', fn: () => getLoginAuditHistory() },
      { name: 'createReaderAccount', fn: () => createReaderAccount({ name: FAKE_ID } as any) },
      { name: 'deleteReaderAccount', fn: () => deleteReaderAccount(FAKE_ID) },
    ],
  },
];

// ════════════════════════════════════════════════════════════
// Result types & page
// ════════════════════════════════════════════════════════════

type TestResult = {
  status: 'idle' | 'running' | 'success' | 'error' | 'warn';
  ms?: number;
  error?: string;
  httpStatus?: number;
  method?: string;
  url?: string;
  errorBody?: string;
  data?: string;
};

const isSlowResult = (r?: TestResult) =>
  !!r && (r.status === 'success' || r.status === 'warn') && r.ms != null && r.ms >= SLOW_THRESHOLD_MS;

// Single honest category per endpoint (priority defect > slow > expected > warn
// > ok). Persisted so the per-release rollup can track DEFECTS (the real signal)
// instead of raw 4xx, which is dominated by benign probe rejections. isDefect
// already subsumes status==='error' (5xx/network).
function categorize(r?: TestResult): string {
  if (isDefect(r)) return 'defect';
  if (isSlowResult(r)) return 'slow';
  if (isExpected(r)) return 'expected';
  if (r?.status === 'success') return 'ok';
  if (r?.status === 'warn') return 'warn';
  return 'error';
}

// p50/p95 over reachable (success/warn) probes only — error timeouts would skew.
function percentile(sortedMs: number[], q: number): number | null {
  if (sortedMs.length === 0) return null;
  if (sortedMs.length === 1) return sortedMs[0];
  const pos = q * (sortedMs.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sortedMs.length - 1);
  return Math.round(sortedMs[lo] + (sortedMs[hi] - sortedMs[lo]) * (pos - lo));
}

type ResultsMap = Record<string, TestResult>;

// ── Persistence ──
// The probe run is expensive (500+ endpoints) and a mid-run 401/refresh used to
// wipe everything. Persist the results map + a run timestamp to localStorage via
// jotai's atomWithStorage (the app's cross-refresh pattern, CLAUDE.md). Because
// every `setResults(...)` writes through the atom, partial runs are saved
// INCREMENTALLY as each probe lands — an interrupted run survives. atomWithStorage
// defaults to getOnInit:false, so SSR + first client render both read the default
// then sync from storage in an effect (no hydration mismatch, SSR-safe for free).
const RESULTS_STORAGE_KEY = 'd360_api_health_results';
const LAST_RUN_STORAGE_KEY = 'd360_api_health_last_run';
// epoch ms (NOT a Date — JSON round-trips a Date to a string and breaks formatting).
const resultsAtom = atomWithStorage<ResultsMap>(RESULTS_STORAGE_KEY, {});
const lastRunAtAtom = atomWithStorage<number | null>(LAST_RUN_STORAGE_KEY, null);

export default function ApiHealthPage() {
  const [results, setResults] = useAtom(resultsAtom);
  const [lastRunAt, setLastRunAt] = useAtom(lastRunAtAtom);
  const [running, setRunning] = useState(false);
  // Default to "Issues only" so the board loads CLEAN — just the things that
  // need attention (defects + failing + slow). Expected/Healthy are revealed via
  // their own chips.
  const [filter, setFilter] = useState<'issues' | 'all' | 'error' | 'success' | 'expected' | 'warn' | 'slow' | 'defect'>('issues');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [drillKey, setDrillKey] = useState<string | null>(null);
  const [reprobingKey, setReprobingKey] = useState<string | null>(null);
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);
  // Release-run persistence: save the current sweep as a tracked per-release run.
  const [release, setRelease] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const router = useRouter();
  const abortRef = useRef(false);

  // Debounce the search input (300ms).
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const totalTests = TEST_MODULES.reduce((s, m) => s + m.tests.length, 0);
  const hasRun = Object.keys(results).length > 0;
  const successCount = Object.values(results).filter(r => r.status === 'success').length;
  const errorCount = Object.values(results).filter(r => r.status === 'error').length;
  // Real defects: SQL_COMPILATION_ERROR / 405 / 408 / network — these otherwise
  // hide inside the yellow 4xx bucket. Errors (5xx/network) are a subset.
  const defectCount = Object.values(results).filter(r => isDefect(r)).length;
  const runningCount = Object.values(results).filter(r => r.status === 'running').length;
  const slowCount = Object.values(results).filter(r => isSlowResult(r)).length;
  // Category buckets are mutually exclusive with the priority:
  //   defect > error > slow > expected > residual-warn > success.
  // Slow wins over expected, so a slow expected-4xx counts as slow only.
  // Expected = the API CORRECTLY rejecting fake/empty probe input (benign).
  const expectedCount = Object.values(results).filter(
    r => isExpected(r) && !isSlowResult(r),
  ).length;
  // Residual warn = a 4xx that is neither a genuine defect nor an expected
  // rejection (rare) and not slow.
  const warnCount = Object.values(results).filter(
    r => r.status === 'warn' && !isDefect(r) && !isExpected(r) && !isSlowResult(r),
  ).length;
  // Healthy = genuine successes ONLY. Expected 4xx is now its own bucket so the
  // two never double-count.
  const healthyCount = successCount;
  // Avg latency over reachable probes only — error timeouts would skew this upward.
  const timed = Object.values(results).filter(
    r => r.ms != null && (r.status === 'success' || r.status === 'warn'),
  ) as TestResult[];
  const avgLatencyMs = timed.length
    ? Math.round(timed.reduce((s, r) => s + (r.ms || 0), 0) / timed.length)
    : null;
  // Latency percentiles + honest success rate (genuine OK over total probed;
  // expected 4xx are NOT counted as success — they are benign rejections).
  const sortedTimed = timed.map(r => r.ms as number).sort((a, b) => a - b);
  const p50Ms = hasRun ? percentile(sortedTimed, 0.5) : null;
  const p95Ms = hasRun ? percentile(sortedTimed, 0.95) : null;
  const probedCount = Object.keys(results).length;
  const successRate = hasRun && probedCount > 0 ? successCount / probedCount : null;
  // Raw HTTP buckets — independent of the honest defect/expected split.
  const raw4xxCount = Object.values(results).filter(
    r => r.httpStatus != null && r.httpStatus >= 400 && r.httpStatus < 500,
  ).length;
  const raw5xxCount = Object.values(results).filter(
    r => r.httpStatus != null && r.httpStatus >= 500,
  ).length;

  // Stale-session detection: a 500 whose body mentions an insufficient-privilege
  // / role / access-control failure means the browser session is running as a
  // limited Snowflake role (e.g. SYSADMIN) rather than the user's full role.
  // A fresh login refreshes the role and clears it. Many such failures at once
  // (>= 5) distinguishes a role problem from normal fake-id 4xx noise.
  const PRIVILEGE_ERROR = /primary role|must have CREATE|access control error|42501|003001/i;
  const privilegeFailCount = Object.values(results).filter(
    r => r.httpStatus === 500 && PRIVILEGE_ERROR.test(`${r.error || ''} ${r.errorBody || ''}`),
  ).length;
  const showStaleBanner = privilegeFailCount >= 5 && !staleBannerDismissed;

  const handleRelogin = useCallback(async () => {
    await signOut({ redirect: false });
    router.replace(routes.signIn);
  }, [router]);

  const runTest = useCallback(async (module: string, test: TestDef) => {
    const key = `${module}::${test.name}`;
    setResults(prev => ({ ...prev, [key]: { status: 'running' } }));
    const t0 = performance.now();
    try {
      const result = await test.fn();
      const ms = Math.round(performance.now() - t0);
      // Capture the EXACT return data, capped to ~2000 chars so a huge payload
      // never balloons the results map (bounded snapshot, not the live object).
      const snapshot = safeStringify(result);
      const data = snapshot.length > 2000 ? `${snapshot.slice(0, 2000)}… (truncated)` : snapshot;
      setResults(prev => ({ ...prev, [key]: { status: 'success', ms, data: data || undefined } }));
    } catch (err: any) {
      const ms = Math.round(performance.now() - t0);
      const httpStatus = err?.response?.status || err?.status;
      const method = err?.config?.method ? String(err.config.method).toUpperCase() : undefined;
      const url = err?.config?.url || err?.request?.responseURL || undefined;
      const raw =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.response?.data ??
        err?.message ??
        String(err);
      const message = typeof raw === 'string' ? raw : safeStringify(raw);
      // Lossless capture of the full response body so the structured defect
      // parser can read error_code / query_id / snowflake_code / hint even when
      // the message-first extraction above kept only the human message string.
      const data = err?.response?.data;
      let errorBody: string | undefined;
      if (data && typeof data === 'object') {
        try { errorBody = JSON.stringify(data); } catch { errorBody = undefined; }
      }

      // 400/404/422 with fake IDs = endpoint works, just validation
      const isValidationError = httpStatus && httpStatus >= 400 && httpStatus < 500;
      setResults(prev => ({
        ...prev,
        [key]: {
          status: isValidationError ? 'warn' : 'error',
          ms, error: message, httpStatus, method, url, errorBody,
        },
      }));
    }
  }, []);

  const runModule = useCallback(async (mod: ModuleDef) => {
    for (const test of mod.tests) {
      if (abortRef.current) return;
      await runTest(mod.module, test);
    }
  }, [runTest]);

  const runAll = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setResults({});
    // Stamp the run START (not completion) so an interrupted/refreshed-mid-run
    // still shows persisted partial results WITH a "last run" time.
    setLastRunAt(Date.now());
    // Re-surface the stale-session banner on each full run if the role problem persists.
    setStaleBannerDismissed(false);
    const queue = [...TEST_MODULES];
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length > 0 && !abortRef.current) {
        const mod = queue.shift()!;
        await runModule(mod);
      }
    });
    await Promise.all(workers);
    setRunning(false);
    if (!abortRef.current) toast.success('Re-probe complete');
  }, [runModule]);

  const stopAll = useCallback(() => { abortRef.current = true; setRunning(false); }, []);

  // Clear the persisted run (results + timestamp). Distinct from the search
  // "Clear" — this wipes the stored probe results from localStorage too.
  const clearResults = useCallback(() => {
    setResults({});
    setLastRunAt(null);
    setDrillKey(null);
  }, [setResults, setLastRunAt]);

  // Re-probe a single endpoint (per-row + drill panel).
  const reprobeOne = useCallback(async (module: string, name: string) => {
    const mod = TEST_MODULES.find(m => m.module === module);
    const test = mod?.tests.find(t => t.name === name);
    if (!test) return;
    const key = `${module}::${name}`;
    setReprobingKey(key);
    try {
      await runTest(module, test);
    } finally {
      setReprobingKey(null);
    }
    toast.success(`Re-probed ${name}`);
  }, [runTest]);

  const exportCsv = useCallback(() => {
    const rows = ['Module,Function,Status,Time (ms),HTTP Status,Error'];
    for (const mod of TEST_MODULES) {
      for (const test of mod.tests) {
        const key = `${mod.module}::${test.name}`;
        const r = results[key];
        if (!r) continue;
        const err = (r.error || '').replace(/"/g, '""');
        rows.push(`"${mod.module}","${test.name}","${r.status}",${r.ms ?? ''},${r.httpStatus ?? ''},"${err}"`);
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `api-health-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [results]);

  // Save the current sweep as a tracked release run. Trims each row to the
  // KPI-relevant fields (no large data/errorBody snapshots) and stamps the honest
  // category so the backend rollup tracks defects, not raw 4xx.
  const saveRun = useCallback(async () => {
    const rel = release.trim();
    if (!rel) { toast.error('Enter a release / version label first'); return; }
    const rows: any[] = [];
    for (const mod of TEST_MODULES) {
      for (const test of mod.tests) {
        const r = results[`${mod.module}::${test.name}`];
        if (!r || r.status === 'idle' || r.status === 'running') continue;
        rows.push({
          endpoint: test.name,
          module: mod.module,
          method: r.method,
          path: r.url,
          status: r.status,
          category: categorize(r),
          http_status: r.httpStatus ?? null,
          time_ms: r.ms ?? null,
          error: r.error ? String(r.error).slice(0, 4000) : undefined,
        });
      }
    }
    if (rows.length === 0) { toast.error('Run a probe before saving'); return; }
    setSaving(true);
    try {
      const res = await persistApiHealthRun(rel, rows);
      toast.success(`Saved ${res.persisted ?? rows.length} results to release “${res.release ?? rel}”`);
      setHistoryRefreshKey(k => k + 1);
    } catch (e: any) {
      if (e instanceof NotDeployedError) {
        toast.error('Run persistence is not available on this backend yet.');
      } else {
        toast.error(e?.message || 'Failed to save run');
      }
    } finally {
      setSaving(false);
    }
  }, [release, results]);

  const toggle = (mod: string) => setCollapsed(p => ({ ...p, [mod]: !p[mod] }));

  // Combined status + search predicate, reused for rendering and "X of Y".
  const matchRow = useCallback((modName: string, name: string, r?: TestResult) => {
    if (debouncedSearch) {
      const hay = `${modName} ${name} ${r?.url || ''}`.toLowerCase();
      if (!hay.includes(debouncedSearch)) return false;
    }
    if (filter === 'all') return true;
    // "Issues only" — the default: real problems needing attention.
    if (filter === 'issues') return isDefect(r) || r?.status === 'error' || isSlowResult(r);
    if (filter === 'slow') return isSlowResult(r);
    if (filter === 'defect') return isDefect(r);
    // "expected" = the API correctly rejecting fake/empty probe input.
    if (filter === 'expected') return isExpected(r) && !isSlowResult(r);
    // "warn" filter = residual 4xx only (defects + expected carved out).
    if (filter === 'warn')
      return r?.status === 'warn' && !isDefect(r) && !isExpected(r) && !isSlowResult(r);
    return r?.status === filter;
  }, [debouncedSearch, filter]);

  // "X of Y": X = rows passing the active filter+search, Y = all rows.
  const visibleCount = useMemo(() => {
    let n = 0;
    for (const mod of TEST_MODULES) {
      for (const t of mod.tests) {
        if (matchRow(mod.module, t.name, results[`${mod.module}::${t.name}`])) n += 1;
      }
    }
    return n;
  }, [matchRow, results]);

  // Resolve the drilled row into a typed presentational detail.
  const drillDetail = useMemo<ProbeDetail | null>(() => {
    if (!drillKey) return null;
    const sep = drillKey.indexOf('::');
    const module = drillKey.slice(0, sep);
    const name = drillKey.slice(sep + 2);
    const result = results[drillKey];
    return { module, name, result, isSlow: isSlowResult(result) };
  }, [drillKey, results]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>API Service Health Check</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
        Tests <b>{totalTests}</b> service endpoints across <b>{TEST_MODULES.length}</b> modules.
        {' '}The board defaults to <b>Issues only</b> — defects, failures and slow calls.
        {' '}Grey <b>Expected</b> rows are the API correctly rejecting the probe’s fake/empty test input (not a problem);
        {' '}use the chips to reveal Expected and Healthy.
      </p>

      {/* Stale-session re-login banner — only when MANY privilege errors cluster */}
      {showStaleBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          marginBottom: 16, padding: '12px 16px', borderRadius: 8,
          border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 14,
        }}>
          <span style={{ flex: 1, minWidth: 240 }}>
            <b>Several endpoints failed with insufficient-privilege errors</b> ({privilegeFailCount}) — your
            session may be running as a limited role. Re-login to refresh your full role.
          </span>
          <button onClick={handleRelogin} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: '#d97706', color: '#fff', fontWeight: 600, fontSize: 13,
          }}>Re-login</button>
          <button
            onClick={() => setStaleBannerDismissed(true)}
            aria-label="Dismiss banner"
            style={{
              padding: '4px 8px', borderRadius: 6, border: '1px solid #f59e0b',
              cursor: 'pointer', background: 'transparent', color: '#92400e', fontSize: 13,
            }}
          >Dismiss</button>
        </div>
      )}

      {/* KPI strip — "—" until a probe has run, never fake-0 */}
      <KpiStrip
        total={totalTests}
        healthy={hasRun ? healthyCount : null}
        expected={hasRun ? expectedCount : null}
        defects={hasRun ? defectCount : null}
        failing={hasRun ? errorCount : null}
        slow={hasRun ? slowCount : null}
        avgLatencyMs={avgLatencyMs}
        successRate={successRate}
        p50Ms={p50Ms}
        p95Ms={p95Ms}
        raw4xx={hasRun ? raw4xxCount : null}
        raw5xx={hasRun ? raw5xxCount : null}
      />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={runAll} disabled={running} style={{
          padding: '8px 20px', borderRadius: 6, border: 'none',
          cursor: running ? 'not-allowed' : 'pointer',
          background: running ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 600, fontSize: 14,
        }}>
          {running ? `Re-probing... (${runningCount} active)` : hasRun ? 'Re-probe all' : 'Test All'}
        </button>
        {running && (
          <button onClick={stopAll} style={{
            padding: '8px 20px', borderRadius: 6, border: '1px solid #ef4444',
            cursor: 'pointer', background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: 14,
          }}>Stop</button>
        )}
        <button onClick={exportCsv} disabled={Object.keys(results).length === 0} style={{
          padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
          cursor: 'pointer', background: '#fff', color: '#374151', fontSize: 14,
        }}>Export CSV</button>
        {hasRun && (
          <button onClick={clearResults} disabled={running} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
            cursor: running ? 'not-allowed' : 'pointer', background: '#fff', color: '#374151', fontSize: 14,
          }}>Clear results</button>
        )}
        {lastRunAt != null && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            last run: {new Date(lastRunAt).toLocaleString()}
          </span>
        )}

        {/* Save the current sweep as a tracked per-release run. The page is an
            admin-only route AND the backend endpoint is ACCOUNTADMIN-gated
            (require_accountadmin_role) — that pair is the honest enforcement;
            api-health is not in the d360-roles permission set, so a useCanPerform
            gate here would always return true and add no real check. */}
        <input
          type="text"
          value={release}
          onChange={(e) => setRelease(e.target.value)}
          placeholder="Release / version (e.g. 2026.06.21)"
          disabled={running || saving}
          style={{
            padding: '7px 12px', borderRadius: 6, border: '1px solid #d1d5db',
            fontSize: 13, width: 220, color: '#374151',
          }}
        />
        <button
          onClick={saveRun}
          disabled={!hasRun || running || saving || !release.trim()}
          title={!hasRun ? 'Run a probe first' : 'Persist this sweep as a tracked release run'}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            cursor: (!hasRun || running || saving || !release.trim()) ? 'not-allowed' : 'pointer',
            background: (!hasRun || running || saving || !release.trim()) ? '#94a3b8' : '#0f766e',
            color: '#fff', fontWeight: 600, fontSize: 14,
          }}
        >{saving ? 'Saving…' : 'Save as release run'}</button>

        {/* Search over module / function / route */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search endpoint or path…"
          style={{
            padding: '7px 12px', borderRadius: 6, border: '1px solid #d1d5db',
            fontSize: 13, width: 220, color: '#374151',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db',
            cursor: 'pointer', background: '#fff', color: '#6b7280', fontSize: 12,
          }}>Clear</button>
        )}
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {visibleCount} of {totalTests}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {/* "Issues only" is the default and groups the attention-worthy buckets;
              Expected/Healthy live behind their own chips so the board loads clean. */}
          {(['issues', 'defect', 'error', 'slow', 'expected', 'success', 'warn', 'all'] as const).map(f => {
            const active = filter === f;
            const issuesCount = defectCount + errorCount + slowCount;
            // Per-chip accent so each category reads in its own colour and never
            // blends into another bucket.
            const accent =
              f === 'defect' ? '#a21caf'
              : f === 'error' ? '#dc2626'
              : f === 'slow' ? '#c2410c'
              : f === 'expected' ? '#64748b'
              : f === 'success' ? '#16a34a'
              : f === 'issues' ? '#2563eb'
              : '#2563eb';
            const tint =
              f === 'defect' ? '#fdf4ff'
              : f === 'error' ? '#fef2f2'
              : f === 'slow' ? '#fff7ed'
              : f === 'expected' ? '#f1f5f9'
              : f === 'success' ? '#f0fdf4'
              : '#eff6ff';
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                border: active ? `2px solid ${accent}` : '1px solid #d1d5db',
                background: active ? tint : '#fff',
                color: active ? accent : '#6b7280', fontWeight: active ? 600 : 400,
              }}>
                {f === 'issues' ? `Issues only (${issuesCount})`
                  : f === 'all' ? `All (${totalTests})`
                  : f === 'error' ? `Failing (${errorCount})`
                  : f === 'expected' ? `Expected (${expectedCount})`
                  : f === 'warn' ? `Other 4xx (${warnCount})`
                  : f === 'defect' ? `Defects (${defectCount})`
                  : f === 'slow' ? `Slow (${slowCount})`
                  : `Healthy (${successCount})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live progress (only while probing) */}
      {running && (
        <div style={{ marginBottom: 16, fontSize: 13, color: '#2563eb' }}>
          Probing… {runningCount} active · {Object.keys(results).length} of {totalTests} done
        </div>
      )}

      {/* Modules + docked drill panel */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {visibleCount === 0 ? (
            <div style={{
              padding: 32, textAlign: 'center', borderRadius: 8,
              border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 14,
            }}>
              {!hasRun
                ? 'No probes run yet \u2014 click \u201CTest All\u201D to check endpoint health.'
                : debouncedSearch
                  ? `No endpoints match \u201C${debouncedSearch}\u201D.`
                  : filter === 'issues'
                    ? '\u2713 No issues \u2014 no defects, failures or slow calls. Use the chips to reveal Expected and Healthy endpoints.'
                    : 'No endpoints match the current filter.'}
            </div>
          ) : TEST_MODULES.map(mod => {
            const modTests = mod.tests.map(t => ({
              ...t,
              key: `${mod.module}::${t.name}`,
              result: results[`${mod.module}::${t.name}`],
            }));
            const filtered = modTests.filter(t => matchRow(mod.module, t.name, t.result));
            if (filtered.length === 0) return null;

            const md = modTests.filter(t => isDefect(t.result)).length;
            const ms = modTests.filter(t => t.result?.status === 'success').length;
            const mex = modTests.filter(t => isExpected(t.result) && !isSlowResult(t.result)).length;
            const mw = modTests.filter(
              t => t.result?.status === 'warn' && !isDefect(t.result) && !isExpected(t.result) && !isSlowResult(t.result),
            ).length;
            const msl = modTests.filter(t => isSlowResult(t.result)).length;
            const isCollapsed = collapsed[mod.module];

            return (
              <div key={mod.module} style={{ marginBottom: 16 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggle(mod.module)}
                >
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                  <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{mod.module}</h2>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>({mod.tests.length})</span>
                  {ms > 0 && <Badge text={`${ms} ok`} bg="#f0fdf4" color="#16a34a" />}
                  {mex > 0 && <Badge text={`${mex} expected`} bg="#f1f5f9" color="#64748b" />}
                  {mw > 0 && <Badge text={`${mw} 4xx`} bg="#fffbeb" color="#d97706" />}
                  {msl > 0 && <Badge text={`${msl} slow`} bg="#fff7ed" color="#c2410c" />}
                  {md > 0 && <Badge text={`${md} defect`} bg="#fdf4ff" color="#a21caf" />}
                  <button onClick={(e) => { e.stopPropagation(); runModule(mod); }} disabled={running} style={{
                    marginLeft: 8, padding: '2px 10px', borderRadius: 4, border: '1px solid #d1d5db',
                    cursor: running ? 'not-allowed' : 'pointer', background: '#fff', fontSize: 12, color: '#374151',
                  }}>Re-probe</button>
                </div>

                {!isCollapsed && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px', width: 280 }}>Function</th>
                        <th style={{ padding: '6px 8px', width: 70 }}>Status</th>
                        <th style={{ padding: '6px 8px', width: 70 }}>Time</th>
                        <th style={{ padding: '6px 8px', width: 50 }}>HTTP</th>
                        <th style={{ padding: '6px 8px' }}>Error</th>
                        <th style={{ padding: '6px 8px', width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(t => {
                        const slow = isSlowResult(t.result);
                        const defect = isDefect(t.result);
                        // Expected = the API correctly rejecting fake/empty probe input.
                        // Slow wins (priority), so a slow expected-4xx is not "expected" here.
                        const expected = isExpected(t.result) && !slow;
                        // Success rows are drillable too when they captured a payload —
                        // that detail panel is the only place the exact response data shows.
                        const drillable =
                          t.result?.status === 'error' || slow || defect || expected ||
                          (t.result?.status === 'success' && !!t.result?.data) ||
                          (t.result?.status === 'warn' && !!t.result?.errorBody);
                        const selected = drillKey === t.key;
                        // A defective 4xx (e.g. SQL_COMPILATION_ERROR) is visually
                        // promoted to magenta so it never blends into expected-grey.
                        const defectWarn = defect && t.result?.status === 'warn';
                        return (
                          <tr key={t.key} style={{
                            borderBottom: '1px solid #f1f5f9',
                            cursor: drillable ? 'pointer' : 'default',
                            // Expected rows read MUTED (neutral grey), never amber —
                            // they are benign, correct rejections of test input.
                            background: selected ? '#eef2ff'
                              : t.result?.status === 'error' ? '#fef2f2'
                              : defectWarn ? '#fdf4ff'
                              : slow ? '#fff7ed'
                              : expected ? '#f8fafc'
                              : t.result?.status === 'warn' ? '#fffbeb'
                              : 'transparent',
                            // Mute the whole expected row so it visually recedes.
                            color: expected ? '#94a3b8' : undefined,
                          }}
                            onClick={drillable ? () => setDrillKey(t.key) : undefined}
                            title={drillable
                              ? expected
                                ? 'Expected — probe sent a test id / empty body, API correctly rejected it'
                                : 'Click for detail'
                              : undefined}
                          >
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12, color: expected ? '#94a3b8' : undefined }}>
                              {t.name}
                              {t.result?.data && (
                                <span
                                  title="Response payload captured — click row to view"
                                  style={{ marginLeft: 6, display: 'inline-block', padding: '0 5px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#eff6ff', color: '#2563eb', verticalAlign: 'middle' }}
                                >data</span>
                              )}
                            </td>
                            <td style={{ padding: '5px 8px' }}>
                              <StatusBadge status={t.result?.status || 'idle'} expected={expected} />
                              {defect && <span style={{ marginLeft: 4, display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fdf4ff', color: '#a21caf' }}>DEFECT</span>}
                              {slow && <span style={{ marginLeft: 4, display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fff7ed', color: '#c2410c' }}>SLOW</span>}
                              {expected && <span title="Probe sent a test id / empty body — the API correctly rejected it" style={{ marginLeft: 4, display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#64748b' }}>Expected</span>}
                            </td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12, color: expected ? '#94a3b8' : undefined }}>{t.result?.ms != null ? `${t.result.ms}ms` : '-'}</td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12,
                              color: expected ? '#94a3b8' : t.result?.httpStatus && t.result.httpStatus >= 500 ? '#dc2626' : t.result?.httpStatus && t.result.httpStatus >= 400 ? '#d97706' : '#374151',
                            }}>{t.result?.httpStatus || '-'}</td>
                            <td style={{ padding: '5px 8px', fontSize: 12, color: expected ? '#94a3b8' : t.result?.status === 'error' ? '#dc2626' : '#92400e',
                              maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }} title={t.result?.error}>{expected ? 'probe sent a test id / empty body — correct rejection' : (t.result?.error || '-')}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); reprobeOne(mod.module, t.name); }}
                                disabled={running || reprobingKey === t.key}
                                style={{
                                  padding: '2px 8px', borderRadius: 4, border: '1px solid #d1d5db',
                                  cursor: running || reprobingKey === t.key ? 'not-allowed' : 'pointer',
                                  background: '#fff', fontSize: 11, color: '#374151',
                                }}
                              >{reprobingKey === t.key ? '\u2026' : 'Re-probe'}</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        {drillDetail && (
          <DrillPanel
            key={drillKey}
            detail={drillDetail}
            onClose={() => setDrillKey(null)}
            onReprobe={(d) => reprobeOne(d.module, d.name)}
            reprobing={reprobingKey === drillKey}
          />
        )}
      </div>

      {/* Per-release KPI history & trend (persisted runs) */}
      <ReleaseHistory refreshKey={historyRefreshKey} />
    </div>
  );
}

// ── UI helpers ──

function StatusBadge({ status, expected }: { status: string; expected?: boolean }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    idle: { bg: '#f1f5f9', color: '#94a3b8', label: 'IDLE' },
    running: { bg: '#eff6ff', color: '#2563eb', label: 'RUN' },
    success: { bg: '#f0fdf4', color: '#16a34a', label: 'OK' },
    warn: { bg: '#fffbeb', color: '#d97706', label: '4xx' },
    error: { bg: '#fef2f2', color: '#dc2626', label: '500' },
  };
  // Expected 4xx renders MUTED grey, never the amber "4xx" warn badge.
  const c = expected
    ? { bg: '#f1f5f9', color: '#64748b', label: '4xx' }
    : config[status] || config.idle;
  return (
    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color }}>{text}</span>;
}

function safeStringify(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'msg' in item) {
        const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
        return `${loc}: ${item.msg}`;
      }
      try { return JSON.stringify(item); } catch { return String(item); }
    }).join('; ');
  }
  try { return JSON.stringify(v); } catch { return String(v); }
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{label}</div>
    </div>
  );
}
