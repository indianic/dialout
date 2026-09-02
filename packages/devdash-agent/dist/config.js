"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LOCAL_SERVER_URL = exports.DEFAULT_SERVER_URL = void 0;
exports.configDirFor = configDirFor;
exports.legacyConfigDirFor = legacyConfigDirFor;
exports.getConfigDir = getConfigDir;
exports.getPidFile = getPidFile;
exports.ensureConfigDir = ensureConfigDir;
exports.loadConfig = loadConfig;
exports.applyProfile = applyProfile;
exports.saveProfile = saveProfile;
exports.saveConfig = saveConfig;
exports.getConfigPath = getConfigPath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * Where the agent keeps config, logs, the pid file and the watchdog.
 *
 * `configDirFor` is parameterised on the home directory so the service
 * installer and its tests can resolve the same path for a home other than the
 * current user's.
 */
function configDirFor(homedir) {
    return path.join(homedir, '.dialout');
}
/** The pre-rename location, kept only so an existing install can be migrated. */
function legacyConfigDirFor(homedir) {
    return path.join(homedir, '.devdash-agent');
}
const CONFIG_DIR = configDirFor(os.homedir());
const LEGACY_CONFIG_DIR = legacyConfigDirFor(os.homedir());
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PID_FILE = path.join(CONFIG_DIR, 'daemon.pid');
exports.DEFAULT_SERVER_URL = 'wss://www.dialout.dev/ws';
exports.DEFAULT_LOCAL_SERVER_URL = 'ws://localhost:50052';
const DEFAULT_CONFIG = {
    serverUrl: exports.DEFAULT_SERVER_URL,
    apiKey: '',
    scanPorts: [3000, 3001, 4200, 5173, 5174, 8000, 8080, 8081, 9000],
    scanRange: { from: 3000, to: 9000 },
    heartbeatInterval: 30000,
    cronInterval: 5,
};
function getConfigDir() {
    return CONFIG_DIR;
}
function getPidFile() {
    return PID_FILE;
}
function ensureConfigDir() {
    if (fs.existsSync(CONFIG_DIR))
        return;
    // One-time migration from the pre-rename directory. This COPIES rather than
    // moves: an older agent may still be installed and running against the old
    // path, and pulling its config out from under a live process would break it
    // mid-flight. The old directory is left for the operator to delete once the
    // old agent is gone.
    if (fs.existsSync(LEGACY_CONFIG_DIR)) {
        try {
            fs.cpSync(LEGACY_CONFIG_DIR, CONFIG_DIR, { recursive: true });
            console.log(`\x1b[90mMigrated agent config ${LEGACY_CONFIG_DIR} -> ${CONFIG_DIR}\x1b[0m`);
            console.log(`\x1b[90mThe old directory was left in place; delete it once the old agent is removed.\x1b[0m`);
            return;
        }
        catch {
            // A failed copy must not stop the agent starting — fall through and
            // create an empty directory, which `init` can populate.
        }
    }
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
function loadConfig() {
    ensureConfigDir();
    if (!fs.existsSync(CONFIG_FILE)) {
        return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
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
function applyProfile(config, name) {
    const profile = name ? config.profiles?.[name] : undefined;
    if (!profile)
        return config;
    return { ...config, activeProfile: name, serverUrl: profile.serverUrl, apiKey: profile.apiKey };
}
// Create/update a profile; when makeActive the top-level connection values
// are synced to it so older agent builds still read the right server.
function saveProfile(name, profile, makeActive = true) {
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
function saveConfig(config) {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}
function getConfigPath() {
    return CONFIG_FILE;
}
//# sourceMappingURL=config.js.map