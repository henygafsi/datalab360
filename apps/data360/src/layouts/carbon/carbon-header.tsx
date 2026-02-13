'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import cn from '@core/utils/class-names';

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
} from 'react-icons/hi2';
import { IoCloseCircle } from 'react-icons/io5';

// Search suggestions
const searchSuggestions = {
  pages: [
    { label: 'BI Reporting', href: '/bi-reporting', icon: HiOutlineChartBarSquare, description: 'View analytics and reports' },
    { label: 'Data Sources', href: '/data-source-connection', icon: HiOutlineGlobeAlt, description: 'Manage data connections' },
    { label: 'Governance', href: '/gouvernance', icon: HiOutlineUsers, description: 'User and role management' },
    { label: 'Explore & Design', href: '/explore-design', icon: HiOutlineDocumentText, description: 'Data modeling & wrangling' },
  ],
  actions: [
    { label: 'Create New Report', href: '/reports/create', icon: HiOutlineArrowTrendingUp, description: 'Generate analytics report' },
    { label: 'Export Data', href: '/export', icon: HiOutlineDocumentText, description: 'Export data to various formats' },
    { label: 'System Settings', href: '/settings', icon: HiOutlineCog6Tooth, description: 'Configure system preferences' },
  ],
};

function SearchBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allSuggestions = [
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
        'z-[990] border-b backdrop-blur-xl transition-all duration-200',
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

      {/* Mobile search */}
      <div className="mt-3 md:hidden">
        <SearchBar />
      </div>
    </StickyHeader>
  );
}
