'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Recording {
  id: number;
  machineId: number;
  userId: number;
  projectId: number | null;
  command: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
}

interface RecordingsPanelProps {
  machineId: number;
}

export default function RecordingsPanel({ machineId }: RecordingsPanelProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [playbackData, setPlaybackData] = useState<string>('');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const termRef = useRef<HTMLDivElement>(null);
  const termInstanceRef = useRef<any>(null);

  const loadRecordings = useCallback(async () => {
    try {
      const r = await fetch(`/api/terminals/recordings?machineId=${machineId}`);
      if (r.ok) setRecordings(await r.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [machineId]);

  useEffect(() => { loadRecordings(); }, [loadRecordings]);

  function formatDuration(start: string, end: string): string {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  async function playRecording(id: number) {
    setPlayingId(id);
    setPlaybackData('');

    // Initialize xterm for playback
    if (termRef.current) {
      const { Terminal: XTerm } = await import('xterm');
      // @ts-ignore
      await import('xterm/css/xterm.css');

      if (termInstanceRef.current) termInstanceRef.current.dispose();

      const term = new XTerm({
        cursorBlink: false,
        fontSize: 12,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
        rows: 18,
        cols: 100,
        disableStdin: true,
        theme: {
          background: '#1a1b26',
          foreground: '#a9b1d6',
        },
      });
      term.open(termRef.current);
      termInstanceRef.current = term;

      // Fetch chunks and replay
      try {
        const r = await fetch(`/api/terminals/${id}`);
        if (!r.ok) return;

        // For now show a message — full playback with chunks will be added
        // when we wire up the chunks API endpoint
        term.write('\x1b[33m[Playback] Loading session data...\x1b[0m\r\n');
        term.write('\x1b[90mSession recording playback will stream chunks in sequence.\x1b[0m\r\n');
        term.write('\x1b[90mFull chunk-based playback coming in next iteration.\x1b[0m\r\n');
      } catch {
        term.write('\x1b[31m[Error loading recording]\x1b[0m\r\n');
      }
    }
  }

  function stopPlayback() {
    if (termInstanceRef.current) {
      termInstanceRef.current.dispose();
      termInstanceRef.current = null;
    }
    setPlayingId(null);
  }

  if (loading) {
    return <div className="text-center py-6 font-mono text-xs" style={{ color: 'var(--dim)' }}>Loading recordings...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="sec-label">
        <span style={{ color: 'var(--muted)' }}>&#9654;</span>
        <span>TERMINAL RECORDINGS</span>
      </div>

      {/* Playback area */}
      {playingId && (
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
            <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              PLAYBACK — Session #{playingId}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="font-mono text-[10px] bg-gray-700 text-gray-200 rounded px-1 py-0.5 border-0"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
              <button onClick={stopPlayback} className="font-mono text-[9px] px-2 py-1 rounded"
                style={{ background: 'var(--b1)', color: '#f7768e' }}>
                CLOSE
              </button>
            </div>
          </div>
          <div ref={termRef} style={{ background: '#1a1b26' }} />
        </div>
      )}

      {/* Recording list */}
      {recordings.length === 0 ? (
        <div className="text-center py-8 font-mono text-xs" style={{ color: 'var(--dim)' }}>
          No recordings yet. Terminal sessions are recorded automatically when enabled in settings.
        </div>
      ) : (
        <div className="space-y-2">
          {recordings.map((rec) => (
            <div key={rec.id} className="p-card flex items-center justify-between" style={{ padding: '10px 16px' }}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs" style={{ color: rec.exitCode === 0 ? '#9ece6a' : '#f7768e' }}>
                  {rec.exitCode === 0 ? '●' : '●'}
                </span>
                <div>
                  <div className="font-mono text-xs" style={{ color: 'var(--txt)' }}>
                    {rec.command || 'shell'}
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: 'var(--dim)' }}>
                    {formatDate(rec.startedAt)} · {rec.endedAt ? formatDuration(rec.startedAt, rec.endedAt) : 'running'} · {rec.cwd}
                  </div>
                </div>
              </div>
              <button
                onClick={() => playRecording(rec.id)}
                className="font-mono text-[9px] px-2 py-1 rounded"
                style={{ background: 'var(--b1)', color: 'var(--accent)', border: '1px solid var(--b2)' }}
              >
                REPLAY
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
