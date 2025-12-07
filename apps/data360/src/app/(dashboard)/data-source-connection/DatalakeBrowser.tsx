'use client';

import { useState, useEffect } from 'react';
import { Button, Text } from 'rizzui';
import {
  HiOutlineFolder,
  HiOutlineDocument,
  HiOutlineArrowLeft
} from 'react-icons/hi2';
import { HiRefresh } from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  listSnowflakeStages,
  listSnowflakeStageFiles
} from './connectionServices';

type Provider = 'snowflake' | 'azure' | 'aws';

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
  const [stages, setStages] = useState<StageItem[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [files, setFiles] = useState<StageItem[]>([]);
  const [showOnlyValid, setShowOnlyValid] = useState<boolean>(false);
  const [allStages, setAllStages] = useState<StageItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Load stages on mount
  useEffect(() => {
    loadStages();
  }, [provider]);

  // Filter stages when filters change
  useEffect(() => {
    filterStages();
  }, [showOnlyValid, searchQuery, allStages]);

  const loadStages = async () => {
    setLoading(true);
    try {
      let stageList: any[] = [];

      if (provider === 'snowflake') {
        // Always use /stages endpoint to get ALL stages
        const response = await listSnowflakeStages();
        stageList = response.stages || [];
      } else if (provider === 'azure') {
        // TODO: Add Azure container listing
        toast.error('Azure container listing not yet implemented');
        return;
      } else if (provider === 'aws') {
        // TODO: Add AWS bucket listing
        toast.error('AWS bucket listing not yet implemented');
        return;
      }

      const formattedStages: StageItem[] = stageList.map((stage: any) => ({
        name: stage.name || stage.stage_name || stage,
        type: 'stage' as const,
        schema_name: stage.schema_name,
        database_name: stage.database_name,
        error: stage.error,
      }));

      setAllStages(formattedStages);
      setCurrentStage(null);
      setFiles([]);

      if (formattedStages.length > 0) {
        toast.success(`Found ${formattedStages.length} total stage(s)`);
      } else {
        toast('No stages found', { icon: 'ℹ️' });
      }
    } catch (error: any) {
      toast.error(`Failed to load stages: ${error.message}`);
      console.error('Error loading stages:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterStages = () => {
    let filtered = [...allStages];

    // Filter by validity
    if (showOnlyValid) {
      filtered = filtered.filter(stage => !stage.error);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(stage =>
        stage.name.toLowerCase().includes(query) ||
        stage.database_name?.toLowerCase().includes(query) ||
        stage.schema_name?.toLowerCase().includes(query)
      );
    }

    setStages(filtered);
  };

  const loadStageFiles = async (stageName: string) => {
    setLoading(true);
    try {
      let fileList: any[] = [];

      if (provider === 'snowflake') {
        const response = await listSnowflakeStageFiles(stageName);
        fileList = response.files || [];
      } else if (provider === 'azure') {
        // TODO: Add Azure blob listing
        toast.error('Azure blob listing not yet implemented');
        return;
      } else if (provider === 'aws') {
        // TODO: Add AWS S3 object listing
        toast.error('AWS S3 object listing not yet implemented');
        return;
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
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStageClick = (stage: StageItem) => {
    if (stage.error) {
      toast.error(`Cannot browse stage: ${stage.error}`);
      return;
    }
    setCurrentStage(stage.name);
    loadStageFiles(stage.name);
  };

  const handleBackToStages = () => {
    setCurrentStage(null);
    setFiles([]);
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getProviderName = () => {
    switch (provider) {
      case 'snowflake': return 'Snowflake';
      case 'azure': return 'Azure Blob Storage';
      case 'aws': return 'Amazon S3';
      default: return 'Datalake';
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-blue-600 bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
            {getProviderName()} Browser
          </h3>
          <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {currentStage ? `Browsing: ${currentStage}` : 'Select a stage to browse'}
          </Text>
        </div>
        <div className="flex items-center space-x-3">
          {currentStage && (
            <Button
              onClick={() => loadStageFiles(currentStage)}
              className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/50"
              disabled={loading}
            >
              <HiRefresh className="h-5 w-5" />
            </Button>
          )}
          {currentStage && (
            <Button
              onClick={handleBackToStages}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
              disabled={loading}
            >
              <HiOutlineArrowLeft className="h-5 w-5 mr-2" />
              Back to Stages
            </Button>
          )}
        </div>
      </div>

      {/* Filters - Only show when viewing stages list */}
      {!currentStage && provider === 'snowflake' && allStages.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Search Bar */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search stages by name, database, or schema..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyValid}
                  onChange={(e) => setShowOnlyValid(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium">Valid only</span>
              </label>

              {/* Stats */}
              <div className="flex items-center space-x-2 text-sm">
                <Text className="text-gray-600 dark:text-gray-400">
                  Showing <span className="font-semibold text-blue-600">{stages.length}</span> of <span className="font-semibold">{allStages.length}</span>
                </Text>
              </div>
            </div>
          </div>

          {/* Filter summary */}
          {(showOnlyValid || searchQuery) && (
            <div className="mt-3 flex items-center space-x-2 text-xs">
              <Text className="text-gray-500 dark:text-gray-400">Active filters:</Text>
              {showOnlyValid && (
                <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  Valid stages only
                </span>
              )}
              {searchQuery && (
                <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  Search: "{searchQuery}"
                </span>
              )}
              <button
                onClick={() => {
                  setShowOnlyValid(false);
                  setSearchQuery('');
                }}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <Text className="text-gray-600 dark:text-gray-400">Loading...</Text>
            </div>
          </div>
        ) : !currentStage ? (
          /* Stage List */
          <div>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Available Stages ({stages.length})
            </h4>
            {stages.length === 0 ? (
              <div className="text-center py-12">
                <HiOutlineFolder className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <Text className="text-gray-600 dark:text-gray-400">No stages found</Text>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stages.map((stage, index) => (
                  <div
                    key={index}
                    onClick={() => handleStageClick(stage)}
                    className={`group rounded-xl border-2 p-6 transition-all duration-300 ${
                      stage.error
                        ? 'border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/20 cursor-not-allowed'
                        : 'cursor-pointer border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 hover:shadow-lg'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                        stage.error
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : 'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        <HiOutlineFolder className={`h-6 w-6 ${
                          stage.error ? 'text-red-600' : 'text-blue-600'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-gray-900 dark:text-white truncate">
                          {stage.name}
                        </h5>
                        {stage.database_name && stage.schema_name && (
                          <Text className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {stage.database_name}.{stage.schema_name}
                          </Text>
                        )}
                        {stage.error ? (
                          <Text className="text-xs text-red-600 dark:text-red-400 mt-1">
                            Error: {stage.error}
                          </Text>
                        ) : (
                          <Text className="text-xs text-gray-500 dark:text-gray-400">Click to browse</Text>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* File List */
          <div>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Files ({files.length} items)
            </h4>
            {files.length === 0 ? (
              <div className="text-center py-12">
                <HiOutlineDocument className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <Text className="text-gray-600 dark:text-gray-400">No files or folders found</Text>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white/50 dark:bg-slate-800/50 transition-all duration-200"
                  >
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                        <HiOutlineDocument className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-medium text-gray-900 dark:text-white truncate">
                          {file.name}
                        </h5>
                        <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
                          {file.size !== undefined && (
                            <span>{formatFileSize(file.size)}</span>
                          )}
                          {file.last_modified && (
                            <span>{new Date(file.last_modified).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
        <Button
          onClick={onBack}
          className="w-full bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary transition-all duration-300 hover:shadow-elevation-2"
          disabled={loading}
        >
          Back to Data Source Selection
        </Button>
      </div>
    </div>
  );
}
