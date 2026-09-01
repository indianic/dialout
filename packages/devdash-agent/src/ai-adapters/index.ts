import { AiKind } from '../ai-session-detector';
import { AiAdapter } from './types';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { grokAdapter } from './grok';

const ADAPTERS: Record<AiKind, AiAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  grok: grokAdapter,
};

export function adapterFor(kind: AiKind): AiAdapter {
  return ADAPTERS[kind];
}

export * from './types';
