'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import {
  ETL_BLOCKS,
  ETLBlockDefinition,
  ETLCategory,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  getBlocksByCategory,
} from './etl-blocks';

interface ETLPaletteProps {
  className?: string;
}

// Draggable block item
const PaletteItem: React.FC<{
  block: ETLBlockDefinition;
}> = ({ block }) => {
  const Icon = block.icon;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', block.type);
    e.dataTransfer.effectAllowed = 'move';

    // Custom drag preview
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
        'group flex items-center gap-3 p-2.5 rounded-lg cursor-grab active:cursor-grabbing',
        'border border-slate-200 dark:border-slate-700',
        'bg-white dark:bg-slate-800',
        'hover:border-slate-300 dark:hover:border-slate-600',
        'hover:shadow-md transition-all duration-200',
        'select-none'
      )}
      title={block.tooltip || block.description}
    >
      {/* Drag handle */}
      <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Icon */}
      <div className={cn('p-2 rounded-lg', block.bgColor)}>
        <Icon className={cn('h-5 w-5', block.color)} />
      </div>

      {/* Label & description */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-slate-800 dark:text-slate-100">
          {block.label}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {block.description}
        </div>
      </div>
    </div>
  );
};

// Category section
const CategorySection: React.FC<{
  category: ETLCategory;
  blocks: ETLBlockDefinition[];
  defaultOpen?: boolean;
}> = ({ category, blocks, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const CategoryIcon = CATEGORY_ICONS[category];

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-2 rounded-lg',
          'text-sm font-semibold text-slate-700 dark:text-slate-200',
          'hover:bg-slate-100 dark:hover:bg-slate-700/50',
          'transition-colors'
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <CategoryIcon className="h-4 w-4 text-slate-500" />
        <span>{CATEGORY_LABELS[category]}</span>
        <span className="ml-auto text-xs text-slate-400 font-normal">
          {blocks.length}
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 pl-2">
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

  // Categorized blocks
  const sourceBlocks = useMemo(() => getBlocksByCategory('source'), []);
  const transformBlocks = useMemo(() => getBlocksByCategory('transform'), []);
  const transformAdvancedBlocks = useMemo(() => getBlocksByCategory('transform_advanced'), []);
  const destinationBlocks = useMemo(() => getBlocksByCategory('destination'), []);
  const pythonBlocks = useMemo(() => getBlocksByCategory('python'), []);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="text-xl">🧩</span>
          ETL Blocks
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Drag blocks to the canvas to build your workflow
        </p>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              'w-full pl-9 pr-3 py-2 rounded-lg',
              'border border-slate-200 dark:border-slate-700',
              'bg-white dark:bg-slate-800',
              'text-sm text-slate-800 dark:text-slate-100',
              'placeholder:text-slate-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            )}
          />
        </div>
      </div>

      {/* Blocks list */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {filteredBlocks ? (
          // Search results
          <div className="space-y-2">
            {filteredBlocks.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No blocks match "{searchQuery}"</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  {filteredBlocks.length} result{filteredBlocks.length !== 1 ? 's' : ''}
                </p>
                {filteredBlocks.map((block) => (
                  <PaletteItem key={block.id} block={block} />
                ))}
              </>
            )}
          </div>
        ) : (
          // Categorized view
          <>
            <CategorySection category="source" blocks={sourceBlocks} />
            <CategorySection category="transform" blocks={transformBlocks} />
            <CategorySection category="transform_advanced" blocks={transformAdvancedBlocks} defaultOpen={false} />
            <CategorySection category="destination" blocks={destinationBlocks} />
            <CategorySection category="python" blocks={pythonBlocks} defaultOpen={false} />
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          Click a node on canvas to configure it
        </p>
      </div>
    </div>
  );
};

export default React.memo(ETLPalette);
