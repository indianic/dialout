"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasCommand = hasCommand;
const child_process_1 = require("child_process");
/**
 * True when `bin` resolves on PATH. Never throws.
 *
 * Deliberately does NOT pass an args array together with a `shell` option —
 * that combination triggers Node 22+'s DEP0190 deprecation warning. Instead
 * `/bin/sh` itself is the program, with a fixed `-c` script; `bin` is handed
 * to the shell as `$1` (via the extra argv positions after the script),
 * never concatenated into the command line, so it can't be interpreted as
 * shell syntax either.
 */
function hasCommand(bin) {
    try {
        (0, child_process_1.execFileSync)('/bin/sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'sh', bin], { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=has-command.js.map