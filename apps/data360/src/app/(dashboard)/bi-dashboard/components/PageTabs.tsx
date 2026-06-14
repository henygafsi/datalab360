'use client';

import { useState } from 'react';
import { Button, Input, Tooltip } from 'rizzui';
import { Plus, X, Pencil, Check, Loader2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createPage, updatePage, deletePage } from '@/app/services/api/biDashboardApi';
import type { DashboardPage } from '@/app/services/api/types';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';

interface PageTabsProps {
  projectId: string;
  pages: DashboardPage[];
  activePageId: string | null;
  onPageSelect: (pageId: string) => void;
  onPagesChange: (pages: DashboardPage[]) => void;
}

export default function PageTabs({
  projectId,
  pages,
  activePageId,
  onPageSelect,
  onPagesChange,
}: PageTabsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedPages = [...pages].sort((a, b) => a.page_order - b.page_order);

  const handleAddPage = async () => {
    const title = newTitle.trim() || `Page ${pages.length + 1}`;
    setLoading(true);
    try {
      const page = await createPage(projectId, {
        title,
        layout: 'grid',
        page_order: pages.length + 1,
      });
      onPagesChange([...pages, page]);
      onPageSelect(page.page_id);
      setNewTitle('');
      setIsAdding(false);
      toast.success(`Page "${title}" added`);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRenamePage = async (pageId: string) => {
    if (!editTitle.trim()) return;
    setLoading(true);
    try {
      const updated = await updatePage(projectId, pageId, { title: editTitle.trim() });
      onPagesChange(pages.map((p) => (p.page_id === pageId ? updated : p)));
      setEditingPageId(null);
      toast.success('Page renamed');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    setConfirmDeleteId(null);
    setLoading(true);
    try {
      await deletePage(projectId, pageId);
      const remaining = pages.filter((p) => p.page_id !== pageId);
      onPagesChange(remaining);
      if (activePageId === pageId && remaining.length > 0) {
        onPageSelect(remaining[0].page_id);
      }
      toast.success('Page deleted');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="tablist" aria-label="Dashboard pages" className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-700">
      {sortedPages.map((page) => {
        const isActive = page.page_id === activePageId;
        const isEditing = editingPageId === page.page_id;

        return (
          <div
            key={page.page_id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${page.page_id}`}
            tabIndex={isActive ? 0 : -1}
            className={cn(
              'group flex items-center gap-1 px-3 py-2 rounded-t-lg text-sm font-medium transition-all cursor-pointer border border-b-0',
              isActive
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-slate-200 dark:border-slate-700'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent',
            )}
          >
            {isEditing ? (
              <div className="flex items-center gap-1">
                <Input
                  size="sm"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenamePage(page.page_id);
                    if (e.key === 'Escape') setEditingPageId(null);
                  }}
                  className="w-24 h-6 text-xs"
                  autoFocus
                />
                <button onClick={() => handleRenamePage(page.page_id)} disabled={loading} aria-label="Confirm rename">
                  <Check className="h-3.5 w-3.5 text-green-500" />
                </button>
                <button onClick={() => setEditingPageId(null)} aria-label="Cancel rename">
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            ) : (
              <>
                {confirmDeleteId === page.page_id ? (
                  <div className="flex items-center gap-1 bg-red-50 dark:bg-red-950/30 rounded-lg px-2 py-0.5">
                    <span className="text-[10px] text-red-700 dark:text-red-400 whitespace-nowrap">Delete this page?</span>
                    <button
                      className="text-[10px] font-semibold text-red-700 dark:text-red-400 hover:underline"
                      onClick={(e) => { e.stopPropagation(); handleDeletePage(page.page_id); }}
                    >
                      Confirm
                    </button>
                    <button
                      className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 hover:underline"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => onPageSelect(page.page_id)} className="bg-transparent border-none p-0 font-inherit text-inherit cursor-pointer">{page.title}</button>
                    <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                      <button
                        className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPageId(page.page_id);
                          setEditTitle(page.title);
                        }}
                        aria-label="Rename page"
                      >
                        <Pencil className="h-3 w-3 text-slate-400" />
                      </button>
                      {pages.length > 1 && (
                        <button
                          className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pages.length <= 1) { toast.error('Cannot delete the last page'); return; }
                            setConfirmDeleteId(page.page_id);
                          }}
                          aria-label="Delete page"
                        >
                          <X className="h-3 w-3 text-red-400" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Add Page */}
      {isAdding ? (
        <div className="flex items-center gap-1 px-2">
          <Input
            size="sm"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddPage();
              if (e.key === 'Escape') { setIsAdding(false); setNewTitle(''); }
            }}
            placeholder="Page title..."
            className="w-28 h-6 text-xs"
            autoFocus
          />
          <button onClick={handleAddPage} disabled={loading} aria-label="Confirm add page">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-500" />}
          </button>
          <button onClick={() => { setIsAdding(false); setNewTitle(''); }} aria-label="Cancel add page">
            <X className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      ) : (
        <Tooltip content="Add page">
          <button
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
