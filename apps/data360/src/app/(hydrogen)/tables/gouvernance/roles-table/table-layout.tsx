'use client';

import AddRoleButton from '@/app/shared/gouvernance/roles/add-role-button';
import EditGrantsButton from '@/app/shared/gouvernance/roles/edit-grants-button';
import PageHeader, { PageHeaderTypes } from '@/app/shared/page-header';

type TableLayoutProps = {
  data: unknown[];
  header: string;
  fileName: string;
} & PageHeaderTypes;

export default function TableLayout({
  data,
  header,
  fileName,
  children,
  ...props
}: React.PropsWithChildren<TableLayoutProps>) {
  return (
    <>
      <PageHeader {...props}>
        <div className="mt-4 flex items-center gap-3 @lg:mt-0">
          <AddRoleButton /> {/* Add Role button */}
          <EditGrantsButton /> {/* Edit Grants button */}
        </div>
      </PageHeader>

      {children}
    </>
  );
}
