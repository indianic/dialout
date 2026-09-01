# AI Commands & MCP — UI (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the commands and MCP servers that Plan A discovers in front of the user — a `/` autocomplete in the composer, and the two `+` menu rows that have said "soon" since the redesign.

**Architecture:** All ranking and trigger logic lives in pure `.ts` modules Vitest can test under `environment: 'node'`. The components are thin and verified by eye. Everything the `+` opens is an **overlay**, never a layout row.

**Tech Stack:** Next.js 15, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-ai-commands-and-mcp-design.md`
**Depends on:** Plan A, shipped in 2.7.2 / `c9ede20`.

---

## Measured reality this plan is written against

The endpoint is live. On the development machine, for a Claude session:

- **81 commands** — 29 `user`, 52 `plugin`, 0 `project`. Plugin names are namespaced
  `plugin:name` (`code-review:code-review`, `commit-commands:clean_gone`).
- **20 MCP servers**, all `scope: 'global'`, all `transport: 'stdio'`.
- A Grok session returns **16 builtins**, several carrying an `alias`.
- Codex returns empty.

Three consequences the design has to answer, and they are the reason this plan
was written after Plan A rather than beside it:

1. **81 items is too many to browse.** An unfiltered list is a scroll, not a
   menu — so ranking matters more than grouping, and the filter must match the
   plugin prefix as well as the command name.
2. **Plugin commands dominate 52:29.** Sorting purely alphabetically buries the
   user's own commands under `agent-sdk-dev:*`. Source has to weigh in.
3. **All 20 MCP servers share one scope and transport here**, so a panel that
   leads with those fields shows twenty identical rows. Name and origin are
   what distinguish them.

---

## Critical context

**No DOM in tests.** `vitest.config.ts` is `environment: 'node'` with
`include: ['src/**/*.test.ts']`. A `.test.tsx` is silently skipped. Logic goes
in `.ts`; components are checked by eye.

**Overlays, not rows.** The composer is a flex sibling of a `flex: 1` chat, so
anything that changes its height resizes the conversation. This was fixed once
already; the picker must not reintroduce it.

**Three empty states, three sentences.** "No commands found", "Machine
offline", and "Update the agent" are different facts. The API distinguishes the
third with `unavailable: true`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/ai/command-filter.ts` | **Create.** `commandQuery()` and `rankCommands()`. Pure. |
| `src/components/ai/command-filter.test.ts` | **Create.** Its tests. |
| `src/components/ai/useAiCapabilities.ts` | **Create.** Lazy fetch + per-page cache + the three states. |
| `src/components/ai/CommandPicker.tsx` | **Create.** The overlay list. |
| `src/components/ai/McpPanel.tsx` | **Create.** The informational panel. |
| `src/components/ai/AiComposer.tsx` | **Modify.** `/` trigger, real `+` rows. |
| `src/components/ai/ai-chat.css` | **Modify.** Picker and panel styles. |
| `src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx` | **Modify.** Pass machineId and tmuxName down. |

---

### Task 1: Trigger and ranking

