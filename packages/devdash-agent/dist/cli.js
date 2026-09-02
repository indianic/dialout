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
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const config_1 = require("./config");
const websocket_1 = require("./websocket");
const service_installer_1 = require("./service-installer");
const update_check_1 = require("./update-check");
const cowork_1 = require("./cowork");
const ssh_local_network_1 = require("./ssh-local-network");
const terminal_detect_1 = require("./terminal-detect");
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
const program = new commander_1.Command();
// Shared between `status` (reporting) and `repair` (which reuses the same
// wording when it re-checks after fixing the watchdog).
const supervisorLabel = {
    'launchd-agent': 'launchd (user agent, at login)',
    'launchd-daemon': 'launchd (system daemon, at boot)',
    'systemd-user': 'systemd (user unit, at login)',
    'systemd-system': 'systemd (system unit, at boot)',
    cron: 'cron watchdog',
};
program
    .name('dialout')
    .description(`Dialout Agent v${pkg.version} — connects your machine to the Dialout server

  Enables remote port scanning, browser-based terminal sessions,
  and filesystem browsing from the Dialout dashboard.

  Quick Start:
    $ dialout init                    # interactive setup (remote/local + API key)
    $ dialout start                   # run in foreground (Ctrl+C to stop)
    $ dialout start --daemon          # run in background
    $ dialout stop                    # stop background agent
    $ dialout restart                 # restart background agent
    $ dialout status                  # check agent & service status

  Profiles (local + remote configs side by side):
    $ dialout profiles                # list saved profiles
    $ dialout use local               # switch active profile
    $ dialout use remote              # switch back
    $ dialout start --profile local   # one-off run, active profile unchanged

  Service Management (auto-start on boot):
    $ dialout install-service         # install launchd (macOS) / systemd (Linux) service
    $ dialout uninstall-service       # remove OS service

  Watchdog (auto-restart if agent dies):
    $ dialout setup-cron              # install cron watchdog (default: every 5 min)
    $ dialout setup-cron -i 3         # check every 3 minutes
    $ dialout remove-cron             # remove cron watchdog
    $ dialout repair                  # fix a stale watchdog (e.g. after a package rename)

  Configuration:
    $ dialout config show             # print current config (API key masked)
    $ dialout config set <key> <val>  # set a config value
    $ dialout config path             # show config file path
    $ dialout config reset            # reset config to defaults (keeps API key)

  Updates:
    $ dialout update                  # update to latest version
    $ dialout --version               # show current version

  Config file: ~/.dialout/config.json
  Docs: https://www.dialout.dev/docs/agent`)
    .version(pkg.version);
