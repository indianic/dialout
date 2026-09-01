'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ThemeProvider } from '@/components/ThemeProvider';

interface SessionInfo {
  id: number;
  command: string;
  cwd: string;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

interface Chunk {
  id: number;
  sessionId: number;
  timestamp: number;
  type: string;
  data: string;
}

type PlayState = 'loading' | 'ready' | 'playing' | 'paused' | 'finished';
type ViewTab = 'terminal' | 'raw';

// Decode chunk data — always base64 encoded (type field is 'output', not 'base64')
function decodeChunkData(chunk: Chunk): string {
  try {
    const binary = atob(chunk.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return chunk.data;
  }
}

// Strip ANSI escape sequences for plain text view
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // CSI sequences (including ?2004h etc)
    .replace(/\x1b\][^\x07]*\x07/g, '')       // OSC sequences terminated by BEL
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')     // OSC sequences terminated by ST
    .replace(/\x1b\][0-9;]*[^\x07\x1b]*/g, '') // Partial OSC (no terminator)
    .replace(/\x1b[()][AB012]/g, '')           // charset switching
    .replace(/\x1b[\x20-\x2f]*[\x40-\x7e]/g, '') // other escape sequences
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // control chars except \t \n \r
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}:${String(mins % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  return `${mins}:${String(secs % 60).padStart(2, '0')}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function SessionReplayPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = Number(params.id);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [allLoaded, setAllLoaded] = useState(false);
  const [playState, setPlayState] = useState<PlayState>('loading');
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0); // 0-1
  const [currentTime, setCurrentTime] = useState(0); // ms from start
  const [totalDuration, setTotalDuration] = useState(0);
  const [viewTab, setViewTab] = useState<ViewTab>('terminal');
  const [rawText, setRawText] = useState('');

  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkIndex = useRef(0);
  const startTimestamp = useRef(0);

  // Load chunks with lazy loading
  const loadChunks = useCallback(async (offset: number = 0) => {
    try {
      const r = await fetch(`/api/terminals/${sessionId}/chunks?offset=${offset}&limit=1000`);
      if (!r.ok) return;
      const data = await r.json();
      if (offset === 0) {
        setSession(data.session);
        setChunks(data.chunks);
      } else {
        setChunks((prev) => [...prev, ...data.chunks]);
      }
      setTotalChunks(data.total);
      setAllLoaded(!data.hasMore);

      // Build raw text from all loaded chunks
      const allChunks = offset === 0 ? data.chunks : [...chunks, ...data.chunks];
      const decoded = allChunks.map((c: Chunk) => decodeChunkData(c)).join('');
      setRawText(stripAnsi(decoded));

      if (data.chunks.length > 0 && offset === 0) {
        const first = data.chunks[0].timestamp;
        const last = data.session.endedAt
          ? new Date(data.session.endedAt).getTime() - new Date(data.session.startedAt).getTime()
          : (data.chunks[data.chunks.length - 1].timestamp - first);
        startTimestamp.current = first;
        setTotalDuration(last > 0 ? last : (data.chunks[data.chunks.length - 1].timestamp - first));
      }

      if (offset === 0) setPlayState('ready');
    } catch {
      setPlayState('ready');
    }
  }, [sessionId]);

  // Init xterm
  useEffect(() => {
    loadChunks(0);
  }, [loadChunks]);

  useEffect(() => {
    if (!termRef.current || playState === 'loading') return;
    let destroyed = false;

    async function initTerm() {
      const xterm = await import('xterm');
      const fit = await import('@xterm/addon-fit');
      // @ts-ignore
      await import('xterm/css/xterm.css');
      if (destroyed || !termRef.current) return;

      const fitAddon = new fit.FitAddon();
      fitRef.current = fitAddon;

      const term = new xterm.Terminal({
        cursorBlink: false,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', Menlo, Monaco, monospace",
        lineHeight: 1.3,
        scrollback: 50000,
        disableStdin: true,
        theme: {
          background: '#0d0d14',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          black: '#0d1117', red: '#ff7b72', green: '#7ee787', yellow: '#d29922',
          blue: '#58a6ff', magenta: '#d2a8ff', cyan: '#79c0ff', white: '#c9d1d9',
          brightBlack: '#484f58', brightRed: '#ffa198', brightGreen: '#aff5b4',
          brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
          brightCyan: '#a5d6ff', brightWhite: '#f0f6fc',
        },
      });
      term.loadAddon(fitAddon);
      term.open(termRef.current);
      try { fitAddon.fit(); } catch {}
      termInstance.current = term;

      const ro = new ResizeObserver(() => {
        if (!destroyed && fitRef.current) try { fitRef.current.fit(); } catch {}
      });
      ro.observe(termRef.current);

      return () => { ro.disconnect(); };
    }

    initTerm();
    return () => { destroyed = true; };
  }, [playState === 'loading']); // eslint-disable-line

  // Play logic
  function playNext() {
    if (!termInstance.current || chunkIndex.current >= chunks.length) {
      // Try loading more chunks
      if (!allLoaded && chunks.length < totalChunks) {
        loadChunks(chunks.length).then(() => {
          if (chunkIndex.current < chunks.length) playNext();
          else setPlayState('finished');
        });
        return;
      }
      setPlayState('finished');
      setProgress(1);
      return;
    }

    const chunk = chunks[chunkIndex.current];
    const data = decodeChunkData(chunk);
    termInstance.current.write(data);

    const elapsed = chunk.timestamp - startTimestamp.current;
    setCurrentTime(elapsed);
    setProgress(totalDuration > 0 ? Math.min(elapsed / totalDuration, 1) : 0);

    chunkIndex.current++;

    if (chunkIndex.current < chunks.length) {
      const next = chunks[chunkIndex.current];
      const delay = Math.max(0, (next.timestamp - chunk.timestamp) / speed);
      // Cap delay to avoid long waits (max 2s real time)
      playTimer.current = setTimeout(playNext, Math.min(delay, 2000));
    } else if (!allLoaded) {
      // Load more chunks
      loadChunks(chunks.length);
    } else {
      setPlayState('finished');
      setProgress(1);
    }
  }

  function handlePlay() {
    if (playState === 'finished') {
      // Restart
      chunkIndex.current = 0;
      if (termInstance.current) termInstance.current.reset();
      setCurrentTime(0);
      setProgress(0);
    }
    setPlayState('playing');
    playNext();
  }

  function handlePause() {
    if (playTimer.current) clearTimeout(playTimer.current);
    playTimer.current = null;
    setPlayState('paused');
  }

  function handleSeek(pct: number) {
    if (playTimer.current) clearTimeout(playTimer.current);
    playTimer.current = null;

    const targetTime = pct * totalDuration + startTimestamp.current;
    if (termInstance.current) termInstance.current.reset();

    // Replay all chunks up to target time
    let i = 0;
    for (; i < chunks.length; i++) {
      if (chunks[i].timestamp > targetTime) break;
      termInstance.current?.write(decodeChunkData(chunks[i]));
    }
    chunkIndex.current = i;
    setCurrentTime(pct * totalDuration);
    setProgress(pct);
    setPlayState('paused');
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playTimer.current) clearTimeout(playTimer.current);
      if (termInstance.current) { try { termInstance.current.dispose(); } catch {} }
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--txt)' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--b1)', padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--header-bg)', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            className="btn-ghost"
            style={{ padding: '4px 10px', fontSize: 11 }}
          >&#8592; BACK</button>
          <div>
            <div className="font-display" style={{ fontSize: 18, color: 'var(--accent)', letterSpacing: '0.06em' }}>
              SESSION REPLAY
            </div>
            {session && (
              <div className="font-mono" style={{ fontSize: 9, color: 'var(--dim)', marginTop: 1 }}>
                #{session.id} &middot; {session.command || 'shell'} &middot; {session.cwd}
              </div>
            )}
          </div>
        </div>

        {session && (
          <div className="font-mono" style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'right' }}>
            <div>{formatDate(session.startedAt)}</div>
            <div>
              {session.endedAt && `Duration: ${formatDuration(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())}`}
              {session.exitCode !== null && ` · Exit: ${session.exitCode}`}
            </div>
          </div>
        )}
      </div>

      {/* Terminal */}
      <div style={{ padding: '12px 20px', flex: 1 }}>
        <div style={{
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.06)',
          background: '#0d0d14',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          {/* Player controls bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 14px',
            background: 'rgba(30, 30, 40, 0.8)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {/* Play/Pause */}
            <button
              onClick={playState === 'playing' ? handlePause : handlePlay}
              disabled={playState === 'loading'}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(88,166,255,0.15)', border: '1px solid rgba(88,166,255,0.3)',
                color: '#58a6ff', fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {playState === 'playing' ? '❚❚' : '▶'}
            </button>

            {/* Time */}
            <span className="font-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', minWidth: 65 }}>
              {formatDuration(currentTime)} / {formatDuration(totalDuration)}
            </span>

            {/* Progress bar */}
            <div
              style={{
                flex: 1, height: 6, background: 'rgba(255,255,255,0.08)',
                borderRadius: 3, cursor: 'pointer', position: 'relative',
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                handleSeek(pct);
              }}
            >
              <div style={{
                width: `${progress * 100}%`, height: '100%',
                background: '#58a6ff', borderRadius: 3,
                transition: playState === 'playing' ? 'none' : 'width 0.15s',
              }} />
              <div style={{
                position: 'absolute', top: -3, left: `${progress * 100}%`,
                width: 12, height: 12, borderRadius: '50%',
                background: '#58a6ff', border: '2px solid #0d0d14',
                transform: 'translateX(-50%)',
                boxShadow: '0 0 6px rgba(88,166,255,0.4)',
              }} />
            </div>

            {/* Speed */}
            <div style={{ display: 'flex', gap: 2 }}>
              {[0.5, 1, 2, 4, 8].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className="font-mono"
                  style={{
                    fontSize: 9, padding: '3px 6px', borderRadius: 3,
                    background: speed === s ? 'rgba(88,166,255,0.2)' : 'transparent',
                    color: speed === s ? '#58a6ff' : 'rgba(255,255,255,0.3)',
                    border: speed === s ? '1px solid rgba(88,166,255,0.3)' : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                >{s}x</button>
              ))}
            </div>

            {/* Chunk info */}
            <span className="font-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
              {chunkIndex.current}/{totalChunks} chunks
            </span>

            {/* View toggle */}
            <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: 1 }}>
              <button
                onClick={() => setViewTab('terminal')}
                className="font-mono"
                style={{
                  fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                  background: viewTab === 'terminal' ? 'rgba(88,166,255,0.2)' : 'transparent',
                  color: viewTab === 'terminal' ? '#58a6ff' : 'rgba(255,255,255,0.3)',
                  border: 'none',
                }}
              >TERMINAL</button>
              <button
                onClick={() => setViewTab('raw')}
                className="font-mono"
                style={{
                  fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                  background: viewTab === 'raw' ? 'rgba(88,166,255,0.2)' : 'transparent',
                  color: viewTab === 'raw' ? '#58a6ff' : 'rgba(255,255,255,0.3)',
                  border: 'none',
                }}
              >RAW TEXT</button>
            </div>
          </div>

          {/* Terminal replay view */}
          <div
            ref={termRef}
            style={{
              height: 'calc(100vh - 200px)', minHeight: 400, padding: 2,
              display: viewTab === 'terminal' ? 'block' : 'none',
            }}
          />

          {/* Raw text view */}
          {viewTab === 'raw' && (
            <div style={{
              height: 'calc(100vh - 200px)', minHeight: 400, overflow: 'auto',
              padding: '12px 16px', background: '#0d0d14',
            }}>
              {rawText ? (
                <pre
                  className="font-mono"
                  style={{
                    fontSize: 12, lineHeight: 1.5, color: '#c9d1d9',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    userSelect: 'text', cursor: 'text', margin: 0,
                  }}
                >{rawText}</pre>
              ) : (
                <div className="font-mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingTop: 40 }}>
                  {playState === 'loading' ? 'Loading session data...' : 'Press play to load session data, then switch to Raw Text to view.'}
                </div>
              )}
              {rawText && (
                <button
                  onClick={() => { navigator.clipboard.writeText(rawText); }}
                  className="font-mono"
                  style={{
                    position: 'sticky', bottom: 12, float: 'right',
                    fontSize: 9, padding: '5px 12px', borderRadius: 4,
                    background: 'rgba(88,166,255,0.15)', color: '#58a6ff',
                    border: '1px solid rgba(88,166,255,0.3)', cursor: 'pointer',
                  }}
                >COPY ALL</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SessionReplayRoute() {
  return (
    <ThemeProvider>
      <SessionReplayPage />
    </ThemeProvider>
  );
}
