import { describe, it, expect } from 'vitest';
import { groupEvents } from './chat-blocks';
import type { AiEvent } from './ai-events';

const call = (id: string, name: string): AiEvent =>
  ({ kind: 'tool_call', id, name, summary: `${name} thing` });
const result = (forId: string, ok = true): AiEvent =>
  ({ kind: 'tool_result', forId, ok, preview: 'line1\nline2' });
const msg = (role: 'user' | 'assistant', text: string, id = text): AiEvent =>
  ({ kind: 'message', role, text, id });

describe('groupEvents', () => {
  it('merges consecutive tool calls into one block', () => {
    const blocks = groupEvents([call('a', 'Read'), call('b', 'Bash')]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('tools');
    if (blocks[0].kind === 'tools') expect(blocks[0].items).toHaveLength(2);
  });

  it('splits tool blocks when a message comes between them', () => {
    const blocks = groupEvents([
      call('a', 'Read'), msg('assistant', 'hello'), call('b', 'Bash'),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['tools', 'assistant', 'tools']);
  });

  it('attaches a result to its call by forId', () => {
    const blocks = groupEvents([call('a', 'Read'), call('b', 'Bash'), result('a', false)]);
    if (blocks[0].kind !== 'tools') throw new Error('expected tools');
    expect(blocks[0].items[0].ok).toBe(false);
    expect(blocks[0].items[0].resultLines).toBe(2);
    expect(blocks[0].items[1].ok).toBe(null); // no result yet
  });

  // A result whose call was never seen must not crash or invent a row.
  it('ignores an orphan result', () => {
    expect(groupEvents([result('nope')])).toHaveLength(0);
  });

  it('keeps a lone tool call', () => {
    const blocks = groupEvents([call('a', 'Read')]);
    expect(blocks).toHaveLength(1);
  });

  it('collapses repeated identical statuses to one divider', () => {
    const blocks = groupEvents([
      { kind: 'state', status: 'working' },
      { kind: 'state', status: 'working' },
      { kind: 'state', status: 'waiting_approval' },
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['status', 'status']);
    if (blocks[1].kind === 'status') expect(blocks[1].status).toBe('waiting_approval');
  });

  it('separates user and assistant messages into their own blocks', () => {
    const blocks = groupEvents([msg('user', 'hi'), msg('assistant', 'hello')]);
    expect(blocks.map((b) => b.kind)).toEqual(['user', 'assistant']);
  });

  it('gives every block a stable unique key', () => {
    const blocks = groupEvents([msg('user', 'hi'), call('a', 'Read'), call('b', 'Bash')]);
    const keys = blocks.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
