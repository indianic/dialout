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
