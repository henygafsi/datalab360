'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import Header from '@/layouts/carbon/carbon-header';
import { CarbonSidebar } from './carbon-sidebar';
import { useSidebarCollapsed } from '@/store/sidebar-store';
import cn from '@core/utils/class-names';

export default function CarbonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const { collapsed: sidebarCollapsed } = useSidebarCollapsed();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-blue-500" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 relative">
      {/* Subtle background gradient */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-blue-50/40 via-transparent to-purple-50/30 dark:from-blue-950/20 dark:via-transparent dark:to-purple-950/15" />

      {/* Dot grid (subtle) */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02] dark:opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Sidebar */}
      <CarbonSidebar className="fixed hidden flex-col justify-between xl:block z-50" />

      {/* Main content */}
      <motion.div
        className={cn(
          'flex w-full flex-col relative z-10 transition-all duration-300',
          'xl:ms-[280px] xl:w-[calc(100%-280px)]'
        )}
        animate={{
          marginLeft: sidebarCollapsed ? 64 : 280,
          width: sidebarCollapsed ? 'calc(100% - 64px)' : 'calc(100% - 280px)',
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{ marginLeft: sidebarCollapsed ? 64 : 280 }}
      >
        <Header />

        <main className="flex flex-grow flex-col px-6 pb-12 pt-6 md:px-8 lg:px-10 lg:pb-16 xl:px-12 2xl:px-16">
          <div className="w-full max-w-none">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <div id="main-content" className="min-h-[60vh]">
                {children}
              </div>
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200/60 bg-white/50 px-6 py-5 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/50 md:px-8 lg:px-10 xl:px-12 2xl:px-16">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                &copy; 2024 DataLab360
              </span>
              <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 dark:bg-green-900/20">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="text-[11px] font-medium text-green-600 dark:text-green-400">
                  Operational
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {['Privacy', 'Terms', 'Support'].map((label) => (
                <a
                  key={label}
                  href={`/${label.toLowerCase()}`}
                  className="rounded-md px-2.5 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
