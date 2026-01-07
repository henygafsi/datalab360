'use client';

import cn from '@core/utils/class-names';
import { Text, Title, Badge } from 'rizzui';
import { PiShieldCheckDuotone, PiLockKeyDuotone, PiUsersThreeDuotone, PiWarningDuotone, PiMaskHappyDuotone, PiTableDuotone } from 'react-icons/pi';
import type { SecurityPosture } from '@/app/services/observability/types';

interface SecurityPostureCardProps {
  data: SecurityPosture | null;
  isLoading?: boolean;
  className?: string;
}

export default function SecurityPostureCard({ data, isLoading, className }: SecurityPostureCardProps) {
  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-50', className)}>
        <div className="animate-pulse">
          <div className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-4 h-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-50', className)}>
        <Title as="h3" className="text-base font-semibold">Security Posture</Title>
        <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
          <PiShieldCheckDuotone className="h-12 w-12 text-gray-400" />
          <Text className="mt-2 text-sm text-gray-500">No security data available</Text>
          <Text className="mt-1 text-xs text-gray-400">Security metrics may not be accessible</Text>
        </div>
      </div>
    );
  }

  // Use new API fields
  const mfaCoverage = data.mfa_coverage_percent ?? 0;
  const totalUsers = data.total_users ?? 0;
  const mfaEnabledUsers = data.mfa_enabled_users ?? 0;
  const failedLogins = data.failed_logins_7days ?? 0;
  const maskingPolicies = data.masking_policies ?? 0;
  const rlsPolicies = data.rls_policies ?? 0;

  // Calculate security score based on metrics
  const securityScore = Math.round(
    (mfaCoverage * 0.4) + // MFA coverage weighs 40%
    (maskingPolicies > 0 ? 30 : 0) + // Masking policies weighs 30%
    (rlsPolicies > 0 ? 20 : 0) + // RLS policies weighs 20%
    (failedLogins < 10 ? 10 : failedLogins < 50 ? 5 : 0) // Low failed logins weighs 10%
  );

  // Determine status based on score
  const getStatusConfig = (score: number): { status: string; color: string; bgColor: string; badgeColor: 'success' | 'warning' | 'danger' } => {
    if (score >= 80) return { status: 'Secure', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/20', badgeColor: 'success' };
    if (score >= 50) return { status: 'Moderate', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-900/20', badgeColor: 'warning' };
    return { status: 'At Risk', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/20', badgeColor: 'danger' };
  };

  const config = getStatusConfig(securityScore);

  const metrics = [
    {
      icon: PiLockKeyDuotone,
      label: 'MFA Coverage',
      value: `${mfaCoverage.toFixed(0)}%`,
      detail: `${mfaEnabledUsers} of ${totalUsers} users`,
      progress: mfaCoverage,
      color: mfaCoverage >= 80 ? 'success' : mfaCoverage >= 50 ? 'warning' : 'danger',
    },
    {
      icon: PiMaskHappyDuotone,
      label: 'Masking Policies',
      value: maskingPolicies.toString(),
      detail: 'Active policies',
      progress: null,
      color: 'primary' as const,
    },
    {
      icon: PiTableDuotone,
      label: 'RLS Policies',
      value: rlsPolicies.toString(),
      detail: 'Row-level security',
      progress: null,
      color: 'secondary' as const,
    },
    {
      icon: PiUsersThreeDuotone,
      label: 'Total Users',
      value: totalUsers.toString(),
      detail: 'Account users',
      progress: null,
      color: 'primary' as const,
    },
  ];

  return (
    <div className={cn('rounded-xl border border-muted bg-gray-0 p-6 dark:bg-gray-50', className)}>
      <div className="flex items-center justify-between">
        <Title as="h3" className="text-base font-semibold">Security Posture</Title>
        <Badge variant="flat" color={config.badgeColor}>
          {config.status}
        </Badge>
      </div>

      {/* Overall Score */}
      <div className={cn('mt-4 rounded-lg p-4', config.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PiShieldCheckDuotone className={cn('h-8 w-8', config.color)} />
            <div>
              <Text className="text-sm text-gray-600 dark:text-gray-400">Security Score</Text>
              <Text className={cn('text-2xl font-bold', config.color)}>
                {securityScore}/100
              </Text>
            </div>
          </div>
          {failedLogins > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 dark:bg-red-900/30">
              <PiWarningDuotone className="h-4 w-4 text-red-600" />
              <Text className="text-sm font-medium text-red-600">
                {failedLogins} failed logins (7d)
              </Text>
            </div>
          )}
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              securityScore >= 80 ? 'bg-green-500' : securityScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
            )}
            style={{ width: `${securityScore}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-4 space-y-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-100/50"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-gray-600" />
                <div>
                  <Text className="text-sm font-medium">{metric.label}</Text>
                  <Text className="text-xs text-gray-500">{metric.detail}</Text>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {metric.progress !== null && (
                  <div className="w-24">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          metric.color === 'success' ? 'bg-green-500' :
                          metric.color === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                        )}
                        style={{ width: `${metric.progress}%` }}
                      />
                    </div>
                  </div>
                )}
                <Text className="min-w-[3rem] text-right text-sm font-semibold">
                  {metric.value}
                </Text>
              </div>
            </div>
          );
        })}
      </div>

      {/* Assessment Timestamp */}
      {data.assessment_timestamp && (
        <Text className="mt-4 text-center text-xs text-gray-400">
          Last assessed: {new Date(data.assessment_timestamp).toLocaleString()}
        </Text>
      )}
    </div>
  );
}
