import { routes } from '@/config/routes'; // Assuming this import path
import { IconType } from 'react-icons/lib';
import {
  PiBinocularsDuotone,
  PiBriefcaseDuotone,
  PiChartBarDuotone,
  PiCheckCircleDuotone,
  PiCurrencyDollarDuotone,
  PiHouseLineDuotone,
  PiMapPinLineDuotone,
  PiShootingStarDuotone,
  PiUserCircleDuotone,
  PiStorefrontDuotone,
  PiUserGearDuotone,
  PiEyeSlashDuotone,
  PiShieldCheckDuotone,
  PiLockKeyDuotone,
  PiGlobeDuotone,
  PiBrainDuotone,
  PiCubeDuotone,
  PiChatCircleDuotone,
  PiChartLineDuotone,
  PiFolderDuotone,
  PiPresentationChartDuotone,
} from 'react-icons/pi';
import { atom } from 'jotai';



export interface SubMenuItemType {
  name: string;
  description?: string;
  href: string;
}

export interface ItemType {
  name: string;
  icon: IconType;
  href?: string;
  description?: string;
  subMenuItems?: SubMenuItemType[];

}

export interface MenuItemsType {
  id: number;
  name: string;
  title: string;
  icon: IconType;
  color: string;
  menuItems: ItemType[];
}

