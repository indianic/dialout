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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverCapabilities = discoverCapabilities;
const path = __importStar(require("path"));
const claude_1 = require("./claude");
const grok_1 = require("./grok");
const fsdeps_1 = require("./fsdeps");
__exportStar(require("./types"), exports);
// Walk up to the nearest directory containing .git. Grok's project config
// resolution is defined in terms of the repo root, so this has to agree with
// it; a cwd outside any repo simply resolves to itself.
function repoRootOf(cwd, d) {
    let dir = cwd;
    for (let i = 0; i < 40; i++) {
        if (d.exists(path.join(dir, '.git')))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return cwd;
}
// One shape, two genuinely different problems behind it: Claude discovers from
// the filesystem, Grok reads a table shipped beside its binary. Adding a vendor
// is a new branch here plus its own module — never a change to callers.
function discoverCapabilities(kind, cwd, deps = {}) {
    const d = (0, fsdeps_1.resolveDeps)(deps);
    const scannedAt = new Date().toISOString();
    try {
        if (kind === 'claude') {
            return {
                kind: 'claude',
                commands: (0, claude_1.claudeCommands)(cwd, deps),
                mcpServers: (0, claude_1.claudeMcpServers)(cwd, deps),
                scannedAt,
            };
        }
        if (kind === 'grok') {
            return {
                kind: 'grok',
                commands: (0, grok_1.grokCommands)(deps),
                mcpServers: (0, grok_1.grokMcpServers)(cwd, repoRootOf(cwd, d), deps),
                scannedAt,
            };
        }
    }
    catch {
        // Discovery is a convenience. It must never take the poll down with it.
    }
    return {
        kind: kind,
        commands: [],
        mcpServers: [],
        scannedAt,
    };
}
//# sourceMappingURL=index.js.map