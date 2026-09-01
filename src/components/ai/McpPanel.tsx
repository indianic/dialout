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
