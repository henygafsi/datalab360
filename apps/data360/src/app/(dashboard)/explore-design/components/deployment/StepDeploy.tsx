'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  Rocket, Loader2, CheckCircle2, XCircle, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import {
  sortEventsForDeployment, filterExecutableEvents, generateSnowflakeSQL,
  inferDDLType, extractIngestionConfigs, SCHEMA_EVENT_TYPES,
} from './deployment-utils';
import type { SQLStatement } from './DeploymentContext';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { rollbackVersion, bulkUpdateEvents } from '@/app/services/api/projectsApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type {
  CreateExploreDeploymentRequest,
  ExecuteIngestionResponse,
} from '@/app/services/api/types';
import type { EventType } from '../../stores/event-store';

export default function StepDeploy() {
  const {
    projectId, database, currentUser,
    events, pendingEvents, updateEventStatus,
    config, results, setResults, goNext, goPrev,
    isDeploying, setIsDeploying,
    schemaVersions, setSchemaVersions,
    setCurrentSchemaVersion,
  } = useDeploymentContext();

  const [phase, setPhase] = useState<'ready' | 'schema' | 'ingestion' | 'complete' | 'failed'>('ready');
  const [progress, setProgress] = useState<string[]>([]);

  const addProgress = useCallback((msg: string) => {
    setProgress(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const handleDeploy = useCallback(async () => {
    // Resolve events to deploy
    const validatedEvents = events.filter(e => e.status === 'validated');
    const eventsToDeploy = validatedEvents.length > 0 ? validatedEvents : pendingEvents;
    const columnMappingEvents = events.filter(e => e.type === 'COLUMN_MAPPING_CREATED');

    if (eventsToDeploy.length === 0 && columnMappingEvents.length === 0) {
      toast('No schema changes or column mappings to deploy.', { icon: 'ℹ️' });
      return;
    }

    setIsDeploying(true);
    setPhase('schema');
    setProgress([]);

    const versionNumber = `${config.versionType === 'major' ? '1' : '0'}.${config.versionType === 'minor' ? '1' : '0'}.${config.versionType === 'patch' ? Date.now() % 1000 : '0'}`;

    const apiEvents = eventsToDeploy.map(e => ({
      event_id: e.id, event_type: e.type, target: e.target, payload: e.payload,
      status: e.status, created_at: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp),
    }));

    const sortedEvents = sortEventsForDeployment(eventsToDeploy);
    const executableEvents = filterExecutableEvents(sortedEvents);

    const orderedSqlQueries = executableEvents
      .map(event => generateSnowflakeSQL(event).sql)
      .filter(sql => sql && !sql.trim().startsWith('--'));

    try {
      // ── WITH APPROVAL ──
      if (config.deploymentType === 'with_approval') {
        addProgress('Submitting for approval...');
        const v1Body: CreateExploreDeploymentRequest = {
          deployment_type: 'with_approval',
          description: config.changelogSummary || `Approval request with ${eventsToDeploy.length} changes`,
          config: {
            sql_queries: orderedSqlQueries,
            events: apiEvents,
            deployment_method: 'REPLACE_EXISTING',
            created_by: currentUser,
            approvers: config.selectedApprovers,
          },
        };
        const v1Result = await exploreDesignApi.requestDeployment(projectId, v1Body);
        setResults(prev => ({ ...prev, deploymentId: v1Result.deployment_id || null }));
        addProgress(`Submitted! Deployment ID: ${v1Result.deployment_id}`);
        toast.success(`Deployment submitted for approval. Approvers: ${config.selectedApprovers.join(', ')}`);
        setPhase('complete');
        goNext(); // → verify step
        setIsDeploying(false);
        return;
      }

      // ── IMMEDIATE DEPLOYMENT ──
      addProgress('Starting two-phase deployment...');

      // Phase 1: Schema (DDL)
      const schemaEventsToExecute = executableEvents.filter(e => SCHEMA_EVENT_TYPES.includes(e.type));
      const sqlStatements: SQLStatement[] = [];
      schemaEventsToExecute.forEach(event => {
        const { sql, rollbackSql } = generateSnowflakeSQL(event);
        if (sql && !sql.trim().startsWith('--')) {
          sqlStatements.push({
            sql, rollback_sql: rollbackSql || undefined,
            object_type: event.type.includes('TABLE') ? 'TABLE' : event.type.includes('COLUMN') ? 'COLUMN' : 'CONSTRAINT',
            object_name: `${event.target.schema}.${event.target.table}${event.target.column ? '.' + event.target.column : ''}`,
          });
        }
      });

      let queriesExecuted = 0;
      let schemaVersionId: string | null = null;

      if (sqlStatements.length > 0) {
        addProgress(`Registering ${sqlStatements.length} DDL actions...`);
        let registeredCount = 0;

        for (let i = 0; i < sqlStatements.length; i++) {
          const stmt = sqlStatements[i];
          const matchingEvent = schemaEventsToExecute.find(e => generateSnowflakeSQL(e).sql === stmt.sql);
          try {
            await exploreDesignApi.addDDLAction(projectId, {
              ddl_sql: stmt.sql,
              ddl_type: matchingEvent ? inferDDLType(matchingEvent.type) : 'CREATE_TABLE',
              priority: i + 1,
              target_table: stmt.object_name || undefined,
              description: stmt.object_type ? `${stmt.object_type}: ${stmt.object_name || 'unknown'}` : `DDL statement ${i + 1}`,
            });
            registeredCount++;
          } catch { /* skip failed registrations */ }
        }

        addProgress(`Registered ${registeredCount}/${sqlStatements.length} DDL actions`);

        if (registeredCount === 0) {
          addProgress('ERROR: Failed to register any DDL actions');
          toast.error('Failed to register any DDL actions');
          schemaEventsToExecute.forEach(e => updateEventStatus({ eventId: e.id, status: 'failed', error: 'Registration failed' }));
          setPhase('failed');
          setIsDeploying(false);
          return;
        }

        addProgress('Executing DDL actions on Snowflake...');
        const ddlResult = await exploreDesignApi.executeDDLActions(
          projectId,
          config.atomicDeployment ? { atomic: true } : undefined,
        );

        if (ddlResult.failed > 0 && ddlResult.executed === 0) {
          const errors = (ddlResult.results || []).filter((r: any) => r.status !== 'SUCCESS').map((r: any) => r.error || 'Unknown');
          addProgress(`ERROR: All DDL actions failed: ${errors.join('; ')}`);
          toast.error(`All DDL actions failed`);
          schemaEventsToExecute.forEach(e => updateEventStatus({ eventId: e.id, status: 'failed', error: errors[0] }));
          setPhase('failed');
          setIsDeploying(false);
          return;
        }

        queriesExecuted = ddlResult.executed || 0;
        addProgress(`Phase 1 complete: ${queriesExecuted} DDL actions executed`);

        // Mark schema events as applied
        schemaEventsToExecute.forEach(e => updateEventStatus({ eventId: e.id, status: 'applied' }));
      } else {
        addProgress('No SQL statements — skipping DDL phase');
      }

      // Refresh versions
      try {
        const versionsResponse = await exploreDesignApi.listExploreVersions(projectId, { limit: 20 });
        setSchemaVersions(versionsResponse.versions);
        setCurrentSchemaVersion(versionsResponse.current_version || null);
        const latestVersion = versionsResponse.current_version || versionsResponse.versions[0];
        if (latestVersion) schemaVersionId = latestVersion.version_id;
      } catch { /* non-critical */ }

      // Phase 2: Ingestion
      setPhase('ingestion');
      const ingestionConfigs = extractIngestionConfigs(events, config.ingestionModeOverrides);

      if (ingestionConfigs.length > 0) {
        const targetVersionId = config.ingestionTargetVersion !== 'latest'
          ? config.ingestionTargetVersion
          : (schemaVersionId || undefined);

        if (config.ingestionType === 'scheduled') {
          addProgress(`Scheduling ingestion for ${ingestionConfigs.length} table(s)...`);
          const allMappings = ingestionConfigs.flatMap(c => c.mappings || []);
          const scheduleResult = await exploreDesignApi.scheduleIngestion(projectId, {
            cron_choice: config.cronChoice,
            custom_cron: config.cronChoice === 'CUSTOM' ? config.customCron : undefined,
            warehouse: config.scheduleWarehouse || undefined,
            mappings: allMappings.length > 0 ? allMappings : undefined,
            config: { ingestion_configs: ingestionConfigs, target_version_id: targetVersionId },
          });
          addProgress(`Scheduled: Task ${scheduleResult.task_name}, Cron: ${scheduleResult.cron_expression}`);
          eventsToDeploy.filter(e => e.type === 'INGESTION_MODE_SET' || e.type === 'COLUMN_MAPPING_CREATED')
            .forEach(e => updateEventStatus({ eventId: e.id, status: 'applied' }));
        } else {
          addProgress(`Ingesting data for ${ingestionConfigs.length} table(s)...`);
          const ingestionResults = await Promise.allSettled(
            ingestionConfigs.map(cfg =>
              exploreDesignApi.executeIngestion(projectId, {
                source_database: cfg.source_database, source_schema: cfg.source_schema, source_table: cfg.source_table,
                target_database: cfg.target_database || '', target_schema: cfg.target_schema || '', target_table: cfg.target_table,
                ingestion_mode: cfg.ingestion_mode, mappings: cfg.mappings,
              }),
            ),
          );

          const fulfilled = ingestionResults.filter((r): r is PromiseFulfilledResult<ExecuteIngestionResponse> => r.status === 'fulfilled');
          const successCount = fulfilled.filter(r => r.value.status === 'success').length;
          const rowsAffected = fulfilled.reduce((sum, r) => sum + (r.value.rows_affected || 0), 0);
          addProgress(`Phase 2 complete: ${successCount}/${ingestionConfigs.length} tables ingested (${rowsAffected} rows)`);

          eventsToDeploy.filter(e => e.type === 'INGESTION_MODE_SET' || e.type === 'COLUMN_MAPPING_CREATED')
            .forEach(e => updateEventStatus({ eventId: e.id, status: 'applied' }));
        }
      } else {
        addProgress('No ingestion configs — skipping Phase 2');
      }

      // Record deployment
      setPhase('complete');
      addProgress('Recording deployment...');
      const v1Body: CreateExploreDeploymentRequest = {
        deployment_type: 'immediate',
        description: config.changelogSummary || `Immediate deployment with ${eventsToDeploy.length} changes`,
        config: {
          sql_queries: sqlStatements.map(s => s.sql),
          events: apiEvents,
          created_by: currentUser,
          schema_version_id: schemaVersionId,
        },
      };
      const v1Record = await exploreDesignApi.requestDeployment(projectId, v1Body);
      setResults(prev => ({ ...prev, deploymentId: v1Record.deployment_id || null }));
      addProgress(`Deployment recorded: ${v1Record.deployment_id}`);

      // Mark remaining events
      sortedEvents.forEach(e => {
        if (e.status !== 'applied' && e.status !== 'failed') updateEventStatus({ eventId: e.id, status: 'applied' });
      });

      // Sync to backend
      const appliedIds = sortedEvents.filter(e => e.status !== 'failed').map(e => e.id).filter(Boolean);
      if (appliedIds.length > 0) {
        try { await bulkUpdateEvents(projectId, { event_ids: appliedIds, new_status: 'SUCCESS' }); } catch { /* non-blocking */ }
      }

      toast.success('Deployment completed successfully!');
      goNext(); // → verify step

    } catch (error: any) {
      const msg = getApiErrorMessage(error) || error?.message || 'Deployment failed';
      addProgress(`ERROR: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      toast.error(`Deployment failed: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      setResults(prev => ({ ...prev, backendError: typeof msg === 'string' ? msg : JSON.stringify(msg) }));
      eventsToDeploy.forEach(e => updateEventStatus({ eventId: e.id, status: 'failed', error: typeof msg === 'string' ? msg : JSON.stringify(msg) }));
      setPhase('failed');
    } finally {
      setIsDeploying(false);
    }
  }, [events, pendingEvents, config, projectId, currentUser, goNext, setResults, updateEventStatus, setIsDeploying, setSchemaVersions, setCurrentSchemaVersion]);

  return (
    <div className="p-6 animate-in fade-in duration-200 space-y-6">
      {/* Deploy prompt */}
      {phase === 'ready' && (
        <div className="text-center py-8">
          <Rocket className="h-12 w-12 mx-auto mb-4 text-blue-500" />
          <h3 className="text-lg font-semibold mb-2">Ready to Deploy</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            {config.deploymentType === 'with_approval'
              ? 'This will submit your changes for approval before deployment.'
              : config.atomicDeployment
              ? 'This will deploy atomically — all or nothing.'
              : 'This will execute a two-phase deployment: Schema DDL → Data Ingestion.'}
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={goPrev} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button size="lg" onClick={handleDeploy} className="gap-2">
              <Rocket className="h-5 w-5" />
              {config.deploymentType === 'with_approval' ? 'Submit for Approval' : 'Deploy Now'}
            </Button>
          </div>
        </div>
      )}

      {/* Progress Log */}
      {phase !== 'ready' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            {phase === 'complete' ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : phase === 'failed' ? (
              <XCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            )}
            <span className="font-semibold text-sm">
              {phase === 'schema' ? 'Phase 1: Schema Deployment' :
               phase === 'ingestion' ? 'Phase 2: Data Ingestion' :
               phase === 'complete' ? 'Deployment Complete' :
               'Deployment Failed'}
            </span>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 max-h-[300px] overflow-auto font-mono text-xs text-slate-300 space-y-0.5">
            {progress.map((line, i) => (
              <div key={i} className={cn(
                line.includes('ERROR') ? 'text-red-400' :
                line.includes('complete') || line.includes('Complete') ? 'text-green-400' :
                'text-slate-300',
              )}>
                {line}
              </div>
            ))}
            {isDeploying && (
              <div className="text-blue-400 animate-pulse">Processing...</div>
            )}
          </div>

          {phase === 'failed' && (
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={goPrev} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Back to Impact
              </Button>
              <Button onClick={() => { setPhase('ready'); setProgress([]); }} className="gap-1.5">
                <Rocket className="h-4 w-4" /> Retry
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
