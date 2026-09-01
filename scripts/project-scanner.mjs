#!/usr/bin/env node
/* ============================================================================
 * project-scanner.mjs  —  Local project catalog scanner (Mac + Linux)
 * ----------------------------------------------------------------------------
 * Scans root folders, detects tech stack + port + start command + URL for each
 * project, and writes a JSON catalog. Re-runs are INCREMENTAL: only folders
 * whose signature files changed are re-analyzed.
 *
 * No external dependencies (Node built-ins only).
 *
 * Run:
 *   node project-scanner.mjs                 # incremental scan, writes catalog
 *   node project-scanner.mjs --full          # ignore cache, full rescan
 *   node project-scanner.mjs --json          # also print catalog JSON to stdout
 *   node project-scanner.mjs --check         # TCP-probe each port (running?)
 *   node project-scanner.mjs /path/a /path/b # override roots for this run
 *
 * Env override:
 *   PROJECT_ROOTS=/Users/me/projects:/Users/me/work node project-scanner.mjs
 * ========================================================================== */

import os from 'os';
import path from 'path';
import fs from 'fs';
import net from 'net';
import crypto from 'crypto';

const HOME = os.homedir();

/* ================================ CONFIG ================================== */
const CONFIG = {
  // Folders to scan. Each direct child (down to maxDepth) is a candidate project.
  roots: [
    path.join(HOME, 'projects'),
    path.join(HOME, 'work'),
    path.join(HOME, 'sites'),
  ],
  maxDepth: 2,           // how many levels under each root to search for projects
  monorepo: false,       // true = keep descending into a project to find sub-apps
  cacheFile: path.join(HOME, '.project-scanner-cache.json'),
  outputFile: path.join(HOME, '.project-catalog.json'),
  phpPortStart: 8000,    // base port for auto-assigned PHP / static-HTML servers
  ignoreDirs: new Set([
    'node_modules', '.git', 'vendor', 'dist', 'build', 'out', 'target',
    '.next', '.nuxt', '.svelte-kit', '.venv', 'venv', '__pycache__', '.cache',
    'coverage', '.idea', '.vscode', 'tmp', 'storage', 'bootstrap',
  ]),
};

// Files whose presence/mtime defines a project fingerprint (for incremental).
const WATCH_FILES = [
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'composer.json', 'composer.lock', 'requirements.txt', 'pyproject.toml', 'Pipfile',
  'manage.py', 'Gemfile', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
  'pubspec.yaml', '.env', '.env.local',
  'vite.config.js', 'vite.config.ts', 'vue.config.js', 'nuxt.config.js',
  'nuxt.config.ts', 'tsconfig.json',
];

const DEFAULT_PORTS = {
  nextjs: 3000, nuxt: 3000, angular: 4200, vite: 5173, cra: 3000,
  sveltekit: 5173, svelte: 5173, vue: 8080, nest: 3000, express: 3000,
  node: 3000, laravel: 8000, symfony: 8000, django: 8000, flask: 5000,
  fastapi: 8000, rails: 3000, go: 8080, rust: 8080, spring: 8080,
};

/* ============================== CLI ARGS ================================== */
const args = process.argv.slice(2);
const FLAGS = {
  full: args.includes('--full'),
  json: args.includes('--json'),
  check: args.includes('--check'),
};
const cliRoots = args.filter(a => !a.startsWith('--'));
if (cliRoots.length) CONFIG.roots = cliRoots;
if (process.env.PROJECT_ROOTS) CONFIG.roots = process.env.PROJECT_ROOTS.split(':');

/* ============================== HELPERS =================================== */
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const exists  = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

function parsePort(str) {
  if (!str) return null;
  let m = str.match(/(?:-p|--port)[ =]+(\d{2,5})/);
  if (m) return +m[1];
  m = str.match(/\bPORT[ =]+(\d{2,5})/);
  if (m) return +m[1];
  return null;
}

