/**
 * AI Feature Store — Jotai-based state with localStorage persistence
 * Manages AI feature toggles, suggestions, and cost tracking
 */

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { aiRecordFeedback } from '@/app/services/api/exploreDesignApi';

// ── Types ────────────────────────────────────────────────────────────────────

export type AiFeatureId =
  | 'column_classification'
  | 'relationship_discovery'
  | 'schema_health_score'
  | 'data_type_optimizer'
  | 'table_templates'
  | 'naming_checker'
  | 'scd_recommender'
  | 'warehouse_sizing'
  | 'clustering_keys'
  | 'materialization_strategy'
  | 'ingestion_optimizer'
  | 'risk_scorer'
  | 'schedule_optimizer';

export type AiStage = 'catalog' | 'modeling' | 'ingestion' | 'deployment';

export interface AiFeatureConfig {
  id: AiFeatureId;
  name: string;
  description: string;
  stage: AiStage;
  costCredits: number;
  enabled: boolean;
}

export interface AiSuggestion {
  id: string;
  featureId: AiFeatureId;
  type: 'info' | 'warning' | 'recommendation';
  title: string;
  message: string;
  action?: {
    label: string;
    eventType?: string;
    payload?: Record<string, any>;
  };
  dismissed: boolean;
  timestamp: number;
}

// ── Default Feature Config ───────────────────────────────────────────────────

export const DEFAULT_AI_FEATURES: AiFeatureConfig[] = [
  // Catalog (AI Phase 1 — Schema Intelligence: ~0.009 credits/session)
  { id: 'column_classification', name: 'Column Classification', description: 'Auto-detect PII, dates, IDs, measures, and dimensions via Cortex', stage: 'catalog', costCredits: 0.0001, enabled: true },
  { id: 'relationship_discovery', name: 'Relationship Discovery', description: 'Suggest foreign key relationships using column similarity and embeddings', stage: 'catalog', costCredits: 0.003, enabled: true },
  { id: 'schema_health_score', name: 'Schema Health Score', description: 'Composite health score: completeness, naming, type efficiency', stage: 'catalog', costCredits: 0.005, enabled: true },
  { id: 'data_type_optimizer', name: 'Data Type Optimizer', description: 'Recommend optimal Snowflake types based on actual data patterns (zero cost)', stage: 'catalog', costCredits: 0, enabled: false },
  // Modeling (AI Phase 2 — Modeling Copilot: ~0.0001 credits)
  { id: 'table_templates', name: 'Table Column Suggestions', description: 'Suggest columns for new tables based on purpose description', stage: 'modeling', costCredits: 0.0001, enabled: true },
  { id: 'naming_checker', name: 'Naming Checker', description: 'Flag naming violations against project conventions (zero cost)', stage: 'modeling', costCredits: 0, enabled: true },
  { id: 'scd_recommender', name: 'SCD Recommender', description: 'Recommend SCD type based on table structure and business context', stage: 'modeling', costCredits: 0.0001, enabled: false },
  // Ingestion (AI Phase 3 — Cost Optimizer: ~0.005 credits)
  { id: 'warehouse_sizing', name: 'Warehouse Sizing', description: 'Analyze warehouse query history and recommend optimal sizing', stage: 'ingestion', costCredits: 0.002, enabled: false },
  { id: 'clustering_keys', name: 'Clustering Keys', description: 'Suggest optimal clustering keys based on query patterns', stage: 'ingestion', costCredits: 0.001, enabled: false },
  { id: 'materialization_strategy', name: 'Materialization Strategy', description: 'Recommend table vs. view vs. dynamic table vs. materialized view', stage: 'ingestion', costCredits: 0.001, enabled: false },
  { id: 'ingestion_optimizer', name: 'Ingestion Mode Optimizer', description: 'Recommend optimal ingestion mode based on table characteristics', stage: 'ingestion', costCredits: 0.001, enabled: true },
  // Deployment (AI Phase 4 — Deployment Intelligence: ~0.003 credits)
  { id: 'risk_scorer', name: 'Deployment Risk Scorer', description: 'Score deployment risk based on DDL types and dependent objects', stage: 'deployment', costCredits: 0.002, enabled: true },
  { id: 'schedule_optimizer', name: 'Schedule Optimizer', description: 'Find optimal deployment window based on warehouse usage patterns', stage: 'deployment', costCredits: 0.001, enabled: false },
];