export const carbonMenuItems: MenuItemsType[] = [
  {
    // MODULES id for account_overview is 13 — sharing id:1 with Connect Data made
    // the RBAC guard grant/deny both items together (modules.ts:108).
    id: 13,
    name: 'Account Overview',
    title: 'Account Overview',
    icon: PiHouseLineDuotone,
    color: 'orange',
    menuItems: [
      {
        name: 'Account Overview',
        href: routes.accountOverview,
        icon: PiHouseLineDuotone,
      }
    ]
  },
  // 1. Connect Data
  {
    id: 1,
    name: 'Connect Data',
    title: 'Connect Data',
    icon: PiUserCircleDuotone,
    color: 'blue',
    menuItems: [
      {
        name: 'Data Source Connection',
        href: routes.connexion.dataSourceConnection,
        icon: PiHouseLineDuotone,
      },
    ]
  },

  // 3. Explore & Design
  {
    id: 12,
    name: 'Explore & Design',
    title: 'Explore & Design',
    icon: PiGlobeDuotone,
    color: 'violet',
    menuItems: [
      {
        name: 'Explore Design',
        href: routes.exploreDesign.view,
        icon: PiGlobeDuotone,
      },
    ]
  },
  // 4. Workflow
  {
    id: 3,
    name: 'Workflow',
    title: 'Workflow',
    icon: PiShootingStarDuotone,
    color: 'amber',
    menuItems: [
      {
        name: 'View Workflow',
        href: routes.workflow.ViewWorkflow,
        icon: PiShootingStarDuotone,
      },
    ],
  },
  // NOTE: "Deploy App" is intentionally NOT a top-level menu module.
  // The deploy-app flow is reached from AI Intelligence → Snowpark Services
  // (Container Services / Streamlit Apps), where app hosting + versioning
  // actually live. The route /deploy-app still exists for deep-linking.
  // 5. Governance
  {
    id: 6,
    name: 'Governance',
    title: 'Governance',
    icon: PiUserGearDuotone,
    color: 'rose',
    menuItems: [
      {
        name: 'Users',
        href: routes.governance.users,
        icon: PiUserCircleDuotone,
      },
      {
        name: 'Roles',
        href: routes.governance.roles,
        icon: PiBriefcaseDuotone,
      },
      {
        name: 'Grants',
        href: routes.governance.grants,
        icon: PiCurrencyDollarDuotone,
      },
      {
        name: 'Access Matrix',
        description: 'Who can reach which page, per role',
        href: routes.governance.accessMatrix,
        icon: PiShieldCheckDuotone,
      },
      {
        name: 'Policies',
        description: 'RLS, Network & Masking policies',
        href: routes.governance.policies,
        icon: PiShieldCheckDuotone,
      },
      {
        name: 'Security Matrix',
        href: routes.governance.securityMatrix,
        icon: PiShieldCheckDuotone,
      },
      {
        name: 'Projects',
        href: routes.governance.projects,
        icon: PiFolderDuotone,
      },
      {
        name: 'Authentication',
        href: routes.governance.oauth,
        icon: PiLockKeyDuotone,
      },
    ],
  },
  // 6. BI Dashboard
  {
    id: 4,
    name: 'BI Dashboard',
    title: 'BI Dashboard',
    icon: PiChartBarDuotone,
    color: 'cyan',
    menuItems: [
      {
        name: 'BI Dashboard',
        description: 'Project-based BI dashboards',
        href: routes.biDashboard.view,
        icon: PiChartBarDuotone,
      },
    ],
  },
  // 7. AI Intelligence
  {
    id: 10,
    name: 'AI Intelligence',
    title: 'AI Intelligence',
    icon: PiBrainDuotone,
    color: 'purple',
    menuItems: [
      {
        name: 'Semantic Models',
        description: 'YAML semantic models for AI Analyst',
        href: routes.intelligent.semanticModels,
        icon: PiCubeDuotone,
      },
      {
        name: 'AI Chat',
        description: 'Ask-your-data conversational analyst',
        href: routes.intelligent.aiChat,
        icon: PiChatCircleDuotone,
      },
      {
        name: 'AI Advisor',
        description: 'Recommendations across your data products',
        href: routes.intelligent.aiAdvisor,
        icon: PiBrainDuotone,
      },
      {
        name: 'ML Features',
        description: 'Text utilities & feature engineering',
        href: routes.intelligent.mlFeatures,
        icon: PiCubeDuotone,
      },
    ],
  },
  // 8. Data Quality
  {
    id: 5,
    name: 'Data Quality',
    title: 'Data Quality',
    icon: PiCheckCircleDuotone,
    color: 'green',
    menuItems: [
      {
        name: 'Quality Reports',
        href: routes.dataQuality.viewReports,
        icon: PiCheckCircleDuotone,
      },
    ],
  },
  // Data Engineering & Developer Tools — merged into Explore & Design and Workflow
  // 11. Observability
  {
    // MODULES id for observability is 9 (modules.ts:147) — id:8 made the RBAC
    // guard never match, so the entry rendered permanently locked.
    id: 9,
    name: 'Observability',
    title: 'Observability',
    icon: PiChartLineDuotone,
    color: 'orange',
    menuItems: [
      {
        name: 'Dashboard',
        description: 'KPIs, lineage, compliance & monitoring',
        href: routes.observability.dashboard,
        icon: PiChartLineDuotone,
      },
    ],
  },
  // Administration — platform config (not a data module; lives under /admin/*)
  {
    id: 11,
    name: 'Administration',
    title: 'Administration',
    icon: PiCubeDuotone,
    color: 'slate',
    menuItems: [
      {
        name: 'Overview',
        description: 'Unified hub — platform health, performance, access, entitlements, config',
        href: routes.administrationHub,
        icon: PiCubeDuotone,
      },
      {
        name: 'Config Data360',
        description: 'Metadata, tables, date columns, cache & refresh',
        href: routes.data360Config.view,
        icon: PiCubeDuotone,
      },
      {
        name: 'Performance',
        description: 'Per-account drill-down: endpoints, users, cache, modules, errors',
        href: routes.adminPerformance.view,
        icon: PiChartLineDuotone,
      },
      {
        name: 'Feature Governance',
        description: 'Per-account feature & addon enablement matrix',
        href: '/administration/feature-governance',
        icon: PiShieldCheckDuotone,
      },
      {
        name: 'Access Control Center',
        description: 'Module → page → tab → feature → action grants, entitlements & usage',
        href: '/administration/access-center',
        icon: PiLockKeyDuotone,
      },
    ],
  },
];

export const carbonMenuItemAtom = atom(carbonMenuItems[0]);
