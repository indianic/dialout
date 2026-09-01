import path from 'path';
import { loadConfig } from './config';
import { connect, disconnect } from './websocket';
import { acquireSingleInstanceLock } from './single-instance';

// LaunchDaemons / systemd units start with a bare PATH (/usr/bin:/bin:...) that
// omits Homebrew and /usr/local/bin, so `tmux` resolves to ENOENT at boot even
// when installed — breaking cowork wrapping and live-session reporting. Ensure
// the common tool locations (and our own node dir) are on PATH before any child
// spawn, regardless of how the agent was launched. Existing entries keep their
// priority; we only append what's missing.
(() => {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', path.dirname(process.execPath)];
  const parts = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const seen = new Set(parts);
  for (const p of extra) if (p && !seen.has(p)) { parts.push(p); seen.add(p); }
  process.env.PATH = parts.join(path.delimiter);
})();

const config = loadConfig();

if (!config.serverUrl || !config.apiKey) {
  console.error('[devdash-agent] Not configured. Run: devdash-agent init');
  process.exit(1);
}

// Enforce one agent per server URL. A watchdog/service respawn or a stray
// manual start that lands while a healthy agent is already connected steps
// aside here instead of opening a second socket on the same key (which the
// server would drop with close 1006, flapping both). See single-instance.ts.
if (!acquireSingleInstanceLock(config.serverUrl)) {
  console.log(`[devdash-agent] Already running for ${config.serverUrl} — exiting (single instance).`);
  process.exit(0);
}

console.log(`[devdash-agent] Starting...`);
console.log(`[devdash-agent] Server: ${config.serverUrl}`);

connect(config, () => {
  console.log('[devdash-agent] Ready');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[devdash-agent] Shutting down...');
  disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[devdash-agent] Shutting down...');
  disconnect();
  process.exit(0);
});
