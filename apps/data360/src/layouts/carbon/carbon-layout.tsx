'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import Header from '@/layouts/carbon/carbon-header';
import { CarbonSidebar } from './carbon-sidebar';
import ChatSidebar from '@/app/shared/chat/ChatSidebar';
import StatusPill from '@/components/layout/status-pill';
import { useSidebarCollapsed } from '@/store/sidebar-store';
import { useMedia } from '@core/hooks/use-media';
import cn from '@core/utils/class-names';

const CURRENT_YEAR = new Date().getFullYear();

export default function CarbonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const { collapsed: sidebarCollapsed } = useSidebarCollapsed();
  // The sidebar only exists at xl+ (`fixed hidden xl:block`). The margin/width
  // animation below uses INLINE styles, which would override the responsive
  // classes on phones and shove every page 280px right — gate it on xl.
  const isXl = useMedia('(min-width: 1280px)', true);
  const pathname = usePathname();
  // /intelligent is the Agentic OS — it carries its own discussion + validation
  // chat, so the floating global chat would be a competing second chat there.
  // /account-overview (2026-08-24 refactor) carries its own contextual Ask-AI
  // panel — one coherent AI entry point, not a competing floating bubble.
  const hideGlobalChat =
    (pathname?.startsWith('/intelligent') || pathname?.startsWith('/account-overview')) ?? false;
  // The Account Overview control plane budgets every vertical pixel for the
  // analytical workspace — the marketing footer (~73px) is chrome there.
  // Privacy/Terms/Support stay reachable from every other page's footer.
  const hideFooter = pathname?.startsWith('/account-overview') ?? false;

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
      {/* (2026-09 shell restructure §4) The fixed full-screen gradient +
          dot-grid decor layers were removed: a reporting product reads on a
          flat, calm ground — decoration carried no information. */}

      {/* Sidebar */}
      <CarbonSidebar className="fixed hidden flex-col justify-between xl:block z-50" />

      {/* Main content */}
      <motion.div
        className={cn(
          'flex w-full flex-col relative z-10 transition-all duration-300',
          'xl:ms-[280px] xl:w-[calc(100%-280px)]'
        )}
        animate={
          isXl
            ? {
                marginLeft: sidebarCollapsed ? 64 : 280,
                width: sidebarCollapsed ? 'calc(100% - 64px)' : 'calc(100% - 280px)',
              }
            : { marginLeft: 0, width: '100%' }
        }
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={isXl ? { marginLeft: sidebarCollapsed ? 64 : 280 } : { marginLeft: 0 }}
      >
        <Header />

        <main className="flex flex-grow flex-col px-3 pb-6 pt-4 md:px-4 lg:px-5 xl:px-6 2xl:px-8">
          <div className="w-full max-w-none">
            {/* Entrance fade removed (§4: motion only answers a user action). */}
            <div id="main-content" className="min-h-[60vh]">
              {children}
            </div>
          </div>
        </main>

        {/* Footer (hidden on the Account Overview control plane) */}
        {!hideFooter && (
        <footer className="border-t border-slate-200/60 bg-white/50 px-6 py-5 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/50 md:px-8 lg:px-10 xl:px-12 2xl:px-16">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                &copy; 2024&ndash;{CURRENT_YEAR} Data360
              </span>
              <StatusPill />
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
        )}
      </motion.div>

      {/* Global Chat Sidebar — all pages except the Agentic OS (/intelligent),
          which has its own discussion + validation chat. */}
      {!hideGlobalChat && <ChatSidebar />}
    </div>
  );
}
