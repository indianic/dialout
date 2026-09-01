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
exports.checkPort = checkPort;
exports.scanPorts = scanPorts;
exports.scanRange = scanRange;
const net = __importStar(require("net"));
const TIMEOUT_MS = 800;
function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(TIMEOUT_MS);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}
async function scanPorts(ports) {
    const results = await Promise.all(ports.map(async (port) => ({ port, open: await checkPort(port) })));
    return results.filter((r) => r.open).map((r) => r.port);
}
async function scanRange(from, to) {
    const batchSize = 50;
    const openPorts = [];
    for (let start = from; start <= to; start += batchSize) {
        const end = Math.min(start + batchSize - 1, to);
        const ports = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        const open = await scanPorts(ports);
        openPorts.push(...open);
    }
    return openPorts;
}
//# sourceMappingURL=port-scanner.js.map