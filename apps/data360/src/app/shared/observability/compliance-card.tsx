'use client';

import cn from '@core/utils/class-names';
import { Text, Title, Badge, Button } from 'rizzui';
import { PiShieldCheckDuotone, PiWarningDuotone, PiXCircleDuotone, PiCheckCircleDuotone, PiArrowRightBold } from 'react-icons/pi';
import type { GdprReport, Soc2Report, ComplianceControl } from '@/app/services/observability/types';

interface ComplianceCardProps {
  type: 'gdpr' | 'soc2';
  report: GdprReport | Soc2Report | null;
  isLoading?: boolean;
  onViewDetails?: () => void;
  className?: string;
}

const statusConfig = {
  compliant: {
    icon: PiCheckCircleDuotone,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    label: 'Compliant',
    badgeColor: 'success' as const,
  },
  partial: {
    icon: PiWarningDuotone,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    label: 'Partial',
    badgeColor: 'warning' as const,
  },
  non_compliant: {
    icon: PiXCircleDuotone,
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'Non-Compliant',
    badgeColor: 'danger' as const,
  },
  not_applicable: {
    icon: PiShieldCheckDuotone,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    label: 'N/A',
    badgeColor: 'secondary' as const,
  },
};

function ControlItem({ control, label }: { control: ComplianceControl; label: string }) {
  const config = statusConfig[control.status] || statusConfig.not_applicable;
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-100/50">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', config.color)} />
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </Text>
      </div>
      <Badge size="sm" variant="flat" color={config.badgeColor}>
        {config.label}
      </Badge>
    </div>
  );
}

export default function ComplianceCard({
  type,
  report,
  isLoading,
  onViewDetails,
  className,
}: ComplianceCardProps) {
  const title = type === 'gdpr' ? 'GDPR Compliance' : 'SOC 2 Type II';
  const description = type === 'gdpr'
    ? 'EU General Data Protection Regulation'
    : 'Trust Service Criteria';

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
        <div className="animate-pulse">
          <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-4 h-20 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-4 space-y-2">
            <div className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
        <Title as="h3" className="text-base font-semibold">{title}</Title>
        <Text className="mt-1 text-sm text-gray-500">{description}</Text>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <PiShieldCheckDuotone className="h-12 w-12 text-gray-400" />
          <Text className="mt-2 text-sm text-gray-500">
            No compliance data available
          </Text>
        </div>
      </div>
    );
  }

  const overallConfig = statusConfig[report.overall_status] || statusConfig.partial;
  const OverallIcon = overallConfig.icon;

  // Get controls based on report type
  const controls = type === 'gdpr'
    ? [
        { key: 'article_17', label: 'Article 17 - Right to Erasure', control: (report as GdprReport).article_17 },
        { key: 'article_32', label: 'Article 32 - Security', control: (report as GdprReport).article_32 },
        { key: 'article_30', label: 'Article 30 - Records', control: (report as GdprReport).article_30 },
      ]
    : [
        { key: 'cc6_1', label: 'CC6.1 - Logical Access', control: (report as Soc2Report).cc6_1 },
        { key: 'cc7_2', label: 'CC7.2 - Security Monitoring', control: (report as Soc2Report).cc7_2 },
        { key: 'cc8_1', label: 'CC8.1 - Change Management', control: (report as Soc2Report).cc8_1 },
      ];

  return (
    <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-800', className)}>
      <div className="flex items-start justify-between">
        <div>
          <Title as="h3" className="text-base font-semibold">{title}</Title>
          <Text className="mt-1 text-sm text-gray-500">{description}</Text>
        </div>
        <div className={cn('rounded-full p-2', overallConfig.bgColor)}>
          <OverallIcon className={cn('h-6 w-6', overallConfig.color)} />
        </div>
      </div>

      {/* Overall Score */}
      <div className={cn('mt-4 rounded-lg p-4', overallConfig.bgColor)}>
        <div className="flex items-center justify-between">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Overall Score
          </Text>
          <div className="flex items-center gap-2">
            <Text className={cn('text-2xl font-bold', overallConfig.color)}>
              {report.overall_score}%
            </Text>
            <Badge variant="flat" color={overallConfig.badgeColor}>
              {overallConfig.label}
            </Badge>
          </div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              report.overall_score >= 80 ? 'bg-green-500' : report.overall_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
            )}
            style={{ width: `${report.overall_score}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 space-y-2">
        {controls.map(({ key, label, control }) => (
          control && <ControlItem key={key} control={control} label={label} />
        ))}
      </div>

      {/* View Details Button */}
      {onViewDetails && (
        <Button
          variant="text"
          color="primary"
          className="mt-4 w-full justify-center"
          onClick={onViewDetails}
        >
          View Full Report
          <PiArrowRightBold className="ml-2 h-4 w-4" />
        </Button>
      )}

      {/* Generated At */}
      <Text className="mt-4 text-center text-xs text-gray-400">
        Generated: {new Date(report.generated_at).toLocaleString()}
      </Text>
    </div>
  );
}
