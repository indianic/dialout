import type { AiEvent } from './events';

export interface ToolItem {
  id: string;
  name: string;
  summary: string;
  ok: boolean | null;           // null = the call has not returned yet
  resultPreview: string | null;
  resultLines: number | null;
}

export type ChatBlock =
  | { kind: 'user';      key: string; text: string; pending?: boolean }
  | { kind: 'assistant'; key: string; text: string }
  | { kind: 'tools';     key: string; items: ToolItem[] }
  | { kind: 'thinking';  key: string; text: string }
  | { kind: 'status';    key: string; status: string };

// Grouping only ever merges ADJACENT events, so the worst case for an adapter
// that interleaves is two blocks instead of one — never a reordering.
export function groupEvents(events: AiEvent[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let lastStatus: string | null = null;

  events.forEach((e, i) => {
    const key = `${('id' in e && e.id) || ('forId' in e && e.forId) || e.kind}-${i}`;
    const tail = blocks[blocks.length - 1];

    if (e.kind === 'message') {
      blocks.push(e.role === 'user'
        ? { kind: 'user', key, text: e.text || '' }
        : { kind: 'assistant', key, text: e.text || '' });
      return;
    }

    if (e.kind === 'tool_call') {
      const item: ToolItem = {
        id: e.id || key,
        name: e.name || 'tool',
        summary: e.summary || '',
        ok: null, resultPreview: null, resultLines: null,
      };
      if (tail && tail.kind === 'tools') tail.items.push(item);
      else blocks.push({ kind: 'tools', key, items: [item] });
      return;
    }

    if (e.kind === 'tool_result') {
      // Search backwards: the call is usually in the current block, but a
      // slow tool can return after a message has split the trace.
      for (let b = blocks.length - 1; b >= 0; b--) {
        const blk = blocks[b];
        if (blk.kind !== 'tools') continue;
        const item = blk.items.find((t) => t.id === e.forId);
        if (!item) continue;
        item.ok = e.ok !== false;
        item.resultPreview = e.preview || '';
        item.resultLines = e.preview ? e.preview.split('\n').length : 0;
        return;
      }
      return; // orphan result: drop it rather than invent a row
    }

    if (e.kind === 'thinking') {
      blocks.push({ kind: 'thinking', key, text: e.text || '' });
      return;
    }

    if (e.kind === 'state') {
      const status = e.status || '';
      if (status && status !== lastStatus) {
        lastStatus = status;
        blocks.push({ kind: 'status', key, status });
      }
    }
  });

  return blocks;
}
