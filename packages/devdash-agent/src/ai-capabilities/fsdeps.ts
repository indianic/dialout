import * as fs from 'fs';
import * as os from 'os';
import type { CapabilityDeps } from './types';

// Real-filesystem defaults. Every one swallows its errors: discovery reporting
// nothing for a source is correct, throwing is not.
export function resolveDeps(deps: CapabilityDeps): Required<CapabilityDeps> {
  return {
    homeDir: deps.homeDir || (() => os.homedir()),
    readFile: deps.readFile || ((p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }),
    readDir: deps.readDir || ((p) => { try { return fs.readdirSync(p); } catch { return []; } }),
    isDir: deps.isDir || ((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }),
    exists: deps.exists || ((p) => { try { fs.accessSync(p); return true; } catch { return false; } }),
  };
}
