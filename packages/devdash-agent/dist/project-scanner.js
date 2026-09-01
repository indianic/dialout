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
exports.scanProjects = scanProjects;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const port_scanner_1 = require("./port-scanner");
const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'vendor', 'dist', 'build', 'out', 'target',
    '.next', '.nuxt', '.svelte-kit', '.venv', 'venv', '__pycache__', '.cache',
    'coverage', '.idea', '.vscode', 'tmp', 'storage', 'bootstrap',
]);
const DEFAULT_PORTS = {
    nextjs: 3000, nuxt: 3000, angular: 4200, vite: 5173, cra: 3000,
    sveltekit: 5173, svelte: 5173, vue: 8080, nest: 3000, express: 3000,
    node: 3000, laravel: 8000, symfony: 8000, django: 8000, flask: 5000,
    fastapi: 8000, rails: 3000, go: 8080, rust: 8080, spring: 8080,
};
function readJSON(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
}
function readText(p) {
    try {
        return fs.readFileSync(p, 'utf8');
    }
    catch {
        return '';
    }
}
function fileExists(p) {
    try {
        fs.accessSync(p);
        return true;
    }
    catch {
        return false;
    }
}
function parseScriptPort(scripts) {
    const str = JSON.stringify(scripts || {});
    let m = str.match(/(?:-p|--port)[ =]+(\d{2,5})/);
    if (m)
        return +m[1];
    m = str.match(/\bPORT[ =]+(\d{2,5})/);
    if (m)
        return +m[1];
    return null;
}
function envPort(dir) {
    for (const f of ['.env.local', '.env']) {
        const t = readText(path.join(dir, f));
        const m = t.match(/(?:^|\n)\s*(?:PORT|APP_PORT|SERVER_PORT)\s*=\s*"?(\d{2,5})"?/);
        if (m)
            return +m[1];
    }
    return null;
}
function configPort(dir) {
    for (const f of ['vite.config.ts', 'vite.config.js', 'vue.config.js',
        'nuxt.config.ts', 'nuxt.config.js', 'svelte.config.js']) {
        const p = path.join(dir, f);
        if (!fileExists(p))
            continue;
        const m = readText(p).match(/port\s*:\s*(\d{2,5})/);
        if (m)
            return +m[1];
    }
    return null;
}
function detectPM(dir) {
    if (fileExists(path.join(dir, 'bun.lockb')))
        return 'bun';
    if (fileExists(path.join(dir, 'pnpm-lock.yaml')))
        return 'pnpm';
    if (fileExists(path.join(dir, 'yarn.lock')))
        return 'yarn';
    return 'npm';
}
function runCmd(pm, script) {
    if (pm === 'npm')
        return script === 'start' ? 'npm start' : `npm run ${script}`;
    if (pm === 'yarn')
        return `yarn ${script}`;
    if (pm === 'pnpm')
        return `pnpm ${script}`;
    if (pm === 'bun')
        return `bun run ${script}`;
    return `npm run ${script}`;
}
function pickScript(scripts) {
    for (const s of ['dev', 'start', 'serve'])
        if (scripts && scripts[s])
            return s;
    return null;
}
function docroot(dir) {
    for (const d of ['public', 'web', 'www', 'htdocs', 'dist'])
        if (fileExists(path.join(dir, d)))
            return path.join(dir, d);
    return dir;
}
function analyzeStack(dir, names) {
    if (names.includes('package.json')) {
        const pkg = readJSON(path.join(dir, 'package.json')) || {};
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const has = (k) => Object.prototype.hasOwnProperty.call(deps, k);
        const ts = has('typescript') || fileExists(path.join(dir, 'tsconfig.json'));
        const language = ts ? 'TypeScript' : 'JavaScript';
        let framework = 'node';
        if (has('next'))
            framework = 'nextjs';
        else if (has('nuxt') || has('nuxt3'))
            framework = 'nuxt';
        else if (has('@angular/core'))
            framework = 'angular';
        else if (has('@sveltejs/kit'))
            framework = 'sveltekit';
        else if (has('svelte'))
            framework = 'svelte';
        else if (has('@nestjs/core'))
            framework = 'nest';
        else if (has('react-scripts'))
            framework = 'cra';
        else if (has('vite'))
            framework = 'vite';
        else if (has('vue'))
            framework = 'vue';
        else if (has('express') || has('koa') || has('fastify'))
            framework = 'express';
        return { stack: 'node', framework, language, pkg };
    }
    if (names.includes('composer.json')) {
        const comp = readJSON(path.join(dir, 'composer.json')) || {};
        const req = { ...(comp.require || {}), ...(comp['require-dev'] || {}) };
        let framework = 'php';
        if (req['laravel/framework'])
            framework = 'laravel';
        else if (Object.keys(req).some((k) => k.startsWith('symfony/')))
            framework = 'symfony';
        return { stack: 'php', framework, language: 'PHP' };
    }
    if (names.includes('manage.py'))
        return { stack: 'python', framework: 'django', language: 'Python' };
    if (names.includes('requirements.txt') || names.includes('pyproject.toml') || names.includes('Pipfile')) {
        const reqTxt = (readText(path.join(dir, 'requirements.txt')) +
            readText(path.join(dir, 'pyproject.toml'))).toLowerCase();
        let framework = 'python';
        if (reqTxt.includes('fastapi'))
            framework = 'fastapi';
        else if (reqTxt.includes('flask'))
            framework = 'flask';
        else if (reqTxt.includes('django'))
            framework = 'django';
        return { stack: 'python', framework, language: 'Python' };
    }
    if (names.includes('go.mod'))
        return { stack: 'go', framework: 'go', language: 'Go' };
    if (names.includes('Cargo.toml'))
        return { stack: 'rust', framework: 'rust', language: 'Rust' };
    if (names.includes('Gemfile'))
        return { stack: 'ruby', framework: 'rails', language: 'Ruby' };
    if (names.includes('pom.xml') || names.includes('build.gradle'))
        return { stack: 'java', framework: 'spring', language: 'Java' };
    if (names.includes('pubspec.yaml'))
        return { stack: 'flutter', framework: 'flutter', language: 'Dart' };
    if (names.some((n) => n.endsWith('.php')))
        return { stack: 'php', framework: 'php', language: 'PHP' };
    if (names.includes('index.html'))
        return { stack: 'static', framework: 'static', language: 'HTML' };
    return null;
}
function resolvePort(dir, info) {
    if (info.stack === 'node') {
        const sp = parseScriptPort(info.pkg?.scripts);
        if (sp)
            return { port: sp, source: 'script' };
        const ep = envPort(dir);
        if (ep)
            return { port: ep, source: 'env' };
        const cp = configPort(dir);
        if (cp)
            return { port: cp, source: 'config' };
        return { port: DEFAULT_PORTS[info.framework] || 3000, source: 'default' };
    }
    if (info.stack === 'python') {
        const ep = envPort(dir);
        if (ep)
            return { port: ep, source: 'env' };
        return { port: DEFAULT_PORTS[info.framework] || 8000, source: 'default' };
    }
    if (info.stack === 'php' && info.framework === 'laravel') {
        const ep = envPort(dir);
        if (ep)
            return { port: ep, source: 'env' };
        return { port: 8000, source: 'default' };
    }
    if (['go', 'rust', 'ruby', 'java'].includes(info.stack))
        return { port: DEFAULT_PORTS[info.framework] || null, source: 'default' };
    // plain php, symfony, static, flutter → no port could be detected. Leave it
    // unassigned so the user sets one; we do NOT auto-allocate an arbitrary port.
    return { port: null, source: 'none' };
}
function buildStartCommand(dir, info, port) {
    const f = info.framework;
    switch (info.stack) {
        case 'node': {
            const pm = detectPM(dir);
            const s = pickScript(info.pkg?.scripts);
            return { cmd: s ? runCmd(pm, s) : `${pm} install`, pm };
        }
        case 'php':
            // No detected port → no runnable command; the user assigns a port first.
            if (port == null)
                return { cmd: null };
            if (f === 'laravel')
                return { cmd: `php artisan serve --port=${port}` };
            if (f === 'symfony')
                return { cmd: `symfony serve --port=${port}` };
            return { cmd: `php -S localhost:${port} -t "${docroot(dir)}"` };
        case 'static':
            if (port == null)
                return { cmd: null };
            return { cmd: `php -S localhost:${port} -t "${docroot(dir)}"` };
        case 'python':
            if (f === 'django')
                return { cmd: `python manage.py runserver ${port}` };
            if (f === 'fastapi')
                return { cmd: `uvicorn main:app --reload --port ${port}` };
            if (f === 'flask')
                return { cmd: `flask run --port ${port}` };
            return { cmd: 'python main.py' };
        case 'go': return { cmd: 'go run .' };
        case 'rust': return { cmd: 'cargo run' };
        case 'ruby': return { cmd: `bundle exec rails server -p ${port}` };
        case 'java': return { cmd: fileExists(path.join(dir, 'pom.xml')) ? 'mvn spring-boot:run' : './gradlew bootRun' };
        case 'flutter': return { cmd: 'flutter run' };
        default: return { cmd: null };
    }
}
function analyzeProject(dir, names) {
    const info = analyzeStack(dir, names);
    if (!info)
        return null;
    const { port, source } = resolvePort(dir, info);
    const start = buildStartCommand(dir, info, port);
    return {
        name: path.basename(dir),
        path: dir,
        stack: info.stack,
        framework: info.framework,
        language: info.language,
        packageManager: start.pm || null,
        port,
        portSource: source,
        url: port ? `http://localhost:${port}` : null,
        startCommand: start.cmd,
    };
}
function findProjects(root, depth, out) {
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    }
    catch {
        return;
    }
    const names = entries.filter((e) => e.isFile()).map((e) => e.name);
    const proj = analyzeProject(root, names);
    if (proj) {
        out.push(proj);
        return; // stop descending once a project is found
    }
    if (depth <= 0)
        return;
    for (const e of entries) {
        if (e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith('.'))
            findProjects(path.join(root, e.name), depth - 1, out);
    }
}
async function scanProjects(rootPath, maxDepth = 2) {
    let resolved = path.resolve(rootPath);
    try {
        resolved = fs.realpathSync(resolved);
    }
    catch { /* keep resolved */ }
    const found = [];
    findProjects(resolved, maxDepth, found);
    found.sort((a, b) => a.path.localeCompare(b.path));
    // No auto-allocation: projects with no detectable port (plain php, symfony,
    // static, flutter) stay port: null so the user assigns one when adding.
    // Probe only the ports we actually detected to mark running projects.
    const uniquePorts = Array.from(new Set(found.map((p) => p.port).filter((n) => n != null)));
    const open = new Set(await (0, port_scanner_1.scanPorts)(uniquePorts));
    return found.map((p) => ({ ...p, running: p.port != null && open.has(p.port) }));
}
//# sourceMappingURL=project-scanner.js.map