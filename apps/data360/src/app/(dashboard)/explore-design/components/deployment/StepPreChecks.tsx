'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from 'rizzui';
import {
  Shield, Loader2, AlertTriangle, Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import { validateEventLocally, generateSnowflakeSQL } from './deployment-utils';
import PreDeployChecksPanel from '../PreDeployChecksPanel';
import PreCheckGate from '../PreCheckGate';
import { analyzeDeploymentRisk as computeDeploymentRisk } from '../../services/ai-analyzers';
import { getCortexRecommend } from '@/app/services/cortex/';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { useAiFeatures } from '../../stores/ai-store';
import type { DesignEvent as AiDesignEvent } from '../../stores/event-store';
import type { PreDeployChecksResult } from '@/app/services/api/types';

export default function StepPreChecks() {
  const {
    projectId, events, pendingEvents, config,
    results, setResults,
    isValidating, setIsValidating,
  } = useDeploymentContext();

  const { isEnabled: isAiEnabled } = useAiFeatures();
  const [isLoadingServerRisk, setIsLoadingServerRisk] = useState(false);

  // Run local validation on mount
  useEffect(() => {
    setIsValidating(true);
    const localResults = new Map<string, { eventId: string; success: boolean; message: string }>();
    pendingEvents.forEach(event => {
      const validation = validateEventLocally(event, events);
      localResults.set(event.id, {
        eventId: event.id,
        success: validation.isValid,
        message: validation.isValid ? 'Passed' : validation.errors.join('; '),
      });
    });
    setResults(prev => ({ ...prev, testResults: localResults as any }));
    setIsValidating(false);
  }, []);

  // Run risk scoring
  const runRiskScoring = useCallback(async () => {
    const riskResult = computeDeploymentRisk(events as AiDesignEvent[]);
    const breakdown: Array<{ factor: string; points: number; reason: string }> = [];

    const destructiveEvents = events.filter(e =>
      ['REMOVE_COLUMN', 'TABLE_RENAMED', 'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED',
       'PRIMARY_KEY_REMOVED', 'FOREIGN_KEY_REMOVED'].includes(e.type),
    );
    for (const ev of destructiveEvents) {
      const table = ev.target?.table || 'unknown';
      const col = ev.target?.column || ev.payload?.columnName || '';
      if (ev.type === 'REMOVE_COLUMN') breakdown.push({ factor: `DROP_COLUMN ${table}.${col}`, points: 15, reason: 'Irreversible data loss' });
      else if (ev.type === 'COLUMN_TYPE_CHANGED') breakdown.push({ factor: `ALTER_CHANGE_TYPE ${table}.${col}`, points: 12, reason: 'Data conversion risk' });
      else if (ev.type === 'TABLE_RENAMED' || ev.type === 'COLUMN_RENAMED') breakdown.push({ factor: `RENAME ${table}${col ? '.' + col : ''}`, points: 10, reason: 'Breaks dependent references' });
      else if (ev.type === 'PRIMARY_KEY_REMOVED') breakdown.push({ factor: `DROP PK on ${table}`, points: 15, reason: 'Integrity constraint removed' });
      else if (ev.type === 'FOREIGN_KEY_REMOVED') breakdown.push({ factor: `DROP FK on ${table}`, points: 10, reason: 'Referential integrity lost' });
    }

    const maskingEvents = events.filter(e => e.type === 'MASKING_POLICY_APPLIED');
    if (maskingEvents.length > 0) breakdown.push({ factor: `${maskingEvents.length} masking policies`, points: maskingEvents.length * 5, reason: 'Governance impact' });

    const tableCount = new Set(events.filter(e => e.type === 'TABLE_CREATED').map(e => e.target?.table)).size;
    if (tableCount > 10) breakdown.push({ factor: `${tableCount} tables in scope`, points: tableCount > 20 ? 25 : 10, reason: 'Large change surface' });

    setResults(prev => ({
      ...prev,
      riskAssessment: { score: riskResult.riskScore, level: riskResult.riskLevel, breakdown, aiSummary: null, aiSummaryLoading: true },
    }));

    // Cortex AI summary
    try {
      const riskContext = `Deployment with ${events.length} events. Risk score: ${riskResult.riskScore}/100 (${riskResult.riskLevel}). ` +
        `Changes: ${destructiveEvents.length} destructive ops, ${maskingEvents.length} masking policies, ${tableCount} tables. ` +
        `Breakdown: ${breakdown.map(b => `${b.factor} (+${b.points}pts: ${b.reason})`).join('; ')}. ` +
        `Summarize the deployment risk and recommend mitigation steps in 2-3 sentences.`;
      const cortexRes = await getCortexRecommend({ error_context: riskContext });
      setResults(prev => ({
        ...prev,
        riskAssessment: prev.riskAssessment ? { ...prev.riskAssessment, aiSummary: cortexRes?.response || null, aiSummaryLoading: false } : null,
      }));
    } catch {
      setResults(prev => ({
        ...prev,
        riskAssessment: prev.riskAssessment ? { ...prev.riskAssessment, aiSummary: null, aiSummaryLoading: false } : null,
      }));
    }
  }, [events, setResults]);

  // Server-side AI risk (behind feature toggle)
  const fetchServerRisk = useCallback(async () => {
    if (!isAiEnabled('risk_scorer') || !projectId) return;
    setIsLoadingServerRisk(true);
    try {
      const result = await exploreDesignApi.aiDeploymentRisk(projectId);
      setResults(prev => ({ ...prev, serverRiskResult: result }));
    } catch { /* fallback to client-side */ }
    finally { setIsLoadingServerRisk(false); }
  }, [projectId, events, isAiEnabled, setResults]);

  const handlePreChecksComplete = useCallback((result: PreDeployChecksResult) => {
    const allPassed = result.checks?.every((c: any) => c.status === 'PASS') ?? false;
    setResults(prev => ({ ...prev, preChecksResult: result, preChecksAllPassed: allPassed }));
    // Auto-run risk scoring after pre-checks
    runRiskScoring();
    fetchServerRisk();
  }, [runRiskScoring, fetchServerRisk, setResults]);

  const riskAssessment = results.riskAssessment;

  return (
      <div className="p-6 space-y-6">
      {/* PreCheckGate — structural validation */}
      <PreCheckGate />

      {/* Server Pre-Deploy Checks (B3) */}
      <PreDeployChecksPanel
        projectId={projectId}
        warehouse={config.scheduleWarehouse || 'COMPUTE_WH'}
        onChecksComplete={handlePreChecksComplete}
      />

      {/* Risk Assessment */}
      {riskAssessment && (
        <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
            <span className="font-medium text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              Risk Assessment
            </span>
            <Badge className={cn(
              'text-xs',
              riskAssessment.level === 'HIGH' ? 'bg-red-100 text-red-600' :
              riskAssessment.level === 'MEDIUM' ? 'bg-amber-100 text-amber-600' :
              'bg-green-100 text-green-600',
            )}>
              {riskAssessment.level} — {riskAssessment.score}/100
            </Badge>
          </div>
          <div className="p-4 space-y-3">
            {riskAssessment.breakdown.length > 0 && (
              <div className="space-y-1.5">
                {riskAssessment.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">{b.factor}</span>
                    <span className="text-red-500 font-mono">+{b.points}</span>
                  </div>
                ))}
              </div>
            )}
            {riskAssessment.aiSummaryLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating AI risk summary...
              </div>
            )}
            {riskAssessment.aiSummary && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300 flex gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{riskAssessment.aiSummary}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Server AI Risk (4.1) */}
      {isLoadingServerRisk && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching AI deployment risk analysis...
        </div>
      )}
      {results.serverRiskResult && (
        <div className="p-4 border dark:border-slate-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI Risk Analysis
            </span>
            <Badge className={cn(
              'text-xs',
              results.serverRiskResult.overall_risk === 'CRITICAL' || results.serverRiskResult.overall_risk === 'HIGH'
                ? 'bg-red-100 text-red-600'
                : results.serverRiskResult.overall_risk === 'MEDIUM'
                ? 'bg-amber-100 text-amber-600'
                : 'bg-green-100 text-green-600',
            )}>
              {results.serverRiskResult.overall_risk}
            </Badge>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">{results.serverRiskResult.recommendation}</p>
        </div>
      )}

      </div>
  );
}
