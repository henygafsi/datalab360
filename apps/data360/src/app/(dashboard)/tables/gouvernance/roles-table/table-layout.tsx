// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\table-layout.tsx

'use client';

import PageHeader, { PageHeaderTypes } from '@/app/shared/page-header';
import ImportButton from '@/app/shared/import-button';
import AddRoleButton from '@/app/shared/gouvernance/roles/add-role-button';

type TableLayoutProps = {
  data: unknown[];
  header: string;
  fileName: string;
  accessToken: string | null; // New: accessToken prop
  onAddUserSuccess: () => void; // New: onAddUserSuccess prop
} & PageHeaderTypes;

export default function TableLayout({
  data,
  header,
  fileName,
  children,
  accessToken, // Destructure accessToken
  onAddRoleSuccess, // Destructure onAddUserSuccess
  ...props
}: React.PropsWithChildren<TableLayoutProps>) {
  return (
    <>
      <PageHeader {...props}>
        <div className="mt-4 flex items-center gap-3 @lg:mt-0">
          {/* AddUserButton is now rendered here */}
          <AddRoleButton onAddRoleSuccess={onAddRoleSuccess} accessToken={accessToken} />
          <ImportButton title={'Import Users'} />{' '}
          {/* ImportButton for file upload */}
        </div>
      </PageHeader>

      {children} {/* This is where your UsersTable component will be rendered */}
    </>
  );
}