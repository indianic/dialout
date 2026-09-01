import { AiAdapter, AiEvent, preview } from './types';

// Claude Code writes ~/.claude/projects/<escaped-cwd>/<session-uuid>.jsonl,
// one JSON record per line. `user` and `assistant` records carry a full
// Anthropic message object; the rest are session metadata.

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((b: any) => (typeof b?.text === 'string' ? b.text : '')).join('');
  }
  return '';
}

// A short human string, so the UI never has to understand a tool's schema.
function summarize(name: string, input: any): string {
  if (input && typeof input === 'object') {
    if (typeof input.command === 'string') return `${name}: ${input.command}`;
    if (typeof input.file_path === 'string') {
      // Absolute paths are long and the leading directories are noise on a
      // phone; the last two segments identify the file well enough.
      const parts = input.file_path.split('/').filter(Boolean);
      return `${name} ${parts.slice(-2).join('/')}`;
    }
    if (typeof input.pattern === 'string') return `${name}: ${input.pattern}`;
  }
  return name;
}

export const claudeAdapter: AiAdapter = {
  toEvents(record: unknown): AiEvent[] {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return [];
    if (rec.type !== 'user' && rec.type !== 'assistant') return [];
    // Subagent output would interleave incomprehensibly with the main thread.
    if (rec.isSidechain) return [];

    const at: string = typeof rec.timestamp === 'string' ? rec.timestamp : '';
    const id: string = typeof rec.uuid === 'string' ? rec.uuid : '';
    const content = rec.message?.content;
    if (content == null) return [];

    if (typeof content === 'string') {
      if (!content) return [];
      return [{ kind: 'message', role: rec.type, text: content, id, at }];
    }
    if (!Array.isArray(content)) return [];

    const events: AiEvent[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      switch (block.type) {
        case 'tool_use':
          events.push({
            kind: 'tool_call', name: String(block.name || 'tool'),
            summary: summarize(String(block.name || 'tool'), block.input),
            input: block.input, id: String(block.id || id), at,
          });
          break;
        case 'tool_result':
          events.push({
            kind: 'tool_result', forId: String(block.tool_use_id || ''),
            ok: !block.is_error, preview: preview(textOf(block.content)), at,
          });
          break;
        case 'thinking':
          events.push({ kind: 'thinking', text: String(block.thinking || ''), id, at });
          break;
        default: {
          // Includes 'text' and any block type a future release introduces.
          // Rendering it as text keeps a new vendor format readable instead of
          // silently dropping half the conversation.
          const text = typeof block.text === 'string' ? block.text : '';
          if (text) events.push({ kind: 'message', role: rec.type, text, id, at });
        }
      }
    }
    return events;
  },

  title(record: unknown): string | null {
    const rec = record as any;
    if (!rec || typeof rec !== 'object') return null;
    if (rec.type === 'custom-title' && typeof rec.customTitle === 'string') return rec.customTitle;
    if (rec.type === 'last-prompt' && typeof rec.lastPrompt === 'string') return rec.lastPrompt;
    return null;
  },
};