**Files:**
- Create: `src/components/ai/command-filter.ts`
- Create: `src/components/ai/command-filter.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/ai/command-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { commandQuery, rankCommands } from './command-filter';
import type { AiCommand } from './capability-types';

const cmd = (name: string, source: AiCommand['source'], description = ''): AiCommand =>
  ({ name, source, description });

describe('commandQuery', () => {
  it('opens on a lone slash', () => {
    expect(commandQuery('/')).toBe('');
  });

  it('returns the text after the slash', () => {
    expect(commandQuery('/comp')).toBe('comp');
  });

  // A slash mid-sentence is a path or a date, not a command.
  it('does not open for a slash that is not first', () => {
    expect(commandQuery('what about /tmp')).toBe(null);
    expect(commandQuery(' /leading-space')).toBe(null);
  });

  it('closes once the command is complete', () => {
    expect(commandQuery('/compact now')).toBe(null);
  });

  it('is closed for ordinary text and for empty input', () => {
    expect(commandQuery('')).toBe(null);
    expect(commandQuery('hello')).toBe(null);
  });
});

describe('rankCommands', () => {
  const all = [
    cmd('code-review:code-review', 'plugin', 'Review a PR'),
    cmd('compact', 'builtin', 'Compact conversation history'),
    cmd('commit-commands:clean_gone', 'plugin', 'Delete merged branches'),
    cmd('seo', 'user', 'SEO Machine'),
    cmd('deploy', 'project', 'Ship it'),
  ];

  it('puts a name prefix match above a name substring above a description match', () => {
    const names = rankCommands(all, 'co').map((c) => c.name);
    expect(names[0]).toBe('compact');            // prefix on the bare name
    expect(names).toContain('code-review:code-review');
    expect(names).not.toContain('seo');
  });

  // 52 of 81 commands are plugin-namespaced, so the prefix has to be searchable
  // or half the list is unreachable by typing.
  it('matches the plugin namespace as well as the command name', () => {
    const names = rankCommands(all, 'commit').map((c) => c.name);
    expect(names).toContain('commit-commands:clean_gone');
  });

  it('matches a word in the description', () => {
    const names = rankCommands(all, 'branches').map((c) => c.name);
    expect(names).toEqual(['commit-commands:clean_gone']);
  });

  // Plugins outnumber the user's own commands 52:29, so a purely alphabetical
  // sort buries the ones they wrote.
  it('breaks ties by source, user first and plugin last', () => {
    const tie = [cmd('zzz', 'plugin'), cmd('zzz2', 'user'), cmd('zzz3', 'project')];
    expect(rankCommands(tie, 'zzz').map((c) => c.source)).toEqual(['user', 'project', 'plugin']);
  });

  it('an empty query returns everything, still ranked by source', () => {
    expect(rankCommands(all, '')).toHaveLength(5);
    expect(rankCommands(all, '')[0].source).toBe('user');
  });

  it('is case insensitive', () => {
    expect(rankCommands(all, 'SEO').map((c) => c.name)).toEqual(['seo']);
  });
});
```

- [ ] **Step 2: Create the browser-side type mirror**

`src/components/ai/capability-types.ts`:

```ts
// Mirrors the agent's ai-capabilities/types.ts. Hand-maintained, like
// src/types/index.ts — the agent is a separate package and the browser must
// not import from it. Update both when the payload changes.
export type CommandSource = 'user' | 'project' | 'plugin' | 'builtin';

export interface AiCommand {
  name: string;
  alias?: string;
  description: string;
  source: CommandSource;
}

export interface McpServerInfo {
  name: string;
  scope: 'global' | 'project';
  transport: 'stdio' | 'http';
  enabled: boolean;
  origin: string;
  command?: string;
  args?: string[];
}

export interface AiCapabilities {
  kind: string;
  commands: AiCommand[];
  mcpServers: McpServerInfo[];
  scannedAt: string;
  unavailable?: boolean;
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/ai/command-filter.test.ts`
Expected: FAIL — cannot resolve `./command-filter`

- [ ] **Step 4: Write the implementation**

`src/components/ai/command-filter.ts`:

```ts
import type { AiCommand, CommandSource } from './capability-types';

// The menu opens only when the slash starts the message. A slash anywhere else
// is a path, a date, or a fraction — not a command.
export function commandQuery(text: string): string | null {
  if (!text.startsWith('/')) return null;
  const rest = text.slice(1);
  // A space means the command has been chosen and arguments are being typed.
  if (/\s/.test(rest)) return null;
  return rest;
}

// User commands are the ones they wrote; plugins outnumber them 52 to 29 on a
// real install, so source is the tie-breaker or the list buries them.
const SOURCE_RANK: Record<CommandSource, number> = {
  user: 0, project: 1, builtin: 2, plugin: 3,
};

// Lower is better.
function score(c: AiCommand, q: string): number {
  const name = c.name.toLowerCase();
  const bare = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  const desc = c.description.toLowerCase();

  if (!q) return 40;
  if (bare.startsWith(q)) return 0;
  if (name.startsWith(q)) return 10;   // the plugin prefix
  if (bare.includes(q)) return 20;
  if (name.includes(q)) return 25;
  if (desc.includes(q)) return 30;
  return Infinity;                     // no match at all
}

export function rankCommands(commands: AiCommand[], query: string): AiCommand[] {
  const q = query.trim().toLowerCase();

  return commands
    .map((c) => ({ c, s: score(c, q) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) =>
      a.s - b.s
      || SOURCE_RANK[a.c.source] - SOURCE_RANK[b.c.source]
      || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ai/command-filter.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 6: Commit**

```bash
git add src/components/ai/command-filter.ts src/components/ai/command-filter.test.ts src/components/ai/capability-types.ts
git commit -m "feat(ai): rank and filter slash commands

