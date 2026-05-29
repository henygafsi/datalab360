'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Badge, Text, Tooltip } from 'rizzui';
import {
  X, Eye, BarChart3, RefreshCw, AlertTriangle, Check,
  Hash, Type, Calendar, Binary, Shield, ChevronDown, ChevronUp,
  Percent, List, Database, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { columnPreview, columnProfile } from '@/app/services/api/exploreDesignApi';

// Adapted shapes for rendering (mapped from new API responses)
interface ColumnPreviewData {
  sample_values: any[];
  total_rows: number;
}

interface ColumnProfile {
  total_rows: number;
  null_count: number;
  null_percentage: number;
  distinct_count: number;
  distinct_percentage: number;
  min_value?: any;
  max_value?: any;
  avg_value?: number;
  min_length?: number;
  max_length?: number;
  avg_length?: number;
  most_frequent?: Array<{ value: any; count: number; percentage: number }>;
  data_quality_score: number;
  is_unique: boolean;
  has_nulls: boolean;
}

interface ColumnPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  database: string;
  schema: string;
  table: string;
  column: string;
  dataType: string;
}

type TabType = 'preview' | 'profile';

const getDataTypeIcon = (dataType: string) => {
  const type = dataType.toUpperCase();
  if (type.includes('INT') || type.includes('NUMBER') || type.includes('DECIMAL') || type.includes('FLOAT')) {
    return <Hash className="h-4 w-4" />;
  }
  if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('CHAR') || type.includes('STRING')) {
    return <Type className="h-4 w-4" />;
  }
  if (type.includes('DATE') || type.includes('TIME') || type.includes('TIMESTAMP')) {
    return <Calendar className="h-4 w-4" />;
  }
  if (type.includes('BOOL')) {
    return <Binary className="h-4 w-4" />;
  }
  return <Database className="h-4 w-4" />;
};

