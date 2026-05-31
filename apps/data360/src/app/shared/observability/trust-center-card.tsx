'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Loader, Badge } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiShieldStarDuotone,
  PiWarning,
  PiCheckCircle,
  PiXCircle,
  PiArrowsClockwise,
  PiInfo,
} from 'react-icons/pi';
import { getTrustCenterFindings, getTrustCenterSummary, isRouteNotDeployed } from '@/app/services/observability';
import { getApiErrorMessage } from '@/lib/api-client';

export default function TrustCenterCard() {
  const [findings, setFindings] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'summary' | 'findings'>('summary');
  const [error, setError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotDeployed(false);
    try {
      const [findingsResult, summaryResult] = await Promise.all([
        getTrustCenterFindings(),
        getTrustCenterSummary(),
      ]);
      const f = findingsResult.findings ?? findingsResult.data ?? findingsResult;
      setFindings(Array.isArray(f) ? f : []);
      setSummary(summaryResult.data ?? summaryResult);
    } catch (err: unknown) {
      if (isRouteNotDeployed(err)) {
        setNotDeployed(true);
      } else {
        const msg = getApiErrorMessage(err);
        setError(msg);
        toast.error(msg);
      }
      setFindings([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getSeverityColor = (severity: string) => {
    const s = (severity || '').toUpperCase();
    if (s === 'CRITICAL' || s === 'HIGH') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    if (s === 'MEDIUM') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    if (s === 'LOW') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  };

  const getSeverityIcon = (severity: string) => {
    const s = (severity || '').toUpperCase();
    if (s === 'CRITICAL' || s === 'HIGH') return <PiXCircle className="w-4 h-4 text-red-500" />;
    if (s === 'MEDIUM') return <PiWarning className="w-4 h-4 text-amber-500" />;
    return <PiInfo className="w-4 h-4 text-blue-500" />;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader variant="spinner" size="lg" />
      </div>
    );
  }

  if (notDeployed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <PiInfo className="h-8 w-8 text-slate-400" />
        <p className="text-base font-medium text-slate-900 dark:text-white">Trust Center is not available yet</p>
        <p className="max-w-md text-sm text-slate-500">
          This capability is not deployed on the connected backend. It will appear here once the Trust Center
          endpoints are exposed.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <PiXCircle className="h-8 w-8 text-red-400" />
        <p className="max-w-md text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
          <PiArrowsClockwise className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <PiShieldStarDuotone className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Snowflake Trust Center</h3>
            <p className="text-sm text-slate-500">Security posture findings and recommendations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeView === 'summary' ? 'solid' : 'outline'}
            size="sm"
            onClick={() => setActiveView('summary')}
            className={activeView === 'summary' ? 'bg-indigo-600 text-white' : ''}
          >
            Summary
          </Button>
          <Button
            variant={activeView === 'findings' ? 'solid' : 'outline'}
            size="sm"
            onClick={() => setActiveView('findings')}
            className={activeView === 'findings' ? 'bg-indigo-600 text-white' : ''}
          >
            Findings ({findings.length})
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
            <PiArrowsClockwise className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Summary View */}
      {activeView === 'summary' && summary && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                {summary.total_findings ?? findings.length ?? 0}
              </div>
              <p className="text-sm text-slate-500">Total Findings</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-700/50 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-red-600 mb-1">
                {summary.critical_count ?? 0}
              </div>
              <p className="text-sm text-slate-500">Critical/High</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-green-200 dark:border-green-700/50 rounded-xl p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <PiCheckCircle className="w-7 h-7 text-green-500" />
                <span className="text-3xl font-bold text-green-600">{summary.compliance_score ?? '-'}%</span>
              </div>
              <p className="text-sm text-slate-500">Compliance Score</p>
            </div>
          </div>

          {/* Category Breakdown */}
          {summary.categories && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Category Breakdown</h4>
              <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-60 text-slate-700 dark:text-slate-300">
                {JSON.stringify(summary.categories, null, 2)}
              </pre>
            </div>
          )}

          {!summary.categories && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Full Summary</h4>
              <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-60 text-slate-700 dark:text-slate-300">
                {JSON.stringify(summary, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Findings View */}
      {activeView === 'findings' && (
        <div className="space-y-3">
          {findings.length === 0 ? (
            <div className="text-center py-12">
              <PiCheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-lg font-medium text-slate-900 dark:text-white">No findings</p>
              <p className="text-sm text-slate-500 mt-1">Your Snowflake account has no security findings</p>
            </div>
          ) : (
            findings.map((finding: any, i: number) => {
              const severity = finding.severity || finding.SEVERITY || 'INFO';
              return (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(severity)}
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white">
                          {finding.title || finding.TITLE || finding.check_name || finding.CHECK_NAME || 'Finding'}
                        </h4>
                        <p className="text-sm text-slate-500 mt-1">
                          {finding.description || finding.DESCRIPTION || finding.details || finding.DETAILS || ''}
                        </p>
                        {(finding.category || finding.CATEGORY) && (
                          <Badge className="mt-2 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300" size="sm">
                            {finding.category || finding.CATEGORY}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge className={getSeverityColor(severity)} size="sm">
                      {severity}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
