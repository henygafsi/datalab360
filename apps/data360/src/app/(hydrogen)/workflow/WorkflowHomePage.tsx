'use client';

import dynamic from 'next/dynamic';

const WorkflowHomePage = dynamic(() => import('./WorkflowHomePage'), { ssr: false });

export default function Page() {
  return <WorkflowHomePage />;
}