const getQualityColor = (score: number) => {
  if (score >= 90) return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
  if (score >= 70) return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400';
  return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const ColumnPreviewModal: React.FC<ColumnPreviewModalProps> = ({
  isOpen,
  onClose,
  projectId,
  database,
  schema,
  table,
  column,
  dataType,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ColumnPreviewData | null>(null);
  const [profileData, setProfileData] = useState<ColumnProfile | null>(null);
  const [showAllFrequent, setShowAllFrequent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, database, schema, table, column]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    setPreviewData(null);
    setProfileData(null);

    try {
      // Load both preview and profile in parallel using new API
      const [previewResp, profileResp] = await Promise.all([
        columnPreview(projectId, database, schema, table, column).catch((err) => {
          console.error('Failed to load preview:', err);
          return null;
        }),
        columnProfile(projectId, database, schema, table, column).catch((err) => {
          console.error('Failed to load profile:', err);
          return null;
        }),
      ]);

      // Map new API response to rendering shape
      if (previewResp) {
        const values = Array.isArray(previewResp.values)
          ? previewResp.values.map((v: any) => (typeof v === 'object' && v !== null && 'value' in v ? v.value : v))
          : [];
        setPreviewData({ sample_values: values, total_rows: previewResp.count });
      }
      if (profileResp) {
        const totalRows = profileResp.total_count;
        const nullCount = profileResp.null_count;
        const distinctCount = profileResp.distinct_count;
        const nullPct = totalRows > 0 ? (nullCount / totalRows) * 100 : 0;
        const distinctPct = totalRows > 0 ? (distinctCount / totalRows) * 100 : 0;
        const topFrequent = (profileResp.top_values ?? []).map((tv) => ({
          value: tv.value,
          count: tv.count,
          percentage: totalRows > 0 ? (tv.count / totalRows) * 100 : 0,
        }));
        setProfileData({
          total_rows: totalRows,
          null_count: nullCount,
          null_percentage: nullPct,
          distinct_count: distinctCount,
          distinct_percentage: distinctPct,
          min_value: profileResp.min_value,
          max_value: profileResp.max_value,
          data_quality_score: profileResp.quality_score ?? 100,
          is_unique: distinctCount === totalRows && totalRows > 0,
          has_nulls: nullCount > 0,
          most_frequent: topFrequent.length > 0 ? topFrequent : undefined,
          max_length: profileResp.max_length ?? undefined,
        });
      }

      // If both failed, show error
      if (!previewResp && !profileResp) {
        setError('Failed to load column data. The backend endpoints may not be available.');
      }
    } catch (err) {
      console.error('Failed to load column data:', err);
      setError('Failed to load column data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              'bg-blue-100 dark:bg-blue-900/30'
            )}>
              {getDataTypeIcon(dataType)}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {column}
              </h3>
              <p className="text-sm text-slate-500">
                {database}.{schema}.{table}
              </p>
            </div>
            <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-mono text-xs">
              {dataType}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b dark:border-slate-700 px-6">
          <button
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'preview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
            onClick={() => setActiveTab('preview')}
          >
            <Eye className="h-4 w-4" />
            Data Preview
          </button>
          <button
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
            onClick={() => setActiveTab('profile')}
          >
            <BarChart3 className="h-4 w-4" />
            Column Profile
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[500px] overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="h-12 w-12 text-amber-500 mb-3" />
              <p className="text-slate-500">{error}</p>
              <Button variant="outline" size="sm" onClick={loadData} className="mt-4">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : activeTab === 'preview' ? (
            // Preview Tab
            <div>
              {previewData && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-slate-500">
                      Showing {previewData.sample_values.length} of {previewData.total_rows.toLocaleString()} rows
                    </p>
                    <Button variant="outline" size="sm" onClick={loadData}>
                      <RefreshCw className="h-3.5 w-3.5 mr-2" />
                      Refresh
                    </Button>
                  </div>

                  <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800">
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-16">
                            #
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-slate-700">
                        {previewData.sample_values.map((value, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-2 text-sm text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2 text-sm font-mono">
                              <span className={cn(
                                value === null && 'text-slate-400 italic'
                              )}>
                                {formatValue(value)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            // Profile Tab
            <div>
              {profileData && (
                <div className="space-y-6">
                  {/* Quality Score */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'p-3 rounded-full',
                        getQualityColor(profileData.data_quality_score)
                      )}>
                        {profileData.data_quality_score >= 90 ? (
                          <Check className="h-6 w-6" />
                        ) : profileData.data_quality_score >= 70 ? (
                          <Minus className="h-6 w-6" />
                        ) : (
                          <AlertTriangle className="h-6 w-6" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                          Data Quality Score
                        </p>
                        <p className={cn(
                          'text-2xl font-bold',
                          profileData.data_quality_score >= 90 ? 'text-green-600' :
                          profileData.data_quality_score >= 70 ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {profileData.data_quality_score}%
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {profileData.is_unique && (
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Unique Values
                        </Badge>
                      )}
                      {profileData.has_nulls && (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Contains NULLs
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 border dark:border-slate-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <List className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-slate-500">Total Rows</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {profileData.total_rows.toLocaleString()}
                      </p>
                    </div>

                    <div className="p-4 border dark:border-slate-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-slate-500">Distinct Values</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {profileData.distinct_count.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">
                        {profileData.distinct_percentage.toFixed(1)}%
                      </p>
                    </div>

                    <div className="p-4 border dark:border-slate-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-xs text-slate-500">NULL Count</span>
                      </div>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {profileData.null_count.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">
                        {profileData.null_percentage.toFixed(1)}%
                      </p>
                    </div>

                    <div className="p-4 border dark:border-slate-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Percent className="h-4 w-4 text-slate-400" />
                        <span className="text-xs text-slate-500">Completeness</span>
                      </div>
                      <p className="text-xl font-bold text-green-600">
                        {(100 - profileData.null_percentage).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Min/Max/Avg */}
                  <div className="p-4 border dark:border-slate-700 rounded-lg">
                    <h4 className="text-sm font-medium mb-3">Value Statistics</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                          <TrendingDown className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Min</p>
                          <p className="text-sm font-mono font-medium">
                            {formatValue(profileData.min_value)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Max</p>
                          <p className="text-sm font-mono font-medium">
                            {formatValue(profileData.max_value)}
                          </p>
                        </div>
                      </div>
                      {profileData.avg_value != null && (
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded">
                            <BarChart3 className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Average</p>
                            <p className="text-sm font-mono font-medium">
                              {profileData.avg_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Most Frequent Values */}
                  {profileData.most_frequent && profileData.most_frequent.length > 0 && (
                    <div className="p-4 border dark:border-slate-700 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">Most Frequent Values</h4>
                        {profileData.most_frequent.length > 3 && (
                          <button
                            onClick={() => setShowAllFrequent(!showAllFrequent)}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {showAllFrequent ? 'Show less' : 'Show all'}
                            {showAllFrequent ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(showAllFrequent ? profileData.most_frequent : profileData.most_frequent.slice(0, 3)).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-mono truncate max-w-[200px]">
                                  {formatValue(item.value)}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {item.count.toLocaleString()} ({item.percentage.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full"
                                  style={{ width: `${item.percentage}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* String Length Stats (for text columns) */}
                  {profileData.min_length != null && (
                    <div className="p-4 border dark:border-slate-700 rounded-lg">
                      <h4 className="text-sm font-medium mb-3">String Length Statistics</h4>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-slate-500">Min Length</p>
                          <p className="text-lg font-bold">{profileData.min_length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Max Length</p>
                          <p className="text-lg font-bold">{profileData.max_length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Avg Length</p>
                          <p className="text-lg font-bold">
                            {profileData.avg_length?.toFixed(1) ?? '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t dark:border-slate-700 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ColumnPreviewModal;
