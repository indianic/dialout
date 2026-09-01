const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  renderSshLocalNetworkBlock, removeSshLocalNetworkBlock, hasConnectTimeout,
  installSshLocalNetworkBlock, sshLocalNetworkApplies, defaultSshConfigPath,
  SSH_LN_BEGIN, SSH_LN_END,
} = require('../dist/ssh-local-network');

function tmpConfig(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-ssh-'));
  const p = path.join(dir, '.ssh', 'config');
  if (contents !== undefined) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents);
  }
  return p;
}

// --- platform gate ---

test('applies on darwin only', () => {
  assert.strictEqual(sshLocalNetworkApplies('darwin'), true);
  assert.strictEqual(sshLocalNetworkApplies('linux'), false);
});

test('install is a no-op off darwin', () => {
  const p = tmpConfig('Host old\n  User me\n');
  assert.strictEqual(installSshLocalNetworkBlock(p, 15, 'linux'), 'skipped-platform');
  assert.strictEqual(fs.readFileSync(p, 'utf-8'), 'Host old\n  User me\n');
});

test('defaultSshConfigPath is ~/.ssh/config', () => {
  assert.strictEqual(defaultSshConfigPath('/home/x'), path.join('/home/x', '.ssh', 'config'));
});

// --- rendering ---

test('block is marker-delimited and sets ConnectTimeout', () => {
  const b = renderSshLocalNetworkBlock(15);
  assert.ok(b.startsWith(SSH_LN_BEGIN));
  assert.ok(b.endsWith(SSH_LN_END));
  assert.match(b, /^Host \*$/m);
  assert.match(b, /^ {2}ConnectTimeout 15$/m);
});

test('timeout is clamped and always an integer', () => {
  assert.match(renderSshLocalNetworkBlock(0), /ConnectTimeout 1$/m);
  assert.match(renderSshLocalNetworkBlock(-5), /ConnectTimeout 1$/m);
  assert.match(renderSshLocalNetworkBlock(9999), /ConnectTimeout 300$/m);
  assert.match(renderSshLocalNetworkBlock(12.7), /ConnectTimeout 12$/m);
});

test('a non-numeric timeout cannot inject config lines', () => {
  const b = renderSshLocalNetworkBlock('5\n  ProxyCommand evil');
  assert.ok(!b.includes('ProxyCommand'));
  assert.match(b, /ConnectTimeout \d+$/m);
});

// --- removal ---

test('removeSshLocalNetworkBlock restores the original file', () => {
  const before = 'Host gitlab\n  User git\n';
  const withBlock = before + '\n' + renderSshLocalNetworkBlock() + '\n';
  assert.strictEqual(removeSshLocalNetworkBlock(withBlock).trim(), before.trim());
});

test('removal is a no-op when no block is present', () => {
  const s = 'Host a\n  User b\n';
  assert.strictEqual(removeSshLocalNetworkBlock(s), s);
});

test('removal leaves the file alone when the end marker is missing', () => {
  const s = `Host a\n${SSH_LN_BEGIN}\nHost *\n  ConnectTimeout 15\n`;
  assert.strictEqual(removeSshLocalNetworkBlock(s), s);
});

// --- existing-setting detection ---

test('an existing ConnectTimeout anywhere is detected', () => {
  assert.strictEqual(hasConnectTimeout('Host a\n  ConnectTimeout 5\n'), true);
  assert.strictEqual(hasConnectTimeout('Host a\n  connecttimeout=5\n'), true);
  assert.strictEqual(hasConnectTimeout('Host a\n  User b\n'), false);
});

test('our own block does not count as an existing ConnectTimeout', () => {
  assert.strictEqual(hasConnectTimeout(renderSshLocalNetworkBlock()), false);
});

// --- install ---

test('creates ~/.ssh/config (0600) when absent', () => {
  const p = tmpConfig(undefined);
  assert.strictEqual(installSshLocalNetworkBlock(p, 15, 'darwin'), 'created');
  const content = fs.readFileSync(p, 'utf-8');
  assert.ok(content.includes(SSH_LN_BEGIN));
  assert.strictEqual(fs.statSync(p).mode & 0o777, 0o600);
  assert.strictEqual(fs.statSync(path.dirname(p)).mode & 0o777, 0o700);
});

test('appends at the END so existing Host stanzas keep precedence', () => {
  const p = tmpConfig('Host build\n  User deploy\n');
  assert.strictEqual(installSshLocalNetworkBlock(p, 15, 'darwin'), 'installed');
  const content = fs.readFileSync(p, 'utf-8');
  assert.ok(content.indexOf('Host build') < content.indexOf(SSH_LN_BEGIN));
});

test('re-install replaces rather than duplicates the block', () => {
  const p = tmpConfig('Host build\n  User deploy\n');
  installSshLocalNetworkBlock(p, 15, 'darwin');
  assert.strictEqual(installSshLocalNetworkBlock(p, 30, 'darwin'), 'updated');
  const content = fs.readFileSync(p, 'utf-8');
  assert.strictEqual(content.split(SSH_LN_BEGIN).length - 1, 1);
  assert.match(content, /ConnectTimeout 30/);
  assert.ok(content.includes('Host build'));
});

test("a user's own ConnectTimeout is left alone", () => {
  const original = 'Host *\n  ConnectTimeout 3\n';
  const p = tmpConfig(original);
  assert.strictEqual(installSshLocalNetworkBlock(p, 15, 'darwin'), 'skipped-existing');
  assert.strictEqual(fs.readFileSync(p, 'utf-8'), original);
});

test('tightens permissions on a pre-existing world-readable config', () => {
  const p = tmpConfig('Host build\n  User deploy\n');
  fs.chmodSync(p, 0o644);
  installSshLocalNetworkBlock(p, 15, 'darwin');
  assert.strictEqual(fs.statSync(p).mode & 0o777, 0o600);
});

test('install then remove round-trips to the original bytes', () => {
  const original = 'Host build\n  User deploy\n';
  const p = tmpConfig(original);
  installSshLocalNetworkBlock(p, 15, 'darwin');
  const restored = removeSshLocalNetworkBlock(fs.readFileSync(p, 'utf-8'));
  assert.strictEqual(restored.trim(), original.trim());
});
