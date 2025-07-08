'use client';
import dynamic from 'next/dynamic';
const WorkflowBuilder = dynamic(() => import('./Workflow'), { ssr: false });

export default function Page() {
  return <WorkflowBuilder />;
}
