#!/usr/bin/env node
/**
 * Stages @dialout/shared into this package's own node_modules so that
 * `bundleDependencies` picks it up.
 *
 * Why bundle it at all: `dialout` is meant to be the only thing a user
 * installs. The shared package is a handful of types and constants used by the
 * server, the agent and the mobile app; publishing it separately would mean a
 * second package to version, and an `npm i -g dialout` that silently fails
 * with E404 for anyone who installs before it exists.
 *
 * Why a script rather than letting npm do it: bundleDependencies packs from
 * this package's OWN node_modules, and in a workspace the dependency is
 * symlinked at the repo root instead. npm will not follow that symlink into
 * the tarball, so without this step the tarball ships a require() with nothing
 * behind it — and the failure only shows up on a machine that has no local
 * checkout, which is every real user.
 *
 * Runs automatically on `npm pack` and `npm publish`.
 */
const { cpSync, existsSync, mkdirSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

const here = resolve(__dirname, '..');
const source = resolve(here, '..', 'devdash-shared');
const target = join(here, 'node_modules', '@dialout', 'shared');

if (!existsSync(source)) {
  console.error(`prepack: cannot find the shared package at ${source}`);
  process.exit(1);
}
if (!existsSync(join(source, 'dist'))) {
  console.error('prepack: the shared package has no dist/ — build it first');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(join(here, 'node_modules', '@dialout'), { recursive: true });
cpSync(source, target, {
  recursive: true,
  // Its own node_modules would drag the whole workspace tree in behind it.
  filter: (src) => !src.includes(`${join('shared', 'node_modules')}`) && !src.includes('/.git'),
});
rmSync(join(target, 'node_modules'), { recursive: true, force: true });
console.log('prepack: staged @dialout/shared for bundling');
