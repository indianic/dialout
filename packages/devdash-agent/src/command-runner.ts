import { spawn, exec } from 'child_process';
import { openSync, closeSync, mkdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { configDirFor } from './config';

const LOG_DIR = join(configDirFor(homedir()), 'logs');

function sanitize(name: string): string {
  return (name || 'run').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'run';
}

export interface RunCommandArgs {
  command: string;
  cwd?: string;
  background?: boolean;
  logName?: string;
}

export interface RunCommandResult {
  ok: boolean;
  pid?: number;
  exitCode?: number;
  output?: string;
  error?: string;
}

export function runCommand(args: RunCommandArgs): Promise<RunCommandResult> {
  const command = (args.command || '').trim();
  if (!command) return Promise.resolve({ ok: false, error: 'Empty command' });

  let cwdIsDir = false;
  if (args.cwd) {
    try {
      cwdIsDir = statSync(args.cwd).isDirectory();
    } catch {
      cwdIsDir = false;
    }
  }
  const cwd = cwdIsDir ? (args.cwd as string) : homedir();

  if (args.background) {
    return new Promise((resolve) => {
      let settled = false;
      let fd: number | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const settle = (result: RunCommandResult) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (fd !== undefined) {
          try {
            closeSync(fd);
          } catch {
            // already closed / nothing to do
          }
        }
        resolve(result);
      };

      try {
        mkdirSync(LOG_DIR, { recursive: true });
        const logPath = join(LOG_DIR, `${sanitize(args.logName || 'run')}.log`);
        fd = openSync(logPath, 'a');
        const child = spawn(command, { cwd, shell: true, detached: true, stdio: ['ignore', fd, fd] });

        child.on('error', (err: any) => {
          settle({ ok: false, error: err?.message || 'spawn failed' });
        });

        if (child.pid) {
          child.unref();
          settle({ ok: true, pid: child.pid });
        } else {
          timer = setTimeout(() => {
            settle({ ok: false, error: 'Failed to start process' });
          }, 500);
        }
      } catch (err: any) {
        settle({ ok: false, error: err?.message || 'spawn failed' });
      }
    });
  }

  return new Promise((resolve) => {
    exec(command, { cwd, timeout: 20000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const output = String((stdout || '') + (stderr || '')).slice(0, 4000);
      if (err) {
        const exitCode = typeof (err as any).code === 'number' ? (err as any).code : 1;
        resolve({ ok: false, exitCode, output, error: err.message });
      } else {
        resolve({ ok: true, exitCode: 0, output });
      }
    });
  });
}
