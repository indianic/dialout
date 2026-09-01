# AI Chat Surface Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/ai/[machineId]/[tmuxName]` readable on a phone — pinned-to-bottom scroll with a jump-back pill, markdown messages that wrap, tool calls grouped under semantic colour chips, and the function-key bar folded into a `+` popover.

**Architecture:** Browser only. Nothing here touches the agent, the ws-server, the database, or any API route, so it ships without an agent release. All decision logic lives in pure `.ts` modules that Vitest can test under `environment: 'node'`; the `.tsx` components stay thin and are verified by eye.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest (node env), `react-markdown` v10 + `remark-gfm` v4.

**Spec:** `docs/superpowers/specs/2026-08-21-ai-chat-surface-redesign-design.md`

---

## Critical context for someone new to this codebase

**The test runner cannot render React.** `vitest.config.ts` sets `environment: 'node'` and
`include: ['src/**/*.test.ts']`. That means:
- Only `.test.ts` files are collected. A `.test.tsx` is silently ignored — it will look
  like your tests pass when they never ran.
- There is no DOM. Do not import a `.tsx` component into a test.
- Therefore every rule worth testing must live in a plain `.ts` module. That is why this
  plan front-loads four pure modules before any component work.

**`localStorage` in tests** is stubbed with `vi.stubGlobal('window', ...)`. Copy the
pattern in `src/lib/__tests__/terminal-prefs.test.ts` exactly.

**Styling convention.** Existing AI components use inline `style={{}}`. That cannot express
media queries or `::after`, so this plan adds `src/components/ai/ai-chat.css`, matching the
precedent of `src/components/terminal-panel.css` and `src/components/mobile-terminal.css`.
Colours are always `var(--token)` — never a hex literal in a component.

**Commit style.** Lowercase conventional prefix, imperative, and the body explains *why*.
Do not push; `main` deploys production on push.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/ai/ai-events.ts` | **Create.** The `AiEvent` type, moved out of `AiChat.tsx` so pure modules can import it without pulling in React. |
| `src/components/ai/tool-appearance.ts` | **Create.** Tool name + ok flag → `{ cls, glyph, colorVar }`. Pure. |
| `src/components/ai/chat-blocks.ts` | **Create.** `AiEvent[]` → `ChatBlock[]`. Grouping and status collapsing. Pure. |
| `src/components/ai/scroll-pin.ts` | **Create.** `shouldFollow()` and the pin threshold. Pure. |
| `src/components/ai/ai-chat-prefs.ts` | **Create.** Function-keys visibility, persisted per device. |
| `src/components/ai/ai-chat.css` | **Create.** All chat layout, wrapping rules, media queries. |
| `src/components/ai/AiMessage.tsx` | **Create.** One message as markdown. Lazy-loads the renderer. |
| `src/components/ai/AiToolTrace.tsx` | **Create.** One `tools` block: rule, rows, chips, collapsed results. |
| `src/components/ai/AiChat.tsx` | **Rewrite.** Scroll container, pin rule, jump-back pill, block dispatch. |
| `src/components/ai/AiComposer.tsx` | **Modify.** `+` popover owning `KeyChipBar` visibility. |
| `src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx` | **Modify.** Optimistic echo, `dvh` shell. |
| `src/app/globals.css` | **Modify.** Add `--tool-search` and `--tool-run` in both themes. |

---

### Task 1: Shared event type and tool appearance

**Files:**
- Create: `src/components/ai/ai-events.ts`
- Create: `src/components/ai/tool-appearance.ts`
- Create: `src/components/ai/tool-appearance.test.ts`

- [ ] **Step 1: Create the shared event type**

`src/components/ai/ai-events.ts`:

```ts
// Moved out of AiChat.tsx so the pure modules below can import it without
// pulling React into a node-environment test.
export interface AiEvent {
  kind: 'message' | 'tool_call' | 'tool_result' | 'thinking' | 'state';
  role?: 'user' | 'assistant';
  text?: string;
  name?: string;
  summary?: string;
  preview?: string;
  ok?: boolean;
  status?: string;
  id?: string;
  forId?: string;
  at?: string;
}
```

- [ ] **Step 2: Write the failing test**

`src/components/ai/tool-appearance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toolAppearance, toolClass } from './tool-appearance';

