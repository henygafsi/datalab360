'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Badge } from 'rizzui';
import {
  X,
  RefreshCw,
  Download,
  BarChart3,
  Database,
  Rows3,
  Columns3,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Hash,
  Type,
  Calendar,
  Binary,
  ChevronDown,
  ChevronRight,
  Shield,
  Key,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { getTableProfile, ColumnProfile } from '@/app/services/explore-design';

interface TableProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: string;
  schema: string;
  table: string;
}

const TableProfileModal: React.FC<TableProfileModalProps> = ({
  isOpen,
  onClose,
  database,
  schema,
  table,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<{
    table: string;
    row_count: number;
    column_count: number;
    columns: ColumnProfile[];
    overall_quality_score: number;
  } | null>(null);
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'quality' | 'nulls'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const loadData = useCallback(async () => {
    if (!database || !schema || !table) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getTableProfile(database, schema, table);
      setProfileData(data);
    } catch (err: any) {
      console.error('Failed to load table profile:', err);
      setError(err.message || 'Failed to load table profile. The backend endpoint may not be available.');
    } finally {
      setIsLoading(false);
    }
  }, [database, schema, table]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const toggleExpanded = (columnName: string) => {
    setExpandedColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnName)) {
        next.delete(columnName);
      } else {
        next.add(columnName);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (profileData) {
      setExpandedColumns(new Set(profileData.columns.map(c => c.column)));
    }
  };

  const collapseAll = () => {
    setExpandedColumns(new Set());
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
    return 'text-red-600 bg-red-100 dark:bg-red-900/30';
  };

  const getQualityIcon = (score: number) => {
    if (score >= 80) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (score >= 60) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  };

  const getDataTypeIcon = (dataType: string) => {
    const type = dataType.toUpperCase();
    if (type.includes('NUMBER') || type.includes('INT') || type.includes('DECIMAL') || type.includes('FLOAT')) {
      return <Hash className="h-4 w-4 text-blue-500" />;
    }
    if (type.includes('VARCHAR') || type.includes('STRING') || type.includes('TEXT') || type.includes('CHAR')) {
      return <Type className="h-4 w-4 text-purple-500" />;
    }
    if (type.includes('DATE') || type.includes('TIME') || type.includes('TIMESTAMP')) {
      return <Calendar className="h-4 w-4 text-orange-500" />;
    }
    if (type.includes('BOOL')) {
      return <Binary className="h-4 w-4 text-green-500" />;
    }
    return <Database className="h-4 w-4 text-slate-500" />;
  };

  const sortedColumns = profileData?.columns ? [...profileData.columns].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.column.localeCompare(b.column);
        break;
      case 'quality':
        comparison = a.data_quality_score - b.data_quality_score;
        break;
      case 'nulls':
        comparison = a.null_percentage - b.null_percentage;
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  }) : [];

  const handleExportCSV = () => {
    if (!profileData) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'Column', 'Data Type', 'Total Rows', 'Null Count', 'Null %',
      'Distinct Count', 'Distinct %', 'Min Value', 'Max Value',
      'Avg Value', 'Quality Score', 'Is Unique', 'Has Nulls'
    ].join(',');

    const rows = profileData.columns.map(col => [
      col.column,
      col.data_type,
      col.total_rows,
      col.null_count,
      col.null_percentage,
      col.distinct_count,
      col.distinct_percentage,
      col.min_value ?? '',
      col.max_value ?? '',
      col.avg_value ?? '',
      col.data_quality_score,
      col.is_unique,
      col.has_nulls
    ].join(','));

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table}_profile_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Profile exported to CSV');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} customSize="1100px">
      <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-bold">{table} - Data Profile</h2>
              <p className="text-sm text-purple-100">
                {database}.{schema}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profileData && (
              <Badge className={cn("text-white", getQualityColor(profileData.overall_quality_score))}>
                Quality: {profileData.overall_quality_score}%
              </Badge>
            )}
            <Button
              variant="text"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        {profileData && (
          <div className="px-6 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <Rows3 className="h-4 w-4 text-slate-400" />
              <span className="text-slate-500">Total Rows:</span>
              <span className="font-medium">{profileData.row_count.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Columns3 className="h-4 w-4 text-slate-400" />
              <span className="text-slate-500">Columns:</span>
              <span className="font-medium">{profileData.column_count}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-400" />
              <span className="text-slate-500">Overall Quality:</span>
              <span className={cn("font-medium px-2 py-0.5 rounded", getQualityColor(profileData.overall_quality_score))}>
                {profileData.overall_quality_score}%
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={isLoading}
                className="gap-1"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={!profileData}
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        {profileData && (
          <div className="px-6 py-2 border-b dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="text" size="sm" onClick={expandAll} className="text-xs">
                Expand All
              </Button>
              <Button variant="text" size="sm" onClick={collapseAll} className="text-xs">
                Collapse All
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2 py-1 border dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-800"
              >
                <option value="name">Name</option>
                <option value="quality">Quality Score</option>
                <option value="nulls">Null %</option>
              </select>
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="px-2 py-1 border dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-800 hover:bg-slate-50"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-purple-500 mb-4" />
              <p className="text-slate-500">Profiling table columns...</p>
              <p className="text-slate-400 text-sm mt-1">This may take a moment for large tables</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <p className="text-red-500 font-medium mb-2">Failed to load profile</p>
              <p className="text-slate-500 text-sm text-center max-w-md">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                className="mt-4 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : profileData ? (
            <div className="space-y-2">
              {sortedColumns.map((col) => {
                const isExpanded = expandedColumns.has(col.column);
                return (
                  <div
                    key={col.column}
                    className="border dark:border-slate-700 rounded-lg overflow-hidden"
                  >
                    {/* Column Header */}
                    <button
                      onClick={() => toggleExpanded(col.column)}
                      className="w-full px-4 py-3 flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}

                      {getDataTypeIcon(col.data_type)}

                      <span className="font-mono text-sm font-medium">{col.column}</span>

                      <Badge className="bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 text-[10px] font-mono">
                        {col.data_type}
                      </Badge>

                      {col.is_unique && (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                          <Key className="h-3 w-3 mr-1" />
                          UNIQUE
                        </Badge>
                      )}

                      {col.has_nulls && (
                        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">
                          {col.null_percentage.toFixed(1)}% NULL
                        </Badge>
                      )}

                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs text-slate-500">
                          {col.distinct_count.toLocaleString()} distinct
                        </span>
                        <div className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs font-medium", getQualityColor(col.data_quality_score))}>
                          {getQualityIcon(col.data_quality_score)}
                          {col.data_quality_score}%
                        </div>
                      </div>
                    </button>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 py-4 bg-white dark:bg-slate-900 border-t dark:border-slate-700">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {/* Row Stats */}
                          <div className="space-y-1">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Rows</p>
                            <p className="text-lg font-bold">{col.total_rows.toLocaleString()}</p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Null Count</p>
                            <p className="text-lg font-bold text-orange-600">{col.null_count.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{col.null_percentage.toFixed(2)}%</p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Distinct Values</p>
                            <p className="text-lg font-bold text-blue-600">{col.distinct_count.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{col.distinct_percentage.toFixed(2)}%</p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Quality Score</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    col.data_quality_score >= 80 ? "bg-green-500" :
                                    col.data_quality_score >= 60 ? "bg-yellow-500" : "bg-red-500"
                                  )}
                                  style={{ width: `${col.data_quality_score}%` }}
                                />
                              </div>
                              <span className="text-lg font-bold">{col.data_quality_score}%</span>
                            </div>
                          </div>

                          {/* Value Stats */}
                          {col.min_value != null && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500 uppercase tracking-wide">Min Value</p>
                              <p className="text-sm font-mono truncate" title={String(col.min_value)}>
                                {String(col.min_value)}
                              </p>
                            </div>
                          )}

                          {col.max_value != null && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500 uppercase tracking-wide">Max Value</p>
                              <p className="text-sm font-mono truncate" title={String(col.max_value)}>
                                {String(col.max_value)}
                              </p>
                            </div>
                          )}

                          {col.avg_value != null && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500 uppercase tracking-wide">Average</p>
                              <p className="text-sm font-mono">
                                {col.avg_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          )}

                          {/* String Length Stats */}
                          {col.min_length != null && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500 uppercase tracking-wide">Length Range</p>
                              <p className="text-sm font-mono">
                                {col.min_length} - {col.max_length} chars
                                {col.avg_length != null && (
                                  <span className="text-slate-400 ml-1">(avg: {col.avg_length?.toFixed(1)})</span>
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Most Frequent Values */}
                        {col.most_frequent && col.most_frequent.length > 0 && (
                          <div className="mt-4 pt-4 border-t dark:border-slate-700">
                            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Most Frequent Values</p>
                            <div className="flex flex-wrap gap-2">
                              {col.most_frequent.map((freq, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm"
                                >
                                  <span className="font-mono truncate max-w-[150px]" title={String(freq.value)}>
                                    {freq.value === null ? 'NULL' : String(freq.value)}
                                  </span>
                                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">
                                    {freq.count.toLocaleString()} ({freq.percentage}%)
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-slate-500">No profile data available</p>
            </div>
          )}
        </div>

        {/* Summary Footer */}
        {profileData && (
          <div className="px-6 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-slate-500">Good:</span>
                  <span className="font-medium">{profileData.columns.filter(c => c.data_quality_score >= 80).length}</span>
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-slate-500">Warning:</span>
                  <span className="font-medium">{profileData.columns.filter(c => c.data_quality_score >= 60 && c.data_quality_score < 80).length}</span>
                </span>
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-slate-500">Poor:</span>
                  <span className="font-medium">{profileData.columns.filter(c => c.data_quality_score < 60).length}</span>
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TableProfileModal;
