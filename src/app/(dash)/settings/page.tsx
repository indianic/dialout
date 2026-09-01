'use client';

import { Settings } from 'lucide-react';
import PageHeader from '@/components/dashboard/PageHeader';
import SettingsPanel from '@/components/SettingsPanel';
import TerminalNamingSettings from '@/components/TerminalNamingSettings';

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Session recording, retention and default terminal commands for this machine."
        icon={<Settings size={20} />}
      />
      <SettingsPanel />
      <TerminalNamingSettings />
    </div>
  );
}
