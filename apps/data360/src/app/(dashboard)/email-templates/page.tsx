import Link from 'next/link';
import { Button } from 'rizzui';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import PageHeader from '@/app/shared/page-header';
import { metaObject } from '@/config/site.config';
import EmailTemplatesGrid from '@/app/shared/email-templates';

export const metadata = {
  ...metaObject('Email Templates'),
};

const pageHeader = {
  title: 'Email Templates',
  breadcrumb: [
    {
      href: '/',
      name: 'Home',
    },
    {
      name: 'Email Templates',
    },
  ],
};

// Admin-only + demo boilerplate: the grid below renders static react.email
// sample previews, not live account templates — guard the route and say so.
export default function EmailTemplates() {
  return (
    <AdminRouteGuard surface="Email Templates">
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb}>
        <Link href="https://react.email/" target="_blank">
          <Button as="span">Learn More</Button>
        </Link>
      </PageHeader>
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        These templates are sample previews (demo boilerplate) — they are not
        wired to the platform&apos;s outbound email yet.
      </p>
      <EmailTemplatesGrid />
    </AdminRouteGuard>
  );
}
