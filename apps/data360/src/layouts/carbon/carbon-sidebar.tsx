'use client';

import cn from '@core/utils/class-names';
import Link from 'next/link';
import Logo from '@core/components/logo';
import ProfileCardMenu from '@/layouts/carbon/profile-card-menu';
import {
  PiDotsThreeVerticalBold,
  PiHeadsetBold,
  PiArrowRightBold,
  PiQuestionBold,
} from 'react-icons/pi';
import dynamic from 'next/dynamic';
import SimpleBar from 'simplebar-react';
import { CarbonSidebarMenu } from './carbon-sidebar-menu';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NeedSupport = dynamic(() => import('@/layouts/carbon/need-support'), {
  ssr: false,
});

export function CarbonSidebar({ className }: { className?: string }) {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role?.toLowerCase();
  const sessionItems = (session?.user as any)?.items ?? [];

  // Debug logging
  console.log('🔍 Session Debug:', {
    role: (session?.user as any)?.role,
    roleLower: userRole,
    items: sessionItems,
    itemsType: typeof sessionItems,
    isArray: Array.isArray(sessionItems)
  });

  // If user is administrator or modeler, grant access to all menus (1-9)
  // Using toLowerCase() to handle case variations
  const allowedIds = (userRole === 'administrator' || userRole === 'modeler')
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
    : sessionItems;

  const username = session?.user?.username || 'Guest';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(!sidebarCollapsed);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarCollapsed]);

  return (
    <motion.aside
      className={cn(
        'fixed bottom-0 start-0 z-50 h-full border-r border-slate-200/60 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-3xl transition-all duration-300 dark:border-slate-700/60 dark:bg-slate-950/95 dark:shadow-black/30',
        sidebarCollapsed ? 'w-16' : 'w-[280px] 2xl:w-80',
        className
      )}
      animate={{
        width: sidebarCollapsed ? 64 : 280,
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-50/30 via-transparent to-purple-50/30 dark:from-blue-950/20 dark:via-transparent dark:to-purple-950/20" />

      {/* Animated side accent */}
      <div className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500 opacity-60" />

      {/* Enhanced Logo section */}
      <div className="relative sticky top-0 z-40 border-b border-slate-200/40 bg-white/90 px-6 pb-6 pt-8 backdrop-blur-xl dark:border-slate-700/40 dark:bg-slate-950/90 2xl:px-8 2xl:pt-10">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/30" />

        <div className="flex items-center justify-between">
          <Link
            href={'/'}
            aria-label="Site Logo"
            className={cn(
              'group relative flex items-center',
              sidebarCollapsed
                ? 'w-full justify-center'
                : 'w-full justify-center'
            )}
          >
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 scale-110 rounded-2xl bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

              {/* Logo container */}
              <motion.div
                className="relative flex items-center justify-center transition-all duration-500 group-hover:scale-105"
                animate={{
                  width: sidebarCollapsed ? 32 : 192,
                  height: sidebarCollapsed ? 32 : 96,
                }}
                transition={{ duration: 0.3 }}
              >
                <Logo
                  className={cn(
                    'brightness-110 drop-shadow-lg filter transition-all duration-300',
                    sidebarCollapsed ? 'h-8 w-8' : 'h-full w-full'
                  )}
                  iconOnly={sidebarCollapsed}
                />
              </motion.div>
            </div>
          </Link>

          {/* Collapse button */}
          <motion.button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="group rounded-lg p-2 text-slate-500 transition-all duration-200 hover:bg-slate-100/50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            title={`${sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
          >
            <motion.div
              animate={{ rotate: sidebarCollapsed ? 0 : 180 }}
              transition={{ duration: 0.2 }}
            >
              <PiArrowRightBold className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            </motion.div>
          </motion.button>
        </div>

        {/* Decorative elements */}
        <motion.div
          className="absolute right-4 top-4 h-2 w-2 rounded-full bg-blue-400/30"
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-4 left-4 h-1.5 w-1.5 rounded-full bg-purple-400/30"
          animate={{ opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 3, repeat: Infinity, delay: 0.7 }}
        />
      </div>

      {/* Navigation section */}
      <SimpleBar
        className={cn(
          'h-[calc(100%-340px)] [&_.simplebar-content]:flex [&_.simplebar-content]:h-full [&_.simplebar-content]:flex-col [&_.simplebar-content]:justify-between'
        )}
      >
        <motion.div
          animate={{ opacity: sidebarCollapsed ? 0.7 : 1 }}
          transition={{ duration: 0.2 }}
        >
          <CarbonSidebarMenu
            allowedIds={allowedIds}
            collapsed={sidebarCollapsed}
          />
        </motion.div>

        {/* Support section */}
        <div className="from-white/98 dark:from-slate-950/98 sticky bottom-0 bg-gradient-to-t to-white/80 px-4 pb-6 backdrop-blur-md dark:to-slate-950/80">
          <NeedSupport
            title="Need Support?"
            text="Get help from our expert team"
            prefixIcon={<PiHeadsetBold className="h-5 w-5 text-blue-500" />}
            className="group relative transform rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/90 via-indigo-50/90 to-purple-50/90 p-6 transition-all duration-300 hover:scale-[1.02] hover:border-blue-300/70 hover:from-blue-100/90 hover:via-indigo-100/90 hover:to-purple-100/90 hover:shadow-lg hover:shadow-blue-500/20 dark:border-blue-800/40 dark:from-blue-950/40 dark:via-indigo-950/40 dark:to-purple-950/40 dark:hover:border-blue-700/50 dark:hover:from-blue-900/50 dark:hover:via-indigo-900/50 dark:hover:to-purple-900/50"
          >
            {/* Animated background pattern */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent via-blue-100/20 to-purple-100/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-transparent dark:via-blue-900/10 dark:to-purple-900/10" />

            {/* Floating particles */}
            <div className="absolute right-2 top-2 h-1 w-1 animate-ping rounded-full bg-blue-400/40" />
            <div className="absolute bottom-3 left-3 h-1.5 w-1.5 animate-pulse rounded-full bg-purple-400/40 delay-1000" />
          </NeedSupport>
        </div>
      </SimpleBar>

      {/* Profile section */}
      <div className="from-slate-50/98 to-white/98 dark:from-slate-950/98 dark:to-slate-900/98 relative border-t border-slate-200/60 bg-gradient-to-t px-6 pb-6 pt-4 backdrop-blur-md dark:border-slate-700/60">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/40 via-transparent to-purple-50/40 dark:from-blue-950/20 dark:via-transparent dark:to-purple-950/20" />

        <ProfileCardMenu
          title={username}
          designation="Administrator"
          placement="top"
          image="https://isomorphic-furyroad.s3.amazonaws.com/public/avatars/avatar-11.webp"
          avatarClassName="!w-14 !h-14 ring-4 ring-blue-500/30 dark:ring-blue-400/30 shadow-xl shadow-blue-500/20"
          icon={
            <PiDotsThreeVerticalBold
              className={cn(
                'h-6 w-6 text-slate-400 transition-all duration-300 group-hover:scale-110 group-hover:text-blue-500'
              )}
            />
          }
          className={cn(
            'group relative mt-4 rounded-2xl px-3 py-3 transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100/90 hover:shadow-lg hover:shadow-slate-500/10 dark:hover:bg-slate-800/90'
          )}
          buttonClassName="border-0 !border-t !border-slate-200/60 dark:!border-slate-700/60 pt-5 px-3 rounded-xl"
        >
          {/* Profile hover effect */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-50/50 to-purple-50/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-blue-950/30 dark:to-purple-950/30" />

          {/* Status indicator */}
          <div className="absolute right-2 top-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          </div>
        </ProfileCardMenu>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
      {/* Collapse/Expand Indicator for collapsed state */}
      <AnimatePresence>
        {sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 transform flex-col items-center space-y-2"
          >
            <div className="h-4 w-1 rounded-full bg-gradient-to-t from-blue-500/30 to-transparent" />
            <div className="h-2 w-0.5 rounded-full bg-purple-500/20" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accessibility helper */}
      <div className="sr-only" aria-live="polite">
        Sidebar is {sidebarCollapsed ? 'collapsed' : 'expanded'}. Press Ctrl+B
        to toggle.
      </div>
    </motion.aside>
  );
}