function envPort(dir) {
  for (const f of ['.env.local', '.env']) {
    const t = readText(path.join(dir, f));
    const m = t.match(/(?:^|\n)\s*(?:PORT|APP_PORT|SERVER_PORT)\s*=\s*"?(\d{2,5})"?/);
    if (m) return +m[1];
  }
  return null;
}

function configPort(dir) {
  for (const f of ['vite.config.ts', 'vite.config.js', 'vue.config.js',
                   'nuxt.config.ts', 'nuxt.config.js', 'svelte.config.js']) {
    const p = path.join(dir, f);
    if (!exists(p)) continue;
    const m = readText(p).match(/port\s*:\s*(\d{2,5})/);
    if (m) return +m[1];
  }
  return null;
}

function detectPM(dir) {
  if (exists(path.join(dir, 'bun.lockb')))       return 'bun';
  if (exists(path.join(dir, 'pnpm-lock.yaml')))  return 'pnpm';
  if (exists(path.join(dir, 'yarn.lock')))       return 'yarn';
  return 'npm';
}

function runCmd(pm, script) {
  if (pm === 'npm')  return script === 'start' ? 'npm start' : `npm run ${script}`;
  if (pm === 'yarn') return `yarn ${script}`;
  if (pm === 'pnpm') return `pnpm ${script}`;
  if (pm === 'bun')  return `bun run ${script}`;
  return `npm run ${script}`;
}

function pickScript(scripts) {
  for (const s of ['dev', 'start', 'serve']) if (scripts && scripts[s]) return s;
  return null;
}

function fingerprint(dir, present) {
  const h = crypto.createHash('sha1');
  for (const f of present.slice().sort()) {
    try {
      const st = fs.statSync(path.join(dir, f));
      h.update(`${f}:${st.size}:${Math.round(st.mtimeMs)}`);
    } catch { /* ignore */ }
  }
  return h.digest('hex');
}

/* ========================= STACK DETECTION =============================== */
// Returns { stack, framework, language } or null if not recognizable.
function analyzeStack(dir, names) {
  // --- Node ---
  if (names.includes('package.json')) {
    const pkg = readJSON(path.join(dir, 'package.json')) || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const has = (k) => Object.prototype.hasOwnProperty.call(deps, k);
    const ts = has('typescript') || exists(path.join(dir, 'tsconfig.json'));
    const language = ts ? 'TypeScript' : 'JavaScript';

    let framework = 'node';
    if (has('next')) framework = 'nextjs';
    else if (has('nuxt') || has('nuxt3')) framework = 'nuxt';
    else if (has('@angular/core')) framework = 'angular';
    else if (has('@sveltejs/kit')) framework = 'sveltekit';
    else if (has('svelte')) framework = 'svelte';
    else if (has('vite')) framework = 'vite';
    else if (has('react-scripts')) framework = 'cra';
    else if (has('@nestjs/core')) framework = 'nest';
    else if (has('vue')) framework = 'vue';
    else if (has('express') || has('koa') || has('fastify')) framework = 'express';
    return { stack: 'node', framework, language, pkg, deps };
  }

  // --- PHP via Composer ---
  if (names.includes('composer.json')) {
    const comp = readJSON(path.join(dir, 'composer.json')) || {};
    const req = { ...(comp.require || {}), ...(comp['require-dev'] || {}) };
    let framework = 'php';
    if (req['laravel/framework']) framework = 'laravel';
    else if (Object.keys(req).some(k => k.startsWith('symfony/'))) framework = 'symfony';
    return { stack: 'php', framework, language: 'PHP' };
  }

  // --- Python ---
  if (names.includes('manage.py'))
    return { stack: 'python', framework: 'django', language: 'Python' };
  if (names.includes('requirements.txt') || names.includes('pyproject.toml') || names.includes('Pipfile')) {
    const reqTxt = (readText(path.join(dir, 'requirements.txt')) +
                    readText(path.join(dir, 'pyproject.toml'))).toLowerCase();
    let framework = 'python';
    if (reqTxt.includes('fastapi')) framework = 'fastapi';
    else if (reqTxt.includes('flask')) framework = 'flask';
    else if (reqTxt.includes('django')) framework = 'django';
    return { stack: 'python', framework, language: 'Python' };
  }

  // --- Other ecosystems ---
  if (names.includes('go.mod'))      return { stack: 'go',      framework: 'go',      language: 'Go' };
  if (names.includes('Cargo.toml'))  return { stack: 'rust',    framework: 'rust',    language: 'Rust' };
  if (names.includes('Gemfile'))     return { stack: 'ruby',    framework: 'rails',   language: 'Ruby' };
  if (names.includes('pom.xml') || names.includes('build.gradle'))
                                     return { stack: 'java',    framework: 'spring',  language: 'Java' };
  if (names.includes('pubspec.yaml'))return { stack: 'flutter', framework: 'flutter', language: 'Dart' };

  // --- Plain PHP (no composer) ---
  if (names.some(n => n.endsWith('.php')))
    return { stack: 'php', framework: 'php', language: 'PHP' };

  // --- Static HTML ---
  if (names.includes('index.html'))
    return { stack: 'static', framework: 'static', language: 'HTML' };

  return null;
}

