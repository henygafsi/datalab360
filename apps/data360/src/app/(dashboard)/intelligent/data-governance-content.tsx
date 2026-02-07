'use client';

import Link from 'next/link';
import { Button, Text } from 'rizzui';
import {
  PiFlowArrow,
  PiShieldCheck,
  PiTable,
  PiPencilSimpleLine,
  PiArrowRight,
} from 'react-icons/pi';
import { routes } from '@/config/routes';

const FEATURES = [
  {
    id: 'etl-blocks',
    title: 'ETL Pipeline Blocks',
    description: 'Reusable source, transform, and load blocks to build data pipelines. Drag-and-drop pipeline builder with Source, Join, Filter, Aggregate, Select, and more.',
    icon: PiFlowArrow,
    href: routes.workflow.ViewWorkflow,
    label: 'Open ETL Pipeline Builder',
    color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
  {
    id: 'governance-policies',
    title: 'Governance Policies',
    description: 'Apply and manage RLS, masking, aggregation, network, password, and session policies. Define who can see which data and how it is protected.',
    icon: PiShieldCheck,
    href: routes.gouvernance.policies,
    label: 'Manage Policies',
    color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  {
    id: 'security-matrix',
    title: 'Security Matrix (Access Table)',
    description: 'Define role-based access by region, store, department, and custom axes. Edit the matrix table stored in Snowflake for governance and RLS.',
    icon: PiTable,
    href: routes.gouvernance.securityMatrix,
    label: 'Edit Security Matrix',
    color: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400',
    borderColor: 'border-violet-200 dark:border-violet-800',
  },
  {
    id: 'grants',
    title: 'Module & Role Grants',
    description: 'Assign modules (Connect Data, Workflow, Governance, etc.) to roles and users. Control access to AI Intelligence, Explore & Design, and other features.',
    icon: PiPencilSimpleLine,
    href: routes.gouvernance.grants,
    label: 'Manage Grants',
    color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
];

export default function DataGovernanceContent() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700">
        <Text className="text-sm text-gray-600 dark:text-gray-400">
          Reusable data and governance capabilities: build ETL pipelines with blocks, apply governance rules (RLS, masking), and manage the security matrix and role grants.
        </Text>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <Link key={feature.id} href={feature.href}>
              <div
                className={`rounded-xl border-2 ${feature.borderColor} p-6 transition-all duration-200 hover:shadow-lg hover:scale-[1.01] cursor-pointer h-full flex flex-col`}
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.color} mb-4`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 flex-1 mb-4">
                  {feature.description}
                </p>
                <Button variant="outline" size="sm" className="w-fit gap-2">
                  {feature.label}
                  <PiArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
