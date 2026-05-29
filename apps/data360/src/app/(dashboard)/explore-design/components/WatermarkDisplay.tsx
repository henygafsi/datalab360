'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from 'rizzui';
import {
  Clock, RefreshCw, ChevronDown, ChevronRight, Database, Timer, User,
} from 'lucide-react';
import { listWatermarks, getWatermark } from '@/app/services/api/exploreDesignApi';
import type { Watermark } from '@/app/services/api/types';

interface WatermarkDisplayProps {
  projectId: string | null;
  tableName: string;
  /** Fully-qualified source table name (e.g. RAW.PUBLIC.ORDERS) for single watermark lookup */
  sourceTableFqn?: string;
  className?: string;
}

const WatermarkDisplay: React.FC<WatermarkDisplayProps> = ({
  projectId,
  tableName,
  sourceTableFqn,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [watermark, setWatermark] = useState<Watermark | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchWatermark = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      if (sourceTableFqn) {
        // Single watermark lookup
        const result = await getWatermark(projectId, sourceTableFqn);
        setWatermark(result);
      } else {
        // List all and find matching
        const result = await listWatermarks(projectId);
        const match = result.watermarks.find(
          (w) => w.source_fqn.toUpperCase().endsWith(tableName.toUpperCase()),
        );
        setWatermark(match || null);
      }
    } catch {
      // Silently fail — no watermark data available
    } finally {
      setIsLoading(false);
    }
  }, [projectId, sourceTableFqn, tableName]);

  useEffect(() => {
    fetchWatermark();
  }, [fetchWatermark]);

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      <button
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-medium text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-500" />
          Watermark Tracking
          {watermark && (
            <Badge size="sm" className="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30">
              Last sync available
            </Badge>
          )}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-3 animate-in fade-in duration-200">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading watermark data...
            </div>
          ) : watermark ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-center">
                  <p className="text-xs text-slate-500 mb-1">Last successful sync</p>
                  <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {new Date(watermark.last_run_at).toLocaleString()} UTC
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                  <p className="text-xs text-slate-500 mb-1">Rows loaded</p>
                  <p className="text-sm font-semibold">
                    {watermark.rows_loaded.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5" />
                  <span>
                    Watermark column: <span className="font-mono font-semibold">{watermark.watermark_column}</span>
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  <span>Updated by: {watermark.updated_by}</span>
                </div>
              </div>
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                <Timer className="h-3.5 w-3.5" />
                Next sync will start from: <span className="font-mono font-semibold">{watermark.last_value}</span>
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-slate-500">
              <Database className="h-6 w-6 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No previous sync recorded</p>
              <p className="text-xs mt-1 text-slate-400">Run an ingestion to see watermark tracking</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WatermarkDisplay;
