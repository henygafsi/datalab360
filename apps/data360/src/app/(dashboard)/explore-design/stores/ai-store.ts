/**
 * AI Feature Store — Jotai-based state with localStorage persistence
 * Manages AI feature toggles, suggestions, and cost tracking
 */

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

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
  // Catalog
  { id: 'column_classification', name: 'Column Classification', description: 'Auto-detect PII, dates, IDs, measures, and dimensions', stage: 'catalog', costCredits: 0, enabled: true },
  { id: 'relationship_discovery', name: 'Relationship Discovery', description: 'Suggest foreign key relationships based on column names and types', stage: 'catalog', costCredits: 0, enabled: true },
  { id: 'schema_health_score', name: 'Schema Health Score', description: 'Score tables on naming, null%, type consistency, and documentation', stage: 'catalog', costCredits: 0, enabled: true },
  { id: 'data_type_optimizer', name: 'Data Type Optimizer', description: 'Recommend optimal Snowflake types (e.g., VARCHAR(256) → VARCHAR(50))', stage: 'catalog', costCredits: 0, enabled: false },
  // Modeling
  { id: 'table_templates', name: 'Table Templates', description: 'Suggest common table patterns (SCD2, audit, bridge tables)', stage: 'modeling', costCredits: 0, enabled: true },
  { id: 'naming_checker', name: 'Naming Checker', description: 'Flag naming violations against project conventions', stage: 'modeling', costCredits: 0, enabled: true },
  { id: 'scd_recommender', name: 'SCD Recommender', description: 'Recommend SCD type based on table characteristics', stage: 'modeling', costCredits: 0.001, enabled: false },
  // Ingestion
  { id: 'warehouse_sizing', name: 'Warehouse Sizing', description: 'Recommend warehouse size based on data volume and complexity', stage: 'ingestion', costCredits: 0, enabled: false },
  { id: 'clustering_keys', name: 'Clustering Keys', description: 'Suggest optimal clustering keys for query performance', stage: 'ingestion', costCredits: 0.001, enabled: false },
  { id: 'materialization_strategy', name: 'Materialization Strategy', description: 'Recommend table vs. view vs. dynamic table vs. materialized view', stage: 'ingestion', costCredits: 0, enabled: false },
  { id: 'ingestion_optimizer', name: 'Ingestion Optimizer', description: 'Detect full_refresh on large tables, missing timestamps', stage: 'ingestion', costCredits: 0, enabled: true },
  // Deployment
  { id: 'risk_scorer', name: 'Risk Scorer', description: 'Score deployment risk based on downstream impact and change type', stage: 'deployment', costCredits: 0, enabled: true },
  { id: 'schedule_optimizer', name: 'Schedule Optimizer', description: 'Recommend optimal scheduling based on data freshness needs', stage: 'deployment', costCredits: 0.001, enabled: false },
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

export function useAiSuggestions() {
  const [suggestions, setSuggestions] = useAtom(aiSuggestionsAtom);
  const activeSuggestions = useAtomValue(activeAiSuggestionsAtom);
  const [feedback, setFeedback] = useAtom(aiFeedbackAtom);
  const feedbackStats = useAtomValue(aiFeedbackStatsAtom);

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

  const acceptSuggestion = (suggestion: AiSuggestion) => {
    setFeedback((prev) => [
      ...prev,
      { suggestionId: suggestion.id, featureId: suggestion.featureId, action: 'accepted', title: suggestion.title, timestamp: Date.now() },
    ]);
    dismiss(suggestion.id);
  };

  const rejectSuggestion = (suggestion: AiSuggestion) => {
    setFeedback((prev) => [
      ...prev,
      { suggestionId: suggestion.id, featureId: suggestion.featureId, action: 'rejected', title: suggestion.title, timestamp: Date.now() },
    ]);
    dismiss(suggestion.id);
  };

  const clearAll = () => setSuggestions([]);

  const replaceSuggestions = (next: AiSuggestion[]) => setSuggestions(next);

  return { suggestions, activeSuggestions, addSuggestion, dismiss, acceptSuggestion, rejectSuggestion, clearAll, replaceSuggestions, feedback, feedbackStats };
}
