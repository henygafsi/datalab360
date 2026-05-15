export const CART_KEY = 'isomorphic-cart';
export const POS_CART_KEY = 'isomorphic-pos-cart';
export const DUMMY_ID = 'FC6723757651DB74';
export const CHECKOUT = 'isomorphic-checkout';
export const CURRENCY_CODE = 'USD';
export const LOCALE = 'en';
export const CURRENCY_OPTIONS = {
  formation: 'en-US',
  fractions: 2,
};

function _normalizeApiUrl(u: string): string {
  let url = (u || '').trim();
  if (!url) return 'https://api.datalab360.io';
  if (url.startsWith('//')) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}
export const API_BASE_URL = _normalizeApiUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.datalab360.io',
);

export const ROW_PER_PAGE_OPTIONS = [
  {
    value: 5,
    name: '5',
  },
  {
    value: 10,
    name: '10',
  },
  {
    value: 15,
    name: '15',
  },
  {
    value: 20,
    name: '20',
  },
];

export const ROLES = {
  // System Roles
  Administrator: 'Administrator',
  AccountAdmin: 'ACCOUNTADMIN',

  // Business Roles
  BusinessUser: 'BUSINESS_USER',           // View dashboards, run queries, export data
  DataModeler: 'DATA_MODELER',             // Design schemas, create mappings, manage events
  DataAnalyst: 'DATA_ANALYST',             // Query data, create reports, view metrics
  QA: 'QA_ENGINEER',                       // Validate deployments, approve changes, run tests

  // Legacy Roles
  Manager: 'Manager',
  Sales: 'Sales',
  Support: 'Support',
  Developer: 'Developer',
  HRD: 'HR Department',
  RestrictedUser: 'Restricted User',
  Customer: 'Customer',
} as const;

// Role-based module access
export const ROLE_PERMISSIONS = {
  // Admin roles — full access to all modules
  ACCOUNTADMIN: {
    modules: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    actions: ['create', 'read', 'update', 'delete', 'approve', 'deploy'],
  },
  SYSADMIN: {
    modules: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    actions: ['create', 'read', 'update', 'delete', 'approve', 'deploy'],
  },
  SECURITYADMIN: {
    modules: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    actions: ['create', 'read', 'update', 'delete', 'approve', 'deploy'],
  },
  // Business roles
  DATA_MODELER: {
    modules: [1, 2, 3, 5, 10, 12],
    actions: ['create', 'read', 'update', 'delete', 'deploy'],
  },
  DATA_ANALYST: {
    modules: [2, 4, 5, 7, 10],
    actions: ['read', 'create_report', 'export'],
  },
  DATA_STEWARD: {
    modules: [1, 5, 6, 9],
    actions: ['read', 'create', 'update', 'approve'],
  },
  AI_ENGINEER: {
    modules: [1, 5, 10, 12],
    actions: ['read', 'create', 'update', 'deploy'],
  },
  FINOPS_MANAGER: {
    modules: [4, 7, 9],
    actions: ['read', 'export', 'configure'],
  },
  QA_ENGINEER: {
    modules: [2, 3, 5, 9],
    actions: ['read', 'approve', 'reject', 'validate', 'test'],
  },
  BUSINESS_USER: {
    modules: [4, 7],
    actions: ['read', 'export'],
  },
} as const;
