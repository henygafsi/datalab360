'use client';

import cn from '@core/utils/class-names';
import { Text, Title, Badge } from 'rizzui';
import { PiLightbulbDuotone, PiWarningDuotone, PiInfoDuotone } from 'react-icons/pi';
import type { Recommendation } from '@/app/services/observability/types';

interface RecommendationsCardProps {
  recommendations: Recommendation[];
  className?: string;
}

const priorityConfig = {
  high: {
    icon: PiWarningDuotone,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    badgeColor: 'danger' as const,
  },
  medium: {
    icon: PiLightbulbDuotone,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    badgeColor: 'warning' as const,
  },
  low: {
    icon: PiInfoDuotone,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    badgeColor: 'info' as const,
  },
};

export default function RecommendationsCard({ recommendations, className }: RecommendationsCardProps) {
  if (!recommendations || recommendations.length === 0) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-50', className)}>
        <Title as="h3" className="text-base font-semibold">
          Recommendations
        </Title>
        <div className="mt-4 flex flex-col items-center justify-center py-8 text-center">
          <PiLightbulbDuotone className="h-12 w-12 text-green-500" />
          <Text className="mt-2 text-sm text-gray-500">
            No recommendations at this time. Your system is running optimally!
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-50', className)}>
      <div className="flex items-center justify-between">
        <Title as="h3" className="text-base font-semibold">
          Recommendations
        </Title>
        <Badge variant="flat" color="primary">
          {recommendations.length} items
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        {recommendations.map((rec, index) => {
          const config = priorityConfig[rec.priority];
          const Icon = config.icon;

          return (
            <div
              key={index}
              className={cn(
                'rounded-lg border border-gray-200 p-4 dark:border-gray-700',
                config.bgColor
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn('mt-0.5 flex-shrink-0', config.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Text className="font-medium text-gray-900 dark:text-gray-100">
                      {rec.title}
                    </Text>
                    <Badge size="sm" variant="flat" color={config.badgeColor}>
                      {rec.priority}
                    </Badge>
                    <Badge size="sm" variant="outline">
                      {rec.category}
                    </Badge>
                  </div>
                  <Text className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {rec.description}
                  </Text>
                  {rec.impact && (
                    <Text className="mt-2 text-xs text-gray-500">
                      <span className="font-medium">Impact:</span> {rec.impact}
                    </Text>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
