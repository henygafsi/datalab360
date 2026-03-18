'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Text, Badge, Modal } from 'rizzui';
import {
  HiOutlineDocument,
  HiOutlineArrowLeft,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlineChevronRight,
  HiOutlineHome,
  HiOutlineShieldCheck
} from 'react-icons/hi2';
import { HiRefresh, HiViewGrid, HiViewList, HiDownload, HiUpload } from 'react-icons/hi';
import { Database } from 'lucide-react';
import toast from 'react-hot-toast';
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

type Provider = 'snowflake' | 'azure' | 'aws' | 'gcs' | 'databricks' | 'iceberg' | 'postgres' | 'mysql';
type Provider = 'snowflake' | 'azure' | 'aws' | 'gcp' | 'databricks' | 'iceberg' | 'postgres' | 'mysql' | 'salesforce' | 'sap' | 'oracle' | 'hubspot' | 'servicenow' | 'custom_api';
type ViewMode = 'grid' | 'table';

const BROWSER_ONLY_PROVIDERS: Provider[] = ['snowflake', 'azure', 'aws', 'gcs'];

interface DatalakeBrowserProps {
  provider: Provider;
  onBack: () => void;
}

interface StageItem {
  name: string;
  type: 'stage' | 'folder' | 'file';
  size?: number;
  last_modified?: string;
  error?: string;
  schema_name?: string;
  database_name?: string;
}

