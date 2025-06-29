import { routes } from '@/config/routes';
import { metaObject } from '@/config/site.config';
import UsersTable from '@/app/shared/gouvernance/users/table';
import TableLayout from '../../tables/gouvernance/users-table/table-layout';

export const metadata = {
  ...metaObject('Users Table'),
};

const pageHeader = {
  title: 'Users Table',
  breadcrumb: [
    {
      href: routes.eCommerce.dashboard,
      name: 'Home',
    },
    {
      name: 'Tables',
    },
    {
      name: 'Users',
    },
  ],
};

export default function UsersTablePage() {
  return (
    <TableLayout
      title={pageHeader.title}
      breadcrumb={pageHeader.breadcrumb}
      data={[]} // Pass empty or sample data for now
      fileName="users_data"
      header="ID,Name,Email,Roles,Status,Created On"
    >
      <UsersTable />
    </TableLayout>
  );
}