/* ========================= PORT + START ================================== */
function resolvePort(dir, info) {
  if (info.stack === 'node') {
    const scriptPort = parsePort(JSON.stringify(info.pkg?.scripts || {}));
    return scriptPort || envPort(dir) || configPort(dir) ||
           DEFAULT_PORTS[info.framework] || 3000;
  }
  if (info.stack === 'python') return envPort(dir) || DEFAULT_PORTS[info.framework] || 8000;
  if (info.stack === 'php' && info.framework === 'laravel') return envPort(dir) || 8000;
  return null; // php/static get an assigned port later
}

function docroot(dir) {
  for (const d of ['public', 'web', 'www', 'htdocs', 'dist'])
    if (exists(path.join(dir, d))) return path.join(dir, d);
  return dir;
}

function startCommand(dir, info, port) {
  const f = info.framework;
  switch (info.stack) {
    case 'node': {
      const pm = detectPM(dir);
      const s = pickScript(info.pkg?.scripts);
      return { cmd: s ? runCmd(pm, s) : `${pm} install`, pm, script: s };
    }
    case 'php':
      if (f === 'laravel')  return { cmd: `php artisan serve --port=${port}` };
      if (f === 'symfony')  return { cmd: `symfony serve --port=${port}` };
      return { cmd: `php -S localhost:${port} -t "${docroot(dir)}"` };
    case 'static':
      return { cmd: `php -S localhost:${port} -t "${docroot(dir)}"` };
    case 'python':
      if (f === 'django')  return { cmd: `python manage.py runserver ${port}` };
      if (f === 'fastapi') return { cmd: `uvicorn main:app --reload --port ${port}` };
      if (f === 'flask')   return { cmd: `flask run --port ${port}` };
      return { cmd: `python main.py` };
    case 'go':      return { cmd: `go run .` };
    case 'rust':    return { cmd: `cargo run` };
    case 'ruby':    return { cmd: `bundle exec rails server -p ${port}` };
    case 'java':    return { cmd: exists(path.join(dir, 'pom.xml')) ? 'mvn spring-boot:run' : './gradlew bootRun' };
    case 'flutter': return { cmd: `flutter run` };
    default:        return { cmd: null };
  }
}

/* ====================== ANALYZE ONE PROJECT ============================== */
function analyzeProject(dir, names) {
  const info = analyzeStack(dir, names);
  if (!info) return null;
  const port = resolvePort(dir, info);
  const start = startCommand(dir, info, port || CONFIG.phpPortStart);
  return {
    name: path.basename(dir),
    path: dir,
    stack: info.stack,
    framework: info.framework,
    language: info.language,
    packageManager: start.pm || null,
    port: port,                 // null => assigned later (php/static)
    url: port ? `http://localhost:${port}` : null,
    startCommand: start.cmd,
    startCwd: dir,
    script: start.script || null,
    needsAssignedPort: port == null,
  };
}

