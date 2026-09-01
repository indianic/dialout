const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { splitRecords, TranscriptTail } = require('../dist/ai-transcript-tail');

test('splitRecords parses whole lines and keeps the partial tail', () => {
  const { records, rest } = splitRecords('{"a":1}\n{"b":2}\n{"c":');
  assert.deepStrictEqual(records, [{ a: 1 }, { b: 2 }]);
  assert.strictEqual(rest, '{"c":');
});

test('splitRecords skips an unparseable line rather than throwing', () => {
  // A vendor format change must never take the feature down.
  const { records } = splitRecords('{"a":1}\nnot json\n{"b":2}\n');
  assert.deepStrictEqual(records, [{ a: 1 }, { b: 2 }]);
});

test('splitRecords on empty input yields nothing', () => {
  assert.deepStrictEqual(splitRecords(''), { records: [], rest: '' });
});

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ddtail-')), 't.jsonl');

test('TranscriptTail emits records appended after start', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{"seq":0}\n');
  const seen = [];
  const tail = new TranscriptTail(file, (recs) => seen.push(...recs));
  tail.start();
  fs.appendFileSync(file, '{"seq":1}\n{"seq":2}\n');
  await new Promise((r) => setTimeout(r, 1500));
  tail.stop();
  assert.deepStrictEqual(seen.map((r) => r.seq), [0, 1, 2]);
});

test('TranscriptTail recovers when the file is truncated', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{"seq":1}\n{"seq":2}\n');
  const seen = [];
  const tail = new TranscriptTail(file, (recs) => seen.push(...recs));
  tail.start();
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(file, '{"seq":9}\n'); // shorter than the old read position
  await new Promise((r) => setTimeout(r, 1500));
  tail.stop();
  assert.ok(seen.some((r) => r.seq === 9), 'must re-read from 0 after truncation');
});

test('TranscriptTail on a missing file does not throw', () => {
  const tail = new TranscriptTail('/nonexistent/nope.jsonl', () => {});
  tail.start();
  tail.stop();
});
