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
  {
    id: 1,
    name: 'Connexion',
    title: 'Connexion',
    icon: PiUserCircleDuotone,
    menuItems: [
      {
        name: 'Data Source Connection',
        href: routes.connexion.dataSourceConnection,
        icon: PiHouseLineDuotone,
      },
    ]
  },
  {
    id: 2,
    name: 'Mapping',
    title: 'Mapping',
    icon: PiMapPinLineDuotone,
    menuItems: [
      {
        name: 'View Mapping',
        href: routes.mapping.viewMap,
        icon: PiMapPinLineDuotone,
      },
    ]
  },
  // Workflow menu item moved here, under Mapping
  {
    id: 3, // Retaining the unique ID
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
  {
    id: 4,
    name: 'BI Reporting',
    title: 'BI Reporting',
    icon: PiChartBarDuotone,
    menuItems: [
      {
        name: 'View Reporting',
        href: routes.biReporting.viewReporting,
        icon: PiCurrencyDollarDuotone,
      },
    ],
  },
  {
    id: 5,
    name: 'Data Quality',
    title: 'Data Quality',
    icon: PiCheckCircleDuotone,
    menuItems: [
      {
        name: 'Quality Reports',
        href: routes.dataQuality.viewReports,
        icon: PiCheckCircleDuotone,
      },
    ],
  },
  {
    id: 6,
    name: 'Gouvernance',
    title: 'Gouvernance',
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
  {
    id: 7,
    name: "KPI's Store",
    title: "KPI's Store",
    icon: PiStorefrontDuotone,
    menuItems: [
      {
        name: 'View KPI',
        href: routes.kpiStore.view,
        icon: PiChartBarDuotone,
      },
    ],
  },
  {
    id: 8,
    name: 'DaRquest / DAC',
    title: 'DaRquest / DAC',
    icon: PiShootingStarDuotone,
    menuItems: [
      {
        name: 'Request Data',
        href: routes.daRquest.view,
        icon: PiShootingStarDuotone,
      },
    ],
  },
  {
    id: 9,
    name: 'Observability',
    title: 'Observability',
    icon: PiBinocularsDuotone,
    menuItems: [
      {
        name: 'System Status',
        href: routes.observability.systemStatus,
        icon: PiBinocularsDuotone,
      },
    ],
  },
  {
    id: 10,
    name: 'Intelligent',
    title: 'Intelligent',
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
];

export const carbonMenuItemAtom = atom(carbonMenuItems[0]);
