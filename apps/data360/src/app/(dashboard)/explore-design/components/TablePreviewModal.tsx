'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Badge } from 'rizzui';
import {
  X,
  RefreshCw,
  Download,
  Table2,
  ChevronLeft,
  ChevronRight,
  Database,
  Rows3,
  Columns3,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { getTablePreview, TablePreviewData } from '@/app/services/explore-design';

interface TablePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  database: string;
  schema: string;
  table: string;
}

const TablePreviewModal: React.FC<TablePreviewModalProps> = ({
  isOpen,
  onClose,
  database,
  schema,
  table,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<TablePreviewData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const loadData = useCallback(async () => {
    if (!database || !schema || !table) return;

    setIsLoading(true);
    setError(null);

    try {
      const offset = (currentPage - 1) * pageSize;
      const data = await getTablePreview(database, schema, table, pageSize, offset);
      setPreviewData(data);
    } catch (err: any) {
      console.error('Failed to load table preview:', err);
      setError(err.message || 'Failed to load table data. The backend endpoint may not be available.');
    } finally {
      setIsLoading(false);
    }
  }, [database, schema, table, currentPage, pageSize]);

  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      loadData();
    }
  }, [isOpen, database, schema, table]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen && previewData) {
      loadData();
    }
  }, [currentPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = previewData ? Math.ceil(previewData.total_rows / pageSize) : 1;

  const handleExportCSV = () => {
    if (!previewData || !previewData.rows.length) {
      toast.error('No data to export');
      return;
    }

    const headers = previewData.columns.join(',');
    const rows = previewData.rows.map(row =>
      previewData.columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      }).join(',')
    );

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table}_preview_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported to CSV');
  };

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} customSize="1200px">
      <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-3">
            <Table2 className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-bold">{table}</h2>
              <p className="text-sm text-blue-100">
                {database}.{schema}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {previewData && (
              <Badge className="bg-white/20 text-white">
                {previewData.total_rows.toLocaleString()} rows
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
        {previewData && (
          <div className="px-6 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-400" />
              <span className="text-slate-500">Database:</span>
              <span className="font-medium">{database}</span>
            </div>
            <div className="flex items-center gap-2">
              <Rows3 className="h-4 w-4 text-slate-400" />
              <span className="text-slate-500">Total Rows:</span>
              <span className="font-medium">{previewData.total_rows.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Columns3 className="h-4 w-4 text-slate-400" />
              <span className="text-slate-500">Columns:</span>
              <span className="font-medium">{previewData.columns.length}</span>
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
                disabled={!previewData?.rows.length}
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading && !previewData ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500 mb-4" />
              <p className="text-slate-500">Loading table data...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <p className="text-red-500 font-medium mb-2">Failed to load data</p>
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
          ) : previewData ? (
            <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                      <th className="px-3 py-2 text-left font-medium text-slate-500 w-12">#</th>
                      {previewData.columns.map((col, idx) => (
                        <th
                          key={idx}
                          className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={cn(
                          "border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                          rowIdx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/50 dark:bg-slate-800/30"
                        )}
                      >
                        <td className="px-3 py-2 text-slate-400 font-mono text-xs">
                          {(currentPage - 1) * pageSize + rowIdx + 1}
                        </td>
                        {previewData.columns.map((col, colIdx) => {
                          const value = row[col];
                          const isNull = value === null || value === undefined;
                          return (
                            <td
                              key={colIdx}
                              className={cn(
                                "px-3 py-2 font-mono text-xs max-w-[300px] truncate",
                                isNull ? "text-slate-400 italic" : "text-slate-700 dark:text-slate-300"
                              )}
                              title={formatCellValue(value)}
                            >
                              {formatCellValue(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Table2 className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-slate-500">No data available</p>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {previewData && previewData.total_rows > pageSize && (
          <div className="px-6 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border dark:border-slate-700 rounded text-sm bg-white dark:bg-slate-800"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500">
                Page {currentPage} of {totalPages.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1 || isLoading}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || isLoading}
                >
                  Last
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TablePreviewModal;
