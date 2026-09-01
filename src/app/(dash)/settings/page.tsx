'use client';

import { Settings } from 'lucide-react';
import PageHeader from '@/components/dashboard/PageHeader';
import SettingsPanel from '@/components/SettingsPanel';
import TerminalNamingSettings from '@/components/TerminalNamingSettings';
import RegistrationSettings from '@/components/RegistrationSettings';

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Session recording, retention, terminal defaults — and who can join this instance."
        icon={<Settings size={20} />}
      />
      <RegistrationSettings />
      <SettingsPanel />
      <TerminalNamingSettings />
    </div>
  );
}
