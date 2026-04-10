'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, ChevronRight, GripVertical, Star } from 'lucide-react';
import {
  ETL_BLOCKS,
  ETLBlockDefinition,
  ETLCategory,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  getBlocksByCategory,
  getCommonBlocks,
} from './etl-blocks';

interface ETLPaletteProps {
  className?: string;
}

// Category color mapping for visual distinction
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  source: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500' },
  transform: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  transform_advanced: { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
  destination: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  python: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  ml_training: { bg: 'bg-pink-50 dark:bg-pink-900/20', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-800', dot: 'bg-pink-500' },
  ai_functions: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800', dot: 'bg-purple-500' },
  templates: { bg: 'bg-slate-50 dark:bg-slate-900/20', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-800', dot: 'bg-slate-500' },
};

// Draggable block item — compact with category color indicator
const PaletteItem: React.FC<{
  block: ETLBlockDefinition;
}> = ({ block }) => {
  const Icon = block.icon;
  const catColor = CATEGORY_COLORS[block.category] || CATEGORY_COLORS.transform;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', block.type);
    e.dataTransfer.effectAllowed = 'move';

    const preview = document.createElement('div');
    preview.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 14px;background:white;border-radius:10px;border:2px solid #3b82f6;box-shadow:0 4px 16px rgba(0,0,0,0.15);font-size:13px;font-weight:600;color:#1e293b;position:absolute;top:-9999px;left:-9999px;';
    preview.textContent = block.label;
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 50, 20);
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (document.body.contains(preview)) document.body.removeChild(preview);
      }, 0);
    });
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing',
        'border border-slate-200/80 dark:border-slate-700/80',
        'bg-white dark:bg-slate-800',
        'hover:border-slate-300 dark:hover:border-slate-600',
        'hover:shadow-md hover:-translate-y-px transition-all duration-200',
        'select-none'
      )}
      title={block.tooltip || block.description}
    >
      {/* Category color dot */}
      <div className={cn('w-1.5 h-8 rounded-full flex-shrink-0', catColor.dot, 'opacity-60')} />

      {/* Icon */}
      <div className={cn('p-1.5 rounded-md', block.bgColor)}>
        <Icon className={cn('h-4 w-4', block.color)} />
      </div>

      {/* Label & description */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[13px] text-slate-800 dark:text-slate-100 leading-tight">
          {block.label}
        </div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate leading-tight mt-0.5">
          {block.description}
        </div>
      </div>

      {/* Drag hint */}
      <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
};

// Category section with colored header
const CategorySection: React.FC<{
  category: ETLCategory;
  blocks: ETLBlockDefinition[];
  defaultOpen?: boolean;
}> = ({ category, blocks, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const CategoryIcon = CATEGORY_ICONS[category];
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.transform;

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors',
          isOpen ? colors.bg : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        )}
        <CategoryIcon className={cn('h-4 w-4 flex-shrink-0', isOpen ? colors.text : 'text-slate-500')} />
        <span className={cn('text-xs font-semibold', isOpen ? colors.text : 'text-slate-600 dark:text-slate-300')}>
          {CATEGORY_LABELS[category]}
        </span>
        <span className="ml-auto text-[10px] text-slate-400 font-normal bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
          {blocks.length}
        </span>
      </button>

      {isOpen && (
        <div className="mt-1.5 space-y-1.5 pl-1">
          {blocks.map((block) => (
            <PaletteItem key={block.id} block={block} />
          ))}
        </div>
      )}
    </div>
  );
};

const ETLPalette: React.FC<ETLPaletteProps> = ({ className }) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter blocks based on search
  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    return ETL_BLOCKS.filter(
      (block) =>
        block.label.toLowerCase().includes(query) ||
        block.description.toLowerCase().includes(query) ||
        block.tooltip?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Common blocks (always shown first)
  const commonBlocks = useMemo(() => getCommonBlocks(), []);

  // Categorized blocks
  const sourceBlocks = useMemo(() => getBlocksByCategory('source'), []);
  const transformBlocks = useMemo(() => getBlocksByCategory('transform'), []);
  const transformAdvancedBlocks = useMemo(() => getBlocksByCategory('transform_advanced'), []);
  const destinationBlocks = useMemo(() => getBlocksByCategory('destination'), []);
  const pythonBlocks = useMemo(() => getBlocksByCategory('python'), []);
  const mlBlocks = useMemo(() => getBlocksByCategory('ml_training'), []);
  const aiBlocks = useMemo(() => getBlocksByCategory('ai_functions'), []);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <div className="p-1 rounded-md bg-indigo-100 dark:bg-indigo-900/40">
            <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          Blocks
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Drag to canvas to build your workflow
        </p>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-8 pr-3 py-1.5 rounded-lg text-sm',
              'border border-slate-200 dark:border-slate-700',
              'bg-white dark:bg-slate-800',
              'text-slate-800 dark:text-slate-100',
              'placeholder:text-slate-400',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400'
            )}
          />
        </div>
      </div>

      {/* Blocks list */}
      <div className="flex-1 overflow-auto px-3 pb-3">
        {filteredBlocks ? (
          // Search results
          <div className="space-y-1.5">
            {filteredBlocks.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Search className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No blocks match &quot;{searchQuery}&quot;</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  Try: source, filter, join, aggregate, sort, ai
                </p>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2 px-1">
                  {filteredBlocks.length} result{filteredBlocks.length !== 1 ? 's' : ''}
                </p>
                {filteredBlocks.map((block) => (
                  <PaletteItem key={block.id} block={block} />
                ))}
              </>
            )}
          </div>
        ) : (
          // Categorized view — Common first, rest collapsed
          <>
            {/* Common blocks — always expanded with star icon */}
            <div className="mb-3">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                <Star className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" fill="currentColor" />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Common</span>
                <span className="ml-auto text-[10px] text-slate-400 font-normal bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                  {commonBlocks.length}
                </span>
              </div>
              <div className="mt-1.5 space-y-1.5 pl-1">
                {commonBlocks.map((block: ETLBlockDefinition) => (
                  <PaletteItem key={`common-${block.id}`} block={block} />
                ))}
              </div>
            </div>

            <div className="h-px bg-slate-200 dark:bg-slate-700 mb-3" />

            <CategorySection category="source" blocks={sourceBlocks} defaultOpen={false} />
            <CategorySection category="transform" blocks={transformBlocks} defaultOpen={false} />
            <CategorySection category="transform_advanced" blocks={transformAdvancedBlocks} defaultOpen={false} />
            <CategorySection category="destination" blocks={destinationBlocks} defaultOpen={false} />
            <CategorySection category="python" blocks={pythonBlocks} defaultOpen={false} />
            <CategorySection category="ml_training" blocks={mlBlocks} defaultOpen={false} />
            <CategorySection category="ai_functions" blocks={aiBlocks} defaultOpen={false} />
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(ETLPalette);