describe('tool-appearance', () => {
  it('maps known tools to their action class', () => {
    expect(toolClass('Read')).toBe('read');
    expect(toolClass('Glob')).toBe('read');
    expect(toolClass('Grep')).toBe('search');
    expect(toolClass('WebSearch')).toBe('search');
    expect(toolClass('Bash')).toBe('run');
    expect(toolClass('Task')).toBe('run');
    expect(toolClass('Edit')).toBe('write');
    expect(toolClass('Write')).toBe('write');
  });

  it('is case and whitespace insensitive', () => {
    expect(toolClass('  bASh  ')).toBe('run');
  });

  // New tools ship constantly. An unknown name must render as a neutral row,
  // never throw and never blank the trace.
  it('falls back to other for an unknown tool', () => {
    expect(toolClass('SomeToolShippedNextWeek')).toBe('other');
    expect(toolAppearance('SomeToolShippedNextWeek').colorVar).toBe('--dim');
  });

  it('failure beats the name-derived class', () => {
    const a = toolAppearance('Read', false);
    expect(a.cls).toBe('failure');
    expect(a.colorVar).toBe('--offline');
    expect(a.glyph).toBe('✕');
  });

  it('every class has a glyph and a colour token', () => {
    for (const name of ['Read', 'Grep', 'Bash', 'Edit', 'Nonsense']) {
      const a = toolAppearance(name);
      expect(a.glyph.length).toBeGreaterThan(0);
      expect(a.colorVar.startsWith('--')).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/ai/tool-appearance.test.ts`
Expected: FAIL — `Failed to resolve import "./tool-appearance"`

- [ ] **Step 4: Write the implementation**

`src/components/ai/tool-appearance.ts`:

```ts
// A tool's colour says what it DID, not which vendor produced it. Reading a
// twenty-step run should show its shape without reading a word.

export type ToolClass = 'read' | 'search' | 'run' | 'write' | 'failure' | 'other';

export interface ToolAppearance {
  cls: ToolClass;
  glyph: string;
  colorVar: string; // a CSS custom property name, never a literal
}

const BY_NAME: Record<string, ToolClass> = {
  read: 'read', glob: 'read', ls: 'read', notebookread: 'read',
  grep: 'search', websearch: 'search', webfetch: 'search',
  bash: 'run', task: 'run', agent: 'run',
  edit: 'write', write: 'write', multiedit: 'write', notebookedit: 'write',
};

const GLYPH: Record<ToolClass, string> = {
  read: '◇', search: '⌕', run: '▸', write: '✎', failure: '✕', other: '·',
};

const COLOR: Record<ToolClass, string> = {
  read: '--accent',
  search: '--tool-search',
  run: '--tool-run',
  write: '--static',
  failure: '--offline',
  other: '--dim',
};

export function toolClass(name: string): ToolClass {
  return BY_NAME[String(name || '').trim().toLowerCase()] ?? 'other';
}

export function toolAppearance(name: string, ok = true): ToolAppearance {
  const cls: ToolClass = ok ? toolClass(name) : 'failure';
  return { cls, glyph: GLYPH[cls], colorVar: COLOR[cls] };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ai/tool-appearance.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/components/ai/ai-events.ts src/components/ai/tool-appearance.ts src/components/ai/tool-appearance.test.ts
git commit -m "feat(ai): map tool names to a semantic appearance

Colour keyed to what a tool did — read, search, run, write — so a long run
can be scanned rather than read. Unknown names fall back to a neutral chip
because new tools ship constantly and a broken row is worse than a dull one."
```

---

### Task 2: Group events into chat blocks

**Files:**
- Create: `src/components/ai/chat-blocks.ts`
- Create: `src/components/ai/chat-blocks.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/ai/chat-blocks.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ai/chat-blocks.test.ts`
Expected: FAIL — `Failed to resolve import "./chat-blocks"`

- [ ] **Step 3: Write the implementation**

`src/components/ai/chat-blocks.ts`:

```ts
import type { AiEvent } from './ai-events';

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
    const key = `${e.id || e.forId || e.kind}-${i}`;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ai/chat-blocks.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/chat-blocks.ts src/components/ai/chat-blocks.test.ts
git commit -m "feat(ai): group the event stream into chat blocks

Consecutive tool calls collapse into one scannable trace, results attach to
their call by forId, and repeated identical statuses yield a single divider.
Grouping only merges adjacent events, so an interleaving adapter costs an
extra block rather than a wrong order."
```

---

### Task 3: The scroll pin rule

**Files:**
- Create: `src/components/ai/scroll-pin.ts`
- Create: `src/components/ai/scroll-pin.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/ai/scroll-pin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldFollow, PIN_THRESHOLD_PX } from './scroll-pin';

describe('shouldFollow', () => {
  it('follows when parked at the bottom', () => {
    expect(shouldFollow(900, 1400, 500)).toBe(true);
  });

  it('follows at exactly the threshold, and stops one pixel past it', () => {
    expect(shouldFollow(900 - PIN_THRESHOLD_PX, 1400, 500)).toBe(true);
    expect(shouldFollow(900 - PIN_THRESHOLD_PX - 1, 1400, 500)).toBe(false);
  });

  it('does not follow when the reader has scrolled up', () => {
    expect(shouldFollow(0, 1400, 500)).toBe(false);
  });

  // Content shorter than the viewport is always "at the bottom": there is
  // nowhere to scroll, so a new event must still land in view.
  it('follows when content is shorter than the viewport', () => {
    expect(shouldFollow(0, 300, 500)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ai/scroll-pin.test.ts`
Expected: FAIL — `Failed to resolve import "./scroll-pin"`

- [ ] **Step 3: Write the implementation**

`src/components/ai/scroll-pin.ts`:

```ts
// A terminal follows the tail unless you have scrolled away from it. Pulled
// out of the component so the threshold is a tested constant rather than a
// number buried in an effect.
export const PIN_THRESHOLD_PX = 80;

export function shouldFollow(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number = PIN_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ai/scroll-pin.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/scroll-pin.ts src/components/ai/scroll-pin.test.ts
git commit -m "feat(ai): extract the scroll-follow rule

The old chat scrolled to the bottom on every event-count change, which yanks
the reader out of history. Follow only while within 80px of the bottom."
```

---

### Task 4: Function-keys visibility preference

**Files:**
- Create: `src/components/ai/ai-chat-prefs.ts`
- Create: `src/components/ai/ai-chat-prefs.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/ai/ai-chat-prefs.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFunctionKeysVisible, setFunctionKeysVisible } from './ai-chat-prefs';

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  });
});

describe('ai-chat-prefs', () => {
  it('defaults to hidden and round-trips', () => {
    expect(getFunctionKeysVisible()).toBe(false);
    setFunctionKeysVisible(true);
    expect(getFunctionKeysVisible()).toBe(true);
    setFunctionKeysVisible(false);
    expect(getFunctionKeysVisible()).toBe(false);
  });

  // Server render has no window at all; reading must not throw.
  it('returns the default when there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(getFunctionKeysVisible()).toBe(false);
  });

  it('survives a localStorage that throws (private mode, blocked storage)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
      },
    });
    expect(getFunctionKeysVisible()).toBe(false);
    expect(() => setFunctionKeysVisible(true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ai/ai-chat-prefs.test.ts`
Expected: FAIL — `Failed to resolve import "./ai-chat-prefs"`

- [ ] **Step 3: Write the implementation**

`src/components/ai/ai-chat-prefs.ts`:

```ts
// Per-device AI chat preferences, following mobile-term-prefs.ts: every read
// and write is guarded, because blocked storage must degrade to the default
// rather than break the composer.

const KEYS_KEY = 'devdash-ai-function-keys';

export function getFunctionKeysVisible(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEYS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setFunctionKeysVisible(on: boolean): void {
  try {
    window.localStorage.setItem(KEYS_KEY, on ? '1' : '0');
  } catch {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ai/ai-chat-prefs.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test`
Expected: all files pass, 75 existing + 20 new tests

```bash
git add src/components/ai/ai-chat-prefs.ts src/components/ai/ai-chat-prefs.test.ts
git commit -m "feat(ai): persist function-key visibility per device"
```

---

### Task 5: Theme tokens and the chat stylesheet

**Files:**
- Modify: `src/app/globals.css` (light block near line 73, dark block near line 112)
- Create: `src/components/ai/ai-chat.css`

- [ ] **Step 1: Add the two missing tokens to both themes**

In `src/app/globals.css`, find the light-theme status colours (`--live`, `--offline`,
`--static`, `--info`) and add directly beneath them:

```css
  /* Tool-trace accents. The theme is otherwise monochrome plus one blue; these
     two exist so a tool chip can say "search" and "run" without reusing the
     status colours, which already mean something else. */
  --tool-search: #0d7a72;
  --tool-run:    #6b3fc4;
```

Find the matching dark-theme block (after `--txt: #eceef3;`) and add the lighter pair —
the same hues raised for contrast on `--bg: #0b0d12`:

```css
  --tool-search: #3fbfb4;
  --tool-run:    #a77bf3;
```

- [ ] **Step 2: Create the stylesheet**

`src/components/ai/ai-chat.css`:

```css
/* The AI chat. Inline styles cannot express media queries or ::after, which is
   why this file exists alongside the components. Every colour is a token. */

.aic-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;          /* the page must never scroll sideways */
  position: relative;
  padding: 14px 13px;
  /* Chrome's scroll anchoring fights streaming content and jitters. */
  overflow-anchor: none;
  -webkit-overflow-scrolling: touch;
}

.aic-stack { display: grid; gap: 13px; }
/* Grid and flex children default to min-width:auto, so ONE long token — a path,
   a stack frame, a base64 blob — sets the column minimum and drags the page. */
.aic-stack > * { min-width: 0; }

.aic-user {
  justify-self: end;
  max-width: 80%;
  background: var(--accent-weak);
  border: 1px solid var(--accent-ring);
  border-radius: 14px 14px 4px 14px;
  padding: 9px 13px;
  color: var(--txt);
  font-size: 14.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.aic-user.aic-pending { opacity: .55; }
.aic-failed { color: var(--offline); font-size: 11.5px; margin-top: 4px; }

.aic-msg { color: var(--txt); font-size: 14.5px; line-height: 1.65; overflow-wrap: anywhere; }
.aic-msg > *:first-child { margin-top: 0; }
.aic-msg > *:last-child { margin-bottom: 0; }
.aic-msg h1, .aic-msg h2, .aic-msg h3, .aic-msg h4 {
  margin: 14px 0 6px; font-size: 15px; font-weight: 600; line-height: 1.4;
}
.aic-msg p { margin: 0 0 9px; }
.aic-msg ul, .aic-msg ol { margin: 0 0 9px; padding-left: 20px; }
.aic-msg li { margin: 3px 0; }
.aic-msg blockquote {
  margin: 0 0 9px; padding-left: 11px;
  border-left: 3px solid var(--b2); color: var(--muted);
}
.aic-msg a { color: var(--accent); text-decoration: underline; }
.aic-msg code {
  background: var(--glass-strong); padding: 1px 5px; border-radius: 5px;
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12.5px;
}
/* Code and tables scroll INSIDE their own box, never dragging the viewport. */
.aic-msg pre {
  background: var(--bg-sub); border: 1px solid var(--b1); border-radius: 9px;
  padding: 11px 13px; margin: 0 0 9px; overflow-x: auto; max-width: 100%;
  font-size: 12px; line-height: 1.6;
}
.aic-msg pre code { background: none; padding: 0; font-size: 12px; }
.aic-tablewrap { overflow-x: auto; max-width: 100%; margin: 0 0 9px; }
.aic-msg table { border-collapse: collapse; font-size: 13px; }
.aic-msg th, .aic-msg td { border: 1px solid var(--b1); padding: 5px 9px; text-align: left; }

.aic-rule {
  display: flex; align-items: center; gap: 9px;
  font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--dim);
}
.aic-rule::after { content: ""; flex: 1; height: 1px; background: var(--b1); }

.aic-tool { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); min-width: 0; }
.aic-tool .aic-name { font-family: 'JetBrains Mono', ui-monospace, monospace; flex: none; }
.aic-tool .aic-path {
  color: var(--dim); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.aic-chip {
  width: 21px; height: 21px; border-radius: 6px; flex: none;
  display: grid; place-items: center; font-size: 11px;
}
.aic-res { font-size: 12px; color: var(--dim); padding-left: 29px; }
.aic-res summary { cursor: pointer; }
.aic-res pre {
  margin-top: 6px; padding: 10px; background: var(--bg-sub);
  border-radius: 8px; overflow-x: auto; font-size: 11.5px; line-height: 1.6;
}
.aic-think {
  font-size: 12px; color: var(--dim);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
.aic-think summary { cursor: pointer; }

.aic-status {
  display: flex; align-items: center; gap: 9px;
  font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--static);
}
.aic-status::before, .aic-status::after {
  content: ""; flex: 1; height: 1px; background: var(--b2);
}

.aic-pill {
  position: sticky; bottom: 8px;
  justify-self: center; width: max-content;
  background: var(--card); border: 1px solid var(--b2); border-radius: 999px;
  padding: 6px 13px; font-size: 11.5px; color: var(--txt);
  box-shadow: 0 6px 18px var(--shadow); cursor: pointer;
}

/* --- composer --- */
.aic-pop {
  background: var(--card); border: 1px solid var(--b2); border-radius: 13px;
  padding: 5px; margin-bottom: 8px; box-shadow: 0 12px 30px var(--shadow); width: 250px;
}
.aic-pi {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border-radius: 9px; font-size: 13px; color: var(--txt);
  background: none; border: 0; text-align: left; cursor: pointer;
}
.aic-pi:disabled { color: var(--dim); cursor: default; }
.aic-pi .aic-soon {
  margin-left: auto; font-size: 10px; color: var(--dim);
  border: 1px solid var(--b1); border-radius: 5px; padding: 1px 5px;
}
.aic-pi .aic-sw { margin-left: auto; font-size: 11px; color: var(--accent); }

@media (max-width: 640px) {
  .aic-scroll { padding: 10px; }
  .aic-user  { max-width: 88%; }
}
@media (min-width: 1025px) {
  .aic-stack { max-width: 860px; margin: 0 auto; width: 100%; }
}
```

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds. The CSS is not imported yet, so nothing changes visually.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/ai/ai-chat.css
git commit -m "feat(ai): add tool-trace tokens and the chat stylesheet

--tool-search and --tool-run in both themes: the palette is otherwise
monochrome plus one blue, and reusing --live/--static for tool classes would
overload colours that already mean status.

The stylesheet exists because inline styles cannot express media queries. It
also carries the three separate fixes for sideways scrolling: min-width:0 on
chat children, overflow-wrap on prose, and overflow-x scoped to pre and
tables. Fixing fewer than all three brings the symptom back."
```

---

### Task 6: Markdown messages

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/components/ai/AiMessage.tsx`

- [ ] **Step 1: Install the renderer**

Run: `npm install react-markdown@^10 remark-gfm@^4`
Expected: both added to `dependencies`. v10 is the line that supports React 19.

- [ ] **Step 2: Create the component**

`src/components/ai/AiMessage.tsx`:

```tsx
'use client';

import { useEffect, useState, type ComponentType } from 'react';

// Loaded on demand so only /ai pays for the renderer. Until the chunk lands the
// text renders as plain pre-wrap — which is exactly what the chat did before
// this change, so a slow connection degrades to the old behaviour rather than
// to a blank bubble.
export default function AiMessage({ text }: { text: string }) {
  const [mod, setMod] = useState<{ Md: ComponentType<any>; gfm: unknown } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([import('react-markdown'), import('remark-gfm')])
      .then(([md, gfm]) => {
        if (alive) setMod({ Md: md.default as ComponentType<any>, gfm: gfm.default });
      })
      .catch(() => { /* stay on the plain-text fallback */ });
    return () => { alive = false; };
  }, []);

  if (!mod) {
    return <div className="aic-msg" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>;
  }

  const { Md, gfm } = mod;
  return (
    <div className="aic-msg">
      <Md
        remarkPlugins={[gfm]}
        components={{
          // Raw HTML is never enabled, but links still need the noopener guard
          // and a target — this text was written by an agent, not by us.
          a: (p: any) => <a {...p} target="_blank" rel="noopener noreferrer" />,
          // A wide table must scroll in its own box, not widen the page.
          table: (p: any) => <div className="aic-tablewrap"><table {...p} /></div>,
        }}
      >
        {text}
      </Md>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors from `AiMessage.tsx`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ai/AiMessage.tsx
git commit -m "feat(ai): render messages as markdown

react-markdown never renders raw HTML, so agent output cannot inject; remark-gfm
covers the tables and task lists Claude actually emits. Both are imported on
demand, and the pre-chunk fallback is plain pre-wrap text — the previous
behaviour — so a slow connection degrades rather than blanks."
```

---

### Task 7: The tool trace

**Files:**
- Create: `src/components/ai/AiToolTrace.tsx`

- [ ] **Step 1: Create the component**

`src/components/ai/AiToolTrace.tsx`:

```tsx
'use client';

import { toolAppearance } from './tool-appearance';
import type { ToolItem } from './chat-blocks';

function Chip({ name, ok }: { name: string; ok: boolean | null }) {
  const a = toolAppearance(name, ok !== false);
  return (
    <span
      className="aic-chip"
      style={{
        background: `color-mix(in srgb, var(${a.colorVar}) 16%, transparent)`,
        color: `var(${a.colorVar})`,
      }}
      aria-hidden
    >
      {a.glyph}
    </span>
  );
}

export default function AiToolTrace({ items }: { items: ToolItem[] }) {
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <div className="aic-rule">
        did {items.length} thing{items.length === 1 ? '' : 's'}
      </div>

      {items.map((t) => (
        <div key={t.id} style={{ display: 'grid', gap: 5, minWidth: 0 }}>
          <div className="aic-tool">
            <Chip name={t.name} ok={t.ok} />
            <span className="aic-name">{t.name}</span>
            <span
              className="aic-path"
              style={t.ok === false ? { color: 'var(--offline)' } : undefined}
              title={t.summary}
            >
              {t.summary}
            </span>
          </div>

          {/* A failure is never collapsed. An error the reader has to expand to
              see is an error they will miss. */}
          {t.ok === false && t.resultPreview && (
            <pre className="aic-res" style={{ color: 'var(--offline)', paddingLeft: 29 }}>
              {t.resultPreview}
            </pre>
          )}

          {t.ok === true && t.resultPreview && (
            <details className="aic-res">
              <summary>output · {t.resultLines} line{t.resultLines === 1 ? '' : 's'}</summary>
              <pre>{t.resultPreview}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/AiToolTrace.tsx
git commit -m "feat(ai): render a grouped tool trace with semantic chips

Successful output stays collapsed; failures do not, because an error you must
expand to see is an error you will miss."
```

---

### Task 8: Rewrite AiChat

**Files:**
- Rewrite: `src/components/ai/AiChat.tsx`

- [ ] **Step 1: Replace the file**

`src/components/ai/AiChat.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { groupEvents } from './chat-blocks';
import { shouldFollow } from './scroll-pin';
import AiMessage from './AiMessage';
import AiToolTrace from './AiToolTrace';
import type { AiEvent } from './ai-events';
import './ai-chat.css';

export type { AiEvent };

const STATUS_LABEL: Record<string, string> = {
  working: 'working',
  waiting_input: 'waiting for you',
  waiting_approval: 'waiting for your approval',
  idle: 'idle',
};

export default function AiChat({
  events,
  pendingText,
  pendingFailed,
}: {
  events: AiEvent[];
  pendingText?: string | null;
  pendingFailed?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [unread, setUnread] = useState(0);

  const blocks = useMemo(() => groupEvents(events), [events]);

  const toBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setPinned(true);
    setUnread(0);
  }, []);

  // Measure the pin from the DOM, never from the event array — the reader's
  // position is the only thing that decides whether we follow.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const follow = shouldFollow(el.scrollTop, el.scrollHeight, el.clientHeight);
        setPinned(follow);
        if (follow) setUnread(0);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (pinned) toBottom('smooth');
    else setUnread((n) => n + 1);
    // Keyed on length: a re-render with no new events must not move the reader.
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sending is an intent to watch the bottom.
  useEffect(() => {
    if (pendingText) toBottom('smooth');
  }, [pendingText, toBottom]);

  return (
    <div className="aic-scroll" ref={scrollRef}>
      <div className="aic-stack">
        {blocks.map((b) => {
          if (b.kind === 'user') return <div key={b.key} className="aic-user">{b.text}</div>;
          if (b.kind === 'assistant') return <AiMessage key={b.key} text={b.text} />;
          if (b.kind === 'tools') return <AiToolTrace key={b.key} items={b.items} />;
          if (b.kind === 'thinking') {
            return (
              <details key={b.key} className="aic-think">
                <summary>thought for a moment</summary>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{b.text}</div>
              </details>
            );
          }
          return (
            <div key={b.key} className="aic-status">
              {STATUS_LABEL[b.status] || b.status}
            </div>
          );
        })}

        {pendingText && (
          <div className="aic-user aic-pending">
            {pendingText}
            {pendingFailed && <div className="aic-failed">not delivered — tap send to retry</div>}
          </div>
        )}

        {!pinned && unread > 0 && (
          <button className="aic-pill" onClick={() => toBottom('smooth')}>
            ↓ {unread} new message{unread === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. The page still passes only `events`; the two new props are optional.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): pin the chat to the tail instead of yanking to it

Follow only while the reader is within 80px of the bottom; otherwise count
arrivals and offer a jump-back pill. Pin state is measured from the scroll
container on a passive rAF-throttled listener, never derived from the event
array, so a re-render with no new events cannot move the reader."
```

---

### Task 9: The composer popover

**Files:**
- Rewrite: `src/components/ai/AiComposer.tsx`

- [ ] **Step 1: Replace the file**

`src/components/ai/AiComposer.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Lock, Unlock, Plus, Keyboard, Slash, Zap } from 'lucide-react';
import KeyChipBar, { CtrlState } from '@/components/KeyChipBar';
import { getFunctionKeysVisible, setFunctionKeysVisible } from './ai-chat-prefs';
import './ai-chat.css';

// Typing here injects keystrokes into a pane the user may also be sitting in
// front of. The lock is not decoration: two inputs into one TUI interleave
// into nonsense, so taking input is always an explicit act.
export default function AiComposer({
  attachedElsewhere,
  onSend,
}: {
  attachedElsewhere: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [ctrlState, setCtrlState] = useState<CtrlState>('off');
  const [menuOpen, setMenuOpen] = useState(false);
  const [keysOn, setKeysOn] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // localStorage is read after mount so the server and first client render
  // agree; reading it during render would hydrate-mismatch.
  useEffect(() => { setKeysOn(getFunctionKeysVisible()); }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const locked = attachedElsewhere && !unlocked;

  const submit = () => {
    const value = text.trim();
    if (!value || locked) return;
    onSend(value);
    setText('');
  };

  const toggleKeys = () => {
    const next = !keysOn;
    setKeysOn(next);
    setFunctionKeysVisible(next);
  };

  return (
    <div ref={wrapRef} style={{
      borderTop: '1px solid var(--b1)', background: 'var(--card)',
      padding: '10px 12px', display: 'grid', gap: 8,
    }}>
      {attachedElsewhere && (
        <button
          onClick={() => setUnlocked((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 12,
            color: unlocked ? 'var(--static)' : 'var(--muted)',
          }}
        >
          {unlocked ? <Unlock size={13} /> : <Lock size={13} />}
          {unlocked
            ? 'You are typing into a session open at your desk'
            : 'Also attached at your desk — tap to take input'}
        </button>
      )}

      {menuOpen && (
        <div className="aic-pop" role="menu">
          <button className="aic-pi" onClick={toggleKeys} role="menuitem">
            <Keyboard size={15} /> Function keys
            <span className="aic-sw">{keysOn ? 'On' : 'Off'}</span>
          </button>
          {/* Reserved for the commands + MCP spec. Present and disabled so that
              work is an added row rather than a redesign of this popover. */}
          <button className="aic-pi" disabled role="menuitem">
            <Slash size={15} /> Commands <span className="aic-soon">soon</span>
          </button>
          <button className="aic-pi" disabled role="menuitem">
            <Zap size={15} /> MCP servers <span className="aic-soon">soon</span>
          </button>
        </div>
      )}

      {/* Answering a TUI means single keys far more often than sentences, and
          KeyChipBar already solves that on the mobile terminal. It emits raw
          control bytes, which is exactly what the agent's NAMED_KEYS table
          maps back to tmux key names. */}
      {!locked && keysOn && (
        <KeyChipBar onSend={onSend} ctrlState={ctrlState} onCtrlStateChange={setCtrlState} />
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <button
          className="btn-icon"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="More"
          aria-expanded={menuOpen}
          style={{
            height: 44, width: 44, flex: 'none',
            color: menuOpen ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          <Plus size={18} />
        </button>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          disabled={locked}
          placeholder={locked ? 'Locked' : 'Message the agent…'}
          style={{
            flex: 1, minWidth: 0, minHeight: 44, maxHeight: 140, resize: 'none',
            background: 'var(--bg-sub)', border: '1px solid var(--b1)',
            borderRadius: 12, padding: '11px 13px', color: 'var(--txt)',
            // 16px stops iOS zooming the page when the field is focused.
            fontSize: 16,
          }}
        />
        <button
          className="btn-grad"
          onClick={submit}
          disabled={locked}
          aria-label="Send"
          style={{ height: 44, width: 44, padding: 0, flex: 'none', display: 'grid', placeItems: 'center' }}
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/AiComposer.tsx
git commit -m "feat(ai): fold the function keys into a + popover

The key bar held permanent vertical space above the input, which is the
scarcest thing on a phone. It is now opt-in and remembered per device, and the
popover carries disabled Commands and MCP rows so the follow-on spec adds a row
rather than redesigning this control."
```

---

### Task 10: Optimistic echo and the page shell

**Files:**
- Rewrite: `src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx`

- [ ] **Step 1: Replace the whole file**

The scroll wrapper must go: `AiChat` owns its own scroller now, and two nested
scrollers break the pin rule because the outer one never moves.

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import AiChat from '@/components/ai/AiChat';
import type { AiEvent } from '@/components/ai/ai-events';
import AiComposer from '@/components/ai/AiComposer';
import AiStatusDot from '@/components/ai/AiStatusDot';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { useDashboardSocket } from '@/hooks/useDashboardSocket';

const PENDING_TIMEOUT_MS = 10_000;

export default function AiSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useDashboard();

  const machineId = parseInt(String(params?.machineId), 10);
  const tmuxName = decodeURIComponent(String(params?.tmuxName));

  const [events, setEvents] = useState<AiEvent[]>([]);
  const [status, setStatus] = useState('idle');

  // A sent message only appears once it round-trips through the transcript
  // tail, which leaves the chat looking frozen for a second or more. Echo it
  // locally and reconcile when the real event arrives.
  const [pending, setPending] = useState<string | null>(null);
  const [pendingFailed, setPendingFailed] = useState(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const command = useCallback(
    async (action: 'open' | 'close' | 'input', text?: string) => {
      await fetch(`/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text }),
      });
    },
    [machineId, tmuxName]
  );

  // Open on mount, close on unmount — the agent stops tailing when nobody is
  // watching, so an abandoned tab does not keep a file poll alive forever.
  useEffect(() => {
    void command('open');
    return () => { void command('close'); };
  }, [command]);

  const clearPending = useCallback(() => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    setPending(null);
    setPendingFailed(false);
  }, []);

  const send = useCallback((text: string) => {
    setPending(text);
    setPendingFailed(false);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    // Ten seconds, then say so. A ghost bubble that never resolves is worse
    // than an honest failure.
    pendingTimer.current = setTimeout(() => setPendingFailed(true), PENDING_TIMEOUT_MS);
    void command('input', text);
  }, [command]);

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  const onAiEvents = useCallback(
    (eventMachineId: number, eventTmux: string, incoming: any[], nextStatus: string) => {
      if (eventMachineId !== machineId || eventTmux !== tmuxName) return;
      setEvents((prev) => [...prev, ...incoming]);
      setStatus(nextStatus);
      // The echoed user message is the acknowledgement. A user cannot send two
      // messages inside the window without the first having already echoed, so
      // matching on "any user message arrived" is enough.
      if (incoming.some((e) => e.kind === 'message' && e.role === 'user')) clearPending();
    },
    [machineId, tmuxName, clearPending]
  );

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL
    || (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      : '');

  useDashboardSocket({
    userId: session?.userId || 0,
    machineId: session?.machineId || 0,
    wsUrl,
    onAiEvents,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderBottom: '1px solid var(--b1)',
      }}>
        <button className="btn-icon" onClick={() => router.push('/ai')} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <span style={{
          flex: 1, minWidth: 0, color: 'var(--txt)', fontSize: 14.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{tmuxName}</span>
        <AiStatusDot status={status} />
      </header>

      <AiChat events={events} pendingText={pending} pendingFailed={pendingFailed} />

      <AiComposer attachedElsewhere={false} onSend={send} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and the suite is green**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: no type errors; all tests pass

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx"
git commit -m "feat(ai): echo a sent message immediately

The chat looked frozen between send and the transcript tail catching up. The
bubble now appears at once and reconciles on the echoed event, with a ten
second timeout so an undelivered message says so instead of hanging forever.

Also drops the page's scroll wrapper — AiChat owns its scroller now, and two
nested scrollers break the pin rule because the outer one never moves."
```

---

### Task 11: Verify by eye, in both themes

**Files:** none — this is a manual pass, and it is not optional. Layout is the one
thing the node-environment test runner cannot check.

- [ ] **Step 1: Run the app**

Run: `npm run dev`
Open `http://localhost:50051/ai`, then open a live session.

- [ ] **Step 2: Check each claim at 330px, 768px and 1440px**

Use device toolbar. For each width confirm:

- The page body does **not** scroll horizontally. Long paths ellipsise; long code
  scrolls inside its own box.
- Scrolling up stops the auto-follow and shows the pill; tapping it returns to the
  bottom and resumes following.
- Sending a message shows a faded bubble immediately, which solidifies when the echo
  arrives.
- `+` opens the popover; the toggle persists across a reload; Escape and an outside
  click close it.
- Tool rows show the right chip colour, and a failed tool shows its error uncollapsed.

- [ ] **Step 3: Check both themes**

Toggle light and dark. The tinted chips are the risk: confirm all five classes stay
legible on `--card` in light, not just on `--bg` in dark.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(ai): responsive and theme corrections from the manual pass"
```

---

## Definition of done

- `npm test` green.
- `npm run build` clean.
- No horizontal page scroll at 330px, 768px or 1440px.
- Chips legible in both themes.
- No colour hard-coded in a component — every one is `var(--token)`.
