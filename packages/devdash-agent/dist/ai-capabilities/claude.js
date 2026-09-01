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
exports.claudeCommands = claudeCommands;
exports.claudeMcpServers = claudeMcpServers;
const path = __importStar(require("path"));
const describe_1 = require("./describe");
const redact_1 = require("./redact");
const fsdeps_1 = require("./fsdeps");
function safe(fn, fallback) {
    try {
        const v = fn();
        return v === null || v === undefined ? fallback : v;
    }
    catch {
        return fallback;
    }
}
function readCommandDir(dir, source, prefix, d) {
    const out = [];
    for (const entry of safe(() => d.readDir(dir), [])) {
        if (!entry.endsWith('.md'))
            continue;
        const body = safe(() => d.readFile(path.join(dir, entry)), null);
        out.push({
            name: prefix + entry.slice(0, -3),
            description: (0, describe_1.describeCommand)(body || ''),
            source,
        });
    }
    return out;
}
// Plugin command directories, measured rather than assumed. Three shapes
// really exist under ~/.claude/plugins/marketplaces:
//
//   <marketplace>/commands                        (marketplace is the plugin)
//   <marketplace>/<plugin>/commands               (e.g. pdf-viewer)
//   <marketplace>/plugins/<plugin>/commands       (the common case, 25 of 32)
//   <marketplace>/external_plugins/<plugin>/commands
//
// A generic "find any directory named commands" walk looked tidier and was
// wrong twice over: it picked up <marketplace>/.claude/commands — a marketplace
// repo's OWN project commands, which the user's CLI does not expose — and
// namespaced them `.claude:`. It also matched impeccable/bin/commands, which
// holds skills.mjs and no slash commands at all.
const PLUGIN_CONTAINERS = ['plugins', 'external_plugins'];
function pluginCommandDirs(marketplaces, d) {
    const out = [];
    for (const mp of safe(() => d.readDir(marketplaces), [])) {
        if (mp.startsWith('.'))
            continue;
        const mpDir = path.join(marketplaces, mp);
        if (!safe(() => d.isDir(mpDir), false))
            continue;
        if (safe(() => d.isDir(path.join(mpDir, 'commands')), false)) {
            out.push({ dir: path.join(mpDir, 'commands'), name: mp });
        }
        for (const child of safe(() => d.readDir(mpDir), [])) {
            // Dot-directories are the repo's own tooling, never a published plugin.
            if (child.startsWith('.') || child === 'commands')
                continue;
            const childDir = path.join(mpDir, child);
            if (!safe(() => d.isDir(childDir), false))
                continue;
            if (PLUGIN_CONTAINERS.includes(child)) {
                for (const plugin of safe(() => d.readDir(childDir), [])) {
                    if (plugin.startsWith('.'))
                        continue;
                    const cmds = path.join(childDir, plugin, 'commands');
                    if (safe(() => d.isDir(cmds), false))
                        out.push({ dir: cmds, name: plugin });
                }
            }
            else if (safe(() => d.isDir(path.join(childDir, 'commands')), false)) {
                out.push({ dir: path.join(childDir, 'commands'), name: child });
            }
        }
    }
    return out;
}
function claudeCommands(cwd, deps = {}) {
    const d = (0, fsdeps_1.resolveDeps)(deps);
    const home = d.homeDir();
    const out = [];
    out.push(...readCommandDir(path.join(home, '.claude', 'commands'), 'user', '', d));
    out.push(...readCommandDir(path.join(cwd, '.claude', 'commands'), 'project', '', d));
    const marketplaces = path.join(home, '.claude', 'plugins', 'marketplaces');
    for (const { dir, name } of pluginCommandDirs(marketplaces, d)) {
        out.push(...readCommandDir(dir, 'plugin', `${name}:`, d));
    }
    return out;
}
function readJson(file, d) {
    const raw = safe(() => d.readFile(file), null);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function toServer(name, cfg, scope, origin) {
    const http = !!(cfg && (cfg.url || cfg.type === 'http' || cfg.type === 'sse'));
    return {
        name,
        scope,
        origin,
        transport: http ? 'http' : 'stdio',
        // Claude has no explicit disable flag; absent means enabled.
        enabled: cfg?.enabled !== false,
        command: http ? undefined : (cfg?.command ? String(cfg.command) : undefined),
        args: http ? undefined : (0, redact_1.redactArgs)(cfg?.args),
    };
}
// The four locations are measured; Claude's runtime precedence between them is
// NOT. So this does not claim to reproduce resolution — it reports each server
// with the scope it came from, and on a name collision shows the narrower one.
// Later entries here win, so project sources come last.
function claudeMcpServers(cwd, deps = {}) {
    const d = (0, fsdeps_1.resolveDeps)(deps);
    const home = d.homeDir();
    const merged = new Map();
    const add = (obj, scope, origin) => {
        if (!obj || typeof obj !== 'object')
            return;
        for (const [name, cfg] of Object.entries(obj)) {
            merged.set(name, toServer(name, cfg, scope, origin));
        }
    };
    const claudeJsonPath = path.join(home, '.claude.json');
    const claudeJson = readJson(claudeJsonPath, d);
    const settingsPath = path.join(home, '.claude', 'settings.json');
    const mcpJsonPath = path.join(cwd, '.mcp.json');
    add(claudeJson?.mcpServers, 'global', claudeJsonPath);
    add(readJson(settingsPath, d)?.mcpServers, 'global', settingsPath);
    add(readJson(mcpJsonPath, d)?.mcpServers, 'project', mcpJsonPath);
    add(claudeJson?.projects?.[cwd]?.mcpServers, 'project', claudeJsonPath);
    return Array.from(merged.values());
}
//# sourceMappingURL=claude.js.map