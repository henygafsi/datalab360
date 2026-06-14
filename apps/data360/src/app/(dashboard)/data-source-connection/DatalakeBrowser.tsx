'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Text, Badge } from 'rizzui';
import {
  HiOutlineDocument,
  HiOutlineArrowLeft,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlineChevronRight,
  HiOutlineHome,
  HiOutlineShieldCheck,
  HiOutlineArrowPath,
  HiXMark
} from 'react-icons/hi2';
import { HiRefresh, HiViewGrid, HiViewList, HiDownload, HiUpload } from 'react-icons/hi';
import { Database, FileText, FileJson, Archive, File as FileIcon, FileSpreadsheet, Braces, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  listSnowflakeStages,
  listSnowflakeStageFiles,
  previewStageFile,
  downloadStageFile,
  deleteStageFile,
  uploadStageFile,
  getStageGrants,
  type StageFilePreviewResponse
} from './connectionServices';

type Provider = 'snowflake' | 'azure' | 'aws' | 'gcs' | 'databricks' | 'iceberg' | 'postgres' | 'mysql' | 'salesforce' | 'sap' | 'oracle' | 'hubspot' | 'servicenow' | 'custom_api';
type ViewMode = 'grid' | 'table';

const BROWSER_ONLY_PROVIDERS: Provider[] = ['snowflake', 'azure', 'aws', 'gcs'];

interface DatalakeBrowserProps {
  provider: Provider;
  onBack: () => void;
}

interface StageItem {
  name: string;
  shortName?: string;
  type: 'stage' | 'folder' | 'file';
  size?: number;
  last_modified?: string;
  error?: string;
  schema_name?: string;
  database_name?: string;
}

// SHOW GRANTS rows — Snowflake returns upper-case keys; some proxies lower-case them.
interface StageGrant {
  PRIVILEGE?: string;
  privilege?: string;
  GRANTED_TO?: string;
  granted_to?: string;
  GRANTEE_NAME?: string;
  grantee_name?: string;
}

