'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Badge } from 'rizzui';
import {
  HiOutlineChartBar,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineXCircle,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineDocumentDuplicate,
  HiOutlineArrowDownTray,
  HiOutlinePlay,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';
import PageBuilder from '../bi-reporting/components/page-builder';
import { SaveAllIcon } from 'lucide-react';
import { ComponentConfig } from '../bi-reporting/components/configuration-modal';
import {
  createQualityReport,
  updateQualityReport,
  getQualityReports,
  deleteQualityReport,
  duplicateQualityReport,
  exportQualityReport,
  runQualityChecks,
  setCurrentUser,
  type QualityReport,
  type QualityMetric,
} from '@/app/services/data-quality/reports-local';

interface QualityReportItem {
  id: string;
  type: 'chart' | 'metric' | 'table';
  componentId: string;
  position: number;
  config?: ComponentConfig;
  w?: number;
  h?: number;
  hUnits?: number;
  fontScale?: number;
}

function Breadcrumb() {
  return (
    <nav className="mb-10">
      <div className="flex items-center space-x-3 text-sm">
        <span className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer transition-colors font-medium">Home</span>
        <div className="w-1 h-1 bg-slate-400 rounded-full" />
        <span className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer transition-colors font-medium">Analytics</span>
        <div className="w-1 h-1 bg-slate-400 rounded-full" />
        <span className="text-slate-900 dark:text-slate-200 font-semibold">Data Quality</span>
      </div>
    </nav>
  );
}

function QualityMetricCard({ metric }: { metric: QualityMetric }) {
  const statusConfig = {
    pass: {
      icon: HiOutlineCheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
    },
    warning: {
      icon: HiOutlineExclamationTriangle,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
    },
    fail: {
      icon: HiOutlineXCircle,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
    },
  };

  const config = statusConfig[metric.status];
  const Icon = config.icon;

  return (
    <div className={`p-4 rounded-lg border ${config.border} ${config.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{metric.name}</span>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>
      <div className="flex items-baseline space-x-2">
        <span className={`text-2xl font-bold ${config.color}`}>{metric.value}%</span>
        {metric.threshold && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Target: {metric.threshold}%
          </span>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count
}: {
  active: boolean,
  onClick: () => void,
  icon: React.ReactNode,
  label: string,
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-8 py-4 rounded-2xl font-semibold transition-all duration-300 flex items-center space-x-3 ${
        active
          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-lg shadow-blue-500/20 border border-blue-200/60 dark:border-blue-800/60'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className={`${active ? 'text-blue-600 dark:text-blue-400' : ''} transition-colors duration-300`}>
        {icon}
      </div>
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <Badge className={`${active ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'} text-xs font-bold min-w-[20px] h-5 flex items-center justify-center`}>
          {count}
        </Badge>
      )}

      {active && (
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-pink-500/10 rounded-2xl" />
      )}
    </button>
  );
}

export default function DataQualityPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('builder');
  const [savedLayouts, setSavedLayouts] = useState<QualityReportItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [reportName, setReportName] = useState('My Quality Report');
  const [reportDescription, setReportDescription] = useState('');
  const [reports, setReports] = useState<QualityReport[]>([]);
  const [showReportList, setShowReportList] = useState(false);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetric[]>([]);

  // Set current user and load reports on mount
  useEffect(() => {
    if (session?.user?.username) {
      setCurrentUser(session.user.username as string);
    }
    loadReports();
  }, [session]);

  const loadReports = async () => {
    try {
      const data = await getQualityReports();
      setReports(data);

      // Load the first report if available
      if (data.length > 0 && !currentReportId) {
        const firstReport = data[0];
        setCurrentReportId(firstReport.id);
        setReportName(firstReport.name);
        setReportDescription(firstReport.description || '');
        setSavedLayouts(firstReport.items);
        setQualityMetrics(firstReport.metrics || []);
        toast.success(`📊 Loaded: ${firstReport.name}`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load reports');
    }
  };

  const handleLayoutChange = (items: QualityReportItem[]) => {
    setSavedLayouts(items);
  };

  const saveReport = async () => {
    if (savedLayouts.length === 0 && qualityMetrics.length === 0) {
      toast.error('Please add at least one chart or metric to save the report');
      return;
    }

    setIsSaving(true);
    try {
      const reportData = {
        name: reportName,
        description: reportDescription,
        items: savedLayouts,
        metrics: qualityMetrics,
        isPublic: false,
      };

      if (currentReportId) {
        // Update existing report
        await updateQualityReport(currentReportId, reportData);
        toast.success('✅ Report updated successfully!');
      } else {
        // Create new report
        const created = await createQualityReport(reportData);
        setCurrentReportId(created.id);
        toast.success('🎉 Report saved successfully!');
      }

      // Reload reports list
      await loadReports();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save report');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewReport = () => {
    setCurrentReportId(null);
    setReportName('My Quality Report');
    setReportDescription('');
    setSavedLayouts([]);
    setQualityMetrics([]);
    setActiveTab('builder');
    toast.success('📝 New report created! Start adding metrics.');
  };

  const handleLoadReport = async (id: string) => {
    try {
      const allReports = await getQualityReports();
      const report = allReports.find((r) => r.id === id);

      if (report) {
        setCurrentReportId(report.id);
        setReportName(report.name);
        setReportDescription(report.description || '');
        setSavedLayouts(report.items);
        setQualityMetrics(report.metrics || []);
        setShowReportList(false);
        setActiveTab('builder');
        toast.success(`📊 Loaded: ${report.name}`);
      }
    } catch (error: any) {
      toast.error('Failed to load report');
    }
  };

  const handleDeleteReport = async (id: string) => {
    const report = reports.find((r) => r.id === id);
    if (!confirm(`Are you sure you want to delete "${report?.name}"?`)) return;

    try {
      await deleteQualityReport(id);
      toast.success('🗑️ Report deleted successfully');

      // If we deleted the current report, create new
      if (currentReportId === id) {
        handleNewReport();
      }

      // Reload reports list
      await loadReports();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete report');
    }
  };

  const handleDuplicateReport = async (id: string) => {
    try {
      const duplicate = await duplicateQualityReport(id);
      toast.success(`📋 Duplicated: ${duplicate.name}`);
      await loadReports();
    } catch (error: any) {
      toast.error(error.message || 'Failed to duplicate report');
    }
  };

  const handleExportReport = async (id: string) => {
    try {
      const jsonData = await exportQualityReport(id);
      const report = reports.find((r) => r.id === id);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${report?.name || 'quality_report'}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('📥 Report exported successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to export report');
    }
  };

  const handleRunQualityChecks = async () => {
    setIsRunningChecks(true);
    try {
      const metrics = await runQualityChecks(currentReportId || 'temp');
      setQualityMetrics(metrics);
      toast.success('✅ Quality checks completed!');
    } catch (error: any) {
      toast.error('Failed to run quality checks');
    } finally {
      setIsRunningChecks(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 py-8 px-6">
      <div className="max-w-[1920px] mx-auto">
        <Breadcrumb />

        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200/60 dark:border-slate-800/60 p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
                Data Quality Reporting
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-lg">
                Monitor and analyze data quality metrics with self-service reporting
              </p>
              <div className="flex items-center space-x-4 mt-4">
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>LocalStorage Caching</span>
                </Badge>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  📊 {reports.length} Saved Reports
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <input
                type="text"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                className="text-2xl font-bold bg-transparent border-b-2 border-transparent hover:border-blue-300 focus:border-blue-500 dark:border-slate-700 dark:hover:border-blue-600 dark:focus:border-blue-500 outline-none transition-colors text-slate-900 dark:text-slate-100 mb-2 text-right"
              />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {currentReportId ? 'Click to rename' : 'New Report'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleNewReport}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <HiOutlinePlus className="w-5 h-5 mr-2" />
              New
            </Button>

            <Button
              onClick={() => setShowReportList(!showReportList)}
              variant="outline"
              className="px-6 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300"
            >
              <HiOutlineChartBar className="w-5 h-5 mr-2" />
              My Reports ({reports.length})
            </Button>

            <Button
              onClick={saveReport}
              disabled={isSaving || (savedLayouts.length === 0 && qualityMetrics.length === 0)}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SaveAllIcon className="w-5 h-5 mr-2" />
              {isSaving ? 'Saving...' : currentReportId ? 'Update' : 'Save'}
            </Button>

            <Button
              onClick={handleRunQualityChecks}
              disabled={isRunningChecks}
              className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
            >
              <HiOutlinePlay className="w-5 h-5 mr-2" />
              {isRunningChecks ? 'Running...' : 'Run Checks'}
            </Button>

            <div className="flex items-center space-x-2 ml-auto">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {savedLayouts.length} Charts
              </span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {qualityMetrics.length} Metrics
              </span>
            </div>
          </div>
        </div>

        {/* Quality Metrics Summary */}
        {qualityMetrics.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200/60 dark:border-slate-800/60 p-8 mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
              Quality Metrics Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {qualityMetrics.map((metric) => (
                <QualityMetricCard key={metric.id} metric={metric} />
              ))}
            </div>
          </div>
        )}

        {/* Report List */}
        {showReportList && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200/60 dark:border-slate-800/60 p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Your Quality Reports
              </h2>
              <Button
                onClick={() => setShowReportList(false)}
                variant="outline"
                size="sm"
              >
                Close
              </Button>
            </div>

            {reports.length === 0 ? (
              <div className="text-center py-12">
                <HiOutlineChartBar className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <p className="text-slate-500 dark:text-slate-400 text-lg">
                  No reports yet. Create your first quality report!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-300 hover:shadow-lg"
                  >
                    <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-2">
                      {report.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                      {report.description || 'No description'}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mb-4">
                      <span>{report.items.length} charts</span>
                      <span>•</span>
                      <span>{report.metrics?.length || 0} metrics</span>
                      <span>•</span>
                      <span>{new Date(report.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => handleLoadReport(report.id)}
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Load
                      </Button>
                      <Button
                        onClick={() => handleDuplicateReport(report.id)}
                        size="sm"
                        variant="outline"
                        className="p-2"
                      >
                        <HiOutlineDocumentDuplicate className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleExportReport(report.id)}
                        size="sm"
                        variant="outline"
                        className="p-2"
                      >
                        <HiOutlineArrowDownTray className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteReport(report.id)}
                        size="sm"
                        variant="outline"
                        className="p-2 text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Page Builder */}
        <PageBuilder
          onLayoutChange={handleLayoutChange}
          initialItems={savedLayouts}
        />
      </div>
    </div>
  );
}
