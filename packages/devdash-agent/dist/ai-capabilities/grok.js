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
exports.parseGrokCommandTable = parseGrokCommandTable;
exports.grokCommands = grokCommands;
exports.grokMcpServers = grokMcpServers;
const path = __importStar(require("path"));
const smol_toml_1 = require("smol-toml");
const redact_1 = require("./redact");
const fsdeps_1 = require("./fsdeps");
const MIN_ROWS = 3;
function cell(s) {
    return s.replace(/`/g, '').trim();
}
// Grok has no user commands directory: its slash commands are built in, and
// the README that ships beside the binary is the only machine-readable list.
// Parsing it at runtime means the menu tracks the installed version instead of
// rotting in our source — the trade is that a restructure breaks the parse, so
// failure is all-or-nothing and loud rather than a silently partial menu.
function parseGrokCommandTable(readme) {
    const text = String(readme || '');
    const start = text.search(/^#{2,4}\s+Slash Commands\s*$/m);
    if (start === -1)
        return [];
    const rest = text.slice(start).split('\n').slice(1);
    const out = [];
    for (const line of rest) {
        if (/^#{1,6}\s/.test(line))
            break; // next heading ends the section
        if (!line.trim().startsWith('|'))
            continue;
        const cols = line.split('|').slice(1, -1).map(cell);
        if (cols.length < 3)
            continue;
        const m = cols[0].match(/^\/([A-Za-z0-9-]+)/);
        if (!m)
            continue; // header and --- rows
        const alias = cols[1].match(/^\/([A-Za-z0-9-]+)/);
        out.push({
            name: m[1],
            alias: alias ? alias[1] : undefined,
            description: cols[2],
            source: 'builtin',
        });
    }
    return out.length >= MIN_ROWS ? out : [];
}
function grokCommands(deps = {}) {
    const d = (0, fsdeps_1.resolveDeps)(deps);
    let readme = null;
    try {
        readme = d.readFile(path.join(d.homeDir(), '.grok', 'README.md'));
    }
    catch {
        readme = null;
    }
    return readme ? parseGrokCommandTable(readme) : [];
}
function readToml(file, d) {
    let raw = null;
    try {
        raw = d.readFile(file);
    }
    catch {
        return null;
    }
    if (!raw)
        return null;
    try {
        return (0, smol_toml_1.parse)(raw);
    }
    catch {
        return null;
    }
}
function toGrokServer(name, cfg, scope, origin) {
    const http = !!(cfg && (cfg.url || cfg.headers));
    return {
        name,
        scope,
        origin,
        transport: http ? 'http' : 'stdio',
        enabled: cfg?.enabled !== false,
        command: http ? undefined : (cfg?.command ? String(cfg.command) : undefined),
        args: http ? undefined : (0, redact_1.redactArgs)(cfg?.args),
    };
}
// Documented precedence: ~/.grok < <repo-root>/.grok < <cwd>/.grok, and a
// same-named project server REPLACES the global entirely — fields are not
// merged, so an omitted field takes its default rather than inheriting.
// Implemented literally, because showing a server with a command it does not
// actually run is worse than showing none.
function grokMcpServers(cwd, repoRoot, deps = {}) {
    const d = (0, fsdeps_1.resolveDeps)(deps);
    const merged = new Map();
    const layers = [
        [path.join(d.homeDir(), '.grok', 'config.toml'), 'global'],
        [path.join(repoRoot, '.grok', 'config.toml'), 'project'],
        [path.join(cwd, '.grok', 'config.toml'), 'project'],
    ];
    for (const [file, scope] of layers) {
        const cfg = readToml(file, d);
        const servers = cfg?.mcp_servers;
        if (!servers || typeof servers !== 'object')
            continue;
        for (const [name, entry] of Object.entries(servers)) {
            // set() replaces wholesale — which is exactly the documented rule.
            merged.set(name, toGrokServer(name, entry, scope, file));
        }
    }
    return Array.from(merged.values());
}
//# sourceMappingURL=grok.js.map