export default function DatalakeBrowser({ provider, onBack }: DatalakeBrowserProps) {
  // System 2 Action-RBAC: deleting stage files maps to connect:delete. The
  // permission allow-set keys this module as 'connect' (registry key), NOT the
  // modules.ts apiName 'connect_datalake' — the apiName key is absent, so it
  // would deny everyone incl. admin (useCanPerform only fail-opens on HTTP error).
  // Fail-open while the allow-set loads (no flash of a disabled control).
  const deletePerm = useCanPerform('connect', 'delete');
  const canDeleteFiles = deletePerm.allowed || deletePerm.loading;
  const deleteDeniedReason =
    'You lack the "delete" permission on connect. Ask an administrator to grant it.';
  const [loading, setLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [files, setFiles] = useState<StageItem[]>([]);
  const [allStages, setAllStages] = useState<StageItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<StageFilePreviewResponse | null>(null);
  const [previewFile, setPreviewFile] = useState<StageItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [previewPageSize, setPreviewPageSize] = useState(100);
  const [grantsOpen, setGrantsOpen] = useState(false);
  const [grants, setGrants] = useState<StageGrant[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantsError, setGrantsError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'bulk-delete' | 'overwrite';
    file?: StageItem;
    fileNames?: string[];
    fileList?: FileList;
    uploadToastId?: string;
    inputRef?: HTMLInputElement;
  } | null>(null);

  const loadStages = useCallback(async () => {
    setLoading(true);
    setCurrentStage(null);
    setFiles([]);
    try {
      let stageList: any[] = [];

      if (provider === 'snowflake' || provider === 'aws' || provider === 'azure' || provider === 'gcs') {
        // All cloud providers create Snowflake external stages, so we list via the same API
        const response = await listSnowflakeStages();
        // Support both: old format (response.stages) and paginated (response.data)
        stageList = Array.isArray(response?.stages) ? response.stages
          : Array.isArray(response?.data) ? response.data
          : Array.isArray(response) ? response : [];
      }

      const formattedStages: StageItem[] = stageList.map((stage: any) => {
        const shortName = stage.name ?? stage.stage_name ?? String(stage);
        const schema = stage.schema_name || 'STAGING';
        const db = stage.database_name || '';
        const displayName = schema !== 'STAGING' && db
            ? `${db}.${schema}.${shortName}`
            : shortName;
        return {
          name: displayName,
          shortName,
          type: 'stage' as const,
          schema_name: schema,
          database_name: db,
          error: stage.error,
          connector_type: stage.connector_type || null,
        };
      });

      const validStages = formattedStages.filter(s => !s.error);
      setAllStages(validStages);

      if (validStages.length > 0) {
        setCurrentStage(validStages[0].name);
      } else {
        setCurrentStage(null);
        setFiles([]);
      }
    } catch (error: any) {
      toast.error(`Failed to load stages: ${error.message}`);
      console.error('Error loading stages:', error);
      setAllStages([]);
      setCurrentStage(null);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  const loadStageFiles = useCallback(async (stageName: string) => {
    setLoading(true);
    try {
      let fileList: any[] = [];

      if (provider === 'snowflake' || provider === 'aws' || provider === 'azure' || provider === 'gcs') {
        const response = await listSnowflakeStageFiles(stageName);
        fileList = response.files || [];
      }

      const formattedFiles: StageItem[] = fileList.map((file: any) => ({
        name: file.name,
        type: 'file',
        size: file.size,
        last_modified: file.last_modified,
      }));

      setFiles(formattedFiles);
    } catch (error: any) {
      toast.error(`Failed to load files: ${error.message}`);
      console.error('Error loading stage files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (BROWSER_ONLY_PROVIDERS.includes(provider)) loadStages();
  }, [provider, loadStages]);

  useEffect(() => {
    if (currentStage) loadStageFiles(currentStage);
  }, [currentStage, loadStageFiles]);

  // Escape closes the non-blocking side panels (preview / grants).
  useEffect(() => {
    if (!previewOpen && !grantsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (previewOpen) setPreviewOpen(false);
      if (grantsOpen) setGrantsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewOpen, grantsOpen]);

  const handleStageChange = (newStageName: string) => {
    setCurrentStage(newStageName);
    setSearchQuery('');
    loadStageFiles(newStageName);
  };

  const fetchPreview = useCallback(async (stageName: string, fileName: string, limit: number, offset: number) => {
    const response = await previewStageFile(stageName, fileName, limit, offset);
    // The endpoint can return an { error, message } payload instead of preview data.
    const errPayload = response as unknown as { error?: unknown; message?: unknown };
    if (errPayload && errPayload.error) {
      throw new Error(typeof errPayload.message === 'string' ? errPayload.message : 'Preview failed');
    }
    setPreviewData(response);
  }, []);

  const handlePreview = async (file: StageItem) => {
    if (!currentStage) return;
    setPreviewFile(file);
    setPreviewOpen(true);
    setPreviewPage(0);
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      await fetchPreview(currentStage, file.name, previewPageSize, 0);
    } catch (error: any) {
      toast.error(`Failed to preview: ${error.message}`);
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewPageChange = (newPage: number) => {
    if (!currentStage || !previewFile) return;
    setPreviewLoading(true);
    const offset = newPage * previewPageSize;
    fetchPreview(currentStage, previewFile.name, previewPageSize, offset)
      .then(() => setPreviewPage(newPage))
      .catch((e: any) => toast.error(e.message))
      .finally(() => setPreviewLoading(false));
  };

  const handleGrantsClick = async () => {
    if (!currentStage) return;
    setGrantsOpen(true);
    setGrantsLoading(true);
    setGrantsError(null);
    setGrants([]);
    try {
      const res = await getStageGrants(currentStage) as { grants?: StageGrant[] };
      setGrants(Array.isArray(res?.grants) ? res.grants : []);
    } catch (e) {
      setGrantsError(e instanceof Error ? e.message : 'Failed to load grants');
    } finally {
      setGrantsLoading(false);
    }
  };

  const handleDownload = async (file: StageItem) => {
    if (!currentStage) return;

    toast('Preparing download...', { icon: '⬇️' });

    try {
      await downloadStageFile(currentStage, file.name);
      toast.success(`Downloaded: ${file.name}`);
    } catch (error: any) {
      const msg = error?.message || 'Failed to download file';
      if (msg.includes('external') || msg.includes('EXTERNAL_STAGE')) {
        toast.error('Download is not supported for external stages. Access files directly from your cloud storage (Azure Blob / S3 / GCS).');
      } else {
        toast.error(`Download failed: ${msg}`);
      }
      console.error('Download error:', error);
    }
  };

  const handleDelete = (file: StageItem) => {
    if (!currentStage) return;
    setConfirmAction({ type: 'delete', file });
  };

  const executeDelete = async (file: StageItem) => {
    if (!currentStage) return;
    setConfirmAction(null);
    setLoading(true);
    try {
      await deleteStageFile(currentStage, file.name);
      toast.success(`Deleted: ${file.name}`);
      loadStageFiles(currentStage);
    } catch (error: any) {
      toast.error(`Failed to delete: ${error.message}`);
      console.error('Delete error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentStage) return;

    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    // Validate file types
    const allowedExtensions = ['.csv', '.json', '.parquet', '.txt'];
    const invalidFiles = Array.from(fileList).filter(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return !allowedExtensions.includes(ext);
    });

    if (invalidFiles.length > 0) {
      toast.error(`Invalid file type(s): ${invalidFiles.map(f => f.name).join(', ')}\nAllowed: ${allowedExtensions.join(', ')}`);
      event.target.value = '';
      return;
    }

    // Validate file sizes (500MB max per file)
    const maxSize = 500 * 1024 * 1024;
    const oversizedFiles = Array.from(fileList).filter(file => file.size > maxSize);

    if (oversizedFiles.length > 0) {
      toast.error(`File(s) too large: ${oversizedFiles.map(f => f.name).join(', ')}\nMax size: 500MB per file`);
      event.target.value = '';
      return;
    }

    setUploading(true);
    const uploadToast = toast.loading(`Uploading ${fileList.length} file(s)...`);

    try {
      const result = await uploadStageFile(currentStage, fileList, false);

      toast.success(
        `Successfully uploaded ${result.total_uploaded || fileList.length} file(s)`,
        { id: uploadToast }
      );

      loadStageFiles(currentStage);
      event.target.value = '';
    } catch (error: any) {
      if (error.message.includes('409') || error.message.toLowerCase().includes('exists')) {
        // Show inline overwrite confirmation instead of browser popup
        toast.dismiss(uploadToast);
        setConfirmAction({
          type: 'overwrite',
          fileList,
          uploadToastId: uploadToast,
          inputRef: event.target,
        });
        // Don't clear uploading yet -- the confirm bar will handle it
        return;
      } else {
        toast.error(`Failed to upload: ${error.message}`, { id: uploadToast });
        console.error('Upload error:', error);
      }
    } finally {
      setUploading(false);
    }
  };

  const executeOverwrite = async () => {
    if (!currentStage || !confirmAction || confirmAction.type !== 'overwrite' || !confirmAction.fileList) return;
    const { fileList, inputRef } = confirmAction;
    setConfirmAction(null);
    const uploadToast = toast.loading(`Uploading ${fileList.length} file(s) (overwrite)...`);
    try {
      const result = await uploadStageFile(currentStage, fileList, true);
      toast.success(
        `Successfully uploaded ${result.total_uploaded || fileList.length} file(s) (overwritten)`,
        { id: uploadToast }
      );
      loadStageFiles(currentStage);
      if (inputRef) inputRef.value = '';
    } catch (retryError: any) {
      toast.error(`Failed to upload: ${retryError.message}`, { id: uploadToast });
      console.error('Upload retry error:', retryError);
    } finally {
      setUploading(false);
    }
  };

  const cancelOverwrite = () => {
    toast.error('Upload cancelled');
    if (confirmAction?.inputRef) confirmAction.inputRef.value = '';
    setConfirmAction(null);
    setUploading(false);
  };

  // Selection handlers
  const toggleFileSelection = (fileName: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileName)
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const toggleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map(f => f.name));
    }
  };

  const handleBulkDownload = async () => {
    if (!currentStage || selectedFiles.length === 0) return;

    let successCount = 0;
    let errorCount = 0;

    for (const fileName of selectedFiles) {
      try {
        await downloadStageFile(currentStage, fileName);
        successCount++;
      } catch (error: any) {
        errorCount++;
        if (error?.message?.includes('external') || error?.message?.includes('EXTERNAL_STAGE')) {
          toast.error('Download is not supported for external stages.');
          break;
        }
        console.error(`Failed to download ${fileName}:`, error);
      }
    }

    if (successCount > 0) {
      toast.success(`Downloaded ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
    } else if (errorCount > 0) {
      toast.error(`${errorCount} file(s) failed to download`);
    }
    setSelectedFiles([]);
  };

  const handleBulkDelete = () => {
    if (!currentStage || selectedFiles.length === 0) return;
    setConfirmAction({ type: 'bulk-delete', fileNames: [...selectedFiles] });
  };

  const executeBulkDelete = async (fileNames: string[]) => {
    if (!currentStage) return;
    setConfirmAction(null);
    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const fileName of fileNames) {
      try {
        await deleteStageFile(currentStage, fileName);
        successCount++;
      } catch (error: any) {
        errorCount++;
        console.error(`Failed to delete ${fileName}:`, error);
      }
    }

    toast.success(`Deleted ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
    setSelectedFiles([]);
    loadStageFiles(currentStage);
    setLoading(false);
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getProviderName = () => {
    switch (provider) {
      case 'snowflake': return 'Snowflake';
      case 'azure': return 'Azure Blob Storage';
      case 'aws': return 'Amazon S3';
      case 'databricks': return 'Databricks';
      case 'iceberg': return 'Apache Iceberg';
      case 'postgres': return 'PostgreSQL';
      case 'mysql': return 'MySQL';
      default: return 'Datalake';
    }
  };

  if (!BROWSER_ONLY_PROVIDERS.includes(provider)) {
    return (
      <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 p-6">
        <Button variant="outline" onClick={onBack} className="self-start bg-white hover:bg-slate-50 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">
          <HiOutlineArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center max-w-md mx-auto shadow-sm">
          <Database className="h-12 w-12 mx-auto text-slate-400 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{getProviderName()}</h3>
          <Text className="text-slate-600 dark:text-slate-400 mt-2">
            No file browser for this connector. Data is ingested to Snowflake (CP_DATA360).
          </Text>
        </div>
      </div>
    );
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'csv':
        return <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
      case 'json':
        return <Braces className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
      case 'parquet':
        return <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />;
      case 'txt':
        return <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
      default:
        return <FileIcon className="h-5 w-5 text-slate-500 dark:text-slate-400" />;
    }
  };

  // Filter and sort files
  const filteredFiles = files
    .filter(file =>
      searchQuery ? file.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    )
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          comparison = new Date(a.last_modified || 0).getTime() - new Date(b.last_modified || 0).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const handleSort = (column: 'name' | 'size' | 'modified') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ column }: { column: 'name' | 'size' | 'modified' }) => {
    if (sortBy !== column) return null;
    return (
      <span className="ml-1">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
            <button type="button" onClick={onBack} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Back to Data Source Connection" aria-label="Back to Data Source Connection">
              <HiOutlineHome className="h-4 w-4" />
            </button>
            <HiOutlineChevronRight className="h-4 w-4" />
            <span className="font-medium text-slate-900 dark:text-white">
              {getProviderName()}
            </span>
            {currentStage && (
              <>
                <HiOutlineChevronRight className="h-4 w-4" />
                <span className="font-medium text-blue-600 dark:text-blue-400 truncate max-w-xs" title={currentStage}>
                  {allStages.find(s => s.name === currentStage)?.shortName || currentStage}
                </span>
              </>
            )}
          </div>

          {/* Main toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              {/* Stage Selector - API-driven only, no static list */}
              <div className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                {allStages.length === 0 ? (
                  <span className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 min-w-[220px] text-sm">
                    {loading ? 'Loading stages...' : 'No stages available'}
                  </span>
                ) : (
                  <select
                    value={currentStage || ''}
                    onChange={(e) => handleStageChange(e.target.value)}
                    className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[220px]"
                    disabled={loading}
                  >
                    {allStages.map((stage) => (
                      <option key={stage.name} value={stage.name} title={stage.name}>
                        {stage.shortName}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  onClick={() => loadStages()}
                  disabled={loading}
                  className="bg-white hover:bg-slate-50 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-sm"
                  title="Sync stages from Snowflake"
                  aria-label="Sync stages list"
                >
                  <HiOutlineArrowPath
                    className={`h-4 w-4 text-slate-600 dark:text-slate-200 ${loading ? 'animate-spin' : ''}`}
                  />
                  {/*Sync stages*/}
                </Button>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {files.length} files
                </Badge>
              </div>

              {/* Search */}
              <div className="flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search files by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded ${viewMode === 'table' ? 'bg-white dark:bg-slate-600 shadow' : 'text-slate-500 dark:text-slate-400'}`}
                  title="Table view"
                >
                  <HiViewList className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white dark:bg-slate-600 shadow' : 'text-slate-500 dark:text-slate-400'}`}
                  title="Grid view"
                >
                  <HiViewGrid className="h-4 w-4" />
                </button>
              </div>

              {/* Upload */}
              <label className="relative">
                <input
                  type="file"
                  multiple
                  accept=".csv,.json,.parquet,.txt"
                  onChange={handleUpload}
                  disabled={uploading || !currentStage}
                  className="hidden"
                />
                <Button
                  as="span"
                  className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  disabled={uploading || !currentStage}
                >
                  <HiUpload className={`h-4 w-4 mr-2 ${uploading ? 'animate-bounce' : ''}`} />
                  Upload Files
                </Button>
              </label>

              {/* Refresh files in current stage */}
              <Button
                onClick={() => currentStage && loadStageFiles(currentStage)}
                className="bg-white hover:bg-slate-50 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-sm"
                disabled={loading || !currentStage}
                title="Refresh files"
                aria-label="Refresh files in current stage"
              >
                <HiRefresh className={`h-4 w-4 text-slate-600 dark:text-slate-200 ${loading ? 'animate-spin' : ''}`} />
                {/*Refresh*/}
              </Button>

              {/* Stage grants (governance) */}
              {provider === 'snowflake' && (
                <Button
                  onClick={handleGrantsClick}
                  disabled={!currentStage || grantsLoading}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 border border-slate-300 dark:border-slate-600"
                  title="View stage permissions"
                  aria-label="View stage permissions"
                >
                  <HiOutlineShieldCheck className="h-4 w-4 mr-2 text-slate-600 dark:text-slate-200" />
                  Permissions
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inline Confirmation Bar */}
      {confirmAction && (
        <div className={`flex-shrink-0 px-6 py-3 flex items-center justify-between border-b ${
          confirmAction.type === 'overwrite'
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          <Text className={`text-sm font-medium ${
            confirmAction.type === 'overwrite'
              ? 'text-amber-800 dark:text-amber-200'
              : 'text-red-800 dark:text-red-200'
          }`}>
            {confirmAction.type === 'delete' && confirmAction.file && (
              <>This action is irreversible. Delete &quot;{confirmAction.file.name}&quot;?</>
            )}
            {confirmAction.type === 'bulk-delete' && confirmAction.fileNames && (
              <>This action is irreversible. Delete {confirmAction.fileNames.length} file(s)?</>
            )}
            {confirmAction.type === 'overwrite' && (
              <>One or more files already exist. Overwrite them?</>
            )}
          </Text>
          <div className="flex items-center space-x-2 ml-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirmAction.type === 'overwrite') {
                  cancelOverwrite();
                } else {
                  setConfirmAction(null);
                }
              }}
              className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (confirmAction.type === 'delete' && confirmAction.file) {
                  executeDelete(confirmAction.file);
                } else if (confirmAction.type === 'bulk-delete' && confirmAction.fileNames) {
                  executeBulkDelete(confirmAction.fileNames);
                } else if (confirmAction.type === 'overwrite') {
                  executeOverwrite();
                }
              }}
              className={
                confirmAction.type === 'overwrite'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }
            >
              {confirmAction.type === 'overwrite' ? 'Yes, Overwrite' : 'Confirm Delete'}
            </Button>
          </div>
        </div>
      )}

      {/* Content - Scrollable (no static/mock data: stages and files from API only) */}
      <div className="flex-1 overflow-auto">
        {loading && allStages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <Text className="text-slate-600 dark:text-slate-400">Loading stages from API...</Text>
            </div>
          </div>
        ) : allStages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md px-4">
              <Database className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <Text className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                No stages available
              </Text>
              <Text className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Create a stage in Snowflake to start browsing files. Stages must exist in the configured schema.
              </Text>
              <Button onClick={() => loadStages()} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                <HiOutlineArrowPath className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {/*Sync stages*/}
              </Button>
            </div>
          </div>
        ) : loading && files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <Text className="text-slate-600 dark:text-slate-400">Loading files...</Text>
            </div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <HiOutlineDocument className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <Text className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                {searchQuery ? 'No files match your search' : 'No files in this stage'}
              </Text>
              <Text className="text-sm text-slate-600 dark:text-slate-400">
                {searchQuery ? 'Try a different search term' : 'Files are loaded from the API for the selected stage.'}
              </Text>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="p-6">
            {/* Bulk Actions Bar */}
            {selectedFiles.length > 0 && (
              <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Text className="font-medium text-blue-900 dark:text-blue-100">
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                    </Text>
                    <button
                      onClick={() => setSelectedFiles([])}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                    >
                      Clear selection
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={handleBulkDownload}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={loading}
                    >
                      <HiDownload className="h-4 w-4 mr-2" />
                      Download Selected
                    </Button>
                    <Button
                      onClick={handleBulkDelete}
                      className="bg-red-600 hover:bg-red-700 text-white"
                      disabled={loading || !canDeleteFiles}
                      title={!canDeleteFiles ? deleteDeniedReason : undefined}
                    >
                      <HiOutlineTrash className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
                  <tr>
                    <th className="px-6 py-3 text-left w-12">
                      <input
                        type="checkbox"
                        checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                      />
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('name')}
                        className="flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        Name <SortIcon column="name" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Format
                      </span>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('size')}
                        className="flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        Size <SortIcon column="size" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('modified')}
                        className="flex items-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        Modified <SortIcon column="modified" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredFiles.map((file) => (
                    <tr
                      key={file.name}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${
                        selectedFiles.includes(file.name) ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(file.name)}
                          onChange={() => toggleFileSelection(file.name)}
                          className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          {getFileIcon(file.name)}
                          <span className="font-medium text-slate-900 dark:text-white">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                        {formatFileSize(file.size)}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                        {formatDate(file.last_modified)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handlePreview(file)}
                            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
                            title="Preview file"
                          >
                            <HiOutlineEye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-2 text-slate-600 hover:text-green-600 hover:bg-green-50 dark:text-slate-400 dark:hover:text-green-400 dark:hover:bg-green-950/30 rounded-lg transition-colors"
                            title="Download file"
                          >
                            <HiDownload className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(file)}
                            disabled={!canDeleteFiles}
                            className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title={canDeleteFiles ? 'Delete file' : deleteDeniedReason}
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Grid View */
          <div className="p-6">
            {/* Bulk Actions Bar */}
            {selectedFiles.length > 0 && (
              <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Text className="font-medium text-blue-900 dark:text-blue-100">
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                    </Text>
                    <button
                      onClick={() => setSelectedFiles([])}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                    >
                      Clear selection
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={handleBulkDownload}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={loading}
                    >
                      <HiDownload className="h-4 w-4 mr-2" />
                      Download Selected
                    </Button>
                    <Button
                      onClick={handleBulkDelete}
                      className="bg-red-600 hover:bg-red-700 text-white"
                      disabled={loading || !canDeleteFiles}
                      title={!canDeleteFiles ? deleteDeniedReason : undefined}
                    >
                      <HiOutlineTrash className="h-4 w-4 mr-2" />
                      Delete Selected
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.name}
                  className={`group bg-white dark:bg-slate-800 rounded-lg border p-4 transition-all cursor-pointer ${
                    selectedFiles.includes(file.name)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <input
                      type="checkbox"
                      checked={selectedFiles.includes(file.name)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleFileSelection(file.name);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                    />
                  </div>
                  <div className="text-center">
                    <div className="mb-3 flex justify-center scale-150">{getFileIcon(file.name)}</div>
                    <h5 className="font-medium text-slate-900 dark:text-white truncate mb-1" title={file.name}>
                      {file.name}
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      {formatFileSize(file.size)}
                    </p>
                    <div className="flex items-center justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handlePreview(file)}
                        className="p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded"
                        title="Preview"
                      >
                        <HiOutlineEye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1.5 text-slate-600 hover:text-green-600 dark:text-slate-400 dark:hover:text-green-400 rounded"
                        title="Download"
                      >
                        <HiDownload className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(file)}
                        disabled={!canDeleteFiles}
                        className="p-1.5 text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        title={canDeleteFiles ? 'Delete' : deleteDeniedReason}
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* File Preview — non-blocking right-side panel (read-only viewer) */}
      {previewOpen && (
      <aside
        role="dialog"
        aria-label="File preview"
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex flex-col h-full">
          {/* Panel Header */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                {getFileIcon(previewFile?.name || '')}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                  {previewFile?.name ?? 'Preview'}
                </h3>
                <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {previewData && (
                    <>
                      <span>{previewData.total_rows?.toLocaleString()} rows</span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>{previewData.columns?.length || 0} columns</span>
                      {previewFile?.size && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span>{formatFileSize(previewFile.size)}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setPreviewOpen(false)}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              aria-label="Close preview"
            >
              <HiXMark className="h-5 w-5" />
            </button>
          </div>

          {/* Panel Body - Scrollable Table */}
          <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:hover:bg-slate-400 dark:[&::-webkit-scrollbar-thumb]:hover:bg-slate-500">
            {previewLoading && !previewData ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading preview...</p>
              </div>
            ) : previewData ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 dark:bg-slate-800/95 backdrop-blur">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 w-12">
                        #
                      </th>
                      {(previewData.columns || []).map((col) => (
                        <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(previewData.rows || []).map((row, idx) => (
                      <tr key={idx} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500 font-mono">
                          {idx + 1}
                        </td>
                        {(previewData.columns || []).map((col) => {
                          const cell = row[col];
                          return (
                            <td key={col} className="px-4 py-2 text-slate-700 dark:text-slate-300 max-w-[300px] truncate font-mono text-xs" title={String(cell ?? '')}>
                              {cell !== null && cell !== undefined ? String(cell) : (
                                <span className="text-slate-400 dark:text-slate-500 italic">null</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {/* Panel Footer - Pagination */}
          <div className="flex-shrink-0 px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span>Rows per page</span>
              <select
                value={previewPageSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPreviewPageSize(v);
                  if (previewFile && currentStage) {
                    setPreviewLoading(true);
                    fetchPreview(currentStage, previewFile.name, v, 0).then(() => setPreviewPage(0)).finally(() => setPreviewLoading(false));
                  }
                }}
                className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                disabled={previewPage === 0 || previewLoading}
                onClick={() => handlePreviewPageChange(previewPage - 1)}
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 rounded-md border border-slate-300 dark:border-slate-600 min-w-[80px] text-center">
                {previewPage + 1}
              </span>
              <button
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                disabled={previewLoading || (previewData?.rows?.length ?? 0) < previewPageSize}
                onClick={() => handlePreviewPageChange(previewPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </aside>
      )}

      {/* Stage grants — non-blocking right-side panel (read-only viewer) */}
      {grantsOpen && (
      <aside
        role="dialog"
        aria-label="Stage permissions"
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate pr-4">
            Permissions &mdash; {currentStage ? allStages.find(s => s.name === currentStage)?.shortName || currentStage : ''}
          </h3>
          <button
            onClick={() => setGrantsOpen(false)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            aria-label="Close"
          >
            <HiXMark className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-auto">
          {grantsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : grantsError ? (
            <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
              <p className="text-sm font-medium text-rose-800 dark:text-rose-300">Failed to load grants</p>
              <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400 break-words">{grantsError}</p>
              <button onClick={handleGrantsClick} className="mt-2 text-xs font-medium text-rose-700 hover:underline dark:text-rose-300">Retry</button>
            </div>
          ) : grants.length === 0 ? (
            <Text className="text-slate-500 dark:text-slate-400">No grants returned for this stage.</Text>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Privilege</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Granted To</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Grantee</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((g, i) => (
                  <tr key={i} className="border-b dark:border-slate-700">
                    <td className="px-2 py-2 text-slate-900 dark:text-slate-200">{g.PRIVILEGE ?? g.privilege ?? '—'}</td>
                    <td className="px-2 py-2 text-slate-900 dark:text-slate-200">{g.GRANTED_TO ?? g.granted_to ?? '—'}</td>
                    <td className="px-2 py-2 text-slate-900 dark:text-slate-200">{g.GRANTEE_NAME ?? g.grantee_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
      )}

      {/* Footer - Fixed */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
            <span>
              {filteredFiles.length} of {files.length} files
              {searchQuery && ' (filtered)'}
            </span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span>Total: {formatFileSize(files.reduce((sum, f) => sum + (f.size || 0), 0))}</span>
          </div>
          <Text className="text-sm text-slate-500 dark:text-slate-400">
            {getProviderName()} &middot; {currentStage ? allStages.find(s => s.name === currentStage)?.shortName || currentStage : 'No stage selected'}
          </Text>
        </div>
      </div>
    </div>
  );
}