// Helper: readline question
function createRL() {
    return readline.createInterface({ input: process.stdin, output: process.stdout });
}
function ask(rl, q) {
    return new Promise((resolve) => rl.question(q, resolve));
}
// Interactive arrow-key multi-select. Renders checklist.ts frames in raw mode.
// Returns the selected tokens, or null if the user cancels (Esc/q).
function promptChecklist(items) {
    const { moveCursor, toggleAt, toggleAll, selectedTokens, renderChecklist } = require('./checklist');
    const rl = require('readline');
    let state = { items, cursor: 0 };
    const legend = '  \x1b[2m↑/↓ move · Space toggle · a all · Enter confirm · Esc cancel\x1b[0m\n' +
        '  \x1b[2mSelected = wrapped in tmux for remote (Shift/Fn+drag to copy). Unselected = fully native.\x1b[0m\n\n';
    rl.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let prevLines = 0;
    const draw = () => {
        const frame = renderChecklist(state);
        if (prevLines > 0)
            process.stdout.write(`\x1b[${prevLines}A`); // up N
        process.stdout.write('\x1b[0J'); // clear to end of screen
        process.stdout.write(frame + '\n');
        prevLines = frame.split('\n').length;
    };
    process.stdout.write(legend);
    draw();
    return new Promise((resolve) => {
        const onKey = (_s, key) => {
            if (!key)
                return;
            if (key.ctrl && key.name === 'c') {
                cleanup();
                process.exit(130);
            }
            if (key.name === 'up')
                state = moveCursor(state, -1);
            else if (key.name === 'down')
                state = moveCursor(state, 1);
            else if (key.name === 'space')
                state = toggleAt(state);
            else if (key.name === 'a')
                state = toggleAll(state);
            else if (key.name === 'return')
                return finish(selectedTokens(state));
            else if (key.name === 'escape' || key.name === 'q')
                return finish(null);
            else
                return;
            draw();
        };
        const cleanup = () => {
            process.stdin.off('keypress', onKey);
            if (process.stdin.isTTY)
                process.stdin.setRawMode(false);
            process.stdin.pause();
        };
        const finish = (result) => {
            cleanup();
            process.stdout.write('\n');
            resolve(result);
        };
        process.stdin.on('keypress', onKey);
    });
}
// Helper: validate API key against the server
async function validateApiKey(serverUrl, apiKey) {
    return new Promise((resolve) => {
        try {
            // Convert wss:// to https:// for the validation endpoint
            const httpUrl = serverUrl
                .replace(/^wss:\/\//, 'https://')
                .replace(/^ws:\/\//, 'http://')
                .replace(/\/ws\/?$/, '');
            const url = `${httpUrl}/api/machines?userId=0`;
            const mod = httpUrl.startsWith('https') ? https : http;
            const req = mod.get(url, {
                headers: { 'X-API-Key': apiKey },
                timeout: 8000,
            }, (res) => {
                // The server doesn't validate API key on this endpoint directly,
                // but we can test WebSocket connectivity by attempting a connection
                resolve({ valid: true });
            });
            req.on('error', (err) => {
                resolve({ valid: false, error: `Cannot reach server: ${err.message}` });
            });
            req.on('timeout', () => {
                req.destroy();
                resolve({ valid: false, error: 'Server connection timed out' });
            });
        }
        catch (err) {
            resolve({ valid: false, error: err.message });
        }
    });
}
// Helper: validate key via WebSocket handshake (most reliable)
async function validateKeyViaWS(serverUrl, apiKey) {
    return new Promise((resolve) => {
        try {
            const WebSocket = require('ws');
            const url = serverUrl.replace(/\/$/, '') + '/daemon';
            const ws = new WebSocket(url, { headers: { 'X-API-Key': apiKey } });
            const timeout = setTimeout(() => {
                ws.close();
                resolve({ valid: false, error: 'Connection timed out' });
            }, 8000);
            ws.on('open', () => {
                // Connected — wait briefly for auth response
            });
            ws.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    if (msg.type === 'auth_ok') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({ valid: true });
                    }
                    else if (msg.type === 'auth_error' || msg.type === 'error') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve({ valid: false, error: msg.error || 'Invalid API key' });
                    }
                }
                catch { }
            });
            ws.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 4001 || code === 4003) {
                    resolve({ valid: false, error: 'Invalid API key — check your key and try again' });
                }
                // If we haven't resolved yet, connection closed unexpectedly
            });
            ws.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ valid: false, error: `Connection failed: ${err.message}` });
            });
        }
        catch (err) {
            resolve({ valid: false, error: err.message });
        }
    });
}
// --- init ---
program
    .command('init')
    .description('Configure the agent with server URL and API key (interactive)')
    .addHelpText('after', `
  Steps:
    1. Go to Dialout web UI → MACHINES tab → click GENERATE KEY
    2. Copy the API key (shown only once)
    3. Run this command and paste the server URL + API key

  Example:
    $ dialout init
    Server URL [wss://www.dialout.dev/ws]:
    API Key: mch_K27F43P1HcN8AIO3EDHwkKvgZl5hkV1t`)
    .action(async () => {
    const rl = createRL();
    const config = (0, config_1.loadConfig)();
    console.log('');
    console.log('\x1b[1mDialout Agent Setup\x1b[0m');
    console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
    console.log('');
    // Step 1: Which server? Saved as a named profile so local and remote
    // configs coexist — switch anytime with "dialout use <profile>".
    // Work out what "Remote" will actually default to BEFORE drawing the menu.
    // Printing DEFAULT_SERVER_URL on the menu line and then defaulting the next
    // prompt to a different saved URL is how someone ends up validating a key
    // for one server against another and getting an unexplained 401.
    const savedRemote = config.profiles?.remote?.serverUrl;
    // A localhost URL saved in the "remote" profile is leftover from local
    // testing — choosing Remote must always default to a real remote server.
    const remoteDefault = savedRemote && !/^wss?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(savedRemote)
        ? savedRemote
        : config_1.DEFAULT_SERVER_URL;
    const remoteIsSaved = remoteDefault !== config_1.DEFAULT_SERVER_URL;
    console.log('\x1b[1mWhere should this agent connect?\x1b[0m');
    console.log('');
    console.log(`  \x1b[36m1)\x1b[0m Remote server — ${remoteDefault}` +
        (remoteIsSaved ? ' \x1b[90m(saved)\x1b[0m' : ''));
    if (remoteIsSaved) {
        console.log(`     \x1b[90mthis build ships with ${config_1.DEFAULT_SERVER_URL} — pick 3 to switch\x1b[0m`);
    }
    console.log(`  \x1b[36m2)\x1b[0m Local dev     — ${config_1.DEFAULT_LOCAL_SERVER_URL} (Dialout running on this machine)`);
    console.log('  \x1b[36m3)\x1b[0m Custom URL');
    console.log('');
    const target = (await ask(rl, 'Choose [1-3, default 1]: ')).trim();
    let profileName;
    let defaultUrl;
    if (target === '2') {
        profileName = 'local';
        defaultUrl = config.profiles?.local?.serverUrl || config_1.DEFAULT_LOCAL_SERVER_URL;
    }
    else if (target === '3') {
        profileName = (await ask(rl, `Profile name [\x1b[36mcustom\x1b[0m]: `)).trim() || 'custom';
        defaultUrl = config.profiles?.[profileName]?.serverUrl || config.serverUrl || config_1.DEFAULT_SERVER_URL;
    }
    else {
        profileName = 'remote';
        defaultUrl = remoteDefault;
    }
    const serverUrlInput = await ask(rl, `Server URL [\x1b[36m${defaultUrl}\x1b[0m]: `);
    const serverUrl = (serverUrlInput.trim() || defaultUrl).replace(/\/$/, '');
    // Step 2: API Key (per profile — a local server issues different keys
    // than the remote one)
    const existingKey = config.profiles?.[profileName]?.apiKey || '';
    const keyPrompt = existingKey
        ? `API Key [\x1b[90m****${existingKey.slice(-4)}\x1b[0m]: `
        : 'API Key: ';
    const apiKeyInput = (await ask(rl, keyPrompt)).trim();
    const apiKey = apiKeyInput || existingKey;
    if (!apiKey) {
        console.error('\n\x1b[31mAPI key is required.\x1b[0m');
        console.error('Generate one at: Dialout → MACHINES tab → GENERATE KEY');
        rl.close();
        process.exit(1);
    }
    // Step 3: Validate key
    console.log('\n\x1b[90mValidating API key...\x1b[0m');
    const result = await validateKeyViaWS(serverUrl, apiKey);
    if (!result.valid) {
        console.error(`\x1b[31mValidation failed: ${result.error}\x1b[0m`);
        // A 401 here means the key is not registered on THIS server — not that
        // the agent is misconfigured. It is almost always a key issued by one
        // server being offered to another, so name the server that refused it
        // rather than leaving the reader to guess from a bare status code.
        if (/\b401\b/.test(result.error || '')) {
            console.error('');
            console.error(`  The server at \x1b[36m${serverUrl}\x1b[0m does not recognise that key.`);
            console.error('  Keys are issued per server, so a key from one Dialout server is');
            console.error('  rejected by another. Check you are pointing at the right one, and');
            console.error('  generate a key there under Settings → Machines.');
        }
        console.error('');
        const retry = await ask(rl, 'Save config anyway? (y/N): ');
        if (retry.toLowerCase() !== 'y') {
            rl.close();
            process.exit(1);
        }
    }
    else {
        console.log('\x1b[32mAPI key validated successfully!\x1b[0m');
    }
    const saved = (0, config_1.saveProfile)(profileName, { serverUrl, apiKey });
    Object.assign(config, saved);
    console.log(`\nSaved profile \x1b[36m${profileName}\x1b[0m (now active) → ${serverUrl}`);
    console.log(`Config file: ${(0, config_1.getConfigPath)()}`);
    const otherProfiles = Object.keys(saved.profiles || {}).filter((n) => n !== profileName);
    if (otherProfiles.length > 0) {
        console.log(`Switch anytime: dialout use ${otherProfiles[0]}`);
    }
    // Step 4: Ask how to start
    console.log('');
    console.log('\x1b[1mHow would you like to run the agent?\x1b[0m');
    console.log('');
    console.log('  \x1b[36m1)\x1b[0m Foreground    — run now in this terminal (for testing)');
    console.log('  \x1b[36m2)\x1b[0m Service       — start automatically (launchd/systemd; asks boot vs login)');
    console.log('  \x1b[36m3)\x1b[0m Cron Watchdog — auto-restart if it dies (cron job)');
    console.log('  \x1b[36m4)\x1b[0m Skip          — configure later');
    console.log('');
    const choice = await ask(rl, 'Choose [1-4]: ');
    // Closed here because every branch below opens its own reader when it
    // needs one; leaving this one open would keep the process alive.
    rl.close();
    switch (choice.trim()) {
        case '1':
            console.log('\n\x1b[90mStarting in foreground (Ctrl+C to stop)...\x1b[0m\n');
            (0, websocket_1.connect)(config, () => {
                console.log('[dialout] Connected and ready.');
            });
            process.on('SIGINT', () => { (0, websocket_1.disconnect)(); process.exit(0); });
            process.on('SIGTERM', () => { (0, websocket_1.disconnect)(); process.exit(0); });
            break;
        case '2': {
            // Same decision, and the same follow-up, as `install-service`.
            const system = await chooseServiceScope();
            (0, service_installer_1.installService)({ system });
            applySshLocalNetworkWorkaround();
            // Check if cron should also be set up
            if (!(0, service_installer_1.isCronInstalled)()) {
                console.log('\n\x1b[33mTip:\x1b[0m Add a cron watchdog for extra reliability:');
                console.log('  dialout setup-cron');
            }
            break;
        }
        case '3': {
            const intervalStr = await (async () => {
                const rl2 = createRL();
                const v = await ask(rl2, `Check interval in minutes [\x1b[36m5\x1b[0m]: `);
                rl2.close();
                return v;
            })();
            const interval = parseInt(intervalStr, 10) || config.cronInterval || 5;
            config.cronInterval = interval;
            (0, config_1.saveConfig)(config);
            // Start daemon first
            const { fork } = require('child_process');
            const child = fork(path.resolve(__dirname, 'index.js'), [], {
                detached: true,
                stdio: 'ignore',
            });
            child.unref();
            const pidFile = (0, config_1.getPidFile)();
            fs.writeFileSync(pidFile, String(child.pid));
            console.log(`\nAgent started in background (PID: ${child.pid})`);
            // Install cron
            (0, service_installer_1.installCron)(interval);
            break;
        }
        case '4':
        default:
            console.log('\nRun "dialout start" when ready.');
            break;
    }
});
/**
 * Decide whether a service install is a boot service or a per-user one.
 *
 * Shared by `init` and `install-service` on purpose. They used to disagree:
 * `init` offered "Service — auto-start on boot" and then called
 * installService() with no arguments, which installs the per-user LaunchAgent
 * that only starts at LOGIN. Someone following the first-run prompt got a
 * weaker service than the one they were promised, and only found out by
 * rebooting and noticing the agent was not there.
 */
