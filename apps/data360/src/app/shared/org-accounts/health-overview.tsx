'use client';

import { useState } from 'react';
import { Text, Badge, Tooltip, Collapse } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiHeartbeatDuotone,
  PiCaretDownBold,
  PiWarningDuotone,
  PiLightbulbDuotone,
} from 'react-icons/pi';
import type { HealthScore, HealthStatus } from '@/app/services/org-accounts/types';

interface HealthOverviewProps {
  healthScores: HealthScore[];
  loading?: boolean;
  className?: string;
}

const statusConfig: Record<HealthStatus, { color: string; bgColor: string; badgeColor: 'success' | 'warning' | 'danger' }> = {
  healthy: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500',
    badgeColor: 'success',
  },
  warning: {
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500',
    badgeColor: 'warning',
  },
  critical: {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500',
    badgeColor: 'danger',
  },
  unknown: {
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500',
    badgeColor: 'warning',
  },
};

function getScoreColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function getScoreBgColor(score: number): string {
  if (score >= 70) return 'bg-green-100 dark:bg-green-900/20';
  if (score >= 50) return 'bg-amber-100 dark:bg-amber-900/20';
  return 'bg-red-100 dark:bg-red-900/20';
}

interface HealthItemProps {
  health: HealthScore;
}

function HealthItem({ health }: HealthItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = statusConfig[health.status] || statusConfig.unknown;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          {/* Score Circle */}
          <div className={cn('flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center', getScoreBgColor(health.overall_score))}>
            <Text className={cn('text-lg font-bold', health.overall_score >= 70 ? 'text-green-600' : health.overall_score >= 50 ? 'text-amber-600' : 'text-red-600')}>
              {health.overall_score}
            </Text>
          </div>

          {/* Account Info */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <Text className="font-medium text-gray-900 dark:text-white truncate">
                {health.account_name}
              </Text>
              <Badge variant="flat" color={config.badgeColor} size="sm">
                {health.status}
              </Badge>
            </div>
            {/* Score Breakdown */}
            <div className="flex items-center gap-4 mt-1">
              {/* Tooltip forwards a ref to its child; wrap the rizzui <Text>
                  (a function component that doesn't forward refs) in a <span> so
                  the ref lands on a DOM node — avoids the React
                  "Function components cannot be given refs" warning. */}
              <Tooltip content="Cost Efficiency Score">
                <span className="text-xs text-gray-500">
                  Cost: <span className="font-medium">{health.cost_score}</span>
                </span>
              </Tooltip>
              {health.activity_score != null && (
                <Tooltip content="Activity Score">
                  <span className="text-xs text-gray-500">
                    Activity: <span className="font-medium">{health.activity_score}</span>
                  </span>
                </Tooltip>
              )}
              {health.security_score != null && (
                <Tooltip content="Security Score">
                  <span className="text-xs text-gray-500">
                    Security: <span className="font-medium">{health.security_score}</span>
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="hidden sm:block w-32 flex-shrink-0">
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getScoreColor(health.overall_score))}
                style={{ width: `${health.overall_score}%` }}
              />
            </div>
          </div>

          {/* Expand Icon */}
          <PiCaretDownBold
            className={cn(
              'h-4 w-4 text-gray-400 transition-transform flex-shrink-0',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Issues */}
            {health.issues.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <PiWarningDuotone className="h-4 w-4 text-amber-600" />
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    Issues ({health.issues.length})
                  </Text>
                </div>
                <ul className="space-y-1">
                  {health.issues.map((issue, index) => (
                    <li key={index} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-amber-500 mt-1">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {health.recommendations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <PiLightbulbDuotone className="h-4 w-4 text-blue-600" />
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    Recommendations ({health.recommendations.length})
                  </Text>
                </div>
                <ul className="space-y-1">
                  {health.recommendations.map((rec, index) => (
                    <li key={index} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-blue-500 mt-1">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* No issues/recommendations */}
            {health.issues.length === 0 && health.recommendations.length === 0 && (
              <div className="col-span-2 text-center py-4">
                <Text className="text-sm text-gray-500">
                  No issues or recommendations for this account
                </Text>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HealthOverview({
  healthScores,
  loading = false,
  className,
}: HealthOverviewProps) {
  // Ensure healthScores is always a valid array
  const scores = Array.isArray(healthScores) ? healthScores : [];

  // Sort by score (lowest first to highlight issues)
  const sortedScores = [...scores].sort((a, b) => a.overall_score - b.overall_score);

  // Calculate summary stats
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, h) => sum + h.overall_score, 0) / scores.length)
    : 0;

  const healthyCount = scores.filter((h) => h.status === 'healthy').length;
  const warningCount = scores.filter((h) => h.status === 'warning').length;
  const criticalCount = scores.filter((h) => h.status === 'critical').length;

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800', className)}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PiHeartbeatDuotone className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            <Text className="font-semibold text-gray-900 dark:text-white">
              Account Health Overview
            </Text>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Text className="text-sm text-gray-500">Avg Score:</Text>
              <Text className={cn('text-sm font-bold', scores.length === 0 ? 'text-gray-400' : avgScore >= 70 ? 'text-green-600' : avgScore >= 50 ? 'text-amber-600' : 'text-red-600')}>
                {scores.length > 0 ? avgScore : '—'}
              </Text>
            </div>
            <div className="flex gap-2">
              {scores.length > 0 && (
                <Badge variant="flat" color="success" size="sm">
                  {healthyCount} Healthy
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="flat" color="warning" size="sm">
                  {warningCount} Warning
                </Badge>
              )}
              {criticalCount > 0 && (
                <Badge variant="flat" color="danger" size="sm">
                  {criticalCount} Critical
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Health List */}
      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
        {sortedScores.length === 0 ? (
          <div className="text-center py-8">
            <PiHeartbeatDuotone className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <Text className="text-gray-500 dark:text-gray-400">
              No health data available
            </Text>
          </div>
        ) : (
          sortedScores.map((health) => (
            <HealthItem key={health.account_name} health={health} />
          ))
        )}
      </div>
    </div>
  );
}
