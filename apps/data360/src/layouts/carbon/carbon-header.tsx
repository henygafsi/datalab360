'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import cn from '@core/utils/class-names';

// Store
import { useBookmarks } from '@/store/bookmarks-store';

// Components
import HamburgerButton from '@/layouts/hamburger-button';
import Logo from '@core/components/logo';
import HeaderMenuRight from '@/layouts/header-menu-right';
import StickyHeader from '@/layouts/sticky-header';
import { CarbonDrawerSidebar } from './carbon-drawer-sidebar';

// Icons
import {
  HiOutlineMagnifyingGlass,
  HiOutlineCommandLine,
  HiOutlineArrowRight,
  HiOutlineGlobeAlt,
  HiOutlineChartBarSquare,
  HiOutlineUsers,
  HiOutlineDocumentText,
  HiOutlineArrowTrendingUp,
  HiOutlineCog6Tooth,
  HiOutlineCpuChip,
  HiOutlineShieldCheck,
  HiOutlineEye,
  HiOutlineCircleStack,
  HiOutlineBolt,
  HiOutlineBeaker,
  HiOutlineBuildingOffice,
  HiOutlineStar,
} from 'react-icons/hi2';
import { IoCloseCircle } from 'react-icons/io5';

// Search suggestions — all Data360 modules
const searchSuggestions = {
  pages: [
    { label: 'Dashboard', href: '/', icon: HiOutlineChartBarSquare, description: 'Platform overview and KPIs' },
    { label: 'Connect Data', href: '/data-source-connection', icon: HiOutlineGlobeAlt, description: 'Stages, pipes, integrations' },
    { label: 'Explore & Design', href: '/explore-design', icon: HiOutlineDocumentText, description: 'Data modeling, DDL, catalog' },
    { label: 'Workflow', href: '/workflow', icon: HiOutlineBolt, description: 'ETL pipelines, tasks, scheduling' },
    { label: 'BI Dashboard', href: '/bi-dashboard', icon: HiOutlineChartBarSquare, description: 'Charts, widgets, dashboards' },
    { label: 'Governance', href: '/governance', icon: HiOutlineUsers, description: 'Roles, grants, policies, audit' },
    { label: 'Governance Grants', href: '/governance/grants', icon: HiOutlineShieldCheck, description: 'Role-based access control' },
    { label: 'Governance Policies', href: '/governance/policies', icon: HiOutlineShieldCheck, description: 'RLS, masking, network policies' },
    { label: 'Governance Projects', href: '/governance/projects', icon: HiOutlineUsers, description: 'Project members & deployments' },
    { label: 'Data Quality', href: '/data-quality', icon: HiOutlineBeaker, description: 'DMF checks, reports, quality gates' },
    { label: 'AI Intelligence', href: '/intelligent', icon: HiOutlineCpuChip, description: 'Cortex AI, LLM, semantic models' },
    { label: 'Observability', href: '/observability', icon: HiOutlineEye, description: 'KPIs, lineage, performance monitoring' },
    { label: 'Account Overview', href: '/account-overview', icon: HiOutlineBuildingOffice, description: 'Command center, cross-account audit' },
  ],
  actions: [
    { label: 'New Explore Project', href: '/explore-design', icon: HiOutlineDocumentText, description: 'Create data modeling project' },
    { label: 'New Workflow', href: '/workflow', icon: HiOutlineBolt, description: 'Create ETL pipeline' },
    { label: 'New BI Dashboard', href: '/bi-dashboard', icon: HiOutlineChartBarSquare, description: 'Create analytics dashboard' },
    { label: 'Run Data Quality Check', href: '/data-quality', icon: HiOutlineBeaker, description: 'Execute DMF validation' },
    { label: 'Admin Config', href: '/admin/data360-config', icon: HiOutlineCog6Tooth, description: 'Platform settings & cache config' },
  ],
};

function SearchBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { bookmarks, toggleBookmark, isBookmarked } = useBookmarks();

  const bookmarkSuggestions = bookmarks.map((b) => ({
    label: b.label,
    href: b.href,
    icon: HiOutlineStar,
    description: b.module,
    category: 'Favorites',
  }));

  const allSuggestions = [
    ...bookmarkSuggestions,
    ...searchSuggestions.pages.map((item) => ({ ...item, category: 'Pages' })),
    ...searchSuggestions.actions.map((item) => ({ ...item, category: 'Actions' })),
  ];

  const filteredSuggestions = allSuggestions.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setIsExpanded(false);
        setShowSuggestions(false);
        setQuery('');
        setSelectedIndex(-1);
      }
      if (showSuggestions) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          const selected = filteredSuggestions[selectedIndex];
          if (selected) window.location.href = selected.href;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSuggestions, selectedIndex, filteredSuggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setIsExpanded(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displaySuggestions = query ? filteredSuggestions : allSuggestions;

  return (
    <div ref={searchRef} className="relative w-full max-w-xl">
      {/* Search input */}
      <div
        className={cn(
          'relative flex items-center rounded-xl border bg-white/70 backdrop-blur-sm transition-all duration-200 dark:bg-slate-800/70',
          isExpanded || showSuggestions
            ? 'border-blue-300/60 ring-2 ring-blue-500/10 dark:border-blue-600/40'
            : 'border-slate-200/60 hover:border-slate-300/60 dark:border-slate-700/60 dark:hover:border-slate-600/60'
        )}
      >
        <HiOutlineMagnifyingGlass
          className={cn(
            'ml-3.5 h-4 w-4 shrink-0 transition-colors duration-200',
            showSuggestions ? 'text-blue-500' : 'text-slate-400'
          )}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => {
            setIsExpanded(true);
            setShowSuggestions(true);
          }}
          placeholder="Search..."
          className="w-full bg-transparent px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none dark:text-slate-200 dark:placeholder-slate-500"
        />
        <div className="mr-3 hidden items-center gap-1 md:flex">
          <kbd className="flex h-5 items-center gap-0.5 rounded border border-slate-200/80 bg-slate-50 px-1.5 text-[10px] font-medium text-slate-400 dark:border-slate-600/60 dark:bg-slate-700/60 dark:text-slate-500">
            <HiOutlineCommandLine className="h-2.5 w-2.5" />K
          </kbd>
        </div>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {showSuggestions && isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-xl shadow-slate-200/40 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/95 dark:shadow-black/30"
          >
            <div className="p-3">
              {/* Header */}
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {query ? `Results for "${query}"` : 'Quick Access'}
                </span>
                <button
                  onClick={() => {
                    setShowSuggestions(false);
                    setIsExpanded(false);
                    setQuery('');
                  }}
                  className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <IoCloseCircle className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>

              {/* Results */}
              <div className="max-h-72 space-y-0.5 overflow-y-auto">
                {displaySuggestions.map((item, index) => (
                  <a
                    key={`${item.category}-${item.label}`}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150',
                      selectedIndex === index
                        ? 'bg-blue-50 dark:bg-blue-900/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                    onClick={() => {
                      setShowSuggestions(false);
                      setIsExpanded(false);
                      setQuery('');
                    }}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        selectedIndex === index
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-800/50 dark:text-blue-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'truncate text-sm font-medium',
                          selectedIndex === index
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-700 dark:text-slate-200'
                        )}
                      >
                        {item.label}
                      </div>
                      <div className="truncate text-xs text-slate-400 dark:text-slate-500">
                        {item.description}
                      </div>
                    </div>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      {item.category}
                    </span>
                    {item.category !== 'Actions' && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleBookmark({ label: item.label, href: item.href, module: item.category });
                        }}
                        className="ml-1 shrink-0 rounded-md p-1 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                        title={isBookmarked(item.href) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <HiOutlineStar className={cn('h-3.5 w-3.5', isBookmarked(item.href) ? 'text-amber-500 fill-amber-500' : 'text-slate-300 dark:text-slate-600')} />
                      </button>
                    )}
                  </a>
                ))}

                {query && filteredSuggestions.length === 0 && (
                  <div className="px-2 py-6 text-center">
                    <div className="text-sm text-slate-500">No results found</div>
                    <div className="mt-1 text-xs text-slate-400">Try different keywords</div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-2 pt-2 text-[10px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <span>↑↓ navigate, ↵ select</span>
                <span>ESC close</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <StickyHeader
      className={cn(
        // flex-wrap: the mobile search row (md:hidden below) must wrap to its
        // own line — as a same-row flex item it overflowed the phone viewport.
        'z-[990] flex-wrap border-b backdrop-blur-xl transition-all duration-200',
        isScrolled
          ? 'bg-white/85 shadow-sm shadow-slate-900/5 border-slate-200/60 dark:bg-slate-900/85 dark:border-slate-700/60 dark:shadow-black/10'
          : 'bg-white/60 border-slate-200/40 dark:bg-slate-900/60 dark:border-slate-700/40'
      )}
    >
      <div className="relative z-10 flex w-full items-center justify-between">
        {/* Left: mobile menu + logo */}
        <div className="flex flex-1 items-center gap-3 max-w-xs">
          <HamburgerButton
            view={<CarbonDrawerSidebar className="static w-full 2xl:w-full" />}
          />
          <Link
            href="/"
            aria-label="DataLab360 Logo"
            className="flex items-center gap-2 xl:hidden"
          >
            <Logo iconOnly className="h-7 w-7" />
            <span className="text-base font-bold text-slate-800 dark:text-slate-100">
              DataLab360
            </span>
          </Link>
        </div>

        {/* Center: search */}
        <div className="mx-6 hidden flex-1 justify-center md:flex">
          <SearchBar />
        </div>

        {/* Right: actions */}
        <div className="flex flex-1 items-center justify-end">
          <HeaderMenuRight />
        </div>
      </div>

      {/* Mobile search — w-full so it wraps to its own header line */}
      <div className="mt-3 w-full md:hidden">
        <SearchBar />
      </div>
    </StickyHeader>
  );
}
