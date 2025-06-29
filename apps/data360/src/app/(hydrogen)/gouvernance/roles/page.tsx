import { routes } from '@/config/routes';
import { metaObject } from '@/config/site.config';
import RolesTable from '@/app/shared/gouvernance/roles/table';
import TableLayout from '../../tables/gouvernance/roles-table/table-layout';

export const metadata = {
  ...metaObject('Roles Table'),
};

const pageHeader = {
  title: 'Roles Table',
  breadcrumb: [
    {
      href: routes.eCommerce.dashboard,
      name: 'Home',
    },
    {
      name: 'Tables',
    },
    {
      name: 'Roles',
    },
  ],
};

export default function RolesTablePage() {
  return (
    <TableLayout
      title={pageHeader.title}
      breadcrumb={pageHeader.breadcrumb}
      data={[]} // Pass empty or sample data for now
      fileName="roles_data"
      header="ID,Role,Number of Grants,Created On,Grants,Status"
    >
      <RolesTable />
    </TableLayout>
  );
}
