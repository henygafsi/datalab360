'use client';

import { useState } from 'react';
import { Badge } from 'rizzui';
import { 
  HiOutlineKey,
  HiOutlineCog6Tooth,
  HiOutlineShieldExclamation,
  HiOutlineLockClosed
} from 'react-icons/hi2';
import GrantsTable from '@/app/shared/gouvernance/grants/table';


// Modern Card Component
const ModernCard = ({ children, className = '', ...props }: { children: React.ReactNode, className?: string }) => {
  return (
    <div className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 ${className}`} {...props}>
      {children}
    </div>
  );
};

export default function GrantsManagementPage() {
  // Breadcrumb component
  const Breadcrumb = () => {
    return (
      <nav className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</span>
          <span>/</span>
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Governance</span>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-200 font-medium">Grants & Permissions</span>
        </div>
      </nav>
    );
  };

  return (
    <div className="space-y-8">
      <Breadcrumb />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-xl shadow-amber-500/25">
            <HiOutlineKey className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Access Control
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">Configure role-based access control and manage module permissions</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-sm font-medium">
            <HiOutlineShieldExclamation className="w-3 h-3 mr-1" />
            Security Center
          </Badge>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ModernCard className="p-6 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <HiOutlineKey className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Role-Based Access</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Define granular permissions for each role</p>
            </div>
          </div>
        </ModernCard>
        
        <ModernCard className="p-6 bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:from-green-950/30 dark:to-emerald-950/30">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <HiOutlineCog6Tooth className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Module Access</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Control access to system modules</p>
            </div>
          </div>
        </ModernCard>
        
        <ModernCard className="p-6 bg-gradient-to-br from-purple-50/80 to-violet-50/80 dark:from-purple-950/30 dark:to-violet-950/30">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <HiOutlineLockClosed className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Security Control</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Maintain secure access policies</p>
            </div>
          </div>
        </ModernCard>
      </div>

      {/* Main Content */}
      <ModernCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Permission Matrix</h2>
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              <HiOutlineLockClosed className="w-3 h-3 mr-1" />
              Access Control
            </Badge>
          </div>
        </div>
        
        <GrantsTable />
      </ModernCard>
    </div>
  );
}