async function chooseServiceScope() {
    if (process.platform === 'linux' && (0, service_installer_1.defaultLinuxScope)() === 'system') {
        // Root on Linux: no password to pay and nothing to weigh.
        console.log('Running as root — installing the boot service (starts at boot, survives logout).');
        console.log('Use --login for a per-user service instead.\n');
        return true;
    }
    if (!process.stdin.isTTY) {
        // Non-interactive: the per-user service is the only one installable
        // without a password.
        return false;
    }
    const rl = createRL();
    const answer = await ask(rl, 'Start the agent at boot, before you log in? Requires admin password. [y/N]: ');
    rl.close();
    const system = /^y(es)?$/i.test(answer.trim());
    if (!system && process.platform === 'linux') {
        console.log('Installing the per-user service — lingering will be enabled so it survives logout.');
    }
    return system;
}
// --- profiles ---
program
    .command('profiles')
    .description('List saved connection profiles (local/remote/…)')
    .action(() => {
    const config = (0, config_1.loadConfig)();
    const names = Object.keys(config.profiles || {});
    if (names.length === 0) {
        console.log('No profiles saved yet. Run: dialout init');
        return;
    }
    console.log('');
    console.log('Connection Profiles');
    console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
    for (const name of names) {
        const p = config.profiles[name];
        const active = name === config.activeProfile;
        const marker = active ? '\x1b[32m●\x1b[0m' : ' ';
        console.log(`  ${marker} ${name.padEnd(10)} ${p.serverUrl}  \x1b[90m(key ****${p.apiKey.slice(-4)})\x1b[0m${active ? '  \x1b[32mactive\x1b[0m' : ''}`);
    }
    console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
    console.log('Switch with: dialout use <name>');
    console.log('');
});
// --- use ---
program
    .command('use <profile>')
    .description('Switch the active connection profile (e.g. local, remote)')
    .addHelpText('after', `
  Examples:
    $ dialout use local          # point the agent at your local Dialout
    $ dialout use remote         # point it back at the live server
    $ dialout restart            # apply to a running background agent`)
    .action((name) => {
    const config = (0, config_1.loadConfig)();
    const profile = config.profiles?.[name];
    if (!profile) {
        const names = Object.keys(config.profiles || {});
        console.error(`Unknown profile: ${name}`);
        console.error(names.length ? `Available: ${names.join(', ')}` : 'No profiles yet — run: dialout init');
        process.exit(1);
    }
    (0, config_1.saveProfile)(name, profile, true);
    console.log(`Active profile: \x1b[36m${name}\x1b[0m → ${profile.serverUrl}`);
    console.log('If the agent is running, apply with: dialout restart');
});
// --- start ---
program
    .command('start')
    .description('Start the agent and connect to the Dialout server')
    .option('--daemon', 'Run in background (fork process, survives terminal close)')
    .option('--profile <name>', 'Use a saved profile for this run only (active profile unchanged)')
    .addHelpText('after', `
  Modes:
    dialout start           Foreground — logs to terminal, Ctrl+C to stop
    dialout start --daemon  Background — forks process, use "stop" to end
    dialout install-service Permanent  — auto-starts on boot (launchd/systemd)
    dialout setup-cron      Watchdog   — cron checks every N minutes, restarts if dead

  Examples:
    $ dialout start                    # test connection in foreground
    $ dialout start --profile local    # one-off run against local Dialout
    $ dialout start --daemon           # run in background for this session
    $ dialout stop                     # stop background agent`)
    .action(async (opts) => {
    await (0, update_check_1.checkForUpdate)();
    let config = (0, config_1.loadConfig)();
    if (opts.profile) {
        if (!config.profiles?.[opts.profile]) {
            console.error(`Unknown profile: ${opts.profile}`);
            console.error(`Available: ${Object.keys(config.profiles || {}).join(', ') || '(none — run: dialout init)'}`);
            process.exit(1);
        }
        config = (0, config_1.applyProfile)(config, opts.profile);
        console.log(`[dialout] Using profile "${opts.profile}" → ${config.serverUrl}`);
    }
    if (!config.serverUrl || !config.apiKey) {
        console.error('Not configured. Run: dialout init');
        process.exit(1);
    }
    if (opts.daemon) {
        const { fork } = require('child_process');
        const child = fork(path.resolve(__dirname, 'index.js'), [], {
            detached: true,
            stdio: 'ignore',
            env: opts.profile
                ? { ...process.env, DEVDASH_AGENT_PROFILE: opts.profile }
                : process.env,
        });
        child.unref();
        const pidFile = (0, config_1.getPidFile)();
        fs.writeFileSync(pidFile, String(child.pid));
        // Verify before claiming. The child exits within milliseconds when
        // another supervisor (a systemd/launchd service, another daemon) already
        // holds the single-instance lock for this server URL — and its stdio is
        // 'ignore', so the "Already running — exiting" line it prints goes
        // nowhere. Reporting the fork's pid unconditionally announced success
        // for a process that was already dead, which reads as "the daemon keeps
        // dying" rather than "something else is already running it".
        await new Promise((resolve) => setTimeout(resolve, 900));
        const stillAlive = (() => {
            try {
                process.kill(child.pid, 0);
                return true;
            }
            catch {
                return false;
            }
        })();
        if (!stillAlive) {
            try {
                fs.unlinkSync(pidFile);
            }
            catch { }
            console.error('\x1b[33mThe agent exited immediately.\x1b[0m');
            console.error('Usually this means another supervisor is already running it for this server URL.');
            console.error('Check what is running:  dialout status');
            process.exit(1);
        }
        console.log(`Agent started in background (PID: ${child.pid})`);
        console.log('Stop with: dialout stop');
        // Suggest cron if not installed
        if (!(0, service_installer_1.isCronInstalled)() && !(0, service_installer_1.isServiceInstalled)()) {
            console.log('\n\x1b[33mTip:\x1b[0m Set up auto-restart with: dialout setup-cron');
        }
        process.exit(0);
    }
    // Foreground mode
    console.log('[dialout] Starting in foreground (Ctrl+C to stop)...');
    (0, websocket_1.connect)(config, () => {
        console.log('[dialout] Connected and ready.');
    });
    process.on('SIGINT', () => {
        console.log('\n[dialout] Stopping...');
        (0, websocket_1.disconnect)();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        (0, websocket_1.disconnect)();
        process.exit(0);
    });
});
// --- stop ---
program
    .command('stop')
    .description('Stop the background agent (started with --daemon)')
    .addHelpText('after', `
  Stops the agent that was started with "dialout start --daemon".
  Has no effect on service-installed agents — use uninstall-service for those.`)
    .action(() => {
    const pidFile = (0, config_1.getPidFile)();
    if (!fs.existsSync(pidFile)) {
        console.log('No running agent found.');
        console.log('If running as service: dialout uninstall-service');
        return;
    }
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    try {
        process.kill(pid, 'SIGTERM');
        console.log(`Agent stopped (PID: ${pid})`);
    }
    catch (err) {
        if (err.code === 'ESRCH') {
            console.log('Agent is not running (stale PID file removed).');
        }
        else {
            console.error('Failed to stop agent:', err.message);
        }
    }
    fs.unlinkSync(pidFile);
});
// --- restart ---
program
    .command('restart')
    .description('Restart the background agent (stop + start --daemon)')
    .addHelpText('after', `
  Convenience command that stops any running daemon and starts a fresh one.
  Equivalent to running "dialout stop && dialout start --daemon".

  Examples:
    $ dialout restart            # restart background agent
    $ dialout status             # verify it's running`)
    .action(async () => {
    await (0, update_check_1.checkForUpdate)();
    const config = (0, config_1.loadConfig)();
    if (!config.serverUrl || !config.apiKey) {
        console.error('Not configured. Run: dialout init');
        process.exit(1);
    }
    // Stop existing daemon if running
    const pidFile = (0, config_1.getPidFile)();
    if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
        try {
            process.kill(pid, 'SIGTERM');
            console.log(`Stopped previous agent (PID: ${pid})`);
        }
        catch (err) {
            if (err.code !== 'ESRCH') {
                console.error('Failed to stop agent:', err.message);
            }
        }
        fs.unlinkSync(pidFile);
    }
    // Start new daemon
    const { fork } = require('child_process');
    const child = fork(path.resolve(__dirname, 'index.js'), [], {
        detached: true,
        stdio: 'ignore',
    });
    child.unref();
    fs.writeFileSync(pidFile, String(child.pid));
    console.log(`Agent restarted in background (PID: ${child.pid})`);
    process.exit(0);
});
// --- status ---
program
    .command('status')
    .description('Show agent connection status, config, and service state')
    .addHelpText('after', `
  Shows: server URL, API key (masked), config path, service state, cron state, process state.`)
    .action(() => {
    const config = (0, config_1.loadConfig)();
    const pidFile = (0, config_1.getPidFile)();
    const svc = (0, service_installer_1.getServiceStatus)();
    const cronInstalled = (0, service_installer_1.isCronInstalled)();
    const kindLabel = {
        'launchd-agent': 'launchd, at login',
        'launchd-daemon': 'launchd, at boot',
        'systemd-user': 'systemd, at login',
        'systemd-system': 'systemd, at boot',
    };
    console.log('');
    console.log('Dialout Agent Status');
    console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
    const profileNames = Object.keys(config.profiles || {});
    console.log(`  Profile:   ${config.activeProfile ? `\x1b[36m${config.activeProfile}\x1b[0m` : '(none)'}${profileNames.length > 1 ? ` \x1b[90m(saved: ${profileNames.join(', ')})\x1b[0m` : ''}`);
    console.log(`  Server:    ${config.serverUrl || '(not configured)'}`);
    console.log(`  API Key:   ${config.apiKey ? '****' + config.apiKey.slice(-4) : '(not set)'}`);
    console.log(`  Config:    ${(0, config_1.getConfigPath)()}`);
    console.log(`  Service:   ${svc.installed ? `\x1b[32minstalled\x1b[0m${svc.kind ? ` (${kindLabel[svc.kind]})` : ''}` : 'not installed'}`);
    console.log(`  Cron:      ${cronInstalled ? `\x1b[32minstalled\x1b[0m (every ${config.cronInterval || 5} min)` : 'not installed'}`);
    // Every supervisor that could be launching this agent, not just the
    // first match (getServiceStatus()/isServiceInstalled() intentionally
    // stop at the first one). Detection only — this never stops a unit,
    // kills a process, or edits the crontab.
    const supervisors = (0, service_installer_1.listSupervisors)();
    if (supervisors.length > 1) {
        console.log('');
        console.log('\x1b[33m  ⚠ Multiple supervisors are managing this agent:\x1b[0m');
        for (const s of supervisors) {
            // "running" means a live process was found for launchd/systemd
            // (svc.pid !== null); cron has no live process of its own to
            // probe — it's a scheduled trigger, not a fourth daemon — so it
            // gets its own word instead of borrowing "running"/"not running"
            // and implying it's an active process racing the others.
            const state = s.kind === 'cron'
                ? `scheduled (fires every ${config.cronInterval || 5} min)`
                : (s.pid !== null ? `running (PID ${s.pid})` : (s.running ? 'running' : 'not running'));
            console.log(`\x1b[33m    - ${supervisorLabel[s.kind]}: ${s.path} — ${state}${s.stale ? ' [STALE]' : ''}\x1b[0m`);
        }
        console.log('\x1b[33m    More than one supervisor causes the connect/disconnect (1006) flapping you may be seeing —\x1b[0m');
        console.log('\x1b[33m    the single-instance lock will keep only one process alive and make all the others exit.\x1b[0m');
    }
    // A systemd user unit without lingering is a time bomb that `status`
    // used to report as a healthy installed service: systemd-logind stops
    // user@<uid>.service when the last session ends, so the agent dies on
    // every logout and silently returns on the next login. Nothing else in
    // this output would ever hint at it.
    if (process.platform === 'linux' && supervisors.some((s) => s.kind === 'systemd-user')) {
        const user = os.userInfo().username;
        if (!(0, service_installer_1.isLingerEnabled)(user)) {
            console.log('');
            console.log('\x1b[33m  ⚠ Installed as a systemd USER unit with lingering OFF.\x1b[0m');
            console.log('\x1b[33m    systemd stops it when your last session ends — the agent dies every time you log out\x1b[0m');
            console.log('\x1b[33m    and only comes back when you log in again.\x1b[0m');
            console.log(`\x1b[33m    Fix:  sudo loginctl enable-linger ${user}\x1b[0m`);
            console.log('\x1b[33m    Or:   dialout install-service --system   (runs at boot, in system.slice)\x1b[0m');
        }
    }
    for (const s of supervisors.filter((s) => s.stale)) {
        console.log('');
        for (const line of (0, service_installer_1.staleSupervisorAdvice)(s)) {
            console.log(`\x1b[33m${line}\x1b[0m`);
        }
    }
    if (svc.installed) {
        // The service manager (launchd/systemd) owns the process — ask it, not the pidfile.
        if (svc.running) {
            console.log(`  Process:   \x1b[32mrunning\x1b[0m (PID: ${svc.pid}, managed by ${svc.kind?.startsWith('launchd') ? 'launchd' : 'systemd'})`);
        }
        else {
            console.log(`  Process:   \x1b[31mnot running\x1b[0m (service installed but stopped — check logs in ~/.dialout/logs)`);
        }
    }
    else if (fs.existsSync(pidFile)) {
        // Manual background mode (dialout start --daemon)
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
        try {
            process.kill(pid, 0);
            console.log(`  Process:   \x1b[32mrunning\x1b[0m (PID: ${pid}, background)`);
        }
        catch {
            console.log(`  Process:   not running (stale PID)`);
        }
    }
    else {
        console.log(`  Process:   not running`);
    }
    console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
    console.log('');
});
// On macOS the tmux server is the process Local Network Privacy judges, so
// every tmux session on the machine — including ones the user opens from their
// own terminal app — is denied LAN access and cannot ssh to a local git remote
// (the measured long form is in ssh-local-network.ts). Installing the service
// is the moment the machine starts hosting tmux sessions, so it is also the
// moment to install the ssh_config default that works around it.
function applySshLocalNetworkWorkaround() {
    if (!(0, ssh_local_network_1.sshLocalNetworkApplies)())
        return;
    const target = (0, ssh_local_network_1.defaultSshConfigPath)();
    try {
        const result = (0, ssh_local_network_1.installSshLocalNetworkBlock)(target);
        // 'skipped-existing' means their own ConnectTimeout already wins;
        // 'updated' means the block was already there. Neither is news.
        if (result === 'skipped-existing' || result === 'updated')
            return;
        console.log(`  ssh: added a ConnectTimeout default to ${target}`);
        console.log('       (macOS denies local-network access to the tmux server, so without this');
        console.log('        git/ssh to a LAN host fails inside every tmux session on this machine.');
        console.log('        To fix it properly, allow tmux under System Settings >');
        console.log('        Privacy & Security > Local Network.)');
    }
    catch (err) {
        // Never fail an install over this — the service itself is still fine.
        console.log(`  ssh: could not update ${target} (${err.message})`);
    }
}
function removeSshLocalNetworkWorkaround() {
    const target = (0, ssh_local_network_1.defaultSshConfigPath)();
    try {
        if (!fs.existsSync(target))
            return;
        const before = fs.readFileSync(target, 'utf-8');
        const after = (0, ssh_local_network_1.removeSshLocalNetworkBlock)(before);
        if (after === before)
            return;
        fs.writeFileSync(target, after);
        console.log(`  ssh: removed the ConnectTimeout block from ${target}`);
    }
    catch {
        // Best effort — a leftover block is harmless.
    }
}
// --- install-service ---
program
    .command('install-service')
    .description('Install as OS service — auto-starts on login (or boot with --system)')
    .option('--system', 'Run at boot, before login (LaunchDaemon / systemd system unit; needs sudo)')
    .option('--login', 'Per-user service that starts at login (skip the interactive prompt)')
    .addHelpText('after', `
  Installs the agent as a system service so it starts automatically.

  Default (per-user, starts at LOGIN):
    macOS  — LaunchAgent at ~/Library/LaunchAgents/com.dialout.agent.plist
    Linux  — systemd user service at ~/.config/systemd/user/dialout.service

  --system (starts at BOOT, before anyone logs in — requires sudo):
    macOS  — LaunchDaemon at /Library/LaunchDaemons/com.dialout.agent.plist
    Linux  — systemd system unit at /etc/systemd/system/dialout.service

  Must run "dialout init" first to configure server URL and API key.

  With no flag on an interactive terminal, it asks whether to start at boot
  (sudo) or at login.

  Examples:
    $ dialout install-service            # ask: boot or login
    $ dialout install-service --system   # start at boot (prompts for sudo)
    $ dialout install-service --login     # start at login, no prompt

  To remove: dialout uninstall-service`)
    .action(async (opts) => {
    const config = (0, config_1.loadConfig)();
    if (!config.serverUrl || !config.apiKey) {
        console.error('Not configured. Run "dialout init" first.');
        process.exit(1);
    }
    // Explicit flags win; otherwise the same decision `init` makes, from the
    // same helper, so the two prompts cannot drift apart again.
    const system = opts.system ? true : opts.login ? false : await chooseServiceScope();
    (0, service_installer_1.installService)({ system });
    applySshLocalNetworkWorkaround();
    process.exit(0);
});
// --- uninstall-service ---
program
    .command('uninstall-service')
    .description('Remove OS service — stops auto-start on boot')
    .addHelpText('after', `
  Removes the service installed by "install-service".
  The agent will no longer start automatically on login/boot.

  A boot service (install-service --system) is owned by root, so this may
  prompt for your password — the same way installing it did.

  This removes the SERVICE only. If a cron watchdog or a manual daemon is also
  running the agent, it keeps running; the command says so and names the fix.`)
    .action(() => {
    const result = (0, service_installer_1.uninstallService)();
    // Exiting 0 after removing nothing is what made this look like it worked
    // while the daemon kept running. Fail loudly instead.
    if (result.pending.length > 0) {
        console.error('\n\x1b[31mService NOT removed.\x1b[0m Run the commands above, then: dialout status');
        process.exitCode = 1;
        return;
    }
    removeSshLocalNetworkWorkaround();
    if (!result.removed)
        return;
    // The service is gone, but it is not the only thing that can start the
    // agent. Point at the leftovers rather than letting `status` surprise them.
    const leftovers = (0, service_installer_1.listSupervisors)().filter((s) => s.kind === 'cron');
    if (leftovers.length > 0) {
        console.log('\n\x1b[33mA cron watchdog is still installed and will restart the agent.\x1b[0m');
        console.log('  Remove it with: dialout remove-cron');
    }
    if (fs.existsSync((0, config_1.getPidFile)())) {
        const pid = parseInt(fs.readFileSync((0, config_1.getPidFile)(), 'utf-8').trim(), 10);
        let alive = false;
        try {
            process.kill(pid, 0);
            alive = true;
        }
        catch { /* stale */ }
        if (alive) {
            console.log(`\n\x1b[33mA manually started agent is still running (PID ${pid}).\x1b[0m`);
            console.log('  Stop it with: dialout stop');
        }
    }
});
// --- setup-cron ---
program
    .command('setup-cron')
    .description('Install cron watchdog — auto-restarts agent if it dies')
    .option('-i, --interval <minutes>', 'Check interval in minutes (default: 5)', '5')
    .addHelpText('after', `
  Creates a cron job that checks if the agent is running every N minutes.
  If the agent is dead, the watchdog restarts it automatically.

  The default interval is 5 minutes. You can customize it:
    $ dialout setup-cron                # every 5 minutes (default)
    $ dialout setup-cron -i 3           # every 3 minutes
    $ dialout setup-cron --interval 10  # every 10 minutes

  To remove: dialout remove-cron`)
    .action((opts) => {
    const config = (0, config_1.loadConfig)();
    if (!config.serverUrl || !config.apiKey) {
        console.error('Not configured. Run "dialout init" first.');
        process.exit(1);
    }
    // A launchd/systemd service already supervises the agent and auto-restarts
    // it on death. Adding a cron watchdog on top means TWO independent
    // supervisors — the exact configuration that used to spawn duplicate
    // daemons (the service's process isn't tracked in daemon.pid, so the
    // watchdog thinks nothing is running and forks a second one). Refuse.
    const svc = (0, service_installer_1.getServiceStatus)();
    if (svc.installed) {
        console.log('An OS service is already installed — it auto-restarts the agent on its own.');
        console.log('A cron watchdog would be a second, conflicting supervisor, so this is a no-op.');
        console.log('To use cron instead, run: dialout uninstall-service first.');
        process.exit(0);
    }
    const interval = parseInt(opts.interval, 10) || 5;
    config.cronInterval = interval;
    (0, config_1.saveConfig)(config);
    // Start daemon if not running. (Even if a duplicate slips through here, the
    // agent's per-URL single-instance lock makes the extra process exit at once.)
    const pidFile = (0, config_1.getPidFile)();
    let isRunning = false;
    if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
        try {
            process.kill(pid, 0);
            isRunning = true;
        }
        catch { }
    }
    if (!isRunning) {
        const { fork } = require('child_process');
        const child = fork(path.resolve(__dirname, 'index.js'), [], {
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        fs.writeFileSync(pidFile, String(child.pid));
        console.log(`Agent started in background (PID: ${child.pid})`);
    }
    (0, service_installer_1.installCron)(interval);
    process.exit(0);
});
// --- remove-cron ---
program
    .command('remove-cron')
    .description('Remove cron watchdog — stops auto-restart')
    .addHelpText('after', `
  Removes the cron job installed by "setup-cron".
  The agent will no longer auto-restart if it dies.
  Note: this does NOT stop the currently running agent.`)
    .action(() => {
    (0, service_installer_1.uninstallCron)();
});
// --- repair ---
program
    .command('repair')
    .description('Rewrite a stale cron watchdog left by an old install/rename')
    .addHelpText('after', `
  Fixes exactly one thing: a cron watchdog (~/.dialout/watchdog.sh)
  whose SCRIPT= line still points at an old, renamed, or uninstalled
  package build — a machine can end up resurrecting a deprecated version
  every few minutes, fighting the real daemon for the same registration.

  Repair rewrites ONLY that path. It never deletes a unit file, kills a
  process, or edits the crontab. When more than one supervisor (launchd /
  systemd / cron) is managing this agent, repair explains what to remove
  and stops there — it does not choose for you.

  Examples:
    $ dialout repair
    $ dialout status              # see current supervisor state`)
    .action(() => {
    let repairResult;
    try {
        repairResult = (0, service_installer_1.repairWatchdog)();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log('');
        console.log('Dialout Agent Repair');
        console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
        console.log(`\x1b[31m  ✗ Could not repair the watchdog: ${message}\x1b[0m`);
        console.log('    Nothing was changed. Check that ~/.dialout/watchdog.sh is a regular,');
        console.log('    readable file you have permission to modify, then try again.');
        console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
        console.log('');
        process.exitCode = 1;
        return;
    }
    const { repaired, from, to } = repairResult;
    console.log('');
    console.log('Dialout Agent Repair');
    console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
    if (repaired) {
        console.log('\x1b[32m  ✓ Rewrote stale watchdog:\x1b[0m ~/.dialout/watchdog.sh');
        console.log(`    from: ${from}`);
        console.log(`    to:   ${to}`);
        console.log('    (previous version backed up alongside it as watchdog.sh.bak-<timestamp>)');
    }
    else {
        console.log('  Watchdog check: \x1b[32mnothing to repair\x1b[0m (absent, or SCRIPT= already correct).');
    }
    // Detection only, same as `status` — repair never removes a supervisor
    // itself (Constraint 3). This just re-reports the full picture after
    // fixing the one thing it's safe to fix automatically.
    const supervisors = (0, service_installer_1.listSupervisors)();
    const staleRemaining = supervisors.filter((s) => s.stale);
    if (supervisors.length > 1) {
        console.log('');
        console.log('\x1b[33m  ⚠ Multiple supervisors are managing this agent:\x1b[0m');
        for (const s of supervisors) {
            const state = s.kind === 'cron'
                ? 'scheduled watchdog'
                : (s.pid !== null ? `running (PID ${s.pid})` : (s.running ? 'running' : 'not running'));
            console.log(`\x1b[33m    - ${supervisorLabel[s.kind]}: ${s.path} — ${state}${s.stale ? ' [STALE]' : ''}\x1b[0m`);
        }
        console.log('\x1b[33m  Repair only fixes the watchdog\x27s SCRIPT= path — it does not remove a supervisor you may still depend on.\x1b[0m');
        // A remaining stale unit needs its own fix command — "repair" cannot
        // touch it, and this listing alone would otherwise leave the operator
        // with a [STALE] tag and no next step for that specific supervisor.
        for (const s of staleRemaining) {
            console.log('');
            for (const line of (0, service_installer_1.staleSupervisorAdvice)(s)) {
                console.log(`\x1b[33m${line}\x1b[0m`);
            }
        }
        console.log('');
        console.log('  Remove the extra one(s) yourself:');
        if (supervisors.some((s) => s.kind === 'cron')) {
            console.log('    dialout remove-cron         # drop the cron watchdog');
        }
        if (supervisors.some((s) => s.kind !== 'cron')) {
            console.log('    dialout uninstall-service   # drop the launchd/systemd service');
        }
    }
    else if (staleRemaining.length > 0) {
        // Exactly one supervisor total, and it's still stale (e.g. a lone
        // stale systemd/launchd unit — repair only ever touches the watchdog).
        // This is NOT a clean state: give the same actionable advice `status`
        // would, instead of a false "no conflicting supervisors" all-clear.
        console.log('');
        for (const s of staleRemaining) {
            for (const line of (0, service_installer_1.staleSupervisorAdvice)(s)) {
                console.log(`\x1b[33m${line}\x1b[0m`);
            }
        }
    }
    else {
        console.log('');
        console.log('  No conflicting supervisors detected.');
    }
    console.log('\x1b[90m' + '─'.repeat(44) + '\x1b[0m');
    console.log('');
});
// --- setup-cowork ---
program
    .command('setup-cowork')
    .description('Choose which terminal app(s) auto-wrap into tmux for Dialout remote access')
    .option('--remove', 'Uninstall the wrapper, clear the allowlist, and go fully native')
    .option('--terminals <csv>', 'Non-interactive: comma-separated terminal tokens to allow')
    .option('--yes', 'Auto-confirm installing tmux if it is missing')
    .option('--adopt-all', 'Adopt all existing tmux sessions non-interactively')
    .option('--no-adopt', 'Skip adopting existing sessions')
    .action(async (opts) => {
    const { tmuxAvailable, listSessions } = require('./tmux-manager');
    const { execFileSync } = require('child_process');
    const { hasCommand } = require('./has-command');
    const config = (0, config_1.loadConfig)();
    const rcFiles = [path.join(os.homedir(), '.zshrc'), path.join(os.homedir(), '.bashrc')];
    // --remove: strip the block, clear the allowlist, go native.
    if (opts.remove) {
        for (const rc of rcFiles) {
            if (!fs.existsSync(rc))
                continue;
            fs.writeFileSync(rc, (0, cowork_1.removeCoworkBlock)(fs.readFileSync(rc, 'utf-8')));
            console.log(`  removed wrapper from ${rc}`);
        }
        removeSshLocalNetworkWorkaround();
        config.cowork = false;
        config.coworkTerminals = [];
        (0, config_1.saveConfig)(config);
        console.log('Reverted to native terminals. Open terminals are unaffected; new shells start normally.');
        return;
    }
    // tmux check → offer to install.
    if (!(await tmuxAvailable())) {
        const plan = (0, cowork_1.pickTmuxInstall)(process.platform, hasCommand);
        if (!plan.canAuto) {
            console.log('\x1b[33mtmux is not installed.\x1b[0m');
            console.log(`  ${plan.manual}`);
            process.exitCode = 1;
            return;
        }
        console.log('\x1b[33mtmux is not installed.\x1b[0m It will be installed with:');
        console.log(`  ${plan.command}`);
        let go = opts.yes === true;
        if (!go) {
            const rl = createRL();
            const ans = (await ask(rl, 'Run this now? [y/N]: ')).trim().toLowerCase();
            rl.close();
            go = ans === 'y' || ans === 'yes';
        }
        if (!go) {
            console.log(`Declined. Install tmux manually (${plan.command}) then re-run: dialout setup-cowork`);
            process.exitCode = 1;
            return;
        }
        try {
            execFileSync('/bin/sh', ['-c', plan.command], { stdio: 'inherit' });
        }
        catch {
            console.log('\x1b[31mtmux install failed.\x1b[0m Install it manually then re-run setup-cowork.');
            process.exitCode = 1;
            return;
        }
        if (!(await tmuxAvailable())) {
            console.log('\x1b[31mtmux still not found after install.\x1b[0m Install it manually then re-run setup-cowork.');
            process.exitCode = 1;
            return;
        }
    }
    // Terminal selection.
    const detected = (0, terminal_detect_1.detectTerminals)();
    // Guard rail against the OTHER reported silent-success trap: a headless
    // SSH-only server showed a 16-row checklist, every row "(not installed)",
    // none current — and even a perfect pick there could never activate
    // cowork, since renderCoworkBlock gates the whole wrapper on
    // `[ -z "$SSH_TTY" ]`. Explicit --terminals still gets the warn-don't-
    // refuse treatment (dotfile-syncing users keep working, matching
    // unmatchableTokens below); the interactive checklist is refused outright
    // since no selection there could ever help.
    const viability = (0, cowork_1.coworkViability)(process.env, detected.some((t) => t.installed));
    if (!viability.usable) {
        for (const reason of viability.reasons) {
            if (reason === 'ssh-session') {
                console.log('\x1b[33mThis is an SSH session — the cowork wrapper deliberately skips SSH logins, so no selection here can ever activate it.\x1b[0m');
            }
            else {
                console.log('\x1b[33mNo terminal emulator is installed on this machine — cowork wraps the app you open a terminal FROM, which runs on your local machine, not this server.\x1b[0m');
            }
        }
        console.log('Instead, open a terminal from the Dialout panel: it creates a tmux session on this machine directly and needs no cowork.');
        if (typeof opts.terminals !== 'string') {
            process.exitCode = 1;
            return;
        }
    }
    let selected;
    if (typeof opts.terminals === 'string') {
        selected = (0, cowork_1.sanitizeTokens)(opts.terminals.split(',').map((t) => t.trim()).filter(Boolean));
    }
    else {
        // installed apps first; current terminal is NOT pre-ticked (only prior picks are).
        const ordered = [...detected].sort((a, b) => Number(b.installed) - Number(a.installed));
        const prev = new Set(config.coworkTerminals ?? []);
        console.log('');
        console.log('Which terminal app(s) should be exposed to Dialout remote (auto-wrap into tmux)?');
        console.log('All other terminals stay native (full OS text selection + scrolling).');
        if (process.stdin.isTTY) {
            const items = ordered.map((t) => ({
                label: t.name,
                token: t.token,
                hint: [t.installed ? '' : 'not installed', t.current ? 'this terminal' : ''].filter(Boolean).join(', ') || undefined,
                checked: prev.has(t.token),
            }));
            console.log('');
            const picked = await promptChecklist(items);
            if (picked === null) {
                console.log('Cancelled — no changes made.');
                return;
            }
            selected = (0, cowork_1.sanitizeTokens)(picked);
        }
        else {
            // Non-TTY (piped) fallback: numbered toggle prompt.
            const ticks = ordered.map((t) => prev.has(t.token));
            ordered.forEach((t, i) => {
                const box = ticks[i] ? '[x]' : '[ ]';
                const tags = [t.installed ? '' : 'not installed', t.current ? 'this terminal' : ''].filter(Boolean).join(', ');
                console.log(`  ${i + 1}) ${box} ${t.name}${tags ? `  (${tags})` : ''}`);
            });
            const rl = createRL();
            const ans = (await ask(rl, '\nToggle by number (space/comma separated), Enter to confirm: ')).trim();
            rl.close();
            for (const tok of ans.split(/[, ]+/).filter(Boolean)) {
                const idx = parseInt(tok, 10) - 1;
                if (idx >= 0 && idx < ticks.length)
                    ticks[idx] = !ticks[idx];
            }
            selected = (0, cowork_1.sanitizeTokens)(ordered.filter((_, i) => ticks[i]).map((t) => t.token));
        }
    }
    // Guard rail against the reported silent no-op: warn (loudly, not
    // silently) when a selected token cannot possibly match on this platform
    // — e.g. picking "Apple_Terminal" on linux, or a Linux-only marker token
    // on darwin. The rc block is still written below (dotfiles may be synced
    // across machines); this only changes what's printed and the exit code.
    const badTokens = (0, cowork_1.unmatchableTokens)(selected, process.platform);
    for (const tok of badTokens) {
        console.log(`\x1b[33mWarning: "${tok}" cannot match on ${process.platform} — that terminal does not run here.\x1b[0m`);
    }
    if (selected.length > 0 && badTokens.length === selected.length) {
        console.log('\x1b[33mNone of the selected terminal(s) can ever match on this machine — cowork will never activate.\x1b[0m');
        process.exitCode = 1;
    }
    // Adopt existing tmux sessions (unchanged behavior).
    const all = await listSessions();
    const orphans = all.filter((s) => s.origin !== 'browser' && !s.folder);
    if (orphans.length > 0 && opts.adopt !== false) {
        console.log('');
        console.log(`Found ${orphans.length} existing tmux session(s) not managed by Dialout:`);
        orphans.forEach((s, i) => console.log(`  ${i + 1}) ${s.name}  (${s.termProgram})`));
        let pick;
        if (opts.adoptAll) {
            pick = 'a';
        }
        else {
            const rl = createRL();
            pick = (await ask(rl, 'Bind which to Dialout? [1,2,… / a=all / n=none]: ')).trim().toLowerCase();
            rl.close();
        }
        let chosen = [];
        if (pick === 'a')
            chosen = orphans;
        else if (pick && pick !== 'n') {
            const idx = pick.split(/[, ]+/).map((x) => parseInt(x, 10) - 1).filter((n) => n >= 0 && n < orphans.length);
            chosen = idx.map((i) => orphans[i]);
        }
        for (const s of chosen) {
            const tmux = (args) => { try {
                execFileSync('tmux', args, { timeout: 5000, stdio: 'pipe' });
            }
            catch { } };
            let cwd = '';
            try {
                cwd = execFileSync('tmux', ['display-message', '-p', '-t', s.name, '#{pane_current_path}'], { timeout: 5000, stdio: 'pipe' }).toString().trim();
            }
            catch { }
            const base = cwd.split('/').filter(Boolean).pop() || '';
            tmux(['set-option', '-t', s.name, '@devdash_origin', 'native']);
            if (s.termProgram === 'unknown')
                tmux(['set-option', '-t', s.name, '@term_program', 'unknown']);
            if (base)
                tmux(['set-option', '-t', s.name, '@devdash_folder', base]);
            if (cwd)
                tmux(['set-option', '-t', s.name, '@devdash_folder_path', cwd]);
        }
        if (chosen.length > 0)
            console.log(`\x1b[32m✓ Adopted ${chosen.length} session(s)\x1b[0m (live after the agent's next poll)`);
    }
    // Persist the allowlist and write / remove the block.
    config.coworkTerminals = selected;
    if (selected.length === 0) {
        for (const rc of rcFiles) {
            if (!fs.existsSync(rc))
                continue;
            fs.writeFileSync(rc, (0, cowork_1.removeCoworkBlock)(fs.readFileSync(rc, 'utf-8')));
            console.log(`  removed wrapper from ${rc}`);
        }
        config.cowork = false;
        (0, config_1.saveConfig)(config);
        console.log('');
        console.log('No remote terminal selected — all terminals are native (OS selection + scrolling).');
        return;
    }
    const existing = rcFiles.filter((f) => fs.existsSync(f));
    const targets = existing.length > 0
        ? existing
        : [(process.env.SHELL || '').includes('bash') ? rcFiles[1] : rcFiles[0]];
    for (const rc of targets) {
        const result = (0, cowork_1.installCoworkBlock)(rc, selected);
        applySshLocalNetworkWorkaround();
        console.log(`  ${result}: wrapper in ${rc}`);
    }
    config.cowork = true;
    (0, config_1.saveConfig)(config);
    console.log('');
    console.log(`\x1b[32mCowork enabled.\x1b[0m Remote app(s): ${selected.join(', ')}`);
    console.log('These auto-wrap into tmux and appear in Dialout → Terminals.');
    console.log('Every other terminal stays native (OS text selection + native scrolling).');
    if ((0, terminal_detect_1.currentTerminalToken)() === '') {
        console.log('\x1b[33mNote:\x1b[0m setup ran inside tmux, so "this terminal" could not be pre-ticked.');
        console.log('Re-run from a native terminal window if the checklist missed your app.');
    }
    console.log('Restart the agent to start reporting sessions: dialout restart');
});
// --- update ---
program
    .command('update')
    .description('Update Dialout to the latest version')
    .addHelpText('after', `
  Checks the IndiaNIC registry for a newer version and installs it.
  If running as a service, you'll be prompted to restart it.

  Examples:
    $ dialout update             # update to latest
    $ dialout --version          # check current version`)
    .action(async () => {
    await (0, update_check_1.performUpdate)();
});
// --- config ---
const configCmd = program
    .command('config')
    .description('View or modify agent configuration')
    .addHelpText('after', `
  Subcommands:
    dialout config show                      Print current config (API key masked)
    dialout config path                      Show config file location
    dialout config reset                     Reset to defaults (keeps API key + server)
    dialout config set <key> <value>         Set a config value

  Config keys:
    serverUrl         WebSocket URL (e.g., wss://dialout.example.com/ws)
    apiKey            Machine API key (e.g., mch_xxxx)
    heartbeatInterval Keep-alive interval in ms (default: 30000)
    cronInterval      Watchdog check interval in minutes (default: 5)
    scanPorts         Comma-separated ports (e.g., 3000,8080,5173)
    scanRange         Port range (e.g., 3000-9000)

  Examples:
    $ dialout config show
    $ dialout config set scanPorts 3000,4200,8080
    $ dialout config reset`);
configCmd
    .command('show')
    .description('Print current configuration (API key masked)')
    .action(() => {
    const config = (0, config_1.loadConfig)();
    const display = { ...config, apiKey: config.apiKey ? '****' + config.apiKey.slice(-4) : '' };
    console.log(JSON.stringify(display, null, 2));
});
configCmd
    .command('path')
    .description('Show config file location')
    .action(() => {
    console.log((0, config_1.getConfigPath)());
});
configCmd
    .command('reset')
    .description('Reset config to defaults (keeps API key and server URL)')
    .addHelpText('after', `
  Resets all configuration values to defaults while preserving:
    - serverUrl  (your server connection)
    - apiKey     (your machine authentication)

  This is useful if you've changed scan ports, intervals, etc. and want to start fresh.

  Examples:
    $ dialout config reset       # reset to defaults
    $ dialout config show        # verify the result`)
    .action(() => {
    const config = (0, config_1.loadConfig)();
    const { serverUrl, apiKey } = config;
    const defaults = {
        serverUrl,
        apiKey,
        scanPorts: [3000, 3001, 4200, 5173, 5174, 8000, 8080, 8081, 9000],
        scanRange: { from: 3000, to: 9000 },
        heartbeatInterval: 30000,
        cronInterval: 5,
    };
    (0, config_1.saveConfig)(defaults);
    console.log('Config reset to defaults (serverUrl and apiKey preserved).');
    console.log(`Config file: ${(0, config_1.getConfigPath)()}`);
});
configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .addHelpText('after', `
  Available keys:
    serverUrl         WebSocket URL (e.g., wss://dialout.example.com/ws)
    apiKey            Machine API key (e.g., mch_xxxx)
    heartbeatInterval Keep-alive interval in ms (default: 30000)
    cronInterval      Watchdog check interval in minutes (default: 5)
    scanPorts         Comma-separated ports (e.g., 3000,8080,5173)
    scanRange         Port range (e.g., 3000-9000)

  Examples:
    $ dialout config set serverUrl wss://new-server.com/ws
    $ dialout config set cronInterval 3
    $ dialout config set scanPorts 3000,4200,8080
    $ dialout config set scanRange 3000-9000
    $ dialout config set heartbeatInterval 60000`)
    .action((key, value) => {
    const config = (0, config_1.loadConfig)();
    if (!(key in config)) {
        console.error(`Unknown config key: ${key}`);
        console.error(`Valid keys: ${Object.keys(config).join(', ')}`);
        process.exit(1);
    }
    if (key === 'heartbeatInterval' || key === 'cronInterval') {
        config[key] = parseInt(value, 10);
    }
    else if (key === 'scanPorts') {
        config[key] = value.split(',').map((p) => parseInt(p.trim(), 10));
    }
    else if (key === 'scanRange') {
        const [from, to] = value.split('-').map((p) => parseInt(p.trim(), 10));
        config[key] = { from, to };
    }
    else {
        config[key] = value;
    }
    // Keep the active profile in sync when connection values change
    if ((key === 'serverUrl' || key === 'apiKey') && config.activeProfile && config.profiles?.[config.activeProfile]) {
        config.profiles[config.activeProfile][key] = config[key];
    }
    (0, config_1.saveConfig)(config);
    console.log(`Set ${key} = ${JSON.stringify(config[key])}`);
});
program.parse();
//# sourceMappingURL=cli.js.map