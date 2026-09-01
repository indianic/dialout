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
exports.TranscriptTail = void 0;
exports.splitRecords = splitRecords;
const fs = __importStar(require("fs"));
// Vendor-neutral JSONL follower. It has no idea what a message is; it hands
// raw records to an adapter. Polled rather than fs.watch-driven: watch is
// unreliable on network and virtualised filesystems, and a 1 s stat is cheap.
const POLL_MS = 1000;
const MAX_CHUNK = 4 << 20; // never read more than 4 MB in one pass
function splitRecords(buffer) {
    const records = [];
    const lines = buffer.split('\n');
    const rest = lines.pop() ?? '';
    for (const line of lines) {
        if (!line.trim())
            continue;
        try {
            records.push(JSON.parse(line));
        }
        catch {
            // A vendor format change, or a line caught mid-write. Skip it; the
            // feature must degrade, never die.
        }
    }
    return { records, rest };
}
class TranscriptTail {
    path;
    onRecords;
    position = 0;
    partial = '';
    timer = null;
    lastGrowthMs = 0;
    constructor(path, onRecords) {
        this.path = path;
        this.onRecords = onRecords;
    }
    start() {
        this.stop();
        this.timer = setInterval(() => this.pump(), POLL_MS);
        this.pump();
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    // Read from position to EOF. Public so an initial replay can be forced.
    pump() {
        let size;
        try {
            size = fs.statSync(this.path).size;
        }
        catch {
            return; // rotated away or not created yet; try again next tick
        }
        if (size < this.position) {
            // Truncated or replaced. Anything else would emit garbage from the
            // middle of a line.
            this.position = 0;
            this.partial = '';
        }
        if (size === this.position)
            return;
        const length = Math.min(size - this.position, MAX_CHUNK);
        const buf = Buffer.alloc(length);
        let read = 0;
        try {
            const fd = fs.openSync(this.path, 'r');
            read = fs.readSync(fd, buf, 0, length, this.position);
            fs.closeSync(fd);
        }
        catch {
            return;
        }
        this.position += read;
        this.lastGrowthMs = Date.now();
        const { records, rest } = splitRecords(this.partial + buf.subarray(0, read).toString());
        this.partial = rest;
        if (records.length)
            this.onRecords(records);
    }
}
exports.TranscriptTail = TranscriptTail;
//# sourceMappingURL=ai-transcript-tail.js.map