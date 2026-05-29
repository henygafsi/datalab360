'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useAiFeatures, useAiSuggestions, type AiFeatureId } from '../stores/ai-store';
import { runAllAnalyzers, type AnalysisResult } from '../services/ai-analyzers';
import type { DesignEvent } from '../stores/event-store';

/**
 * Hook that runs AI analyzers whenever events or feature toggles change.
 * Debounces analysis to avoid running on every keystroke.
 */
export function useAiAnalysis(events: DesignEvent[]) {
  const { features, isEnabled } = useAiFeatures();
  const { replaceSuggestions } = useAiSuggestions();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResultRef = useRef<AnalysisResult | null>(null);

  const enabledFeatureIds = useMemo(() => {
    const set = new Set<AiFeatureId>();
    for (const f of features) {
      if (f.enabled) set.add(f.id);
    }
    return set;
  }, [features]);

  // Fingerprint for change detection
  const fingerprint = useMemo(() => {
    return `${events.length}_${Array.from(enabledFeatureIds).sort().join(',')}`;
  }, [events.length, enabledFeatureIds]);

  useEffect(() => {
    if (events.length === 0) {
      replaceSuggestions([]);
      lastResultRef.current = null;
      return;
    }

    // Debounce 500ms
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const result = runAllAnalyzers(events, enabledFeatureIds);
      lastResultRef.current = result;

      // Convert to full AiSuggestion objects
      const withIds = result.suggestions.map((s, i) => ({
        ...s,
        id: `${s.featureId}_${i}_${Date.now()}`,
        dismissed: false,
        timestamp: Date.now(),
      }));

      replaceSuggestions(withIds);
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    getLastResult: () => lastResultRef.current,
    isEnabled,
  };
}
