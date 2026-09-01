#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

function check(label, fn) {
  try {
    const result = fn();
    console.log(`${GREEN}  ✓${NC} ${label}${result ? ` — ${result}` : ''}`);
    return true;
  } catch (err) {
    console.log(`${RED}  ✗${NC} ${label} — ${err.message || 'failed'}`);
    return false;
  }
}

console.log('');
console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
console.log(`${BOLD}  dialout installed${NC}`);
console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
console.log('');

console.log(`${CYAN}Checking requirements...${NC}`);

const nodeOk = check('Node.js >= 18', () => {
  const v = process.version.replace('v', '');
  const major = parseInt(v.split('.')[0]);
  if (major < 18) throw new Error(`found ${process.version}, need >= 18`);
  return process.version;
});

const platformOk = check('Platform supported', () => {
  const p = os.platform();
  if (p !== 'darwin' && p !== 'linux') throw new Error(`${p} not supported yet`);
  return `${p} ${os.arch()}`;
});

const ptyOk = check('node-pty native module', () => {
  require('node-pty');
  return 'loaded';
});

console.log('');

if (!ptyOk) {
  console.log(`${YELLOW}  node-pty failed to load. Try rebuilding:${NC}`);
  console.log(`  npm rebuild node-pty`);
  console.log('');
}

if (nodeOk && platformOk && ptyOk) {
  console.log(`${GREEN}All checks passed!${NC}`);
} else {
  console.log(`${YELLOW}Some checks failed. The agent may not work correctly.${NC}`);
}

console.log('');
console.log(`${CYAN}Next steps:${NC}`);
console.log('');
console.log('  1. Generate an API key in the DevDash web UI (MACHINES tab)');
console.log('');
console.log('  2. Configure the agent:');
console.log(`     ${BOLD}devdash-agent init${NC}`);
console.log('');
console.log('  3. Start the agent:');
console.log(`     ${BOLD}devdash-agent start${NC}`);
console.log('');
console.log('  4. Install as service (auto-start on boot):');
console.log(`     ${BOLD}devdash-agent install-service${NC}`);
console.log('');
console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
console.log('');
