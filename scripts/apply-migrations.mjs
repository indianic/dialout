// Runs every schema migration, in order, on every deploy.
//
// This exists because the previous arrangement — a hand-written chain of
// `node scripts/apply-x.mjs && node scripts/apply-y.mjs && …` inside
// .gitlab-ci.yml — silently drifted. Three scripts
// (apply-auth-security-columns, apply-cowork-columns,
// apply-terminal-naming-columns) were never added to it, so the columns they
// create existed in production only because someone had run them by hand.
// Nothing failed; the deploy just quietly did less than it looked like.
//
// The fix is not "remember to update the chain". It is that this script
// REFUSES TO RUN if any scripts/apply-*.mjs on disk is missing from ORDER
// below. Adding a migration and forgetting to wire it up now breaks the
// deploy loudly at the migration step, before the build, instead of producing
// a running app with a missing column.
//
// Every migration must stay idempotent — ADD COLUMN IF NOT EXISTS,
// CREATE TABLE/INDEX IF NOT EXISTS. They run on every single deploy.

import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

const here = dirname(fileURLToPath(import.meta.url));

// Explicit rather than alphabetical: if a future migration ever does depend on
// an earlier one, the order is here to be adjusted rather than accidental.
const ORDER = [
  'apply-auth-security-columns.mjs',
  'apply-2fa-columns.mjs',
  'apply-process-control-columns.mjs',
  'apply-project-credentials.mjs',
  'apply-terminal-last-seen.mjs',
  'apply-terminal-naming-columns.mjs',
  'apply-cowork-columns.mjs',
  'apply-push-subscriptions.mjs',
  'apply-push-platform.mjs',
  'apply-enquiries-table.mjs',
];

// One-shot scripts are not migrations and must never run on every deploy.
// hash-existing-pins.mjs rewrites stored PINs; re-running it is not a no-op.
const ON_DISK = readdirSync(here)
  .filter((name) => name.startsWith('apply-') && name.endsWith('.mjs'))
  .filter((name) => name !== 'apply-migrations.mjs');

const unlisted = ON_DISK.filter((name) => !ORDER.includes(name));
const missing = ORDER.filter((name) => !ON_DISK.includes(name));

if (unlisted.length) {
  console.error('\nMigration(s) present on disk but not listed in ORDER:');
  for (const name of unlisted) console.error(`  - ${name}`);
  console.error('\nAdd them to ORDER in scripts/apply-migrations.mjs.');
  console.error('Refusing to deploy a half-applied schema.\n');
  process.exit(1);
}

if (missing.length) {
  console.error('\nORDER names migration(s) that do not exist:');
  for (const name of missing) console.error(`  - ${name}`);
  console.error('\nRemove them from ORDER, or restore the files.\n');
  process.exit(1);
}

console.log(`Applying ${ORDER.length} migrations…\n`);

for (const name of ORDER) {
  process.stdout.write(`  ${name} … `);
  const run = spawnSync(process.execPath, [join(here, name)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  if (run.status !== 0) {
    console.error('FAILED\n');
    console.error(run.stdout?.toString() || '');
    console.error(run.stderr?.toString() || '');
    console.error(`\n${name} failed. Stopping before the build.\n`);
    process.exit(1);
  }
  console.log('ok');
}

console.log('\nAll migrations applied.\n');
