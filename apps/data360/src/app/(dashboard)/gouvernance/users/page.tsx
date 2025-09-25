'use client';

import { useState, useCallback } from 'react';
import { Button, Badge } from 'rizzui';
import { 
  HiOutlineUsers,
  HiOutlineUserPlus,
  HiOutlineArrowUpTray,
  HiOutlineAdjustmentsHorizontal
} from 'react-icons/hi2';
import UsersTable from '@/app/shared/gouvernance/users/table';
import AddUserButton from '@/app/shared/gouvernance/users/add-user-button';
import ImportButton from '@/app/shared/import-button';


// Modern Card Component
const ModernCard = ({ children, className = '', ...props }: { children: React.ReactNode, className?: string }) => {
  return (
    <div className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 ${className}`} {...props}>
      {children}
    </div>
  );
};

export default function UsersManagementPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Callback to refresh the users table after adding a new user
  const handleAddUserSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Breadcrumb component
  const Breadcrumb = () => {
    return (
      <nav className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</span>
          <span>/</span>
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Governance</span>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-200 font-medium">Users Management</span>
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
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/25">
            <HiOutlineUsers className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              User Management
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">Manage user accounts, roles, and permissions across your organization</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <ImportButton title="Import Users" />
          <AddUserButton onAddUserSuccess={handleAddUserSuccess} />
        </div>
      </div>

      {/* Main Content */}
      <ModernCard className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
              <HiOutlineUsers className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">User Directory</h2>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 text-sm font-medium">
              Active Users
            </Badge>
          </div>
        </div>
        
        <div className="bg-slate-50/50 dark:bg-slate-900/20 rounded-xl p-1 border border-slate-200/50 dark:border-slate-700/50">
          <UsersTable 
            key={refreshKey} 
            onAddUserSuccess={handleAddUserSuccess} 
          />
        </div>
      </ModernCard>
    </div>
  );
}
