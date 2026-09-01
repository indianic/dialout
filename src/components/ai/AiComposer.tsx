'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Lock, Unlock, Plus, Keyboard, Slash, Zap } from 'lucide-react';
import KeyChipBar, { CtrlState } from '@/components/KeyChipBar';
import { getFunctionKeysVisible, setFunctionKeysVisible } from './ai-chat-prefs';
import { shouldSubmitOnEnter, COARSE_POINTER_QUERY } from './composer-behaviour';
import CommandPicker from './CommandPicker';
import McpPanel from './McpPanel';
import { useAiCapabilities } from './useAiCapabilities';
import { commandQuery, rankCommands } from './command-filter';
import { useHardwareKeyboard } from './useHardwareKeyboard';
import './ai-chat.css';

// Typing here injects keystrokes into a pane the user may also be sitting in
// front of. The lock is not decoration: two inputs into one TUI interleave
// into nonsense, so taking input is always an explicit act.
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
  const [text, setText] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [ctrlState, setCtrlState] = useState<CtrlState>('off');
  const [menuOpen, setMenuOpen] = useState(false);
  const [keysOn, setKeysOn] = useState(false);
  // Server render has no matchMedia, and a wrong first paint would flash the
  // key bar onto a desktop, so this starts false and is read after mount.
  const [coarse, setCoarse] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Which overlay the + opened, if any. Only one at a time — they occupy the
  // same anchored space above the input.
  const [sheet, setSheet] = useState<null | 'commands' | 'mcp'>(null);
  const [selected, setSelected] = useState(0);
  const { state: capState, load, refresh } = useAiCapabilities(machineId, tmuxName);

  // Typing "/" is itself a request for the list.
  // An iPad with a keyboard cover is a coarse pointer WITH a real Enter key,
  // so the pointer test alone is not enough to decide either of the two things
  // it used to decide on its own.
  const { hardware, noteKeydown, noteFocus } = useHardwareKeyboard(coarse);
  const onScreenOnly = coarse && !hardware;

  const typedQuery = commandQuery(text);
  const pickerOpen = sheet === 'commands' || typedQuery !== null;

  // localStorage is read after mount so the server and first client render
  // agree; reading it during render would hydrate-mismatch.
  useEffect(() => { setKeysOn(getFunctionKeysVisible()); }, []);

  // Tracked live rather than read once: an iPad gains and loses a hardware
  // keyboard mid-session, and a desktop with a touchscreen can change too.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(COARSE_POINTER_QUERY);
    const apply = () => setCoarse(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (pickerOpen || sheet === 'mcp') void load();
  }, [pickerOpen, sheet, load]);

  useEffect(() => { setSelected(0); }, [typedQuery]);

  useEffect(() => {
    if (!menuOpen && !sheet) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setMenuOpen(false); setSheet(null); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setSheet(null); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, sheet]);

  const locked = attachedElsewhere && !unlocked;

  const submit = () => {
    const value = text.trim();
    if (!value || locked) return;
    onSend(value);
    setText('');
  };

  // Inserts, never sends: a command usually takes arguments, and firing on
  // pick would rob the user of the chance to add them.
  const pickCommand = (name: string) => {
    setText(`/${name} `);
    setSheet(null);
    inputRef.current?.focus();
  };

  const toggleKeys = () => {
    const next = !keysOn;
    setKeysOn(next);
    setFunctionKeysVisible(next);
  };

  return (
    <div ref={wrapRef} className="aic-composer">
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
          {/* Only where the key bar can apply. A row that can never do
              anything is the same noise the bar itself was on a desktop. */}
          {onScreenOnly && (
            <button className="aic-pi" onClick={toggleKeys} role="menuitem">
              <Keyboard size={15} /> Function keys
              <span className="aic-sw">{keysOn ? 'On' : 'Off'}</span>
            </button>
          )}
          {/* Reserved for the commands + MCP spec. Present and disabled so that
              work is an added row rather than a redesign of this popover. */}
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
        </div>
      )}

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

      {/* Answering a TUI means single keys far more often than sentences, and
          KeyChipBar already solves that on the mobile terminal. It emits raw
          control bytes, which is exactly what the agent's NAMED_KEYS table
          maps back to tmux key names. */}
      {!locked && onScreenOnly && keysOn && (
        <KeyChipBar
          onSend={onSendKeys ?? onSend}
          ctrlState={ctrlState}
          onCtrlStateChange={setCtrlState}
        />
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
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={noteFocus}
          // iOS shows an AutoFill accessory — password, card, address — above
          // the keyboard for any field it cannot rule out. These are the only
          // levers a web page has over it. Best effort, not a guarantee: the
          // accessory is OS chrome and Safari may show it regardless. The
          // data-* attributes additionally stop password-manager extensions
          // overlaying their own button on the field.
          name="devdash-agent-message"
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          data-form-type="other"
          // Autocorrect is actively harmful here rather than merely noisy:
          // messages to a coding agent are full of paths, flags and
          // identifiers, and iOS will happily rewrite --no-verify or
          // tmux-manager.ts into prose. Turning it off also suppresses the
          // QuickType prediction strip on most iOS versions.
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          onKeyDown={(e) => {
            // Learn what kind of keyboard this is from the keystroke itself,
            // before deciding what Enter means.
            noteKeydown(e);
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
            if (shouldSubmitOnEnter(e, onScreenOnly)) { e.preventDefault(); submit(); }
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
