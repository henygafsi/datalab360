'use client';

import Link from 'next/link';
import cn from '@core/utils/class-names';
import SimpleBar from '@core/ui/simplebar';
import Logo from '@core/components/logo';
import { SidebarMenu } from './sidebar-menu';

export default function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-[280px] 2xl:w-[320px] transition-all duration-300',
        className
      )}
    >
      {/* Glassmorphism Background */}
      <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/50" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/30 to-white/10 dark:from-slate-900/50 dark:via-slate-900/30 dark:to-slate-900/10" />
      
      {/* Content */}
      <div className="relative h-full flex flex-col">
        {/* Logo Section */}
        <div className="flex items-center px-8 py-6 border-b border-slate-200/50 dark:border-slate-700/50">
          <Link
            href={'/'}
            aria-label="Site Logo"
            className="block transition-all duration-300 hover:scale-105 hover:rotate-2"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">D3</span>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                  Data360
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Analytics Platform</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-hidden">
          <SimpleBar className="h-full px-4 py-6">
            <div className="animate-fade-in-up">
              <SidebarMenu />
            </div>
          </SimpleBar>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200/50 dark:border-slate-700/50">
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">JD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">John Doe</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">admin@data360.com</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
