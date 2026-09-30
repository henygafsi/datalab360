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
import SimpleBar from 'simplebar-react';
import { CarbonSidebarMenu } from './carbon-sidebar-menu';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { normalizeToIds, getAllModuleIds } from '@/config/modules';
import { useSidebarCollapsed } from '@/store/sidebar-store';


export function CarbonSidebar({ className }: { className?: string }) {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role?.toLowerCase();
  const sessionItems = (session?.user as any)?.items ?? [];

  // Compute allowed menu IDs based on role
  // Admin roles get all modules, other users get their assigned modules
  // Session items can be either numeric IDs or string names - normalizeToIds handles both
  const allowedIds = useMemo(() => {
    const isAdminRole = userRole === 'administrator' || userRole === 'modeler' || userRole === 'accountadmin' || userRole === 'sysadmin' || userRole === 'securityadmin';

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
        // (2026-09 shell restructure §4) decor layers removed; width is 280
        // everywhere (class, animation, layout margin) — the 2xl:w-80 variant
        // silently disagreed with both.
        'fixed bottom-0 start-0 z-50 h-full border-r border-slate-200/60 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-950',
        sidebarCollapsed ? 'w-16' : 'w-[280px]',
        className
      )}
      animate={{
        width: sidebarCollapsed ? 64 : 280,
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Compact identity row — the logo is a wayfinding mark, not a banner. */}
      <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <Link
            href={'/'}
            aria-label="Site Logo"
            className="flex min-w-0 items-center justify-center"
          >
            <Logo
              className={cn(sidebarCollapsed ? 'h-7 w-7' : 'h-7 w-auto')}
              iconOnly={sidebarCollapsed}
            />
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

      {/* Navigation section — height budget = full height minus the compact
          identity row (~56px) and the profile section (~96px). */}
      <SimpleBar
        className={cn(
          'h-[calc(100%-152px)] [&_.simplebar-content]:flex [&_.simplebar-content]:h-full [&_.simplebar-content]:flex-col [&_.simplebar-content]:justify-between'
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

        {/* Support link — a single quiet row, not a marketing card. An
            executive console should not hard-sell "our expert team" in the
            primary nav; keep help reachable, drop the visual weight. */}
        {!sidebarCollapsed && (
          <div className="sticky bottom-0 bg-white/90 px-4 pb-4 pt-2 backdrop-blur-md dark:bg-slate-950/90">
            <a
              href="mailto:support@datalab360.io"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <PiHeadsetBold className="h-4 w-4" aria-hidden="true" />
              Support
            </a>
          </div>
        )}
      </SimpleBar>

      {/* Profile section */}
      <div className={cn(
        "relative border-t border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-950",
        sidebarCollapsed ? "px-2 pb-4 pt-3" : "px-4 pb-4 pt-3"
      )}>
        {sidebarCollapsed ? (
          <div className="flex justify-center">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-accent-600 flex items-center justify-center text-white font-semibold text-sm">
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

      {/* Accessibility helper */}
      <div className="sr-only" aria-live="polite">
        Sidebar is {sidebarCollapsed ? 'collapsed' : 'expanded'}. Press Ctrl+B
        to toggle.
      </div>
    </motion.aside>
  );
}
