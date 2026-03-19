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
  Key,
  Sparkles,
  Check,
  Loader2,
  ChevronDown,
  Layers,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import {
  tableProfile as fetchTableProfile,
  aiClassifyColumns,
  aiOptimizeTypes,
  aiClusteringKeys,
} from '@/app/services/api/exploreDesignApi';
import type { AiColumnCategory, ClusteringKeysResult } from '@/app/services/api/types';
import { useAiFeatures } from '../stores/ai-store';

// Adapted column profile shape for rendering (mapped from new API)
interface ColumnProfile {
  column: string;
  data_type: string;
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

// ── AI Column Classification & Optimization ─────────────────────────────────

type AiClass =
  | 'IDENTIFIER'
  | 'PII_CANDIDATE'
  | 'MEASURE'
  | 'FLAG'
  | 'DIMENSION'
  | 'TIMESTAMP'
  | 'FOREIGN_KEY'
  | 'METADATA'
  | 'TEXT_CONTENT'
  | 'CATEGORICAL';

interface ColumnAiResult {
  aiClass: AiClass;
  suggestion: string | null;
  sql?: string;
}

const aiClassConfig: Record<AiClass, { color: string; bgColor: string }> = {
  IDENTIFIER:    { color: 'text-indigo-700 dark:text-indigo-300', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  PII_CANDIDATE: { color: 'text-red-700 dark:text-red-300',      bgColor: 'bg-red-100 dark:bg-red-900/30' },
  MEASURE:       { color: 'text-blue-700 dark:text-blue-300',     bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  FLAG:          { color: 'text-amber-700 dark:text-amber-300',   bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  DIMENSION:     { color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  TIMESTAMP:     { color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  FOREIGN_KEY:   { color: 'text-cyan-700 dark:text-cyan-300',     bgColor: 'bg-cyan-100 dark:bg-cyan-900/30' },
  METADATA:      { color: 'text-slate-600 dark:text-slate-400',   bgColor: 'bg-slate-200 dark:bg-slate-700' },
  TEXT_CONTENT:  { color: 'text-emerald-700 dark:text-emerald-300', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  CATEGORICAL:   { color: 'text-pink-700 dark:text-pink-300',     bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
};

function classifyColumn(col: ColumnProfile, rowCount: number, tableName: string): ColumnAiResult {
  const name = col.column.toUpperCase();
  const dtype = col.data_type.toUpperCase();

  // ── PII detection ─────────────────────────────────────────────────────
  const piiPatterns = ['EMAIL', 'PHONE', 'SSN', 'PASSPORT', 'ADDRESS', 'FIRST_NAME', 'LAST_NAME',
    'FULL_NAME', 'BIRTH', 'DOB', 'CREDIT_CARD', 'CARD_NUM', 'IBAN', 'ZIP_CODE', 'POSTAL'];
  if (piiPatterns.some((p) => name.includes(p))) {
    return {
      aiClass: 'PII_CANDIDATE',
      suggestion: 'Add masking policy',
      sql: `ALTER TABLE ${tableName} ALTER COLUMN ${col.column} SET MASKING POLICY pii_mask;`,
    };
  }

  // ── Identifier (unique + non-null, often PK or FK) ────────────────────
  if (col.is_unique && !col.has_nulls && (name.includes('_ID') || name.endsWith('ID') || name === 'ID' || name.includes('_KEY') || name.includes('_CODE'))) {
    return { aiClass: 'IDENTIFIER', suggestion: null };
  }

  // ── Foreign key pattern (ends with _ID but not unique) ────────────────
  if (!col.is_unique && (name.endsWith('_ID') || name.endsWith('_KEY') || name.endsWith('_FK')) && !col.has_nulls) {
    return { aiClass: 'FOREIGN_KEY', suggestion: null };
  }

  // ── Timestamp / date columns ──────────────────────────────────────────
  if (dtype.includes('DATE') || dtype.includes('TIMESTAMP') || dtype.includes('TIME')) {
    return { aiClass: 'TIMESTAMP', suggestion: null };
  }
  // Date stored as string
  if ((dtype.includes('VARCHAR') || dtype.includes('STRING')) && col.min_value != null) {
    const val = String(col.min_value);
    if (/^\d{4}-\d{2}-\d{2}/.test(val) || /^\d{2}\/\d{2}\/\d{4}/.test(val)) {
      const hasTime = /\d{2}:\d{2}/.test(val);
      const target = hasTime ? 'TIMESTAMP_NTZ' : 'DATE';
      return {
        aiClass: 'TIMESTAMP',
        suggestion: `Change to ${target}`,
        sql: `ALTER TABLE ${tableName} ALTER COLUMN ${col.column} SET DATA TYPE ${target};`,
      };
    }
  }
  if (name.includes('CREATED') || name.includes('UPDATED') || name.includes('_AT') || name.includes('_DATE') || name.includes('_TIME') || name === 'TIMESTAMP') {
    return { aiClass: 'TIMESTAMP', suggestion: null };
  }

  // ── Flag / boolean ────────────────────────────────────────────────────
  if (dtype.includes('BOOL')) {
    return { aiClass: 'FLAG', suggestion: null };
  }
  if (name.startsWith('IS_') || name.startsWith('HAS_') || name.startsWith('CAN_') || name.includes('_FLAG') || name.includes('ACTIVE') || name.includes('ENABLED')) {
    if ((dtype.includes('VARCHAR') || dtype.includes('STRING') || dtype.includes('NUMBER')) && col.distinct_count <= 2) {
      return {
        aiClass: 'FLAG',
        suggestion: 'Change to BOOLEAN',
        sql: `ALTER TABLE ${tableName} ALTER COLUMN ${col.column} SET DATA TYPE BOOLEAN;`,
      };
    }
    return { aiClass: 'FLAG', suggestion: null };
  }
  // Generic 2-value detection
  if (col.distinct_count === 2 && (dtype.includes('VARCHAR') || dtype.includes('STRING') || dtype.includes('NUMBER'))) {
    const minStr = String(col.min_value ?? '').toUpperCase();
    const maxStr = String(col.max_value ?? '').toUpperCase();
    const boolPairs = [['0', '1'], ['TRUE', 'FALSE'], ['YES', 'NO'], ['Y', 'N'], ['T', 'F']];
    if (boolPairs.some(([a, b]) => (minStr === a && maxStr === b) || (minStr === b && maxStr === a))) {
      return {
        aiClass: 'FLAG',
        suggestion: 'Change to BOOLEAN',
        sql: `ALTER TABLE ${tableName} ALTER COLUMN ${col.column} SET DATA TYPE BOOLEAN;`,
      };
    }
  }

  // ── Measure (numeric, not an ID) ──────────────────────────────────────
  if (
    (dtype.includes('NUMBER') || dtype.includes('INT') || dtype.includes('FLOAT') || dtype.includes('DECIMAL') || dtype.includes('DOUBLE')) &&
    !name.includes('_ID') && !name.endsWith('ID')
  ) {
    // Numeric stored as string
    return { aiClass: 'MEASURE', suggestion: null };
  }
  // Numeric values in a VARCHAR
  if (
    (dtype.includes('VARCHAR') || dtype.includes('STRING')) &&
    col.min_value != null && col.max_value != null &&
    !isNaN(Number(col.min_value)) && !isNaN(Number(col.max_value)) &&
    col.distinct_count > 2
  ) {
    const allInts = Number(col.min_value) === Math.floor(Number(col.min_value)) &&
      Number(col.max_value) === Math.floor(Number(col.max_value));
    const target = allInts ? 'NUMBER(38,0)' : 'FLOAT';
    return {
      aiClass: 'MEASURE',
      suggestion: `Change to ${target}`,
      sql: `ALTER TABLE ${tableName} ALTER COLUMN ${col.column} SET DATA TYPE ${target};`,
    };
  }

  // ── Metadata columns ──────────────────────────────────────────────────
  if (name.includes('CREATED_BY') || name.includes('UPDATED_BY') || name.includes('MODIFIED_BY') || name.includes('VERSION') || name.includes('ETL_') || name.includes('LOAD_')) {
    return { aiClass: 'METADATA', suggestion: null };
  }

  // ── Categorical / dimension (string with low cardinality) ─────────────
  if (
    (dtype.includes('VARCHAR') || dtype.includes('STRING')) &&
    col.distinct_count > 0 && col.distinct_count < 50 && rowCount > 0
  ) {
    return { aiClass: 'CATEGORICAL', suggestion: null };
  }

  // ── Dimension (string with moderate cardinality) ──────────────────────
  if (
    (dtype.includes('VARCHAR') || dtype.includes('STRING')) &&
    col.distinct_count >= 50 && col.distinct_count < rowCount * 0.8
  ) {
    return { aiClass: 'DIMENSION', suggestion: null };
  }

  // ── Text content (high cardinality strings, likely free text) ─────────
  if (
    (dtype.includes('VARCHAR') || dtype.includes('STRING') || dtype.includes('TEXT')) &&
    col.distinct_count >= rowCount * 0.8
  ) {
    return { aiClass: 'TEXT_CONTENT', suggestion: null };
  }

  // ── Default: unique identifier ────────────────────────────────────────
  if (col.is_unique && !col.has_nulls) {
    return { aiClass: 'IDENTIFIER', suggestion: null };
  }

  return { aiClass: 'DIMENSION', suggestion: null };
}

// Map backend AI categories to local UI AiClass
const apiCategoryToAiClass: Record<AiColumnCategory, AiClass> = {
  PII: 'PII_CANDIDATE',
  METRIC: 'MEASURE',
  DIMENSION: 'DIMENSION',
  KEY: 'IDENTIFIER',
  AUDIT: 'METADATA',
  TECHNICAL: 'METADATA',
  UNKNOWN: 'DIMENSION',
};

interface AiSuggestionEvent {
  column: string;
  aiClass: AiClass;
  suggestion: string;
  currentType: string;
  sql?: string;
}

interface TableProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  database: string;
  schema: string;
  table: string;
  onAcceptSuggestion?: (event: AiSuggestionEvent) => void;
}

const TableProfileModal: React.FC<TableProfileModalProps> = ({
  isOpen,
  onClose,
  projectId,
  database,
  schema,
  table,
  onAcceptSuggestion,
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
  const [sortBy, setSortBy] = useState<'name' | 'quality' | 'nulls'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [aiResults, setAiResults] = useState<Record<string, ColumnAiResult>>({});
  const [aiAccepted, setAiAccepted] = useState<Record<string, boolean>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  // Clustering keys state
  const [clusteringResult, setClusteringResult] = useState<ClusteringKeysResult | null>(null);
  const [isClusteringLoading, setIsClusteringLoading] = useState(false);
  const [clusteringExpanded, setClusteringExpanded] = useState(true);

  const loadData = useCallback(async () => {
    if (!database || !schema || !table) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchTableProfile(projectId, database, schema, table);
      // Map new API response to rendering shape
      const mappedColumns: ColumnProfile[] = (data.columns ?? []).map((col) => {
        const totalRows = data.row_count;
        const nullCount = col.null_count ?? 0;
        const distinctCount = col.distinct_count ?? 0;
        const nullPct = totalRows > 0 ? (nullCount / totalRows) * 100 : 0;
        const distinctPct = totalRows > 0 ? (distinctCount / totalRows) * 100 : 0;
        return {
          column: col.column_name,
          data_type: col.data_type,
          total_rows: totalRows,
          null_count: nullCount,
          null_percentage: nullPct,
          distinct_count: distinctCount,
          distinct_percentage: distinctPct,
          min_value: col.min_value,
          max_value: col.max_value,
          data_quality_score: col.quality_score ?? 100,
          is_unique: distinctCount === totalRows && totalRows > 0,
          has_nulls: nullCount > 0,
        };
      });
      setProfileData({
        table: data.table,
        row_count: data.row_count,
        column_count: data.column_count,
        columns: mappedColumns,
        overall_quality_score: data.aggregate_quality_score ?? 100,
      });
    } catch (err: any) {
      console.error('Failed to load table profile:', err);
      setError(err.message || 'Failed to load table profile. The backend endpoint may not be available.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, database, schema, table]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const { isEnabled } = useAiFeatures();

  const handleGenerateAi = useCallback(async () => {
    if (!profileData) return;
    setIsGenerating(true);

    const fqn = `${database}.${schema}.${table}`;
    const results: Record<string, ColumnAiResult> = {};

    try {
      // Try server-side classification if enabled
      if (isEnabled('column_classification') && projectId) {
        const [classifyRes, optimizeRes] = await Promise.allSettled([
          aiClassifyColumns(projectId, { database, schema, table }),
          isEnabled('data_type_optimizer')
            ? aiOptimizeTypes(projectId, { database, schema, table })
            : Promise.resolve(null),
        ]);

        if (classifyRes.status === 'fulfilled' && classifyRes.value) {
          for (const cls of classifyRes.value.classifications) {
            const uiClass = apiCategoryToAiClass[cls.category] || 'DIMENSION';
            results[cls.column] = {
              aiClass: uiClass,
              suggestion: cls.suggestion,
            };
          }
        }

        // Merge type optimization suggestions
        if (optimizeRes.status === 'fulfilled' && optimizeRes.value) {
          for (const opt of optimizeRes.value.optimizations) {
            if (results[opt.column]) {
              results[opt.column].suggestion = results[opt.column].suggestion || opt.reason;
              results[opt.column].sql = `ALTER TABLE ${fqn} ALTER COLUMN ${opt.column} SET DATA TYPE ${opt.suggested_type};`;
            } else {
              results[opt.column] = {
                aiClass: 'MEASURE',
                suggestion: opt.reason,
                sql: `ALTER TABLE ${fqn} ALTER COLUMN ${opt.column} SET DATA TYPE ${opt.suggested_type};`,
              };
            }
          }
        }

        // If server returned results, use them
        if (Object.keys(results).length > 0) {
          // Fill any missing columns with client-side fallback
          for (const col of profileData.columns) {
            if (!results[col.column]) {
              results[col.column] = classifyColumn(col, profileData.row_count, fqn);
            }
          }
          setAiResults(results);
          setAiAccepted({});
          setAiGenerated(true);
          const sugCount = Object.values(results).filter((r) => r.suggestion).length;
          toast.success(
            sugCount > 0
              ? `AI classified ${profileData.columns.length} columns, ${sugCount} suggestion${sugCount > 1 ? 's' : ''}`
              : `AI classified ${profileData.columns.length} columns — all types look good!`,
          );
          return;
        }
      }
    } catch {
      // Fallback to client-side classification
    }

    // Client-side fallback
    for (const col of profileData.columns) {
      results[col.column] = classifyColumn(col, profileData.row_count, fqn);
    }
    setAiResults(results);
    setAiAccepted({});
    setAiGenerated(true);
    const sugCount = Object.values(results).filter((r) => r.suggestion).length;
    toast.success(
      sugCount > 0
        ? `Classified ${profileData.columns.length} columns, ${sugCount} suggestion${sugCount > 1 ? 's' : ''}`
        : `Classified ${profileData.columns.length} columns — all types look good!`,
    );
  }, [profileData, database, schema, table, projectId, isEnabled]);

  // Wrap in useCallback to make it sync from the caller's perspective
  const handleGenerateAiClick = useCallback(() => {
    handleGenerateAi().finally(() => setIsGenerating(false));
  }, [handleGenerateAi]);

  const handleAcceptSuggestion = (colName: string) => {
    setAiAccepted((prev) => ({ ...prev, [colName]: true }));
    const r = aiResults[colName];
    const colProfile = profileData?.columns.find((c) => c.column === colName);
    if (r?.suggestion) {
      onAcceptSuggestion?.({
        column: colName,
        aiClass: r.aiClass,
        suggestion: r.suggestion,
        currentType: colProfile?.data_type ?? '',
        sql: r.sql,
      });
    }
    if (r?.sql) {
      navigator.clipboard.writeText(r.sql);
      toast.success(`Accepted — DDL event created, SQL copied`);
    } else {
      toast.success('Accepted');
    }
  };

  const handleRejectSuggestion = (colName: string) => {
    setAiResults((prev) => {
      const next = { ...prev };
      if (next[colName]) {
        next[colName] = { ...next[colName], suggestion: null, sql: undefined };
      }
      return next;
    });
    toast.success('Dismissed');
  };

  // ── Clustering Keys ──────────────────────────────────────────────────────
  const handleSuggestClustering = useCallback(async () => {
    if (!profileData) return;
    setIsClusteringLoading(true);
    try {
      const result = await aiClusteringKeys(projectId, {
        database,
        schema,
        table: table,
      });
      setClusteringResult(result);
      setClusteringExpanded(true);
      if (result.suggestions.length > 0) {
        toast.success(
          `Found ${result.suggestions.length} clustering suggestion${result.suggestions.length > 1 ? 's' : ''}`,
        );
      } else {
        toast.success('No clustering improvements suggested for this table');
      }
    } catch (err: any) {
      console.error('Failed to get clustering suggestions:', err);
      toast.error(err.message || 'Failed to get clustering key suggestions');
    } finally {
      setIsClusteringLoading(false);
    }
  }, [profileData, projectId, database, schema, table]);

  const handleApplyClusteringSql = () => {
    if (!clusteringResult?.ddl) return;
    navigator.clipboard.writeText(clusteringResult.ddl);
    toast.success('Clustering DDL copied to clipboard');
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
              <span className="font-medium">{(profileData.row_count ?? 0).toLocaleString()}</span>
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateAiClick}
                disabled={isGenerating || !profileData}
                className="gap-1 border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating ? 'Analyzing...' : aiGenerated ? 'Re-analyze' : 'AI Optimize'}
              </Button>
              {isEnabled('clustering_keys') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestClustering}
                  disabled={isClusteringLoading || !profileData}
                  className="gap-1 border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                >
                  {isClusteringLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Layers className="h-4 w-4" />
                  )}
                  {isClusteringLoading ? 'Analyzing...' : 'Suggest Clustering'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Toolbar */}
        {profileData && (
          <div className="px-6 py-2 border-b dark:border-slate-700 flex items-center justify-end">
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
        <div className="flex-1 overflow-auto">
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
            <>
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
                          {(col.null_percentage ?? 0).toFixed(1)}% NULL
                        </Badge>
                      )}

                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs text-slate-500">
                          {(col.distinct_count ?? 0).toLocaleString()} distinct
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
                            <p className="text-lg font-bold">{(col.total_rows ?? 0).toLocaleString()}</p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Null Count</p>
                            <p className="text-lg font-bold text-orange-600">{(col.null_count ?? 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{(col.null_percentage ?? 0).toFixed(2)}%</p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-slate-500 uppercase tracking-wide">Distinct Values</p>
                            <p className="text-lg font-bold text-blue-600">{(col.distinct_count ?? 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{(col.distinct_percentage ?? 0).toFixed(2)}%</p>
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
                                    {(freq.count ?? 0).toLocaleString()} ({freq.percentage ?? 0}%)
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

            {/* AI-enhanced table view */}
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 border-b dark:border-slate-700 whitespace-nowrap">
                      COLUMN
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 border-b dark:border-slate-700 whitespace-nowrap">
                      TYPE
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 border-b dark:border-slate-700 whitespace-nowrap">
                      NULLS
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 border-b dark:border-slate-700 whitespace-nowrap">
                      DISTINCT
                    </th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 border-b dark:border-slate-700 whitespace-nowrap">
                      QUALITY
                    </th>
                    {aiGenerated && (
                      <>
                        <th className="px-4 py-2.5 text-left font-semibold text-purple-600 dark:text-purple-300 border-b dark:border-slate-700 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" />
                            AI CLASS
                          </span>
                        </th>
                        <th className="px-4 py-2.5 text-left font-semibold text-purple-600 dark:text-purple-300 border-b dark:border-slate-700 whitespace-nowrap">
                          SUGGESTION
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-700">
                  {sortedColumns.map((col) => {
                    const ai = aiResults[col.column];
                    const accepted = aiAccepted[col.column];
                    const classCfg = ai ? aiClassConfig[ai.aiClass] : null;

                    return (
                      <tr
                        key={col.column}
                        className={cn(
                          'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                          accepted && 'bg-green-50/50 dark:bg-green-900/10',
                        )}
                      >
                        {/* COLUMN */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {getDataTypeIcon(col.data_type)}
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {col.column}
                            </span>
                            {col.is_unique && (
                              <Key className="h-3 w-3 text-amber-500" />
                            )}
                          </div>
                        </td>

                        {/* TYPE */}
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                            {col.data_type}
                          </span>
                        </td>

                        {/* NULLS */}
                        <td className="px-4 py-2.5">
                          {col.has_nulls ? (
                            <span className={cn(
                              'text-xs font-medium',
                              col.null_percentage > 50 ? 'text-red-600' :
                              col.null_percentage > 10 ? 'text-orange-600' : 'text-slate-500',
                            )}>
                              {col.null_percentage.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-xs text-green-600">0%</span>
                          )}
                        </td>

                        {/* DISTINCT */}
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            {col.distinct_count.toLocaleString()}
                          </span>
                        </td>

                        {/* QUALITY */}
                        <td className="px-4 py-2.5 text-center">
                          <div className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                            getQualityColor(col.data_quality_score),
                          )}>
                            {getQualityIcon(col.data_quality_score)}
                            {col.data_quality_score}%
                          </div>
                        </td>

                        {/* AI CLASS */}
                        {aiGenerated && (
                          <td className="px-4 py-2.5">
                            {ai && classCfg && (
                              <Badge
                                size="sm"
                                className={cn(classCfg.bgColor, classCfg.color, 'text-[10px] font-bold')}
                              >
                                {ai.aiClass}
                              </Badge>
                            )}
                          </td>
                        )}

                        {/* SUGGESTION */}
                        {aiGenerated && (
                          <td className="px-4 py-2.5">
                            {ai?.suggestion ? (
                              accepted ? (
                                <span className="flex items-center gap-1 text-xs text-green-600">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Applied
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                                    {ai.suggestion}
                                  </span>
                                  <button
                                    onClick={() => handleAcceptSuggestion(col.column)}
                                    className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 transition-colors"
                                    title="Accept suggestion"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRejectSuggestion(col.column)}
                                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                                    title="Dismiss suggestion"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <BarChart3 className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-slate-500">No profile data available</p>
            </div>
          )}
        </div>

        {/* Clustering Keys Results */}
        {clusteringResult && clusteringResult.suggestions.length > 0 && (
          <div className="border-t dark:border-slate-700">
            <button
              onClick={() => setClusteringExpanded((p) => !p)}
              className="w-full px-6 py-3 flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                <Layers className="h-4 w-4" />
                AI Clustering Suggestions
                <Badge size="sm" className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-[10px]">
                  {clusteringResult.suggestions.length}
                </Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-normal ml-2">
                  {clusteringResult.table_size_gb}GB · {clusteringResult.row_count?.toLocaleString()} rows · ~{clusteringResult.estimated_scan_reduction_pct}% scan reduction
                </span>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-amber-600 dark:text-amber-400 transition-transform',
                  clusteringExpanded && 'rotate-180',
                )}
              />
            </button>
            {clusteringExpanded && (
              <div className="px-6 py-4 space-y-3 bg-white dark:bg-slate-900 border-t dark:border-slate-700">
                {/* Recommended cluster key */}
                {clusteringResult.recommended_cluster_by?.length > 0 && (
                  <div className="border dark:border-slate-700 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Recommended Cluster Key:
                      </span>
                      <span className="font-mono text-sm text-amber-700 dark:text-amber-300 font-semibold">
                        ({clusteringResult.recommended_cluster_by.join(', ')})
                      </span>
                    </div>
                  </div>
                )}

                {/* Individual column analysis */}
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Column Analysis
                </div>
                {clusteringResult.suggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    className="border dark:border-slate-700 rounded-lg p-3 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-slate-800 dark:text-slate-200">
                          {sug.column}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'text-xs font-medium px-2 py-0.5 rounded',
                            sug.relevance_score >= 8
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : sug.relevance_score >= 5
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                          )}
                        >
                          Relevance: {sug.relevance_score}/10
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          WHERE: {sug.where_frequency}x · JOIN: {sug.join_frequency}x
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* DDL + Copy */}
                {clusteringResult.ddl && (
                  <div className="mt-3 border dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        DDL Statement
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleApplyClusteringSql}
                        className="gap-1 h-7 text-xs"
                      >
                        <Copy className="h-3 w-3" />
                        Copy SQL
                      </Button>
                    </div>
                    <pre className="px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 overflow-x-auto whitespace-pre-wrap">
                      {clusteringResult.ddl}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
