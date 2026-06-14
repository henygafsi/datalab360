'use client';

import cn from '@core/utils/class-names';
import { Text, Title } from 'rizzui';
import { PiHeartbeatDuotone } from 'react-icons/pi';
import MetricHelp from '@/components/ui/MetricHelp';
import { dash } from '@/app/shared/ui/format';

interface HealthScoreCardProps {
  // Accepts a missing value — the headline renders "—" for null/undefined/NaN
  // (R3) while the bar collapses to empty; a genuine 0 still renders as 0.
  score: number | null | undefined;
  status: 'healthy' | 'warning' | 'critical';
  className?: string;
}

const statusConfig = {
  healthy: {
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Healthy',
  },
  warning: {
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
    label: 'Warning',
  },
  critical: {
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    label: 'Critical',
  },
};

export default function HealthScoreCard({ score, status, className }: HealthScoreCardProps) {
  // Guard against unexpected casing/values from the API (keys are lowercased on
  // transform but values are not) — avoid an undefined-config crash.
  const config = statusConfig[String(status).toLowerCase() as keyof typeof statusConfig] ?? statusConfig.warning;

  // Numeric clamp for the bar geometry only (width + band color). A missing
  // score keeps the bar empty (0%) — the honest "—" lives in the headline.
  const pct =
    typeof score === 'number' && Number.isFinite(score)
      ? Math.max(0, Math.min(100, score))
      : 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-6',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Overall Health Score
            </Text>
            <MetricHelp
              title="Overall Health Score"
              definition="Composite 0–100 score blending freshness, reliability and error signals across monitored assets. Higher means healthier."
              source="observability telemetry"
              goodRange="≥ 80 / 100"
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <Title as="h2" className={cn('text-4xl font-bold', config.color)}>
              {dash(score)}
            </Title>
            <Text className="text-lg text-gray-500">/100</Text>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                config.bgColor,
                config.color
              )}
            >
              {config.label}
            </span>
          </div>
        </div>
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full',
            config.bgColor
          )}
        >
          <PiHeartbeatDuotone className={cn('h-10 w-10', config.color)} />
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
