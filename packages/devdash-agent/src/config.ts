import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// A profile is one server connection target (URL + the API key that server
// issued). "remote" and "local" profiles coexist so any dev machine can
// switch between the live server and a localhost DevDash for testing.
export interface ProfileConfig {
  serverUrl: string;
  apiKey: string;
}

export interface AgentConfig {
  // Effective connection values — always mirror the active profile.
  serverUrl: string;
  apiKey: string;
  activeProfile?: string;
  profiles?: Record<string, ProfileConfig>;
  scanPorts: number[];
  scanRange: { from: number; to: number };
  heartbeatInterval: number;
  cronInterval: number; // minutes between watchdog checks (default 5)
  cowork?: boolean; // wrap browser shells in tmux + enumerate sessions
  /** Terminal-app tokens whose shells auto-wrap into tmux for remote access. */
  coworkTerminals?: string[];
}

const CONFIG_DIR = path.join(os.homedir(), '.devdash-agent');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PID_FILE = path.join(CONFIG_DIR, 'daemon.pid');

export const DEFAULT_SERVER_URL = 'wss://www.dialout.dev/ws';
export const DEFAULT_LOCAL_SERVER_URL = 'ws://localhost:50052';

const DEFAULT_CONFIG: AgentConfig = {
  serverUrl: DEFAULT_SERVER_URL,
  apiKey: '',
  scanPorts: [3000, 3001, 4200, 5173, 5174, 8000, 8080, 8081, 9000],
  scanRange: { from: 3000, to: 9000 },
  heartbeatInterval: 30000,
  cronInterval: 5,
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getPidFile(): string {
  return PID_FILE;
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): AgentConfig {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
  const config: AgentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };

  // Migrate pre-profile configs: lift top-level credentials into a
  // "remote" profile so local/remote setups can live side by side.
  if ((!config.profiles || Object.keys(config.profiles).length === 0) && config.serverUrl && config.apiKey) {
    config.profiles = { remote: { serverUrl: config.serverUrl, apiKey: config.apiKey } };
    config.activeProfile = config.activeProfile || 'remote';
  }

  // DEVDASH_AGENT_PROFILE overrides the active profile for this process
  // only (used by `start --profile <name>` and its forked daemon).
  const envProfile = process.env.DEVDASH_AGENT_PROFILE;
  return applyProfile(config, envProfile || config.activeProfile);
}

// Return the config with serverUrl/apiKey resolved from the named profile.
// Unknown/missing profile names leave the config untouched.
export function applyProfile(config: AgentConfig, name?: string): AgentConfig {
  const profile = name ? config.profiles?.[name] : undefined;
  if (!profile) return config;
  return { ...config, activeProfile: name, serverUrl: profile.serverUrl, apiKey: profile.apiKey };
}

// Create/update a profile; when makeActive the top-level connection values
// are synced to it so older agent builds still read the right server.
export function saveProfile(name: string, profile: ProfileConfig, makeActive = true): AgentConfig {
  const config = loadConfig();
  config.profiles = { ...(config.profiles || {}), [name]: profile };
  if (makeActive) {
    config.activeProfile = name;
    config.serverUrl = profile.serverUrl;
    config.apiKey = profile.apiKey;
  }
  saveConfig(config);
  return config;
}

export function saveConfig(config: AgentConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
