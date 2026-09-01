const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanProjects } = require('../dist/project-scanner.js');

function makeFixtures() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devdash-scan-'));
  const write = (rel, content) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };

  // Next.js + TypeScript, port from script flag
  write('next-app/package.json', JSON.stringify({
    dependencies: { next: '15.0.0', react: '19.0.0' },
    devDependencies: { typescript: '5.0.0' },
    scripts: { dev: 'next dev -p 4200' },
  }));
  write('next-app/tsconfig.json', '{}');

  // Vite, port from config file
  write('vite-app/package.json', JSON.stringify({
    devDependencies: { vite: '6.0.0' },
    scripts: { dev: 'vite' },
  }));
  write('vite-app/vite.config.ts', 'export default { server: { port: 5199 } }');
  write('vite-app/yarn.lock', '');

  // Express, port from .env
  write('api-app/package.json', JSON.stringify({
    dependencies: { express: '4.0.0' },
    scripts: { start: 'node index.js' },
  }));
  write('api-app/.env', 'PORT=4123\n');

  // Laravel
  write('laravel-app/composer.json', JSON.stringify({
    require: { 'laravel/framework': '^11.0' },
  }));

  // Plain PHP and static HTML — no port detectable, left unassigned (no auto-allocation)
  write('php-site/index.php', '<?php echo "hi";');
  write('static-site/index.html', '<h1>hi</h1>');

  // Django, nested one level deep
  write('group/django-app/manage.py', '#!/usr/bin/env python');

  // Must be ignored: project inside node_modules
  write('next-app/node_modules/fake/package.json', JSON.stringify({
    dependencies: { express: '4.0.0' },
  }));

  return root;
}

test('scanProjects detects stacks, ports, and start commands', async () => {
  const root = makeFixtures();
  try {
    const projects = await scanProjects(root, 2);
    const byName = Object.fromEntries(projects.map((p) => [p.name, p]));

    assert.equal(projects.length, 7);

    assert.equal(byName['next-app'].framework, 'nextjs');
    assert.equal(byName['next-app'].language, 'TypeScript');
    assert.equal(byName['next-app'].port, 4200);
    assert.equal(byName['next-app'].portSource, 'script');
    assert.equal(byName['next-app'].startCommand, 'npm run dev');
    assert.equal(byName['next-app'].url, 'http://localhost:4200');

    assert.equal(byName['vite-app'].framework, 'vite');
    assert.equal(byName['vite-app'].port, 5199);
    assert.equal(byName['vite-app'].portSource, 'config');
    assert.equal(byName['vite-app'].packageManager, 'yarn');
    assert.equal(byName['vite-app'].startCommand, 'yarn dev');

    assert.equal(byName['api-app'].framework, 'express');
    assert.equal(byName['api-app'].port, 4123);
    assert.equal(byName['api-app'].portSource, 'env');

    assert.equal(byName['laravel-app'].framework, 'laravel');
    assert.equal(byName['laravel-app'].port, 8000);
    assert.equal(byName['laravel-app'].startCommand, 'php artisan serve --port=8000');

    assert.equal(byName['django-app'].framework, 'django');
    assert.equal(byName['django-app'].port, 8000);
    assert.equal(byName['django-app'].startCommand, 'python manage.py runserver 8000');

    // php/static: no port detected → left unassigned (no auto-allocation).
    // The user assigns a port when adding; url/startCommand stay empty.
    assert.equal(byName['php-site'].stack, 'php');
    assert.equal(byName['php-site'].port, null);
    assert.equal(byName['php-site'].portSource, 'none');
    assert.equal(byName['php-site'].url, null);
    assert.equal(byName['php-site'].startCommand, null);
    assert.equal(byName['php-site'].running, false);
    assert.equal(byName['static-site'].stack, 'static');
    assert.equal(byName['static-site'].port, null);
    assert.equal(byName['static-site'].portSource, 'none');
    assert.equal(byName['static-site'].url, null);
    assert.equal(byName['static-site'].startCommand, null);

    // nothing detected inside node_modules
    assert.ok(!byName['fake']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanProjects is deterministic across runs', async () => {
  const root = makeFixtures();
  try {
    const a = await scanProjects(root, 2);
    const b = await scanProjects(root, 2);
    assert.deepEqual(
      a.map((p) => [p.path, p.port]),
      b.map((p) => [p.path, p.port])
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanProjects respects maxDepth', async () => {
  const root = makeFixtures();
  try {
    const shallow = await scanProjects(root, 0);
    // root itself is not a project, depth 0 means don't descend
    assert.equal(shallow.length, 0);
    const depth1 = await scanProjects(root, 1);
    // group/django-app is at depth 2, so not found at depth 1
    assert.ok(!depth1.some((p) => p.name === 'django-app'));
    assert.ok(depth1.some((p) => p.name === 'next-app'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scanProjects detects a project when the root itself is one', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devdash-scan-root-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      dependencies: { '@nestjs/core': '10.0.0' },
      scripts: { dev: 'nest start --watch' },
    }));
    const projects = await scanProjects(root, 2);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].framework, 'nest');
    assert.equal(projects[0].path, fs.realpathSync(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