/* ====================== FOLDER WALK ====================================== */
function findProjects(root, depth, out) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  const names = entries.filter(e => e.isFile()).map(e => e.name);
  const proj = analyzeProject(root, names);
  if (proj) {
    const present = WATCH_FILES.filter(f => names.includes(f) || (f === 'index.html' && names.includes(f)));
    if (!present.length) present.push(...names.filter(n => n.endsWith('.php') || n === 'index.html'));
    out.push({ proj, present });
    if (!CONFIG.monorepo) return; // stop descending once a project is found
  }
  if (depth <= 0) return;
  for (const e of entries) {
    if (e.isDirectory() && !CONFIG.ignoreDirs.has(e.name) && !e.name.startsWith('.'))
      findProjects(path.join(root, e.name), depth - 1, out);
  }
}

/* ====================== PORT ASSIGNMENT ================================= */
function assignPorts(projects, cacheAssign) {
  const used = new Set();
  // Seed only with explicit (non-assigned) ports so a project keeps its own
  // assigned port across runs instead of colliding with itself.
  for (const p of projects) if (p.port && !p.needsAssignedPort) used.add(p.port);
  for (const p of projects) {
    if (!p.needsAssignedPort) continue;
    let port = cacheAssign[p.path];
    if (!port || used.has(port)) {
      port = CONFIG.phpPortStart;
      while (used.has(port)) port++;
    }
    used.add(port);
    cacheAssign[p.path] = port;
    p.port = port;
    p.url = `http://localhost:${port}`;
    // rebuild start command now that the port is known
    p.startCommand = p.startCommand.replace(/localhost:\d+/, `localhost:${port}`);
  }
}

/* ====================== TCP RUNNING CHECK =============================== */
function isPortUp(port, timeout = 350) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(timeout);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, '127.0.0.1');
  });
}

/* ============================== MAIN ==================================== */
async function main() {
  const cache = (!FLAGS.full && readJSON(CONFIG.cacheFile)) || { projects: {}, assign: {} };
  cache.projects = cache.projects || {};
  cache.assign = cache.assign || {};

  // 1. discover candidates
  const found = [];
  for (const root of CONFIG.roots) findProjects(root, CONFIG.maxDepth, found);

  // 2. incremental analyze
  const seen = new Set();
  const projects = [];
  let reused = 0, fresh = 0;
  for (const { proj, present } of found) {
    seen.add(proj.path);
    const fp = fingerprint(proj.path, present);
    const cached = cache.projects[proj.path];
    if (cached && cached.fingerprint === fp) {
      projects.push(cached.data);
      reused++;
    } else {
      cache.projects[proj.path] = { fingerprint: fp, data: proj };
      projects.push(proj);
      fresh++;
    }
  }

  // 3. prune deleted projects
  for (const p of Object.keys(cache.projects)) if (!seen.has(p)) delete cache.projects[p];
  for (const p of Object.keys(cache.assign))   if (!seen.has(p)) delete cache.assign[p];

  // 4. assign stable ports for php/static
  assignPorts(projects, cache.assign);

  // 5. optional running check
  if (FLAGS.check) {
    await Promise.all(projects.map(async (p) => { p.running = p.port ? await isPortUp(p.port) : false; }));
  }

  // 6. write outputs
  const catalog = { scannedAt: new Date().toISOString(), roots: CONFIG.roots, count: projects.length, projects };
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(catalog, null, 2));
  fs.writeFileSync(CONFIG.cacheFile, JSON.stringify(cache, null, 2));

  // 7. report
  console.log(`\nScanned ${CONFIG.roots.length} root(s) → ${projects.length} project(s)  (${fresh} new/changed, ${reused} cached)\n`);
  for (const p of projects.sort((a, b) => a.name.localeCompare(b.name))) {
    const run = FLAGS.check ? (p.running ? '🟢' : '⚪') : '  ';
    console.log(`${run} ${p.name.padEnd(22)} ${(p.framework).padEnd(10)} ${String(p.url || '-').padEnd(26)} ${p.startCommand || ''}`);
  }
  console.log(`\nCatalog → ${CONFIG.outputFile}`);
  if (FLAGS.json) console.log('\n' + JSON.stringify(catalog, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
