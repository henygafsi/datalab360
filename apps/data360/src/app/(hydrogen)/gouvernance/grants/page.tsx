import { routes } from '@/config/routes';
import TableLayout from '@/app/(hydrogen)/tables/table-layout';
import { metaObject } from '@/config/site.config';
import GrantsTable from '@/app/shared/gouvernance/grants/table';

export const metadata = {
  ...metaObject('Grants Table'),
};

const pageHeader = {
  title: 'Grants Table',
  breadcrumb: [
    {
      href: routes.eCommerce.dashboard,
      name: 'Home',
    },
    {
      name: 'Tables',
    },
    {
      name: 'Grants',
    },
  ],
};

export default function GrantsTablePage() {
  return (
    <TableLayout
      title={pageHeader.title}
      breadcrumb={pageHeader.breadcrumb}
      data={[]} // Empty data to be handled by the table component
      fileName="grants_data"
      header="ID,Role,Number of Grants,Created On,Permissions,Status"
    >
     <GrantsTable />
    </TableLayout>
  );
}
