"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProcessTable = parseProcessTable;
exports.descendantsOf = descendantsOf;
exports.classifyProcess = classifyProcess;
exports.findAgentInPane = findAgentInPane;
exports.readProcessTable = readProcessTable;
const child_process_1 = require("child_process");
const PS_ROW_RE = /^\s*(\d+)\s+(\d+)\s+(\S.*)$/;
function parseProcessTable(psOutput) {
    const rows = [];
    for (const line of psOutput.split('\n')) {
        const m = line.match(PS_ROW_RE);
        if (!m)
            continue;
        rows.push({ pid: parseInt(m[1], 10), ppid: parseInt(m[2], 10), command: m[3] });
    }
    return rows;
}
// Every descendant of rootPid, depth unbounded. The `seen` set is not an
// optimisation: `ps` output is a snapshot and pid reuse can produce a parent
// cycle, which would otherwise spin the agent's poll loop forever.
function descendantsOf(rows, rootPid) {
    const byParent = new Map();
    for (const row of rows) {
        const siblings = byParent.get(row.ppid);
        if (siblings)
            siblings.push(row);
        else
            byParent.set(row.ppid, [row]);
    }
    const out = [];
    const seen = new Set([rootPid]);
    const stack = [rootPid];
    while (stack.length) {
        for (const child of byParent.get(stack.pop()) || []) {
            if (seen.has(child.pid))
                continue;
            seen.add(child.pid);
            out.push(child);
            stack.push(child.pid);
        }
    }
    return out;
}
// Anchored on a path segment boundary so `claudette` and `claude-notes.md`
// do not match, and on the vendors' real install layouts.
const KIND_RULES = [
    { kind: 'claude', re: /(^|\/)claude(\s|$)|\/\.local\/share\/claude\/versions\// },
    { kind: 'codex', re: /(^|\/)codex(\s|$)|\/Caskroom\/codex\// },
    // Grok installs to ~/.grok/bin/grok, so the install-layout half is anchored
    // on that directory rather than a package manager's.
    { kind: 'grok', re: /(^|\/)grok(\s|$)|\/\.grok\/bin\// },
];
function classifyProcess(command) {
    for (const rule of KIND_RULES) {
        if (rule.re.test(command))
            return rule.kind;
    }
    return null;
}
// Shallowest match wins: the agent CLI is a direct child of the pane shell,
// while its MCP servers and subprocesses sit deeper and may share its name.
function findAgentInPane(rows, panePid) {
    for (const proc of descendantsOf(rows, panePid)) {
        const kind = classifyProcess(proc.command);
        if (kind)
            return { pid: proc.pid, kind };
    }
    return null;
}
async function readProcessTable(deps = {}) {
    const run = deps.run || (() => new Promise((resolve) => {
        // One `ps` for the whole machine, not one per pane.
        (0, child_process_1.execFile)('ps', ['-A', '-o', 'pid=,ppid=,command='], { timeout: 5000, maxBuffer: 8 << 20 }, (err, stdout) => resolve(err ? '' : stdout));
    }));
    return parseProcessTable(await run());
}
//# sourceMappingURL=ai-session-detector.js.map