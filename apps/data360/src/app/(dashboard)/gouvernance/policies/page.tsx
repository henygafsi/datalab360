'use client';

import { useState } from 'react';
import { Button, Badge } from 'rizzui';
import {
  PiShieldCheck,
  PiLockKey,
  PiGlobe,
  PiEyeSlash,
  PiChartBar,
  PiChartLineUp,
  PiTag,
} from 'react-icons/pi';

// Import existing policy components (we'll use their content)
import RLSPoliciesContent from './rls-policies-content';
import NetworkPoliciesContent from './network-policies-content';
import MaskingPoliciesContent from './masking-policies-content';
import AggregationPoliciesContent from './aggregation-policies-content';
import TagPoliciesContent from './tag-policies-content';
import PasswordPoliciesContent from './password-policies-content';
import SessionPoliciesContent from './session-policies-content';
import DMFContent from './dmf-content';
import ClassificationContent from './classification-content';

type TabType = 'rls' | 'network' | 'masking' | 'aggregation' | 'tag' | 'password' | 'session' | 'dmf' | 'classification';

const TABS = [
  {
    id: 'rls' as TabType,
    name: 'Row Access',
    icon: PiLockKey,
    description: 'Row-level security (RLS)',
    color: 'purple',
  },
  {
    id: 'masking' as TabType,
    name: 'Masking',
    icon: PiEyeSlash,
    description: 'Data masking & anonymization',
    color: 'amber',
  },
  {
    id: 'aggregation' as TabType,
    name: 'Aggregation',
    icon: PiChartBar,
    description: 'Control data aggregation rules',
    color: 'cyan',
  },
  {
    id: 'network' as TabType,
    name: 'Network',
    icon: PiGlobe,
    description: 'IP-based access control',
    color: 'blue',
  },
  {
    id: 'tag' as TabType,
    name: 'Tag-Based',
    icon: PiShieldCheck,
    description: 'Tag-based governance',
    color: 'green',
  },
  {
    id: 'password' as TabType,
    name: 'Password',
    icon: PiLockKey,
    description: 'Password requirements',
    color: 'red',
  },
  {
    id: 'session' as TabType,
    name: 'Session',
    icon: PiShieldCheck,
    description: 'Session management',
    color: 'indigo',
  },
  {
    id: 'dmf' as TabType,
    name: 'Data Metrics',
    icon: PiChartLineUp,
    description: 'Data Metric Functions',
    color: 'teal',
  },
  {
    id: 'classification' as TabType,
    name: 'Classification',
    icon: PiTag,
    description: 'Data classification & PII',
    color: 'violet',
  },
];

const TAB_COLORS = {
  purple: {
    active: 'border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  blue: {
    active: 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  amber: {
    active: 'border-amber-600 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  green: {
    active: 'border-green-600 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  red: {
    active: 'border-red-600 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  indigo: {
    active: 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  cyan: {
    active: 'border-cyan-600 text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  teal: {
    active: 'border-teal-600 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
  violet: {
    active: 'border-violet-600 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20',
    inactive: 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
  },
};

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('rls');

  const Breadcrumb = () => {
    return (
      <nav className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</span>
          <span>/</span>
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Governance</span>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-200 font-medium">Policies</span>
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
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl shadow-violet-500/25">
            <PiShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Security Policies
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Manage RLS, Masking, Aggregation, Network, and other governance policies
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-6">
        <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const colorClass = TAB_COLORS[tab.color as keyof typeof TAB_COLORS];
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
                  isActive ? colorClass.active : colorClass.inactive
                }`}
              >
                <Icon className="w-4 h-4" />
                <div className="text-left">
                  <div>{tab.name}</div>
                  <div className="text-xs opacity-70">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'rls' && <RLSPoliciesContent />}
          {activeTab === 'masking' && <MaskingPoliciesContent />}
          {activeTab === 'aggregation' && <AggregationPoliciesContent />}
          {activeTab === 'network' && <NetworkPoliciesContent />}
          {activeTab === 'tag' && <TagPoliciesContent />}
          {activeTab === 'password' && <PasswordPoliciesContent />}
          {activeTab === 'session' && <SessionPoliciesContent />}
          {activeTab === 'dmf' && <DMFContent />}
          {activeTab === 'classification' && <ClassificationContent />}
        </div>
      </div>
    </div>
  );
}
