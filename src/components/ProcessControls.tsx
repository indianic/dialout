'use client';

import { useState } from 'react';
import { Play, Square, RotateCw } from 'lucide-react';
import { Project } from '@/types';
import { useDashboard } from './dashboard/DashboardContext';
import RunCommandModal from './RunCommandModal';

interface ProcessControlsProps {
  project: Project;
  onlineMachineIds: number[];
  size?: number;
}

export default function ProcessControls({ project: p, onlineMachineIds, size = 16 }: ProcessControlsProps) {
  const { runProcessAction } = useDashboard();
  const [ask, setAsk] = useState<null | 'start' | 'stop' | 'restart'>(null);

  const arch = p.status === 'archived';
  const portBased = !!p.port;
  const daemonOnline = p.machineId ? onlineMachineIds.includes(p.machineId) : false;
  if (arch || !portBased || !daemonOnline) return null;

  async function trigger(action: 'start' | 'stop' | 'restart') {
    const res = await runProcessAction(p, action);
    if (res.needCommand) setAsk(action);
  }

  return (
    <>
      {!p.isRunning ? (
        <button className="btn-icon" title="Start" onClick={(e) => { e.stopPropagation(); trigger('start'); }}><Play size={size} /></button>
      ) : (
        <>
          <button className="btn-icon" title="Restart" onClick={(e) => { e.stopPropagation(); trigger('restart'); }}><RotateCw size={size} /></button>
          <button className="btn-icon danger" title="Stop" onClick={(e) => { e.stopPropagation(); trigger('stop'); }}><Square size={size} /></button>
        </>
      )}

      <RunCommandModal
        open={ask !== null}
        action={ask || 'start'}
        projectName={p.name}
        onClose={() => setAsk(null)}
        onSubmit={async (command, opts) => {
          const a = ask!;
          setAsk(null);
          await runProcessAction(p, a, { command, background: opts.background, save: opts.save });
        }}
      />
    </>
  );
}
