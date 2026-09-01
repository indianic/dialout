import { execFile } from 'child_process';

// Which AI coding CLI is running inside a tmux pane.
//
// Classification is deliberately NOT by process name. Measured on a real
// machine: Claude Code's binary lives at ~/.local/share/claude/versions/<ver>,
// so its `comm` is a version number, and other agent CLIs rename themselves
// outright. Only the full argv is trustworthy.

import type { AiKind } from '@dialout/shared';
export type { AiKind };

export interface ProcRow {
  pid: number;
  ppid: number;
  command: string;
}

const PS_ROW_RE = /^\s*(\d+)\s+(\d+)\s+(\S.*)$/;

export function parseProcessTable(psOutput: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of psOutput.split('\n')) {
    const m = line.match(PS_ROW_RE);
    if (!m) continue;
    rows.push({ pid: parseInt(m[1], 10), ppid: parseInt(m[2], 10), command: m[3] });
  }
  return rows;
}

// Every descendant of rootPid, depth unbounded. The `seen` set is not an
// optimisation: `ps` output is a snapshot and pid reuse can produce a parent
// cycle, which would otherwise spin the agent's poll loop forever.
export function descendantsOf(rows: ProcRow[], rootPid: number): ProcRow[] {
  const byParent = new Map<number, ProcRow[]>();
  for (const row of rows) {
    const siblings = byParent.get(row.ppid);
    if (siblings) siblings.push(row);
    else byParent.set(row.ppid, [row]);
  }
  const out: ProcRow[] = [];
  const seen = new Set<number>([rootPid]);
  const stack = [rootPid];
  while (stack.length) {
    for (const child of byParent.get(stack.pop()!) || []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      out.push(child);
      stack.push(child.pid);
    }
  }
  return out;
}

// Anchored on a path segment boundary so `claudette` and `claude-notes.md`
// do not match, and on the vendors' real install layouts.
const KIND_RULES: { kind: AiKind; re: RegExp }[] = [
  { kind: 'claude', re: /(^|\/)claude(\s|$)|\/\.local\/share\/claude\/versions\// },
  { kind: 'codex',  re: /(^|\/)codex(\s|$)|\/Caskroom\/codex\// },
  // Grok installs to ~/.grok/bin/grok, so the install-layout half is anchored
  // on that directory rather than a package manager's.
  { kind: 'grok',   re: /(^|\/)grok(\s|$)|\/\.grok\/bin\// },
];

export function classifyProcess(command: string): AiKind | null {
  for (const rule of KIND_RULES) {
    if (rule.re.test(command)) return rule.kind;
  }
  return null;
}

// Shallowest match wins: the agent CLI is a direct child of the pane shell,
// while its MCP servers and subprocesses sit deeper and may share its name.
export function findAgentInPane(
  rows: ProcRow[],
  panePid: number
): { pid: number; kind: AiKind } | null {
  for (const proc of descendantsOf(rows, panePid)) {
    const kind = classifyProcess(proc.command);
    if (kind) return { pid: proc.pid, kind };
  }
  return null;
}

export interface ProcessTableDeps {
  run?: () => Promise<string>;
}

export async function readProcessTable(deps: ProcessTableDeps = {}): Promise<ProcRow[]> {
  const run = deps.run || (() => new Promise<string>((resolve) => {
    // One `ps` for the whole machine, not one per pane.
    execFile('ps', ['-A', '-o', 'pid=,ppid=,command='], { timeout: 5000, maxBuffer: 8 << 20 },
      (err, stdout) => resolve(err ? '' : stdout));
  }));
  return parseProcessTable(await run());
}
