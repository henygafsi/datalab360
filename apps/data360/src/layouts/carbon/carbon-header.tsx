'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  HiOutlineBell,
  HiOutlineCommandLine,
  HiOutlineSparkles,
  HiOutlineBookmark,
  HiOutlineCog6Tooth,
  HiOutlineArrowTrendingUp,
  HiOutlineGlobeAlt,
  HiOutlineChartBarSquare,
  HiOutlineUsers,
  HiOutlineDocumentText,
  HiOutlineArrowRight,
  HiOutlineMoon,
  HiOutlineSun,
  HiOutlineComputerDesktop
} from 'react-icons/hi2';
import { IoCloseCircle } from 'react-icons/io5';

// Enhanced search suggestions with categories
const searchSuggestions = {
  pages: [
    { label: 'BI Reporting', href: '/bi-reporting', icon: HiOutlineChartBarSquare, description: 'View analytics and reports' },
    { label: 'Data Sources', href: '/data-source-connection', icon: HiOutlineGlobeAlt, description: 'Manage data connections' },
    { label: 'Governance', href: '/gouvernance', icon: HiOutlineUsers, description: 'User and role management' },
    { label: 'Mapping', href: '/mapping', icon: HiOutlineDocumentText, description: 'Data mapping wizard' }
  ],
  actions: [
    { label: 'Create New Report', href: '/reports/create', icon: HiOutlineArrowTrendingUp, description: 'Generate analytics report' },
    { label: 'Export Data', href: '/export', icon: HiOutlineDocumentText, description: 'Export data to various formats' },
    { label: 'System Settings', href: '/settings', icon: HiOutlineCog6Tooth, description: 'Configure system preferences' }
  ]
};

// Advanced Search Component
function AdvancedSearch() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flatten suggestions for navigation
  const allSuggestions = [
    ...searchSuggestions.pages.map(item => ({ ...item, category: 'Pages' })),
    ...searchSuggestions.actions.map(item => ({ ...item, category: 'Actions' }))
  ];

  const filteredSuggestions = allSuggestions.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.description.toLowerCase().includes(query.toLowerCase())
  );

  // Keyboard navigation
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
          setSelectedIndex(prev => 
            prev < filteredSuggestions.length - 1 ? prev + 1 : 0
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredSuggestions.length - 1
          );
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          const selected = filteredSuggestions[selectedIndex];
          if (selected) {
            window.location.href = selected.href;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSuggestions, selectedIndex, filteredSuggestions]);

  // Click outside handler
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

  const handleInputChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl">
      <motion.div
        className="relative group"
        animate={{ 
          width: isExpanded ? '100%' : '400px',
          scale: isExpanded ? 1.02 : 1
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        {/* Search container with glass morphism */}
        <div className="relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-900/5 dark:shadow-black/20">
          {/* Animated gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-purple-50/30 to-blue-50/50 dark:from-blue-950/30 dark:via-purple-950/20 dark:to-blue-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Search icon */}
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10">
            <motion.div
              animate={{ 
                scale: showSuggestions ? 1.1 : 1,
                color: showSuggestions ? '#3b82f6' : '#64748b'
              }}
              transition={{ duration: 0.2 }}
            >
              <HiOutlineMagnifyingGlass className="w-5 h-5" />
            </motion.div>
          </div>

          {/* Search input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              setIsExpanded(true);
              setShowSuggestions(true);
            }}
            placeholder="Search everything... (⌘K)"
            className="w-full pl-12 pr-20 py-4 bg-transparent border-0 text-slate-700 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none text-sm font-medium relative z-10"
          />

          {/* Keyboard shortcut badge */}
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 hidden md:flex items-center space-x-2 z-10">
            <motion.div
              className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-200/50 dark:bg-slate-700/50 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 backdrop-blur-sm"
              whileHover={{ scale: 1.05 }}
            >
              <HiOutlineCommandLine className="w-3 h-3" />
              <span>K</span>
            </motion.div>
          </div>

          {/* Focus ring */}
          <div className="absolute inset-0 rounded-2xl ring-2 ring-blue-500/20 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
        </div>
      </motion.div>

      {/* Enhanced Search Results */}
      <AnimatePresence>
        {showSuggestions && isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-3 w-full max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/60 dark:border-slate-700/60 rounded-3xl shadow-2xl shadow-slate-900/10 dark:shadow-black/30 z-50 overflow-hidden"
          >
            <div className="p-6">
              {/* Search header */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  {query ? `Results for "${query}"` : 'Quick Access'}
                </div>
                <button
                  onClick={() => {
                    setShowSuggestions(false);
                    setIsExpanded(false);
                    setQuery('');
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors duration-200"
                >
                  <IoCloseCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              {/* Search results */}
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {(query ? filteredSuggestions : allSuggestions).map((item, index) => (
                  <motion.a
                    key={`${item.category}-${item.label}`}
                    href={item.href}
                    className={cn(
                      'flex items-center space-x-4 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer',
                      selectedIndex === index
                        ? 'bg-blue-50/80 dark:bg-blue-900/30 border border-blue-200/60 dark:border-blue-700/60'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/80'
                    )}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.2 }}
                    whileHover={{ x: 2 }}
                    onClick={() => {
                      setShowSuggestions(false);
                      setIsExpanded(false);
                      setQuery('');
                    }}
                  >
                    {/* Icon */}
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200',
                      selectedIndex === index
                        ? 'bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-400'
                        : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 group-hover:bg-slate-200/80 dark:group-hover:bg-slate-700/80'
                    )}>
                      <item.icon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        'text-sm font-medium transition-colors duration-200',
                        selectedIndex === index
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-slate-100'
                      )}>
                        {item.label}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {item.description}
                      </div>
                    </div>

                    {/* Category badge */}
                    <div className={cn(
                      'px-2 py-1 rounded-lg text-xs font-medium transition-colors duration-200',
                      selectedIndex === index
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                        : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400'
                    )}>
                      {item.category}
                    </div>

                    {/* Arrow */}
                    <div className={cn(
                      'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
                      selectedIndex === index && 'opacity-100'
                    )}>
                      <HiOutlineArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </motion.a>
                ))}

                {query && filteredSuggestions.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <div className="text-4xl mb-3">🔍</div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                      No results found
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      Try searching with different keywords
                    </div>
                  </div>
                )}
              </div>

              {/* Search footer */}
              <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Use ↑↓ to navigate, ↵ to select</span>
                <span>ESC to close</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Theme Switcher Component
