'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Save, Video, Clock } from 'lucide-react';

interface UserSettingsData {
  recordSessions: boolean;
  retentionDays: number;
  defaultCommands: string;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<UserSettingsData>({
    recordSessions: true,
    retentionDays: 15,
    defaultCommands: '[]',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/settings');
      if (r.ok) {
        const data = await r.json();
        setSettings({
          recordSessions: data.recordSessions ?? true,
          retentionDays: data.retentionDays ?? 15,
          defaultCommands: data.defaultCommands ?? '[]',
        });
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch { /* silent */ }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6" style={{ color: 'var(--muted)', fontSize: 13 }}>
        <span className="spin" style={{ width: 16, height: 16, display: 'inline-block' }} /> Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sec-label flex items-center gap-2">
        <Settings size={15} style={{ color: 'var(--muted)' }} />
        <span>Terminal Settings</span>
      </div>

      <div className="card-v2" style={{ padding: 18 }}>
        {/* Record sessions toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-start gap-2.5">
            <Video size={16} style={{ color: 'var(--muted)', marginTop: 2 }} />
            <div>
              <div style={{ color: 'var(--txt)', fontSize: 13.5, fontWeight: 600 }}>Record Terminal Sessions</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                Automatically record all terminal sessions for playback
              </div>
            </div>
          </div>
          <button
            onClick={() => setSettings((s) => ({ ...s, recordSessions: !s.recordSessions }))}
            className={settings.recordSessions ? 'status-chip live' : 'status-chip offline'}
            style={{ cursor: 'pointer' }}
            aria-label="Toggle session recording"
          >
            {settings.recordSessions ? 'On' : 'Off'}
          </button>
        </div>

        {/* Retention days */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-start gap-2.5">
            <Clock size={16} style={{ color: 'var(--muted)', marginTop: 2 }} />
            <div>
              <div style={{ color: 'var(--txt)', fontSize: 13.5, fontWeight: 600 }}>Retention Period</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                Auto-delete recordings older than this
              </div>
            </div>
          </div>
          <select
            value={settings.retentionDays}
            onChange={(e) => setSettings((s) => ({ ...s, retentionDays: Number(e.target.value) }))}
            className="inp"
            style={{ width: 'auto' }}
          >
            <option value={7}>7 days</option>
            <option value={15}>15 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="btn-grad flex items-center gap-1.5"
          >
            {saving ? <span className="spin" style={{ width: 14, height: 14, display: 'inline-block' }} /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
