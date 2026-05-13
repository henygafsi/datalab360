'use client';

import PageHeader, { PageHeaderTypes } from '@/app/shared/page-header';
import ImportButton from '@/app/shared/import-button';
import AddUserButton from '@/app/shared/governance/users/add-user-button';

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
          <AddUserButton onAddUserSuccess={() => {}} />
          <ImportButton title={'Import Users'} />{' '}
        </div>
      </PageHeader>

      {children}
    </>
  );
}