export default function DatalakeBrowser({ provider, onBack }: DatalakeBrowserProps) {
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
  const [grants, setGrants] = useState<any[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);

  const loadStages = useCallback(async () => {
    setLoading(true);
    setCurrentStage(null);
    setFiles([]);
    try {
      let stageList: any[] = [];

      if (provider === 'snowflake' || provider === 'aws' || provider === 'azure' || provider === 'gcs') {
        // All cloud providers create Snowflake external stages, so we list via the same API
        const response = await listSnowflakeStages();
        stageList = Array.isArray(response?.stages) ? response.stages : [];
      }

      const formattedStages: StageItem[] = stageList.map((stage: any) => ({
        name: stage.name ?? stage.stage_name ?? String(stage),
        type: 'stage' as const,
        schema_name: stage.schema_name,
        database_name: stage.database_name,
        error: stage.error,
      }));

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
      const sortParam = sortBy === 'modified' ? 'last_modified' : sortBy;

      if (provider === 'snowflake' || provider === 'aws' || provider === 'azure' || provider === 'gcs') {
        const response = await listSnowflakeStageFiles(stageName, { sort: sortParam });
        fileList = response.files || [];
      }

      const formattedFiles: StageItem[] = fileList.map((file: any) => ({
        name: file.name,
        type: 'file',
        size: file.size,
        last_modified: file.last_modified,
      }));

      if (sortOrder === 'desc' && sortBy === 'name') {
        formattedFiles.reverse();
      } else if (sortOrder === 'desc' && (sortBy === 'size' || sortBy === 'modified')) {
        formattedFiles.reverse();
      }
      setFiles(formattedFiles);
    } catch (error: any) {
      toast.error(`Failed to load files: ${error.message}`);
      console.error('Error loading stage files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [provider, sortBy, sortOrder]);

  useEffect(() => {
    if (BROWSER_ONLY_PROVIDERS.includes(provider)) loadStages();
  }, [provider, loadStages]);

  useEffect(() => {
    if (currentStage) loadStageFiles(currentStage);
  }, [currentStage, loadStageFiles]);

  const handleStageChange = (newStageName: string) => {
    setCurrentStage(newStageName);
    setSearchQuery('');
    loadStageFiles(newStageName);
  };

  const fetchPreview = useCallback(async (stageName: string, fileName: string, limit: number, offset: number) => {
    const data = await previewStageFile(stageName, fileName, limit, offset);
    setPreviewData(data);
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
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setPreviewLoading(false));
  };

  const handleGrantsClick = async () => {
    if (!currentStage) return;
    setGrantsOpen(true);
    setGrantsLoading(true);
    try {
      const res = await getStageGrants(currentStage);
      setGrants(Array.isArray(res?.grants) ? res.grants : []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load grants');
      setGrants([]);
    } finally {
      setGrantsLoading(false);
    }
  };

  const handleDownload = async (file: StageItem) => {
    if (!currentStage) return;

    setLoading(true);
    toast('Downloading file...', { icon: '⬇️' });

    try {
      await downloadStageFile(currentStage, file.name);
      toast.success(`Downloaded: ${file.name}`);
    } catch (error: any) {
      toast.error(`Failed to download: ${error.message}`);
      console.error('Download error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (file: StageItem) => {
    if (!currentStage) return;

    const confirmed = confirm(
      `⚠️ WARNING: This action is irreversible.\n\nAre you sure you want to delete "${file.name}"?`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      await deleteStageFile(currentStage, file.name);
      toast.success(`Deleted: ${file.name}`);

      // Reload files after deletion
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
        const overwrite = confirm(
          `⚠️ One or more files already exist.\n\nDo you want to overwrite them?`
        );

        if (overwrite) {
          try {
            const result = await uploadStageFile(currentStage, fileList, true);
            toast.success(
              `Successfully uploaded ${result.total_uploaded || fileList.length} file(s) (overwritten)`,
              { id: uploadToast }
            );
            loadStageFiles(currentStage);
            event.target.value = '';
          } catch (retryError: any) {
            toast.error(`Failed to upload: ${retryError.message}`, { id: uploadToast });
            console.error('Upload retry error:', retryError);
          }
        } else {
          toast.error('Upload cancelled', { id: uploadToast });
        }
      } else {
        toast.error(`Failed to upload: ${error.message}`, { id: uploadToast });
        console.error('Upload error:', error);
      }
    } finally {
      setUploading(false);
    }
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

    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const fileName of selectedFiles) {
      try {
        await downloadStageFile(currentStage, fileName);
        successCount++;
      } catch (error: any) {
        errorCount++;
        console.error(`Failed to download ${fileName}:`, error);
      }
    }

    toast.success(`Downloaded ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
    setSelectedFiles([]);
    setLoading(false);
  };

  const handleBulkDelete = async () => {
    if (!currentStage || selectedFiles.length === 0) return;

    const confirmed = confirm(
      `⚠️ WARNING: This action is irreversible.\n\nAre you sure you want to delete ${selectedFiles.length} file(s)?`
    );

    if (!confirmed) return;

    setLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const fileName of selectedFiles) {
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
        <Button variant="outline" onClick={onBack} className="self-start">
          <HiOutlineArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center max-w-md mx-auto">
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
        return '📊';
      case 'json':
        return '📋';
      case 'parquet':
        return '📦';
      case 'txt':
        return '📄';
      default:
        return '📁';
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
                <span className="font-medium text-blue-600 dark:text-blue-400">{currentStage}</span>
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
                  <span className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 min-w-[250px] text-sm">
                    {loading ? 'Loading stages…' : 'No stages (from API)'}
                  </span>
                ) : (
                  <select
                    value={currentStage || ''}
                    onChange={(e) => handleStageChange(e.target.value)}
                    className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[250px]"
                    disabled={loading}
                  >
                    {allStages.map((stage) => (
                      <option key={stage.name} value={stage.name}>
                        {stage.name}
                        {stage.database_name && stage.schema_name ? ` (${stage.database_name}.${stage.schema_name})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  onClick={() => loadStages()}
                  disabled={loading}
                  className="bg-white hover:bg-slate-50 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600"
                  title="Refresh stages list"
                  aria-label="Refresh stages list"
                >
                  <HiRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {files.length} files
                </Badge>
              </div>

              {/* Search */}
              <div className="flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search files..."
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
                  Upload
                </Button>
              </label>

              {/* Refresh files in current stage */}
              <Button
                onClick={() => currentStage && loadStageFiles(currentStage)}
                className="bg-white hover:bg-slate-50 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600"
                disabled={loading || !currentStage}
                title="Refresh files"
                aria-label="Refresh files in current stage"
              >
                <HiRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>

              {/* Stage grants (governance) */}
              {provider === 'snowflake' && (
                <Button
                  onClick={handleGrantsClick}
                  disabled={!currentStage || grantsLoading}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600"
                  title="View stage grants"
                  aria-label="View stage grants"
                >
                  <HiOutlineShieldCheck className="h-4 w-4 mr-2" />
                  Grants
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sort dropdown for file list */}
      {files.length > 0 && (
        <div className="px-6 py-2 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
          <Text className="text-sm text-slate-600 dark:text-slate-400">Sort by:</Text>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'size' | 'modified')}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm px-3 py-1.5"
          >
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="modified">Last modified</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
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
                No stages returned
              </Text>
              <Text className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Stages are loaded from the backend (GET /connect/stages). Create stages in Snowflake schema CP_DATA360.STAGING or click Refresh above to retry.
              </Text>
              <Button onClick={() => loadStages()} disabled={loading}>
                <HiRefresh className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh stages
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
                      Download ({selectedFiles.length})
                    </Button>
                    <Button
                      onClick={handleBulkDelete}
                      className="bg-red-600 hover:bg-red-700 text-white"
                      disabled={loading}
                    >
                      <HiOutlineTrash className="h-4 w-4 mr-2" />
                      Delete ({selectedFiles.length})
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
                        Type
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
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredFiles.map((file, index) => (
                    <tr
                      key={index}
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
                          <span className="text-2xl">{getFileIcon(file.name)}</span>
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
                            className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                            title="Delete file"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredFiles.map((file, index) => (
                <div
                  key={index}
                  className="group bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-lg hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer"
                >
                  <div className="text-center">
                    <div className="text-5xl mb-3">{getFileIcon(file.name)}</div>
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
                        className="p-1.5 text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded"
                        title="Delete"
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

      {/* File Preview Modal with pagination */}
      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} size="xl" className="max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
            {previewFile?.name ?? 'Preview'}
          </h3>
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {previewLoading && !previewData ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : previewData ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                <span>{previewData.total_rows} rows (page size: {previewPageSize})</span>
                <span>Columns: {previewData.columns?.join(', ') || '—'}</span>
              </div>
              <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      {(previewData.columns || []).map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300 border-b dark:border-slate-700">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(previewData.rows || []).map((row, idx) => (
                      <tr key={idx} className="border-b dark:border-slate-700 last:border-0">
                        {(previewData.columns || []).map((col) => (
                          <td key={col} className="px-3 py-2 text-slate-900 dark:text-slate-200 max-w-xs truncate" title={String((row as any)[col] ?? '')}>
                            {String((row as any)[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Page size:</span>
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
                    className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previewPage === 0 || previewLoading}
                    onClick={() => handlePreviewPageChange(previewPage - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600 dark:text-slate-400">Page {previewPage + 1}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previewLoading || (previewData.rows?.length ?? 0) < previewPageSize}
                    onClick={() => handlePreviewPageChange(previewPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      {/* Stage grants modal */}
      <Modal isOpen={grantsOpen} onClose={() => setGrantsOpen(false)} size="md">
        <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Stage grants — {currentStage}</h3>
          <Button size="sm" variant="outline" onClick={() => setGrantsOpen(false)}>Close</Button>
        </div>
        <div className="p-4 max-h-96 overflow-auto">
          {grantsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
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
      </Modal>

      {/* Footer - Fixed */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <Text className="text-sm text-slate-600 dark:text-slate-400">
            Showing {filteredFiles.length} of {files.length} files
            {searchQuery && ` (filtered)`}
          </Text>
          <Button
            onClick={onBack}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
            title="Back to Data Source Connection"
            aria-label="Back to Data Source Connection"
          >
            <HiOutlineArrowLeft className="h-4 w-4 mr-2" />
            Back to Connections
          </Button>
        </div>
      </div>
    </div>
  );
}
