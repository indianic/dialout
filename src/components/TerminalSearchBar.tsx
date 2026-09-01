'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import type { TerminalSearchResult } from './Terminal';

interface TerminalSearchBarProps {
  /** Fresh search for `term` — called on every keystroke; an empty string clears. */
  onSearch: (term: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  /** Latest match info reported by the SearchAddon for the last search
   *  action, if the addon has reported one yet. */
  result: TerminalSearchResult | null;
}

function formatResult(result: TerminalSearchResult | null, hasTerm: boolean): string {
  if (!hasTerm || !result) return '';
  if (result.count === 0) return 'No results';
  // resultIndex is -1 when the addon's highlight limit was exceeded — still
  // show the count, just without a "current match" position.
  if (result.index < 0) return `${result.count} match${result.count === 1 ? '' : 'es'}`;
  return `${result.index + 1} / ${result.count}`;
}

// Slim in-buffer search bar (Ctrl-F equivalent) shown below MobileTerminalShell's
// topbar. Presentational + callbacks only — owns no terminal ref, mirroring
// how TerminalSettingsDrawer is structured; the shell wires these callbacks to
// the active tab's TerminalHandle.
export default function TerminalSearchBar({ onSearch, onNext, onPrev, onClose, result }: TerminalSearchBarProps) {
  const [term, setTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input the moment the bar mounts (i.e. when the shell opens it).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTerm(v);
    onSearch(v);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!term) return;
      if (e.shiftKey) onPrev(); else onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Stop the keydown from bubbling to document — otherwise a
      // document-level Escape handler higher up (e.g. the settings drawer's,
      // or the shell's tabs/copy-menu one) would ALSO fire on this same
      // keypress when the search input has focus, closing more than one
      // overlay at once. Each overlay should own a single Escape press.
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="devdash-tsb" role="search">
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        className="devdash-tsb-input"
        placeholder="Search buffer…"
        value={term}
        onChange={onChange}
        onKeyDown={onKeyDown}
        aria-label="Search terminal buffer"
      />
      <span className="devdash-tsb-count" aria-live="polite">
        {formatResult(result, term.length > 0)}
      </span>
      <button
        type="button"
        className="devdash-tsb-btn"
        onClick={onPrev}
        disabled={!term}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp size={18} />
      </button>
      <button
        type="button"
        className="devdash-tsb-btn"
        onClick={onNext}
        disabled={!term}
        aria-label="Next match"
        title="Next match (Enter)"
      >
        <ChevronDown size={18} />
      </button>
      <button
        type="button"
        className="devdash-tsb-btn devdash-tsb-close"
        onClick={onClose}
        aria-label="Close search"
        title="Close search (Esc)"
      >
        <X size={18} />
      </button>
    </div>
  );
}
