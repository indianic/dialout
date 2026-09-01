"use strict";
// MCP `env` and `headers` never leave the machine at all. `args` do, because
// the detail row shows how a server is launched — and a token passed as a CLI
// argument would ride along with it. Redaction is deliberately eager: a
// redacted argument costs the reader nothing, a leaked one costs a key.
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactArgs = redactArgs;
const SECRET_FLAG = /(token|key|secret|password|passwd|auth|credential)/i;
// Long, unbroken, high-entropy-ish: the shape of a credential rather than a path.
const TOKEN_SHAPE = /^[A-Za-z0-9_\-.]{24,}$/;
function redactArgs(args) {
    if (!Array.isArray(args))
        return undefined;
    return args.map((raw, i) => {
        const arg = String(raw);
        const inline = arg.match(/^([A-Za-z0-9_]+)=(.+)$/);
        if (inline && SECRET_FLAG.test(inline[1]))
            return `${inline[1]}=[redacted]`;
        const prev = i > 0 ? String(args[i - 1]) : '';
        if (prev.startsWith('-') && SECRET_FLAG.test(prev))
            return '[redacted]';
        if (TOKEN_SHAPE.test(arg) && !arg.includes('/'))
            return '[redacted]';
        return arg;
    });
}
//# sourceMappingURL=redact.js.map