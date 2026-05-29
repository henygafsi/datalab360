import { routes } from '@/config/routes';
import { DUMMY_ID } from '@/config/constants';

// Note: do not add href in the label object, it is rendering as label
export const pageLinks = [
  // label start
  {
    name: 'Connexion',
    label: true,
  },
  {
    name: 'Data Source Connection',
    href: routes.connexion.dataSourceConnection,
    label: true,
  },
  // label end
  {
    name: 'Mapping',
    label: true,
  },
  {
    name: 'View Mapping',
    href: routes.mapping.viewMap,
  },
  {
    name: 'View Reporting',
    href: routes.biDashboard.view,
  },
  {
    name: 'Gouvernance',
    label: true,
  },
  {
    name: 'Users',
    href: routes.governance.users,
  },
  {
    name: 'Roles',
    href: routes.governance.roles,
  },
  {
    name: 'Grants',
    href: routes.governance.grants,
  },
    {
    name: 'Policies',
    href: routes.governance.policies,
  },
   {
    name: 'Projects',
    href: routes.governance.projects,
  },
  {
    name: "KPI's Store",
    label: true,
  },
  {
    name: 'View KPI',
    href: routes.kpiStore.view,
  },
  {
    name: 'DaRquest / DAC',
    label: true,
  },
  {
    name: 'DaRquest / DAC',
    href: routes.daRquest.view,
  },
  {
    name: 'Intelligent',
    label: true,
  },
  {
    name: 'Semantic Models',
    href: routes.intelligent.dashboard,
  },
  {
    name: 'Data & Governance',
    href: routes.intelligent.dataGovernance,
  },
  {
    name: 'Observability',
    label: true,
  }
];
