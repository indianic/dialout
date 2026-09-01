'use client';

import { useRouter } from 'next/navigation';
import { Radar } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PageHeader from '@/components/dashboard/PageHeader';
import PortScanner from '@/components/PortScanner';
import ProjectFolderScanner from '@/components/ProjectFolderScanner';

export default function ScannerPage() {
  const router = useRouter();
  const { projects } = useDashboard();
  return (
    <div>
      <PageHeader
        title="Scanner"
        subtitle="Discover projects in a folder, or scan ports and register what you find."
        icon={<Radar size={20} />}
      />
      <ProjectFolderScanner />
      <PortScanner visible projects={projects} onQuickAdd={(port) => router.push(`/projects?new=${port}`)} />
    </div>
  );
}
