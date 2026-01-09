'use client';

import { useState, useEffect } from 'react';
import { Text, Badge, Button, Loader } from 'rizzui';
import cn from '@core/utils/class-names';
import toast from 'react-hot-toast';
import {
  PiXBold,
  PiArrowSquareOut,
  PiCalendarDuotone,
  PiMapPinDuotone,
  PiCloudDuotone,
  PiCoinsDuotone,
  PiDatabaseDuotone,
  PiUsersDuotone,
  PiChartLineDuotone,
  PiHeartbeatDuotone,
  PiWarningDuotone,
  PiLightbulbDuotone,
} from 'react-icons/pi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { getAccountDetail } from '@/app/services/org-accounts/hooks';
import type { ClientAccount, AccountDetailResponse } from '@/app/services/org-accounts/types';

interface AccountDetailModalProps {
  account: ClientAccount | null;
  isOpen: boolean;
  onClose: () => void;
}

function getHealthColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function getHealthBgColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

const WAREHOUSE_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
];

export default function AccountDetailModal({
  account,
  isOpen,
  onClose,
}: AccountDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AccountDetailResponse | null>(null);

  useEffect(() => {
    if (isOpen && account) {
      fetchAccountDetail();
    } else {
      setDetail(null);
    }
  }, [isOpen, account]);

  async function fetchAccountDetail() {
    if (!account) return;

    setLoading(true);
    try {
      const data = await getAccountDetail(account.account_name);
      setDetail(data);
    } catch (error) {
      console.error('Failed to fetch account detail:', error);
      toast.error('Failed to load account details');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !account) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-white dark:bg-gray-900 z-50 shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {account.account_name}
                </Text>
                {account.account_url && (
                  <a
                    href={account.account_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-primary"
                  >
                    <PiArrowSquareOut className="h-5 w-5" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <Badge
                  variant="flat"
                  color={account.is_active ? 'success' : 'danger'}
                  size="sm"
                >
                  {account.is_active ? 'Active' : 'Inactive'}
                </Badge>
                {account.edition && (
                  <Badge variant="flat" color="primary" size="sm">
                    {account.edition.replace('_', ' ')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button variant="text" onClick={onClose}>
            <PiXBold className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader variant="spinner" size="xl" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Account Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <PiMapPinDuotone className="h-5 w-5 text-gray-500" />
                  <div>
                    <Text className="text-xs text-gray-500">Region</Text>
                    <Text className="font-medium text-gray-900 dark:text-white">
                      {account.region || 'N/A'}
                    </Text>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <PiCloudDuotone className="h-5 w-5 text-gray-500" />
                  <div>
                    <Text className="text-xs text-gray-500">Cloud</Text>
                    <Text className="font-medium text-gray-900 dark:text-white">
                      {account.cloud || 'N/A'}
                    </Text>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <PiCalendarDuotone className="h-5 w-5 text-gray-500" />
                  <div>
                    <Text className="text-xs text-gray-500">Created</Text>
                    <Text className="font-medium text-gray-900 dark:text-white">
                      {account.created_on
                        ? new Date(account.created_on).toLocaleDateString()
                        : 'N/A'}
                    </Text>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="h-5 w-5 text-gray-500 flex items-center justify-center text-xs font-bold">
                    ID
                  </div>
                  <div>
                    <Text className="text-xs text-gray-500">Locator</Text>
                    <Text className="font-medium text-gray-900 dark:text-white">
                      {account.account_locator || 'N/A'}
                    </Text>
                  </div>
                </div>
              </div>

              {/* Health Score */}
              {detail?.health && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <PiHeartbeatDuotone className="h-5 w-5 text-gray-600" />
                      <Text className="font-semibold text-gray-900 dark:text-white">
                        Health Score
                      </Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={cn('text-2xl font-bold', getHealthColor(detail.health.overall_score))}>
                        {detail.health.overall_score}
                      </div>
                      <Text className="text-gray-500">/100</Text>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
                    <div
                      className={cn('h-full rounded-full transition-all', getHealthBgColor(detail.health.overall_score))}
                      style={{ width: `${detail.health.overall_score}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <Text className="text-xs text-gray-500 mb-1">Cost</Text>
                      <Text className={cn('font-bold', getHealthColor(detail.health.cost_score))}>
                        {detail.health.cost_score}
                      </Text>
                    </div>
                    <div className="text-center">
                      <Text className="text-xs text-gray-500 mb-1">Activity</Text>
                      <Text className={cn('font-bold', getHealthColor(detail.health.activity_score))}>
                        {detail.health.activity_score}
                      </Text>
                    </div>
                    <div className="text-center">
                      <Text className="text-xs text-gray-500 mb-1">Security</Text>
                      <Text className={cn('font-bold', getHealthColor(detail.health.security_score))}>
                        {detail.health.security_score}
                      </Text>
                    </div>
                  </div>
                  {detail.health.issues.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <PiWarningDuotone className="h-4 w-4 text-amber-600" />
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">
                          Issues
                        </Text>
                      </div>
                      <ul className="space-y-1">
                        {detail.health.issues.map((issue, i) => (
                          <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                            <span className="text-amber-500 mt-1">•</span>
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.health.recommendations.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <PiLightbulbDuotone className="h-4 w-4 text-blue-600" />
                        <Text className="text-sm font-medium text-gray-900 dark:text-white">
                          Recommendations
                        </Text>
                      </div>
                      <ul className="space-y-1">
                        {detail.health.recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                            <span className="text-blue-500 mt-1">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Usage Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <PiCoinsDuotone className="h-4 w-4 text-amber-600" />
                    <Text className="text-xs text-gray-500">Credits (30d)</Text>
                  </div>
                  <Text className="text-xl font-bold text-gray-900 dark:text-white">
                    {detail?.credits?.total_credits?.toFixed(2) ?? '0'}
                  </Text>
                </div>
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <PiDatabaseDuotone className="h-4 w-4 text-purple-600" />
                    <Text className="text-xs text-gray-500">Storage</Text>
                  </div>
                  <Text className="text-xl font-bold text-gray-900 dark:text-white">
                    {detail?.storage?.total_tb?.toFixed(2) ?? '0'} TB
                  </Text>
                </div>
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <PiUsersDuotone className="h-4 w-4 text-blue-600" />
                    <Text className="text-xs text-gray-500">Active Users</Text>
                  </div>
                  <Text className="text-xl font-bold text-gray-900 dark:text-white">
                    {detail?.logins?.unique_users ?? '0'}
                  </Text>
                </div>
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <PiChartLineDuotone className="h-4 w-4 text-green-600" />
                    <Text className="text-xs text-gray-500">Queries (7d)</Text>
                  </div>
                  <Text className="text-xl font-bold text-gray-900 dark:text-white">
                    {detail?.queries?.query_count?.toLocaleString() ?? '0'}
                  </Text>
                </div>
              </div>

              {/* Warehouse Usage */}
              {detail?.warehouses && detail.warehouses.length > 0 && (
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Text className="font-semibold text-gray-900 dark:text-white mb-4">
                    Warehouse Usage
                  </Text>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={detail.warehouses.slice(0, 5)}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
                        <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="warehouse_name"
                          stroke="#9ca3af"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          width={75}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
                                  <Text className="text-xs font-medium text-gray-900 dark:text-white">
                                    {data.warehouse_name}
                                  </Text>
                                  <Text className="text-xs text-gray-600">
                                    Credits: {data.total_credits?.toFixed(2) ?? '0'}
                                  </Text>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="total_credits" radius={[0, 4, 4, 0]}>
                          {detail.warehouses.slice(0, 5).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={WAREHOUSE_COLORS[index % WAREHOUSE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Login Activity */}
              {detail?.logins && (
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Text className="font-semibold text-gray-900 dark:text-white mb-4">
                    Login Activity
                  </Text>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Text className="text-xs text-gray-500">Unique Users</Text>
                      <Text className="text-lg font-bold text-gray-900 dark:text-white">
                        {detail.logins.unique_users}
                      </Text>
                    </div>
                    <div>
                      <Text className="text-xs text-gray-500">Total Logins</Text>
                      <Text className="text-lg font-bold text-gray-900 dark:text-white">
                        {detail.logins.total_logins}
                      </Text>
                    </div>
                    <div>
                      <Text className="text-xs text-gray-500">Successful</Text>
                      <Text className="text-lg font-bold text-green-600">
                        {detail.logins.successful_logins}
                      </Text>
                    </div>
                    <div>
                      <Text className="text-xs text-gray-500">Failed</Text>
                      <Text className="text-lg font-bold text-red-600">
                        {detail.logins.failed_logins}
                      </Text>
                    </div>
                  </div>
                  {detail.logins.last_login && (
                    <Text className="text-xs text-gray-500 mt-4">
                      Last login: {new Date(detail.logins.last_login).toLocaleString()}
                    </Text>
                  )}
                </div>
              )}

              {/* Alerts for this account */}
              {detail?.alerts && detail.alerts.length > 0 && (
                <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <Text className="font-semibold text-gray-900 dark:text-white mb-4">
                    Recent Alerts
                  </Text>
                  <div className="space-y-3">
                    {detail.alerts.map((alert, index) => (
                      <div
                        key={index}
                        className={cn(
                          'p-3 rounded-lg',
                          alert.alert_type === 'critical' && 'bg-red-50 dark:bg-red-900/20',
                          alert.alert_type === 'warning' && 'bg-amber-50 dark:bg-amber-900/20',
                          alert.alert_type === 'security' && 'bg-purple-50 dark:bg-purple-900/20',
                          alert.alert_type === 'info' && 'bg-blue-50 dark:bg-blue-900/20'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Text className="text-sm font-medium text-gray-900 dark:text-white">
                            {alert.title}
                          </Text>
                          <Badge
                            variant="flat"
                            color={
                              alert.alert_type === 'critical'
                                ? 'danger'
                                : alert.alert_type === 'warning'
                                ? 'warning'
                                : alert.alert_type === 'security'
                                ? 'secondary'
                                : 'info'
                            }
                            size="sm"
                          >
                            {alert.alert_type}
                          </Badge>
                        </div>
                        <Text className="text-sm text-gray-600 dark:text-gray-300">
                          {alert.message}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