// ── Atoms ────────────────────────────────────────────────────────────────────

// Persisted toggle state: Record<AiFeatureId, boolean>
const defaultToggles: Record<AiFeatureId, boolean> = {} as any;
for (const f of DEFAULT_AI_FEATURES) {
  defaultToggles[f.id] = f.enabled;
}

export const aiFeatureTogglesAtom = atomWithStorage<Record<AiFeatureId, boolean>>(
  'data360:ai-feature-toggles',
  defaultToggles,
);

// Derived: full feature configs with persisted enabled state merged in
export const aiFeaturesAtom = atom((get) => {
  const toggles = get(aiFeatureTogglesAtom);
  return DEFAULT_AI_FEATURES.map((f) => ({
    ...f,
    enabled: toggles[f.id] ?? f.enabled,
  }));
});

// Suggestions (session-only, not persisted)
export const aiSuggestionsAtom = atom<AiSuggestion[]>([]);

// Applied suggestion ids (session-only) — the suggestion's action CTA was
// dispatched to the canvas event store. Kept visible (NOT dismissed) so the row
// can render an "Applied to canvas" confirmation instead of vanishing.
export const aiAppliedSuggestionIdsAtom = atom<Set<string>>(new Set<string>());

// Feedback tracking (persisted — improves future accuracy)
export interface AiFeedback {
  suggestionId: string;
  featureId: AiFeatureId;
  action: 'accepted' | 'rejected';
  title: string;
  timestamp: number;
}

export const aiFeedbackAtom = atomWithStorage<AiFeedback[]>(
  'data360:ai-suggestion-feedback',
  [],
);

// Derived: feedback stats
export const aiFeedbackStatsAtom = atom((get) => {
  const feedback = get(aiFeedbackAtom);
  const accepted = feedback.filter((f) => f.action === 'accepted').length;
  const rejected = feedback.filter((f) => f.action === 'rejected').length;
  const total = accepted + rejected;
  return {
    accepted,
    rejected,
    total,
    acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
  };
});

// Derived: active (non-dismissed) suggestions
export const activeAiSuggestionsAtom = atom((get) => {
  return get(aiSuggestionsAtom).filter((s) => !s.dismissed);
});

// Derived: stats
export const aiStatsAtom = atom((get) => {
  const features = get(aiFeaturesAtom);
  const enabledFeatures = features.filter((f) => f.enabled);
  return {
    enabledCount: enabledFeatures.length,
    totalCount: features.length,
    totalCost: enabledFeatures.reduce((sum, f) => sum + f.costCredits, 0),
    zeroCostCount: enabledFeatures.filter((f) => f.costCredits === 0).length,
  };
});

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useAiFeatures() {
  const features = useAtomValue(aiFeaturesAtom);
  const [toggles, setToggles] = useAtom(aiFeatureTogglesAtom);
  const stats = useAtomValue(aiStatsAtom);

  const toggle = (featureId: AiFeatureId) => {
    setToggles((prev) => ({
      ...prev,
      [featureId]: !prev[featureId],
    }));
  };

  const isEnabled = (featureId: AiFeatureId): boolean => {
    return toggles[featureId] ?? false;
  };

  const enableAll = () => {
    const next = { ...toggles };
    for (const f of DEFAULT_AI_FEATURES) next[f.id] = true;
    setToggles(next);
  };

  const disableAll = () => {
    const next = { ...toggles };
    for (const f of DEFAULT_AI_FEATURES) next[f.id] = false;
    setToggles(next);
  };

  return { features, toggle, isEnabled, enableAll, disableAll, stats };
}

