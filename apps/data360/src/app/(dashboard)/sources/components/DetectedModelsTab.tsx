'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { Badge, Button, Loader } from 'rizzui';
import {
  Table2, GitBranch, Boxes,
  RefreshCw, Layers, Zap, Target,
  TrendingUp, BarChart3, FolderPlus, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { discoverRelationships, getSchemaHealth } from '@/app/services/explore-design/de-objects';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';

interface DetectedModel {
  id: string;
  name: string;
  type: 'fact' | 'dimension' | 'bridge' | 'staging' | 'aggregate' | 'unknown';
  sourceTables: string[];
  confidence: number;
  description: string;
  relationships: Array<{ from: string; to: string; type: string; confidence: number }>;
  suggestedActions: string[];
  kpiPotential?: string[];
}

interface DetectedModelsTabProps {
  projectId?: string;
  sourceTables?: Array<{ database: string; schema: string; table: string }>;
}

/** Subset of the explore-design schema-health response actually rendered here. */
interface SchemaHealth {
  overall_score?: number;
  health_score?: number;
  relations_count?: number;
  coverage?: number;
  issues_count?: number;
}

const MODEL_TYPE_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  fact: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-400', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  dimension: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-400', icon: <Layers className="h-3.5 w-3.5" /> },
  bridge: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', icon: <GitBranch className="h-3.5 w-3.5" /> },
  staging: { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', icon: <Table2 className="h-3.5 w-3.5" /> },
  aggregate: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  unknown: { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', icon: <Boxes className="h-3.5 w-3.5" /> },
};

/**
 * Qualitative label for the rule-based classification match. The underlying
 * value is a hardcoded heuristic score (naming pattern + relationship degree),
 * NOT a calibrated model probability — so we surface a coarse strength bucket
 * instead of a precise percentage to avoid implying AI confidence.
 */
function matchStrengthLabel(confidence: number): string {
  if (confidence >= 0.8) return 'Strong';
  if (confidence >= 0.6) return 'Likely';
  return 'Tentative';
}

export default function DetectedModelsTab({ projectId, sourceTables }: DetectedModelsTabProps) {
  const [models, setModels] = useState<DetectedModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [health, setHealth] = useState<SchemaHealth | null>(null);

  // System-2 Action-RBAC gate for the model-detection run. The underlying call
  // (POST /explore-design/{pid}/ai/discover-relationships) is gated by the
  // backend `require_module("explore_design")`; the write/AI-assist action in
  // that module is `create` (matches ContextRightBar). Project-scoped, fail-open
  // while the allow-set loads; honest-disable only on a resolved denial.
  const detectPerm = useCanPerform('explore_design', 'create', projectId);
  const canDetect = detectPerm.allowed || detectPerm.loading;
  const detectDeniedReason =
    'You lack the "create" permission on explore & design. Ask an administrator to grant it.';

  const runDetection = useCallback(async () => {
    if (!projectId || !sourceTables?.length) return;
    setLoading(true);
    setError(null);
    const [relResult, healthResult] = await Promise.allSettled([
      // Backend expects `table_name` (not `table`) — mirror the proven payload
      // shape used by the Explore & Design discover-relationships call.
      discoverRelationships(projectId, {
        tables: sourceTables.map((t) => ({
          database: t.database,
          schema: t.schema,
          table_name: t.table,
        })),
      }),
      getSchemaHealth(projectId),
    ]);

    // Relationship discovery is the primary signal — if it fails, surface the error.
    if (relResult.status === 'rejected') {
      setError(getApiErrorMessage(relResult.reason));
      setLoading(false);
      return;
    }

    if (healthResult.status === 'fulfilled') {
      const h = healthResult.value;
      setHealth({
        overall_score: h.overall_score,
        // Coverage card was always '—' (coverage never set). Map it to the
        // real completeness sub-score the schema-health endpoint returns.
        coverage: h.sub_scores?.completeness?.score,
        relations_count: relResult.value?.relationships?.length,
        issues_count: h.sub_scores?.naming?.violations?.length,
      });
    } else {
      setHealth(null);
    }

    const inferred = inferModelsFromRelationships(relResult.value, sourceTables);
    setModels(inferred);
    setDetected(true);
    setLoading(false);
  }, [projectId, sourceTables]);

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <Boxes className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">No Project Selected</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto">
          Select or create a project to detect data models from your sources.
        </p>
      </div>
    );
  }

  if (!detected && !loading) {
    return (
      <div className="text-center py-16">
        <div className="relative inline-block mb-4">
          <Boxes className="h-12 w-12 text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Detect Data Models</h3>
        <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
          Discover relationships across your source tables, then classify each table (fact, dimension,
          staging, …) from its naming pattern and relationship structure to suggest a star or normalized dimensional schema.
        </p>
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Table2 className="h-3.5 w-3.5 text-emerald-500" />
            {sourceTables?.length ?? '—'} source tables
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <GitBranch className="h-3.5 w-3.5 text-blue-500" />
            Rule-based detection
          </div>
        </div>
        <Button
          size="lg"
          className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
          onClick={runDetection}
          disabled={loading || !sourceTables?.length || !canDetect}
          title={!canDetect ? detectDeniedReason : undefined}
        >
          {loading ? <Loader size="sm" /> : <Boxes className="h-4 w-4" />}
          Detect Models
        </Button>
        {!sourceTables?.length && (
          <p className="mt-3 text-xs text-gray-400">Select source tables in the Sources tab first.</p>
        )}
        {error && (
          <div role="alert" className="mx-auto mt-4 flex max-w-md items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-left dark:border-rose-800 dark:bg-rose-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="text-sm font-medium text-rose-800 dark:text-rose-300">Detection failed</p>
              <p className="text-xs text-rose-700 dark:text-rose-400">{error}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="relative inline-block mb-4">
          <Loader size="lg" />
        </div>
        <p className="text-sm text-gray-500">Analyzing table structures and detecting models...</p>
        <p className="text-xs text-gray-400 mt-1">This may take a moment</p>
      </div>
    );
  }

  const sel = models.find((m) => m.id === selectedModel);

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {models.length} Models Detected
            </h3>
            <div className="flex gap-1.5">
              {Object.entries(
                models.reduce<Record<string, number>>((acc, m) => {
                  acc[m.type] = (acc[m.type] || 0) + 1;
                  return acc;
                }, {})
              ).map(([type, count]) => {
                const style = MODEL_TYPE_STYLES[type] || MODEL_TYPE_STYLES.unknown;
                return (
                  <Badge key={type} size="sm" className={cn(style.bg, style.text, 'text-[10px] gap-1')}>
                    {style.icon} {count} {type}
                  </Badge>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            Classified by naming patterns and relationship structure — match strength is a rule-based heuristic, not a model probability.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={runDetection}
            disabled={!canDetect}
            title={!canDetect ? detectDeniedReason : undefined}
            className="gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />Re-detect
          </Button>
          <Link href={`/explore-design?project=${encodeURIComponent(projectId)}`}>
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <FolderPlus className="h-3 w-3" />Open in Modeler
            </Button>
          </Link>
        </div>
      </div>

      {/* Health Overview */}
      {health && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Health Score', value: health.overall_score ?? health.health_score ?? '—', color: 'emerald' },
            { label: 'Relations Found', value: health.relations_count ?? models.reduce((s, m) => s + m.relationships.length, 0), color: 'blue' },
            { label: 'Coverage', value: health.coverage ? `${health.coverage}%` : '—', color: 'purple' },
            { label: 'Issues', value: health.issues_count ?? '—', color: 'amber' },
          ].map((s) => (
            <div key={s.label} className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <p className="text-[10px] text-gray-500">{s.label}</p>
              <p className={cn('text-lg font-bold', `text-${s.color}-600 dark:text-${s.color}-400`)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Models Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {models.map((model) => {
          const style = MODEL_TYPE_STYLES[model.type] || MODEL_TYPE_STYLES.unknown;
          const isSelected = selectedModel === model.id;
          return (
            <button
              key={model.id}
              onClick={() => setSelectedModel(isSelected ? null : model.id)}
              className={cn(
                'text-left p-4 rounded-xl border transition-all',
                isSelected
                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 shadow-md'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn('p-1.5 rounded-lg', style.bg)}>
                    <span className={style.text}>{style.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{model.name}</h4>
                    <Badge size="sm" className={cn(style.bg, style.text, 'text-[9px] mt-0.5')}>{model.type}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div
                    title="Rule-based match strength (naming pattern + relationship structure) — not a model probability"
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      model.confidence >= 0.8
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : model.confidence >= 0.6
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    )}>
                    {matchStrengthLabel(model.confidence)}
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{model.description}</p>

              <div className="flex flex-wrap gap-1 mb-2">
                {model.sourceTables.slice(0, 4).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[9px] font-mono text-gray-600 dark:text-gray-400">
                    <Table2 className="h-2.5 w-2.5" />{t.split('.').pop()}
                  </span>
                ))}
                {model.sourceTables.length > 4 && (
                  <span className="text-[9px] text-gray-400">+{model.sourceTables.length - 4} more</span>
                )}
              </div>

              {model.relationships.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <GitBranch className="h-3 w-3" />
                  {model.relationships.length} relationships
                </div>
              )}

              {isSelected && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                  {model.suggestedActions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">Suggested Actions</p>
                      {model.suggestedActions.map((action, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 py-0.5">
                          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                          {action}
                        </div>
                      ))}
                    </div>
                  )}
                  {model.kpiPotential && model.kpiPotential.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">KPI Potential</p>
                      <div className="flex flex-wrap gap-1">
                        {model.kpiPotential.map((kpi) => (
                          <Badge key={kpi} size="sm" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px]">
                            <Target className="h-2.5 w-2.5 mr-0.5" />{kpi}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers: infer models from relationship discovery results
// ---------------------------------------------------------------------------

// The relationship-discovery endpoint is loosely typed (returns `any` from the
// shared service). These optional fields cover the variants the backend emits.
interface DiscoveredRelationship {
  from_table?: string;
  source_table?: string;
  to_table?: string;
  target_table?: string;
  relationship_type?: string;
  type?: string;
  confidence?: number;
}

function inferModelsFromRelationships(
  relResult: unknown,
  sourceTables: Array<{ database: string; schema: string; table: string }>,
): DetectedModel[] {
  const models: DetectedModel[] = [];
  const root = (relResult ?? {}) as { relationships?: DiscoveredRelationship[]; discovered?: DiscoveredRelationship[] };
  const relationships: DiscoveredRelationship[] = root.relationships || root.discovered || [];

  const tableNames = sourceTables.map((t) => `${t.database}.${t.schema}.${t.table}`);
  const relMap = new Map<string, DiscoveredRelationship[]>();

  for (const rel of relationships) {
    const from = rel.from_table || rel.source_table || '';
    const to = rel.to_table || rel.target_table || '';
    if (!relMap.has(from)) relMap.set(from, []);
    relMap.get(from)!.push(rel);
    if (!relMap.has(to)) relMap.set(to, []);
    relMap.get(to)!.push(rel);
  }

  for (const fqn of tableNames) {
    const name = fqn.split('.').pop() || fqn;
    const rels = relMap.get(fqn) || [];
    const outgoing = rels.filter((r) => (r.from_table || r.source_table) === fqn);
    const incoming = rels.filter((r) => (r.to_table || r.target_table) === fqn);

    let type: DetectedModel['type'] = 'unknown';
    let confidence = 0.5;
    let description = '';
    const suggestedActions: string[] = [];
    const kpiPotential: string[] = [];

    const nameLower = name.toLowerCase();
    if (nameLower.startsWith('fact_') || nameLower.startsWith('fct_') || outgoing.length >= 3) {
      type = 'fact';
      confidence = outgoing.length >= 3 ? 0.85 : 0.7;
      description = `Fact table with ${outgoing.length} dimension references. Central transactional entity.`;
      suggestedActions.push('Validate FK relationships', 'Define grain and aggregation level');
      kpiPotential.push('Revenue', 'Volume', 'Conversion');
    } else if (nameLower.startsWith('dim_') || nameLower.startsWith('d_') || (incoming.length >= 2 && outgoing.length === 0)) {
      type = 'dimension';
      confidence = incoming.length >= 2 ? 0.85 : 0.7;
      description = `Dimension table referenced by ${incoming.length} fact tables. Provides descriptive context.`;
      suggestedActions.push('Apply SCD2 pattern', 'Add business descriptions', 'Validate natural keys');
    } else if (nameLower.includes('bridge') || nameLower.includes('xref') || nameLower.includes('link')) {
      type = 'bridge';
      confidence = 0.75;
      description = 'Bridge/link table connecting multiple dimensions.';
      suggestedActions.push('Validate many-to-many relationship', 'Check for orphan records');
    } else if (nameLower.startsWith('stg_') || nameLower.startsWith('raw_') || nameLower.includes('staging')) {
      type = 'staging';
      confidence = 0.8;
      description = 'Staging/raw layer table. Candidate for transformation into fact or dimension.';
      suggestedActions.push('Define transformation rules', 'Map to target model', 'Set up incremental load');
    } else if (nameLower.startsWith('agg_') || nameLower.includes('summary') || nameLower.includes('report')) {
      type = 'aggregate';
      confidence = 0.75;
      description = 'Aggregate/reporting table for BI consumption.';
      kpiPotential.push('Pre-aggregated metrics');
    } else if (rels.length > 0) {
      type = outgoing.length > incoming.length ? 'fact' : 'dimension';
      confidence = 0.5;
      description = `Table with ${rels.length} detected relationships. Needs manual classification.`;
      suggestedActions.push('Review and classify table type', 'Validate relationships');
    } else {
      description = 'Standalone table with no detected relationships. May need manual mapping.';
      suggestedActions.push('Check for implicit relationships', 'Add to appropriate schema layer');
    }

    models.push({
      id: fqn,
      name,
      type,
      sourceTables: [fqn],
      confidence,
      description,
      relationships: rels.map((r) => ({
        from: r.from_table || r.source_table || '',
        to: r.to_table || r.target_table || '',
        type: r.relationship_type || r.type || 'unknown',
        confidence: r.confidence || 0.5,
      })),
      suggestedActions,
      kpiPotential,
    });
  }

  return models.sort((a, b) => {
    const typeOrder = { fact: 0, dimension: 1, bridge: 2, aggregate: 3, staging: 4, unknown: 5 };
    return (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5) || b.confidence - a.confidence;
  });
}
