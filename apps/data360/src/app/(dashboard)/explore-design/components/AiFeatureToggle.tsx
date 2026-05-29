'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Switch } from 'rizzui';
import {
  Sparkles, ChevronDown, ChevronRight, Info, Zap,
  Table2, RefreshCw, AlertTriangle,
  Database, Brain, X, Power, PowerOff,
  ThumbsUp, ThumbsDown, TrendingUp,
} from 'lucide-react';
import {
  useAiFeatures,
  useAiSuggestions,
  type AiFeatureId,
  type AiFeatureConfig,
  type AiStage,
  type AiSuggestion,
} from '../stores/ai-store';

// ── Stage Config ─────────────────────────────────────────────────────────────

const stageConfig: Record<AiStage, { label: string; color: string; icon: React.ComponentType<any> }> = {
  catalog: { label: 'Catalog', color: 'bg-blue-100 text-blue-600', icon: Database },
  modeling: { label: 'Modeling', color: 'bg-green-100 text-green-600', icon: Table2 },
  ingestion: { label: 'Ingestion', color: 'bg-purple-100 text-purple-600', icon: RefreshCw },
  deployment: { label: 'Deployment', color: 'bg-amber-100 text-amber-600', icon: Zap },
};

const suggestionTypeConfig: Record<AiSuggestion['type'], {
  icon: React.ComponentType<any>;
  color: string;
  bgColor: string;
}> = {
  info: { icon: Info, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  warning: { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  recommendation: { icon: Sparkles, color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
};

// ── Props ────────────────────────────────────────────────────────────────────

interface AiFeatureToggleProps {
  onSuggestionAction?: (suggestion: AiSuggestion) => void;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

const AiFeatureToggle: React.FC<AiFeatureToggleProps> = ({
  onSuggestionAction,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { features, toggle, enableAll, disableAll, stats } = useAiFeatures();
  const { activeSuggestions, dismiss, acceptSuggestion, rejectSuggestion, feedbackStats } = useAiSuggestions();

  const groupedFeatures = useMemo(() => {
    const groups: Record<string, AiFeatureConfig[]> = {};
    for (const f of features) {
      if (!groups[f.stage]) groups[f.stage] = [];
      groups[f.stage].push(f);
    }
    return groups;
  }, [features]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Inline Suggestions */}
      {activeSuggestions.length > 0 && (
        <div className="space-y-2">
          {activeSuggestions.map((suggestion) => {
            const config = suggestionTypeConfig[suggestion.type];
            const SuggIcon = config.icon;

            return (
              <div
                key={suggestion.id}
                className={cn('flex items-start gap-3 px-4 py-3 rounded-lg border', config.bgColor)}
              >
                <SuggIcon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', config.color)}>{suggestion.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{suggestion.message}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {suggestion.action && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => onSuggestionAction?.(suggestion)}
                      >
                        <Sparkles className="h-3 w-3" />
                        {suggestion.action.label}
                      </Button>
                    )}
                    <button
                      onClick={() => acceptSuggestion(suggestion)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 transition-colors"
                      title="Accept suggestion"
                    >
                      <ThumbsUp className="h-3 w-3" />
                      Accept
                    </button>
                    <button
                      onClick={() => rejectSuggestion(suggestion)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 transition-colors"
                      title="Reject suggestion"
                    >
                      <ThumbsDown className="h-3 w-3" />
                      Reject
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => dismiss(suggestion.id)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Feature Toggles Panel */}
      <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
        <button
          className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="font-medium text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            AI Intelligence
            <Badge size="sm" className="bg-violet-100 text-violet-600 dark:bg-violet-900/30">
              {stats.enabledCount}/{stats.totalCount} active
            </Badge>
            {activeSuggestions.length > 0 && (
              <Badge size="sm" className="bg-amber-100 text-amber-600 animate-pulse">
                {activeSuggestions.length} suggestion{activeSuggestions.length > 1 ? 's' : ''}
              </Badge>
            )}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">
              ~{stats.totalCost.toFixed(3)} credits/session &bull; {stats.zeroCostCount} free
            </span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div>
            {/* Cost info + bulk actions */}
            <div className="px-4 py-2 bg-violet-50/50 dark:bg-violet-900/10 border-b dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-violet-600">
                <Info className="h-3 w-3" />
                <span>
                  {stats.zeroCostCount} features at zero cost (pure Python). AI is always optional.
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); enableAll(); }}
                  className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-500"
                  title="Enable all"
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); disableAll(); }}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                  title="Disable all"
                >
                  <PowerOff className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Feature Groups */}
            {Object.entries(groupedFeatures).map(([stage, stageFeatures]) => {
              const sc = stageConfig[stage as AiStage];
              const StageIcon = sc.icon;

              return (
                <div key={stage} className="border-b dark:border-slate-700 last:border-0">
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                    <StageIcon className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {sc.label}
                    </span>
                    <Badge size="sm" className={cn(sc.color, 'text-[10px]')}>
                      {stageFeatures.filter((f) => f.enabled).length}/{stageFeatures.length}
                    </Badge>
                  </div>

                  <div className="divide-y dark:divide-slate-700/50">
                    {stageFeatures.map((feature) => (
                      <div
                        key={feature.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 transition-colors',
                          !feature.enabled && 'opacity-60',
                        )}
                      >
                        <Switch
                          checked={feature.enabled}
                          onChange={() => toggle(feature.id)}
                        />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{feature.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{feature.description}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {feature.costCredits === 0 ? (
                            <Badge size="sm" className="bg-green-100 text-green-600 text-[10px]">
                              FREE
                            </Badge>
                          ) : (
                            <Badge size="sm" className="bg-slate-100 text-slate-500 text-[10px]">
                              ~{feature.costCredits} cr
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Feedback Stats */}
            {feedbackStats.total > 0 && (
              <div className="px-4 py-2 bg-emerald-50/50 dark:bg-emerald-900/10 border-b dark:border-slate-700 flex items-center gap-3 text-xs">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Feedback: {feedbackStats.acceptanceRate}% acceptance rate
                </span>
                <span className="text-slate-400">
                  ({feedbackStats.accepted} accepted, {feedbackStats.rejected} rejected)
                </span>
              </div>
            )}

            {/* Footer */}
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs text-slate-400">
              <span>ROI: ~245x &bull; Total: ~{stats.totalCost.toFixed(3)} credits/session</span>
              <span>{stats.enabledCount} of {stats.totalCount} features enabled</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiFeatureToggle;
