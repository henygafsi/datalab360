'use client';

import cn from '@core/utils/class-names';
import Link from 'next/link';
import Logo from '@core/components/logo';
import ProfileCardMenu from '@/layouts/carbon/profile-card-menu';
import {
  PiDotsThreeVerticalBold,
  PiHeadsetBold,
  PiArrowRightBold,
} from 'react-icons/pi';
import dynamic from 'next/dynamic';
import SimpleBar from 'simplebar-react';
import { CarbonSidebarMenu } from './carbon-sidebar-menu';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { normalizeToIds, getAllModuleIds } from '@/config/modules';
import { useSidebarCollapsed } from '@/store/sidebar-store';

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

  // Compute allowed menu IDs based on role
  // Admin roles get all modules, other users get their assigned modules
  // Session items can be either numeric IDs or string names - normalizeToIds handles both
  const allowedIds = useMemo(() => {
    const isAdminRole = userRole === 'administrator' || userRole === 'modeler' || userRole === 'accountadmin' || userRole === 'sysadmin';

    if (isAdminRole) {
      return getAllModuleIds(); // Returns [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    }

    // For non-admin users, normalize their session items to IDs
    // This handles both numeric IDs and string module names
    if (Array.isArray(sessionItems) && sessionItems.length > 0) {
      return normalizeToIds(sessionItems as (string | number)[]);
    }

    return []; // No access if no items assigned
  }, [userRole, sessionItems]);

  const username = session?.user?.username || 'Guest';
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebarCollapsed();

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
      <div className="absolute bottom-0 left-0 top-0 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500 opacity-40" />

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
                  width: sidebarCollapsed ? 32 : 150,
                  height: sidebarCollapsed ? 32 : 50,
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

      </div>

      {/* Navigation section */}
      <SimpleBar
        className={cn(
          'h-[calc(100%-300px)] [&_.simplebar-content]:flex [&_.simplebar-content]:h-full [&_.simplebar-content]:flex-col [&_.simplebar-content]:justify-between'
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

        {/* Support section - hidden when collapsed */}
        {!sidebarCollapsed && (
          <div className="from-white/98 dark:from-slate-950/98 sticky bottom-0 bg-gradient-to-t to-white/80 px-4 pb-6 backdrop-blur-md dark:to-slate-950/80">
            <NeedSupport
              title="Need Support?"
              text="Get help from our expert team"
              prefixIcon={<PiHeadsetBold className="h-5 w-5 text-blue-500" />}
              className="group relative rounded-xl border border-slate-200/60 bg-gradient-to-br from-slate-50/90 to-blue-50/50 p-5 transition-all duration-200 hover:border-blue-200/60 hover:shadow-md hover:shadow-blue-500/10 dark:border-slate-700/40 dark:from-slate-800/40 dark:to-blue-950/30 dark:hover:border-blue-800/50"
            />
          </div>
        )}
      </SimpleBar>

      {/* Profile section */}
      <div className={cn(
        "from-slate-50/98 to-white/98 dark:from-slate-950/98 dark:to-slate-900/98 relative border-t border-slate-200/60 bg-gradient-to-t backdrop-blur-md dark:border-slate-700/60",
        sidebarCollapsed ? "px-2 pb-4 pt-3" : "px-6 pb-6 pt-4"
      )}>
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/40 via-transparent to-purple-50/40 dark:from-blue-950/20 dark:via-transparent dark:to-purple-950/20" />

        {sidebarCollapsed ? (
          <div className="flex justify-center">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm ring-2 ring-blue-500/30 dark:ring-blue-400/30">
                {username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-white dark:ring-slate-900" />
            </div>
          </div>
        ) : (
          <ProfileCardMenu
            title={username}
            designation={userRole || 'User'}
            placement="top"
            initial={username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            avatarClassName="!w-11 !h-11 ring-2 ring-slate-200/60 dark:ring-slate-700/60 shadow-sm"
            icon={
              <PiDotsThreeVerticalBold
                className={cn(
                  'h-5 w-5 text-slate-400 transition-colors duration-200 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                )}
              />
            }
            className={cn(
              'group relative mt-2 rounded-xl px-2 py-2 transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            )}
            buttonClassName="border-0 !border-t !border-slate-200/60 dark:!border-slate-700/60 pt-4 px-3 rounded-xl"
          />
        )}
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

      {/* Accessibility helper */}
      <div className="sr-only" aria-live="polite">
        Sidebar is {sidebarCollapsed ? 'collapsed' : 'expanded'}. Press Ctrl+B
        to toggle.
      </div>
    </motion.aside>
  );
}
