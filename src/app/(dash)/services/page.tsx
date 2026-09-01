'use client';

import { Server } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PageHeader from '@/components/dashboard/PageHeader';
import SystemServices from '@/components/SystemServices';

export default function ServicesPage() {
  const { services, reloadServices } = useDashboard();
  return (
    <div>
      <PageHeader
        title="System services"
        subtitle="Per-machine registry of ports used by long-running services."
        icon={<Server size={20} />}
      />
      <SystemServices services={services} onReload={reloadServices} />
    </div>
  );
}
