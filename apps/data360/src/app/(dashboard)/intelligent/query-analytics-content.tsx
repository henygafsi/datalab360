'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge, Button, Loader } from 'rizzui';
import {
  PiMagnifyingGlass,
  PiWarningCircle,
  PiLightning,
  PiArrowsClockwise,
  PiChartLineUp,
  PiCopy,
  PiCaretDown,
  PiCaretUp,
} from 'react-icons/pi';
import {
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineArrowPath,
} from 'react-icons/hi2';
import {
  runQueryAnalysis,
  getQueryAnalyticsResults,
  getQueryAnalyticsSummary,
  getRedundantGroups,
} from '@/app/services/cortex';
import type { AnalyticsResult, AnalyticsSummary, RedundantGroup, RunAnalysisResponse } from '@/app/services/cortex';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  optimization: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const TYPE_LABELS: Record<string, string> = {
  redundant_queries: 'Redundant',
  error_pattern: 'Error Pattern',
  slow_query: 'Slow Query',
  optimization: 'Optimization',
};

export default function QueryAnalyticsContent() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [results, setResults] = useState<AnalyticsResult[]>([]);
  const [redundantGroups, setRedundantGroups] = useState<RedundantGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<RunAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [hours, setHours] = useState(5);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, resultsData, groupsData] = await Promise.all([
        getQueryAnalyticsSummary(),
        getQueryAnalyticsResults({ analysis_type: activeFilter || undefined, limit: 100 }),
        getRedundantGroups(20),
      ]);
      setSummary(summaryData);
      setResults(resultsData.results);
      setRedundantGroups(groupsData.groups);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load analytics';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const result = await runQueryAnalysis(hours);
      setAnalyzeResult(result);
      await loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Analysis failed';
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const formatTime = (ms: number | null) => {
    if (!ms) return '—';
    if (ms > 60000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms > 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms)}ms`;
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Never';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Run Analysis Controls */}
      <div className="flex items-center justify-between bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/30 rounded-xl border border-cyan-200/60 dark:border-cyan-800/40 p-5">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Cortex Query Analysis
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Analyze recent Snowflake query history using AI to detect redundant queries, error patterns, and optimization opportunities.
          </p>
          {summary?.LAST_ANALYSIS_AT && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Last analysis: {formatTimestamp(summary.LAST_ANALYSIS_AT)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-white"
          >
            <option value={1}>Last 1h</option>
            <option value={3}>Last 3h</option>
            <option value={5}>Last 5h</option>
            <option value={12}>Last 12h</option>
            <option value={24}>Last 24h</option>
            <option value={48}>Last 48h</option>
          </select>
          <Button
            className="gap-2"
            onClick={handleRunAnalysis}
            disabled={analyzing}
          >
            {analyzing ? (
              <HiOutlineArrowPath className="w-4 h-4 animate-spin" />
            ) : (
              <PiMagnifyingGlass className="w-4 h-4" />
            )}
            {analyzing ? 'Analyzing...' : 'Run Analysis'}
          </Button>
        </div>
      </div>

      {/* Analysis Result Banner */}
      {analyzeResult && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 flex items-center gap-3">
          <HiOutlineCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-300">
            Analyzed {analyzeResult.analyzed} queries — found {analyzeResult.cortex_issues} issues, {analyzeResult.redundant_groups} redundant groups.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex items-center gap-3">
          <HiOutlineExclamationTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <Button variant="text" size="sm" className="ml-auto shrink-0" onClick={loadData}>Retry</Button>
        </div>
      )}

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.TOTAL_ANALYZED ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Analyzed</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.REDUNDANT_COUNT ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Redundant</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.ERROR_COUNT ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Error Patterns</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.OPTIMIZATION_COUNT ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Optimizations</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{summary.SLOW_QUERY_COUNT ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Slow Queries</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{summary.CRITICAL_COUNT ?? 0}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Critical</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[null, 'redundant_queries', 'error_pattern', 'slow_query', 'optimization'].map((type) => (
          <button
            key={type ?? 'all'}
            onClick={() => setActiveFilter(type)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeFilter === type
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {type ? TYPE_LABELS[type] || type : 'All Issues'}
          </button>
        ))}
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Analysis Results
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
              ({results.length} issues)
            </span>
          </h3>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
            <PiArrowsClockwise className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>

        {results.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <PiChartLineUp className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No analysis results yet. Run an analysis to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {results.map((r) => (
              <div key={r.ANALYSIS_ID}>
                <button
                  onClick={() => setExpandedRow(expandedRow === r.ANALYSIS_ID ? null : r.ANALYSIS_ID)}
                  className="w-full px-5 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                >
                  <Badge className={`${SEVERITY_STYLES[r.SEVERITY] || SEVERITY_STYLES.info} text-xs shrink-0`}>
                    {r.SEVERITY}
                  </Badge>
                  <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 text-xs shrink-0">
                    {TYPE_LABELS[r.ANALYSIS_TYPE] || r.ANALYSIS_TYPE}
                  </Badge>
                  <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                    {r.RECOMMENDATION || 'No recommendation'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {r.USERNAME}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {formatTime(r.EXECUTION_TIME_MS)}
                  </span>
                  {r.IS_REDUNDANT && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs shrink-0">
                      <PiCopy className="w-3 h-3 mr-0.5 inline" />
                      Redundant
                    </Badge>
                  )}
                  {expandedRow === r.ANALYSIS_ID ? (
                    <PiCaretUp className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <PiCaretDown className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </button>

                {expandedRow === r.ANALYSIS_ID && (
                  <div className="px-5 py-4 bg-gray-50 dark:bg-gray-850 border-t border-gray-100 dark:border-gray-700">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Query ID</p>
                        <p className="text-sm font-mono text-gray-900 dark:text-white truncate">{r.QUERY_ID}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Query Type</p>
                        <p className="text-sm text-gray-900 dark:text-white">{r.QUERY_TYPE}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Database</p>
                        <p className="text-sm text-gray-900 dark:text-white">{r.DATABASE_NAME || '—'}.{r.SCHEMA_NAME || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Warehouse</p>
                        <p className="text-sm text-gray-900 dark:text-white">{r.WAREHOUSE_NAME || '—'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                        <Badge className={r.EXECUTION_STATUS === 'SUCCESS'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }>
                          {r.EXECUTION_STATUS}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Rows Produced</p>
                        <p className="text-sm text-gray-900 dark:text-white">{r.ROWS_PRODUCED?.toLocaleString() ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Execution Time</p>
                        <p className="text-sm text-gray-900 dark:text-white">{formatTime(r.EXECUTION_TIME_MS)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Analyzed At</p>
                        <p className="text-sm text-gray-900 dark:text-white">{formatTimestamp(r.ANALYSIS_TIMESTAMP)}</p>
                      </div>
                    </div>
                    {r.ERROR_MESSAGE && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Error Message</p>
                        <p className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded px-3 py-2 font-mono">
                          {r.ERROR_MESSAGE}
                        </p>
                      </div>
                    )}
                    {r.RECOMMENDATION && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">AI Recommendation</p>
                        <p className="text-sm text-gray-900 dark:text-white bg-cyan-50 dark:bg-cyan-900/10 rounded px-3 py-2">
                          {r.RECOMMENDATION}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Redundant Groups */}
      {redundantGroups.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              <PiCopy className="w-4 h-4 inline mr-2" />
              Redundant Query Groups
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                ({redundantGroups.length} groups)
              </span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-750">
                  <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">User</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Warehouse</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Executions</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Avg Time</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500 dark:text-gray-400">Total Time</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {redundantGroups.map((g) => (
                  <tr key={g.REDUNDANT_GROUP_ID} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-4 py-2 text-gray-900 dark:text-white">{g.QUERY_TYPE}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{g.SAMPLE_USER}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{g.WAREHOUSE}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        {g.EXECUTION_COUNT}x
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{formatTime(g.AVG_TIME_MS)}</td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">{formatTime(g.TOTAL_TIME_MS)}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300 max-w-xs truncate">{g.RECOMMENDATION}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Error Patterns */}
      {summary?.top_error_patterns && summary.top_error_patterns.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            <PiWarningCircle className="w-4 h-4 inline mr-2 text-red-500" />
            Top Error Patterns
          </h3>
          <div className="space-y-2">
            {summary.top_error_patterns.map((ep, i) => (
              <div key={i} className="flex items-start gap-3 bg-red-50/50 dark:bg-red-900/10 rounded-lg px-4 py-3">
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                  {ep.count}x
                </Badge>
                <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">{ep.error}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
