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
  menuItems: ItemType[];

}

export const carbonMenuItems: MenuItemsType[] = [
  // 1. Connect Data
  {
    id: 1,
    name: 'Connect Data',
    title: 'Connect Data',
    icon: PiUserCircleDuotone,
    menuItems: [
      {
        name: 'Data Source Connection',
        href: routes.connexion.dataSourceConnection,
        icon: PiHouseLineDuotone,
      },
    ]
  },
  // 2. Explore & Design
  {
    id: 12,
    name: 'Explore & Design',
    title: 'Explore & Design',
    icon: PiGlobeDuotone,
    menuItems: [
      {
        name: 'Explore Design',
        href: routes.exploreDesign.view,
        icon: PiGlobeDuotone,
      },
    ]
  },
  // 3. Workflow
  {
    id: 3,
    name: 'Workflow',
    title: 'Workflow',
    icon: PiShootingStarDuotone,
    menuItems: [
      {
        name: 'View Workflow',
        href: routes.workflow.ViewWorkflow,
        icon: PiShootingStarDuotone,
      },
    ],
  },
  // 4. Governance
  {
    id: 6,
    name: 'Governance',
    title: 'Governance',
    icon: PiUserGearDuotone,
    menuItems: [
      {
        name: 'Users',
        href: routes.gouvernance.users,
        icon: PiUserCircleDuotone,
      },
      {
        name: 'Roles',
        href: routes.gouvernance.roles,
        icon: PiBriefcaseDuotone,
      },
      {
        name: 'Grants',
        href: routes.gouvernance.grants,
        icon: PiCurrencyDollarDuotone,
      },
      {
        name: 'Policies',
        description: 'RLS, Network & Masking policies',
        href: routes.gouvernance.policies,
        icon: PiShieldCheckDuotone,
      },
      {
        name: 'Security Matrix',
        href: routes.gouvernance.securityMatrix,
        icon: PiShieldCheckDuotone,
      },
    ],
  },
  // 5. Business Reporting
  {
    id: 4,
    name: 'Business Reporting',
    title: 'Business Reporting',
    icon: PiChartBarDuotone,
    menuItems: [
      {
        name: 'BI Reporting',
        href: routes.biReporting.viewReporting,
        icon: PiCurrencyDollarDuotone,
      },
    ],
  },
  // 6. AI Intelligence
  {
    id: 10,
    name: 'AI Intelligence',
    title: 'AI Intelligence',
    icon: PiBrainDuotone,
    menuItems: [
      {
        name: 'Semantic Models',
        description: 'YAML models for Cortex Analyst',
        href: routes.intelligent.dashboard,
        icon: PiCubeDuotone,
      },
      {
        name: 'Cortex Chat',
        description: 'Natural language data queries',
        href: routes.intelligent.cortexChat,
        icon: PiChatCircleDuotone,
      },
    ],
  },
  // 7. Data Health
  {
    id: 5,
    name: 'Data Health',
    title: 'Data Health',
    icon: PiCheckCircleDuotone,
    menuItems: [
      {
        name: 'Quality Reports',
        href: routes.dataQuality.viewReports,
        icon: PiCheckCircleDuotone,
      },
    ],
  },
  // 8. Observability
  {
    id: 8,
    name: 'Observability',
    title: 'Observability',
    icon: PiChartLineDuotone,
    menuItems: [
      {
        name: 'Dashboard',
        description: 'KPIs, Compliance & Monitoring',
        href: routes.observability.dashboard,
        icon: PiChartLineDuotone,
      },
    ],
  },
];

export const carbonMenuItemAtom = atom(carbonMenuItems[0]);
