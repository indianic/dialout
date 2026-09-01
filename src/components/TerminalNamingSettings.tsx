'use client';

import { useState } from 'react';
import { Save, Type } from 'lucide-react';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import {
  renderTerminalName, factsFromSession, DEFAULT_TERMINAL_TEMPLATE, TERMINAL_NAME_TOKENS,
} from '@/lib/terminal-name';

export default function TerminalNamingSettings() {
  const { session, checkAuth } = useDashboard();
  const machines: Array<{ id: number; name: string; terminalNameTemplate?: string | null; terminalPreviewLines?: number | null }> =
    session?.machines || [];
  const [machineId, setMachineId] = useState<number>(session?.machineId || machines[0]?.id || 0);
  const current = machines.find((m) => m.id === machineId);
  const [template, setTemplate] = useState(current?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE);
  const [lines, setLines] = useState<number>(current?.terminalPreviewLines ?? 3);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onPickMachine = (id: number) => {
    setMachineId(id);
    const m = machines.find((x) => x.id === id);
    setTemplate(m?.terminalNameTemplate || DEFAULT_TERMINAL_TEMPLATE);
    setLines(m?.terminalPreviewLines ?? 3);
    setSaved(false);
  };

  const insertToken = (tok: string) => setTemplate((t) => `${t}[${tok}]`);

  const previewName = renderTerminalName(
    template,
    factsFromSession({
      machineName: current?.name || 'machine', folder: 'phasepilot', folderPath: '/www/phasepilot',
      createdLocal: new Date().toISOString().replace(/\.\d+Z$/, ''), startedAt: null,
      gitBranch: 'main', termProgram: 'iTerm.app', tmuxName: 'phasepilot-ab12cd34',
    }),
    'phasepilot-ab12cd34'
  );

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/machines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: machineId, terminalNameTemplate: template, terminalPreviewLines: lines }),
      });
      if (res.ok) {
        setSaved(true);
        await checkAuth();
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  if (machines.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="sec-label flex items-center gap-2">
        <Type size={15} style={{ color: 'var(--muted)' }} />
        <span>Terminal Naming</span>
      </div>
      <div className="card-v2" style={{ padding: 18 }}>
        {machines.length > 1 && (
          <div className="mb-4">
            <div style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 6 }}>Machine</div>
            <select className="inp" style={{ width: 'auto' }} value={machineId} onChange={(e) => onPickMachine(Number(e.target.value))}>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ color: 'var(--txt)', fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Name template</div>
        <input className="inp" style={{ width: '100%', fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace" }}
          value={template} onChange={(e) => { setTemplate(e.target.value); setSaved(false); }} />
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
          {TERMINAL_NAME_TOKENS.map((tok) => (
            <button key={tok} type="button" onClick={() => insertToken(tok)}
              className="status-chip" style={{ cursor: 'pointer', fontSize: 11 }}>[{tok}]</button>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>
          Preview: <span style={{ color: 'var(--accent)', fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace" }}>{previewName}</span>
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 18 }}>
          <div>
            <div style={{ color: 'var(--txt)', fontSize: 13.5, fontWeight: 600 }}>Description lines</div>
            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Last lines of output shown on the card (0 hides)</div>
          </div>
          <select className="inp" style={{ width: 'auto' }} value={lines} onChange={(e) => { setLines(Number(e.target.value)); setSaved(false); }}>
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="flex justify-end" style={{ marginTop: 18 }}>
          <button onClick={save} disabled={saving} className="btn-grad flex items-center gap-1.5">
            {saving ? <span className="spin" style={{ width: 14, height: 14, display: 'inline-block' }} /> : <Save size={15} />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