export function useAiSuggestions(projectId?: string | null) {
  const [suggestions, setSuggestions] = useAtom(aiSuggestionsAtom);
  const activeSuggestions = useAtomValue(activeAiSuggestionsAtom);
  const [feedback, setFeedback] = useAtom(aiFeedbackAtom);
  const feedbackStats = useAtomValue(aiFeedbackStatsAtom);
  const [appliedSuggestionIds, setAppliedSuggestionIds] = useAtom(aiAppliedSuggestionIdsAtom);

  const addSuggestion = (suggestion: Omit<AiSuggestion, 'id' | 'dismissed' | 'timestamp'>) => {
    const id = `${suggestion.featureId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setSuggestions((prev) => [
      ...prev,
      { ...suggestion, id, dismissed: false, timestamp: Date.now() },
    ]);
    return id;
  };

  const dismiss = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, dismissed: true } : s)),
    );
  };

  /** Sync feedback to server (fire-and-forget) */
  const syncFeedbackToServer = (
    suggestion: AiSuggestion,
    accepted: boolean,
    reason?: string,
  ) => {
    if (!projectId) return;
    aiRecordFeedback(projectId, {
      feature: suggestion.featureId,
      suggestion_id: suggestion.id,
      accepted,
      reason: reason || (accepted ? 'User accepted suggestion' : 'User rejected suggestion'),
    }).catch(() => {
      // Silently fail — local feedback is already persisted
    });
  };

  /**
   * Record positive feedback ("Helpful"). This ONLY logs a thumbs-up — it does
   * NOT execute/apply the suggestion. Applying is done exclusively via the
   * action CTA (see markApplied). Kept named acceptSuggestion for callers, but
   * the UX label is "Helpful" to stop conflating feedback with execution.
   */
  const acceptSuggestion = (suggestion: AiSuggestion) => {
    setFeedback((prev) => [
      ...prev,
      { suggestionId: suggestion.id, featureId: suggestion.featureId, action: 'accepted', title: suggestion.title, timestamp: Date.now() },
    ]);
    dismiss(suggestion.id);
    syncFeedbackToServer(suggestion, true);
  };

  /** Record negative feedback ("Not helpful"). Does NOT execute anything. */
  const rejectSuggestion = (suggestion: AiSuggestion) => {
    setFeedback((prev) => [
      ...prev,
      { suggestionId: suggestion.id, featureId: suggestion.featureId, action: 'rejected', title: suggestion.title, timestamp: Date.now() },
    ]);
    dismiss(suggestion.id);
    syncFeedbackToServer(suggestion, false);
  };

  /**
   * Mark a suggestion as applied to the canvas after its action CTA dispatched a
   * real event. Keeps the row visible (NOT dismissed) so an "Applied" state can
   * render. Optionally auto-records positive feedback (the user did act on it).
   */
  const markApplied = (suggestion: AiSuggestion, recordFeedback = true) => {
    setAppliedSuggestionIds((prev) => {
      if (prev.has(suggestion.id)) return prev;
      const next = new Set(prev);
      next.add(suggestion.id);
      return next;
    });
    if (recordFeedback) {
      setFeedback((prev) => [
        ...prev,
        { suggestionId: suggestion.id, featureId: suggestion.featureId, action: 'accepted', title: suggestion.title, timestamp: Date.now() },
      ]);
      syncFeedbackToServer(suggestion, true, 'User applied suggestion to canvas');
    }
  };

  const isApplied = (id: string) => appliedSuggestionIds.has(id);

  const clearAll = () => {
    setSuggestions([]);
    setAppliedSuggestionIds(new Set());
  };

  const replaceSuggestions = (next: AiSuggestion[]) => {
    setSuggestions(next);
    // A fresh analysis run produces new suggestion ids — drop stale applied ids.
    setAppliedSuggestionIds(new Set());
  };

  return { suggestions, activeSuggestions, addSuggestion, dismiss, acceptSuggestion, rejectSuggestion, markApplied, isApplied, appliedSuggestionIds, clearAll, replaceSuggestions, feedback, feedbackStats };
}
