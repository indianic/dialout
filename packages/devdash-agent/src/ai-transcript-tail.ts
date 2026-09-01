import * as fs from 'fs';

// Vendor-neutral JSONL follower. It has no idea what a message is; it hands
// raw records to an adapter. Polled rather than fs.watch-driven: watch is
// unreliable on network and virtualised filesystems, and a 1 s stat is cheap.

const POLL_MS = 1000;
const MAX_CHUNK = 4 << 20; // never read more than 4 MB in one pass

export function splitRecords(buffer: string): { records: unknown[]; rest: string } {
  const records: unknown[] = [];
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A vendor format change, or a line caught mid-write. Skip it; the
      // feature must degrade, never die.
    }
  }
  return { records, rest };
}

export class TranscriptTail {
  private position = 0;
  private partial = '';
  private timer: NodeJS.Timeout | null = null;
  lastGrowthMs = 0;

  constructor(
    private readonly path: string,
    private readonly onRecords: (records: unknown[]) => void
  ) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.pump(), POLL_MS);
    this.pump();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // Read from position to EOF. Public so an initial replay can be forced.
  pump(): void {
    let size: number;
    try {
      size = fs.statSync(this.path).size;
    } catch {
      return; // rotated away or not created yet; try again next tick
    }
    if (size < this.position) {
      // Truncated or replaced. Anything else would emit garbage from the
      // middle of a line.
      this.position = 0;
      this.partial = '';
    }
    if (size === this.position) return;

    const length = Math.min(size - this.position, MAX_CHUNK);
    const buf = Buffer.alloc(length);
    let read = 0;
    try {
      const fd = fs.openSync(this.path, 'r');
      read = fs.readSync(fd, buf, 0, length, this.position);
      fs.closeSync(fd);
    } catch {
      return;
    }
    this.position += read;
    this.lastGrowthMs = Date.now();

    const { records, rest } = splitRecords(this.partial + buf.subarray(0, read).toString());
    this.partial = rest;
    if (records.length) this.onRecords(records);
  }
}
