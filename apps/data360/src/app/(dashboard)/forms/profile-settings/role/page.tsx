import { metaObject } from '@/config/site.config';
import RoleSettingsView from '@/app/shared/account-settings/role-settings';

export const metadata = {
  ...metaObject('Role'),
};

export default function RoleSettingsPage() {
  return <RoleSettingsView />;
}