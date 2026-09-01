'use client';

import { MonitorSmartphone, Plus } from 'lucide-react';
import { Project } from '@/types';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import PageHeader from '@/components/dashboard/PageHeader';
import MachineManagement from '@/components/MachineManagement';

export default function MachinesPage() {
  const { session, openTerminal, openAddMachine } = useDashboard();
  if (!session) return null;

  return (
    <div>
      <PageHeader
        title="Machines"
        subtitle="Register machines, manage agent API keys, and open machine-level terminals."
        icon={<MonitorSmartphone size={20} />}
        actions={
          <button className="btn-grad" onClick={openAddMachine}>
            <Plus size={16} /> Add Machine
          </button>
        }
      />
      <MachineManagement
        userId={session.userId}
        machines={session.machines}
        currentMachineId={session.machineId}
        onTerminal={(machineId, machineName) => {
          const machineProject: Project = {
            id: -machineId, userId: session.userId, machineId,
            name: machineName, port: null, addonPorts: '', url: '',
            techStack: '', description: '', startDate: null,
            runner: '', status: 'active', tags: '', notes: '', rootPath: '~',
            startCommand: '', stopCommand: '', restartCommand: '', runInBackground: true,
            isRunning: true, lastChecked: null, createdAt: '', updatedAt: '',
          };
          openTerminal(machineProject);
        }}
      />
    </div>
  );
}