function ThemeSwitch() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [isOpen, setIsOpen] = useState(false);

  const themes = [
    { value: 'light', label: 'Light', icon: HiOutlineSun },
    { value: 'dark', label: 'Dark', icon: HiOutlineMoon },
    { value: 'system', label: 'System', icon: HiOutlineComputerDesktop }
  ];

  const ActiveIcon = themes.find((t) => t.value === theme)?.icon;

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border border-slate-200/60 dark:border-slate-600/60 hover:border-slate-300/60 dark:hover:border-slate-500/60 transition-all duration-300 group"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {ActiveIcon && (
          <ActiveIcon className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors duration-200" />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-2xl shadow-slate-900/10 dark:shadow-black/30 z-50 overflow-hidden"
          >
            <div className="p-2">
              {themes.map((themeOption, index) => (
                <motion.button
                  key={themeOption.value}
                  onClick={() => {
                    setTheme(themeOption.value as 'light' | 'dark' | 'system');
                    setIsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center space-x-3 px-3 py-2 rounded-xl transition-all duration-200 group',
                    theme === themeOption.value
                      ? 'bg-blue-50/80 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300'
                  )}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.2 }}
                >
                  <themeOption.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{themeOption.label}</span>
                  {theme === themeOption.value && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Notification Center Component
function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(4);

  const notifications = [
    {
      id: 1,
      type: 'success',
      title: 'Report Generated Successfully',
      message: 'Your quarterly analytics report is ready for download.',
      time: '2 minutes ago',
      read: false
    },
    {
      id: 2,
      type: 'info',
      title: 'System Update Available',
      message: 'DataLab360 v2.1 is available with new features.',
      time: '1 hour ago',
      read: false
    },
    {
      id: 3,
      type: 'warning',
      title: 'Data Source Sync Warning',
      message: 'AWS S3 connection experiencing intermittent delays.',
      time: '3 hours ago',
      read: false
    },
    {
      id: 4,
      type: 'info',
      title: 'New Team Member Added',
      message: 'Sarah Johnson has been added to your team.',
      time: '1 day ago',
      read: true
    }
  ];

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  };

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border border-slate-200/60 dark:border-slate-600/60 hover:border-slate-300/60 dark:hover:border-slate-500/60 transition-all duration-300 group"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <HiOutlineBell className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors duration-200" />
        
        {unreadCount > 0 && (
          <motion.div
            className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-red-500 to-pink-500 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-xs font-bold text-white">{unreadCount}</span>
          </motion.div>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-96 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 rounded-2xl shadow-2xl shadow-slate-900/10 dark:shadow-black/30 z-50 overflow-hidden"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                  Notifications
                </h3>
                <div className="flex items-center space-x-2">
                  <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors duration-200">
                    Mark all read
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors duration-200"
                  >
                    <IoCloseCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Notifications list */}
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {notifications.map((notification, index) => (
                  <motion.div
                    key={notification.id}
                    className={cn(
                      'p-4 rounded-xl border transition-all duration-200 cursor-pointer group',
                      notification.read
                        ? 'bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/40 dark:border-slate-700/40'
                        : 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-200/60 dark:border-blue-700/40'
                    )}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.2 }}
                    whileHover={{ scale: 1.02, y: -1 }}
                  >
                    <div className="flex items-start space-x-3">
                      {/* Icon */}
                      <div className="text-lg mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          'text-sm font-medium mb-1',
                          notification.read
                            ? 'text-slate-700 dark:text-slate-300'
                            : 'text-slate-900 dark:text-slate-100'
                        )}>
                          {notification.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                          {notification.message}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {notification.time}
                        </div>
                      </div>

                      {/* Unread indicator */}
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                <Link
                  href="/notifications"
                  className="flex items-center justify-center w-full py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-200"
                >
                  View all notifications
                  <HiOutlineArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main Header Component
export default function Header() {
  const { data: session } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <StickyHeader
      className={cn(
        'z-[990] transition-all duration-300 backdrop-blur-2xl border-b',
        isScrolled
          ? 'bg-white/80 dark:bg-slate-900/80 border-slate-200/80 dark:border-slate-700/80 shadow-lg shadow-slate-900/5 dark:shadow-black/20'
          : 'bg-white/60 dark:bg-slate-900/60 border-slate-200/40 dark:border-slate-700/40'
      )}
    >
      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-blue-50/20 via-transparent to-purple-50/20 dark:from-blue-950/10 dark:via-transparent dark:to-purple-950/10 pointer-events-none"
        animate={{
          background: isScrolled
            ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.03) 0%, transparent 50%, rgba(139, 92, 246, 0.03) 100%)'
            : 'linear-gradient(90deg, rgba(59, 130, 246, 0.02) 0%, transparent 50%, rgba(139, 92, 246, 0.02) 100%)'
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Header content */}
      <div className="flex items-center justify-between w-full relative z-10">
        {/* Left section */}
        <div className="flex items-center space-x-4 flex-1 max-w-md">
          {/* Mobile menu button */}
          <HamburgerButton
            view={<CarbonDrawerSidebar className="static w-full 2xl:w-full" />}
          />

          {/* Mobile logo */}
          <Link
            href="/"
            aria-label="DataLab360 Logo"
            className="flex items-center space-x-3 group xl:hidden"
          >
            <motion.div
              className="relative"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="absolute inset-0 bg-blue-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg -z-10" />
              <Logo iconOnly className="w-8 h-8" />
            </motion.div>
            <motion.span
              className="text-xl font-bold bg-gradient-to-r from-slate-900 via-blue-600 to-purple-600 dark:from-white dark:via-blue-400 dark:to-purple-400 bg-clip-text text-transparent"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              DataLab360
            </motion.span>
          </Link>
        </div>

        {/* Center - Search */}
        <div className="flex-1 max-w-2xl mx-8 hidden md:block">
          <AdvancedSearch />
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-3 flex-1 justify-end max-w-md">
          {/* Theme switcher */}
          <ThemeSwitch />

          {/* Bookmarks */}
          <motion.button
            className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 border border-slate-200/60 dark:border-slate-600/60 hover:border-slate-300/60 dark:hover:border-slate-500/60 transition-all duration-300 group"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Bookmarks"
          >
            <HiOutlineBookmark className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors duration-200" />
          </motion.button>

          {/* Notifications */}
          <NotificationCenter />

          {/* AI Assistant */}
          <motion.button
            className="relative p-3 rounded-xl bg-gradient-to-r from-purple-100/80 to-blue-100/80 dark:from-purple-900/40 dark:to-blue-900/40 hover:from-purple-200/80 hover:to-blue-200/80 dark:hover:from-purple-800/50 dark:hover:to-blue-800/50 border border-purple-200/60 dark:border-purple-700/40 transition-all duration-300 group"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="AI Assistant"
          >
            <HiOutlineSparkles className="w-5 h-5 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors duration-200" />
            <motion.div
              className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm -z-10"
              animate={{ opacity: [0, 0.3, 0] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
            />
          </motion.button>

          {/* Divider */}
          <div className="w-px h-8 bg-slate-200/60 dark:bg-slate-700/60" />

          {/* User menu */}
          <HeaderMenuRight />
        </div>
      </div>

      {/* Mobile search */}
      <div className="md:hidden mt-4">
        <AdvancedSearch />
      </div>

      {/* Bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
    </StickyHeader>
  );
}