Ranking rather than grouping, because a real install returns 81 commands and
an unfiltered list is a scroll rather than a menu. The plugin namespace is
searchable — 52 of those 81 are namespaced, so matching only the bare name
leaves most of them unreachable by typing — and source breaks ties so the
user's own commands are not buried under agent-sdk-dev:*."
```

---

### Task 2: The capabilities hook

**Files:**
- Create: `src/components/ai/useAiCapabilities.ts`

- [ ] **Step 1: Write the hook**

`src/components/ai/useAiCapabilities.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiCapabilities } from './capability-types';

export type CapabilityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; caps: AiCapabilities }
  | { status: 'unavailable' }        // offline, or an agent that predates 2.7.2
  | { status: 'error' };

// Discovery walks several directories on the developer's machine. Nobody
// should pay for that just by reading a chat, so this fetches on first open
// and then serves from memory for the life of the page.
export function useAiCapabilities(machineId: number, tmuxName: string) {
  const [state, setState] = useState<CapabilityState>({ status: 'idle' });
  const inflight = useRef(false);

  // A different session must not serve the previous one's commands.
  useEffect(() => {
    setState({ status: 'idle' });
    inflight.current = false;
  }, [machineId, tmuxName]);

  const load = useCallback(async (force = false) => {
    if (inflight.current) return;
    if (!force && state.status !== 'idle') return;
    inflight.current = true;
    setState({ status: 'loading' });
    try {
      const res = await fetch(
        `/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}/capabilities`
      );
      if (!res.ok) { setState({ status: 'error' }); return; }
      const caps: AiCapabilities = await res.json();
      setState(caps.unavailable ? { status: 'unavailable' } : { status: 'ready', caps });
    } catch {
      setState({ status: 'error' });
    } finally {
      inflight.current = false;
    }
  }, [machineId, tmuxName, state.status]);

  return { state, load, refresh: () => load(true) };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/useAiCapabilities.ts
git commit -m "feat(ai): fetch session capabilities lazily, once per page

Discovery walks directories on the developer's machine, so nobody pays for it
by merely reading a chat. Distinguishes unavailable — offline, or an agent
older than 2.7.2 — from an honest empty result."
```

---

### Task 3: Picker and panel styles

**Files:**
- Modify: `src/components/ai/ai-chat.css`

- [ ] **Step 1: Append the styles**

Add to the end of `src/components/ai/ai-chat.css`:

```css
/* --- command picker + MCP panel ---------------------------------------
   Both are overlays anchored to the composer's top edge, for the same
   reason the + popover is: the composer is a flex sibling of a flex:1
   chat, so a layout row here resizes the conversation. */
.aic-sheet {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  z-index: 25;
  max-height: min(46vh, 380px);
  overflow-y: auto;
  overscroll-behavior: contain;      /* stop the chat scrolling behind it */
  background: var(--card);
  border: 1px solid var(--b2);
  border-radius: 13px;
  margin-bottom: 8px;
  box-shadow: 0 12px 30px var(--shadow);
  padding: 5px;
}

.aic-cmd {
  display: flex; align-items: baseline; gap: 9px; width: 100%;
  padding: 8px 10px; border-radius: 9px; border: 0; background: none;
  text-align: left; cursor: pointer; color: var(--txt); min-width: 0;
}
.aic-cmd:hover, .aic-cmd[aria-selected="true"] { background: var(--accent-weak); }
.aic-cmd .aic-cmd-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px; flex: none;
}
.aic-cmd .aic-cmd-desc {
  color: var(--dim); font-size: 12px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.aic-cmd .aic-cmd-src {
  margin-left: auto; flex: none; font-size: 10px; color: var(--dim);
  border: 1px solid var(--b1); border-radius: 5px; padding: 1px 5px;
}

.aic-sheet-head {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px 5px; font-size: 10.5px; letter-spacing: .06em;
  text-transform: uppercase; color: var(--dim);
}
.aic-sheet-head button {
  margin-left: auto; font-size: 11px; color: var(--accent);
  background: none; border: 0; cursor: pointer; text-transform: none;
  letter-spacing: 0;
}
.aic-sheet-empty { padding: 14px 12px; color: var(--dim); font-size: 12.5px; }

.aic-mcp { padding: 8px 10px; border-radius: 9px; min-width: 0; }
.aic-mcp + .aic-mcp { border-top: 1px solid var(--b1); border-radius: 0; }
.aic-mcp-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.aic-mcp-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px; color: var(--txt);
}
.aic-mcp-tag {
  font-size: 10px; color: var(--dim);
  border: 1px solid var(--b1); border-radius: 5px; padding: 1px 5px; flex: none;
}
.aic-mcp-off { color: var(--offline); border-color: var(--offline); }
.aic-mcp-cmd {
  margin-top: 3px; font-size: 11.5px; color: var(--dim);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

@media (max-width: 640px) {
  .aic-sheet { left: 8px; right: 8px; max-height: 42vh; }
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: compiles. Nothing uses the classes yet, so no visual change.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/ai-chat.css
git commit -m "feat(ai): styles for the command picker and MCP panel

Both overlay the chat rather than occupying a composer row, and carry
overscroll-behavior: contain so scrolling the list does not drag the
conversation behind it."
```

---

### Task 4: CommandPicker

**Files:**
- Create: `src/components/ai/CommandPicker.tsx`

- [ ] **Step 1: Write the component**

`src/components/ai/CommandPicker.tsx`:

```tsx
'use client';

import { rankCommands } from './command-filter';
import type { CapabilityState } from './useAiCapabilities';

export default function CommandPicker({
  state,
  query,
  selected,
  onPick,
  onRefresh,
}: {
  state: CapabilityState;
  query: string;
  selected: number;
  onPick: (name: string) => void;
  onRefresh: () => void;
}) {
  if (state.status === 'loading') {
    return <div className="aic-sheet"><div className="aic-sheet-empty">Looking…</div></div>;
  }
  // Three different facts, three different sentences. Collapsing them is what
  // let a silent agent bug hide for three months.
  if (state.status === 'unavailable') {
    return (
      <div className="aic-sheet">
        <div className="aic-sheet-empty">
          Commands need agent 2.7.2 or newer on this machine — or the machine is offline.
        </div>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="aic-sheet">
        <div className="aic-sheet-empty">Could not reach the machine.</div>
      </div>
    );
  }
  if (state.status !== 'ready') return null;

  const matches = rankCommands(state.caps.commands, query);

  return (
    <div className="aic-sheet" role="listbox" aria-label="Slash commands">
      <div className="aic-sheet-head">
        {matches.length} command{matches.length === 1 ? '' : 's'}
        <button onClick={onRefresh}>Refresh</button>
      </div>

      {matches.length === 0 && (
        <div className="aic-sheet-empty">No command matches “{query}”.</div>
      )}

      {matches.map((c, i) => (
        <button
          key={c.name}
          className="aic-cmd"
          role="option"
          aria-selected={i === selected}
          // onMouseDown, not onClick: the textarea must not lose focus first,
          // which would close the picker before the pick registers.
          onMouseDown={(e) => { e.preventDefault(); onPick(c.name); }}
        >
          <span className="aic-cmd-name">/{c.name}</span>
          <span className="aic-cmd-desc">{c.description}</span>
          <span className="aic-cmd-src">{c.source}</span>
        </button>
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
git add src/components/ai/CommandPicker.tsx
git commit -m "feat(ai): the slash command picker

Picks fire on mouseDown rather than click: a click would blur the textarea
first, closing the picker before the pick registered."
```

---

### Task 5: McpPanel

**Files:**
- Create: `src/components/ai/McpPanel.tsx`

- [ ] **Step 1: Write the component**

`src/components/ai/McpPanel.tsx`:

```tsx
'use client';

import type { CapabilityState } from './useAiCapabilities';

export default function McpPanel({
  state,
  onRefresh,
}: {
  state: CapabilityState;
  onRefresh: () => void;
}) {
  if (state.status === 'loading') {
    return <div className="aic-sheet"><div className="aic-sheet-empty">Looking…</div></div>;
  }
  if (state.status === 'unavailable') {
    return (
      <div className="aic-sheet">
        <div className="aic-sheet-empty">
          MCP details need agent 2.7.2 or newer on this machine — or the machine is offline.
        </div>
      </div>
    );
  }
  if (state.status === 'error') {
    return <div className="aic-sheet"><div className="aic-sheet-empty">Could not reach the machine.</div></div>;
  }
  if (state.status !== 'ready') return null;

  const servers = state.caps.mcpServers;

  return (
    <div className="aic-sheet">
      <div className="aic-sheet-head">
        {/* "as configured", not "in use": the four Claude config locations are
            measured but its runtime precedence between them is not, so this
            does not claim to show what the CLI actually loaded. */}
        {servers.length} server{servers.length === 1 ? '' : 's'} as configured
        <button onClick={onRefresh}>Refresh</button>
      </div>

      {servers.length === 0 && (
        <div className="aic-sheet-empty">
          None configured for this session.
        </div>
      )}

      {servers.map((s) => (
        <div className="aic-mcp" key={`${s.origin}:${s.name}`}>
          <div className="aic-mcp-top">
            <span className="aic-mcp-name">{s.name}</span>
            <span className="aic-mcp-tag">{s.scope}</span>
            {s.transport === 'http' && <span className="aic-mcp-tag">http</span>}
            {!s.enabled && <span className="aic-mcp-tag aic-mcp-off">disabled</span>}
          </div>
          {/* All 20 servers on a real machine share scope and transport, so the
              launch line is what actually tells them apart. */}
          {s.command && (
            <div className="aic-mcp-cmd" title={`${s.command} ${(s.args || []).join(' ')}`}>
              {s.command} {(s.args || []).join(' ')}
            </div>
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
git add src/components/ai/McpPanel.tsx
git commit -m "feat(ai): the MCP servers panel

Leads with name and launch line, because every server on a real machine shares
the same scope and transport — those tags distinguish nothing on their own.
Says 'as configured' rather than 'in use': Claude's runtime precedence between
its four config locations is unmeasured and this does not claim it."
```

---

### Task 6: Wire the composer

**Files:**
- Modify: `src/components/ai/AiComposer.tsx`
- Modify: `src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx`

- [ ] **Step 1: Pass the session down**

In `src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx`, change the composer element to:

```tsx
      <AiComposer
        attachedElsewhere={false}
        machineId={machineId}
        tmuxName={tmuxName}
        onSend={send}
        // Keystrokes go straight through: no pending bubble, nothing to
        // reconcile, and nothing that would time out as "not delivered".
        onSendKeys={(data) => void command('input', data)}
      />
```

- [ ] **Step 2: Add the props, state and handlers to `AiComposer`**

Add to the imports:

```tsx
import CommandPicker from './CommandPicker';
import McpPanel from './McpPanel';
import { useAiCapabilities } from './useAiCapabilities';
import { commandQuery, rankCommands } from './command-filter';
```

Replace the props block with, in full:

```tsx
export default function AiComposer({
  attachedElsewhere,
  machineId,
  tmuxName,
  onSend,
  onSendKeys,
}: {
  attachedElsewhere: boolean;
  machineId: number;
  tmuxName: string;
  onSend: (text: string) => void;
  // Raw control bytes from the key bar. Deliberately a separate channel from
  // onSend: a keystroke is not a message, and routing Esc through the message
  // path raised a pending chat bubble containing an escape character.
  onSendKeys?: (data: string) => void;
}) {
```

Add beside the other state:

```tsx
  // Which overlay the + opened, if any. Only one at a time — they occupy the
  // same anchored space above the input.
  const [sheet, setSheet] = useState<null | 'commands' | 'mcp'>(null);
  const [selected, setSelected] = useState(0);
  const { state: capState, load, refresh } = useAiCapabilities(machineId, tmuxName);

  // Typing "/" is itself a request for the list.
  const typedQuery = commandQuery(text);
  const pickerOpen = sheet === 'commands' || typedQuery !== null;

  useEffect(() => {
    if (pickerOpen || sheet === 'mcp') void load();
  }, [pickerOpen, sheet, load]);

  useEffect(() => { setSelected(0); }, [typedQuery]);
```

Add the insert handler beside `submit`:

```tsx
  // Inserts, never sends: a command usually takes arguments, and firing on
  // pick would rob the user of the chance to add them.
  const pickCommand = (name: string) => {
    setText(`/${name} `);
    setSheet(null);
    inputRef.current?.focus();
  };
```

Add a `const inputRef = useRef<HTMLTextAreaElement>(null);` beside the other refs
and put `ref={inputRef}` on the textarea.

- [ ] **Step 3: Handle keys while the picker is open**

Replace the textarea's `onKeyDown` with:

```tsx
          onKeyDown={(e) => {
            if (pickerOpen && capState.status === 'ready') {
              const matches = rankCommands(capState.caps.commands, typedQuery || '');
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((i) => Math.min(i + 1, matches.length - 1));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === 'Escape') { e.preventDefault(); setText(''); setSheet(null); return; }
              // Enter completes the highlighted command rather than sending a
              // half-typed one. Only when there is something to complete.
              if (e.key === 'Enter' && !e.shiftKey && matches[selected]) {
                e.preventDefault();
                pickCommand(matches[selected].name);
                return;
              }
            }
            if (shouldSubmitOnEnter(e, coarse)) { e.preventDefault(); submit(); }
          }}
```

- [ ] **Step 4: Render the sheets and enable the menu rows**

Replace the two disabled `+` menu rows with:

```tsx
          <button
            className="aic-pi"
            role="menuitem"
            onClick={() => { setSheet('commands'); setMenuOpen(false); }}
          >
            <Slash size={15} /> Commands
          </button>
          <button
            className="aic-pi"
            role="menuitem"
            onClick={() => { setSheet('mcp'); setMenuOpen(false); }}
          >
            <Zap size={15} /> MCP servers
          </button>
```

And immediately after the `{menuOpen && (...)}` block, add:

```tsx
      {pickerOpen && (
        <CommandPicker
          state={capState}
          query={typedQuery || ''}
          selected={selected}
          onPick={pickCommand}
          onRefresh={refresh}
        />
      )}

      {sheet === 'mcp' && <McpPanel state={capState} onRefresh={refresh} />}
```

Finally, extend the existing outside-click effect so it also closes `sheet`:
change its condition from `if (!menuOpen) return;` to
`if (!menuOpen && !sheet) return;`, and have both handlers call
`setMenuOpen(false); setSheet(null);`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`
Expected: no type errors, 111 tests pass, build clean

- [ ] **Step 6: Commit**

```bash
git add src/components/ai/AiComposer.tsx "src/app/(dash)/ai/[machineId]/[tmuxName]/page.tsx"
git commit -m "feat(ai): slash commands and MCP servers in the composer

Typing / opens the ranked list; the + menu opens the same list for browsing
and the MCP panel beside it. Picking inserts '/name ' rather than sending,
because a command usually takes arguments.

While the picker is open Enter completes the highlighted command instead of
sending a half-typed one — the one place the desktop Enter-to-send rule has to
yield, or the feature fights the composer."
```

---

### Task 7: Verify by eye

**Files:** none. Layout is the one thing the node-environment runner cannot check.

- [ ] **Step 1: Run against a live session**

Run: `npm run dev` and open a real AI session at `/ai`.

Note: the local ws-server needs `--env-file=.env.local` (JWT_SECRET is not in
`.env` on this machine), or test against the deployed site instead.

- [ ] **Step 2: Confirm, at desktop width**

- Typing `/` opens the list; it shows 81 commands on this machine.
- `/comp` ranks `compact` first; `/commit` reaches `commit-commands:clean_gone`,
  proving the namespace is searchable.
- Arrow keys move the highlight, Enter completes, Escape closes and clears.
- Picking inserts `/name ` and leaves focus in the input.
- **The conversation does not move** when any sheet opens.
- The `+` menu's two rows open the picker and the MCP panel.
- The MCP panel lists 20 servers with their launch lines.

- [ ] **Step 3: Confirm on a phone**

- The sheet is reachable and scrollable, and scrolling it does not drag the
  chat behind it.
- Tapping a command inserts it without the keyboard closing.
- With the key bar on, the sheet still overlays rather than stacking.

- [ ] **Step 4: Confirm the honest empty states**

Stop the agent (`kill $(pgrep -f 'devdash-agent/dist/index.js')`; launchd
restarts it within five seconds, so do this deliberately) and confirm the
picker says the agent/offline sentence rather than "no commands found".

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(ai): corrections from the command picker verification pass"
```

---

## Definition of done

- `npm test` green, `npm run build` clean.
- Typing `/` lists real commands from the machine that owns the session.
- Picking inserts and never sends.
- No sheet resizes the conversation, at any width.
- Offline and old-agent read differently from "none found".
