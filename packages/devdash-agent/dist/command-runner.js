"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = runCommand;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const config_1 = require("./config");
const LOG_DIR = (0, path_1.join)((0, config_1.configDirFor)((0, os_1.homedir)()), 'logs');
function sanitize(name) {
    return (name || 'run').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'run';
}
function runCommand(args) {
    const command = (args.command || '').trim();
    if (!command)
        return Promise.resolve({ ok: false, error: 'Empty command' });
    let cwdIsDir = false;
    if (args.cwd) {
        try {
            cwdIsDir = (0, fs_1.statSync)(args.cwd).isDirectory();
        }
        catch {
            cwdIsDir = false;
        }
    }
    const cwd = cwdIsDir ? args.cwd : (0, os_1.homedir)();
    if (args.background) {
        return new Promise((resolve) => {
            let settled = false;
            let fd;
            let timer;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                if (timer)
                    clearTimeout(timer);
                if (fd !== undefined) {
                    try {
                        (0, fs_1.closeSync)(fd);
                    }
                    catch {
                        // already closed / nothing to do
                    }
                }
                resolve(result);
            };
            try {
                (0, fs_1.mkdirSync)(LOG_DIR, { recursive: true });
                const logPath = (0, path_1.join)(LOG_DIR, `${sanitize(args.logName || 'run')}.log`);
                fd = (0, fs_1.openSync)(logPath, 'a');
                const child = (0, child_process_1.spawn)(command, { cwd, shell: true, detached: true, stdio: ['ignore', fd, fd] });
                child.on('error', (err) => {
                    settle({ ok: false, error: err?.message || 'spawn failed' });
                });
                if (child.pid) {
                    child.unref();
                    settle({ ok: true, pid: child.pid });
                }
                else {
                    timer = setTimeout(() => {
                        settle({ ok: false, error: 'Failed to start process' });
                    }, 500);
                }
            }
            catch (err) {
                settle({ ok: false, error: err?.message || 'spawn failed' });
            }
        });
    }
    return new Promise((resolve) => {
        (0, child_process_1.exec)(command, { cwd, timeout: 20000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            const output = String((stdout || '') + (stderr || '')).slice(0, 4000);
            if (err) {
                const exitCode = typeof err.code === 'number' ? err.code : 1;
                resolve({ ok: false, exitCode, output, error: err.message });
            }
            else {
                resolve({ ok: true, exitCode: 0, output });
            }
        });
    });
}
//# sourceMappingURL=command-runner.js.map