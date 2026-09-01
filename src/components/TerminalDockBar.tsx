'use client';

import { Project } from '@/types';

export interface DockEntry {
  project: Project;
  tabCount: number;
  runningCount: number;
  viewMode: 'full' | 'docked' | 'card';
}

interface TerminalDockBarProps {
  entries: DockEntry[];
  activeProjectId: number | null;
  onSelect: (projectId: number) => void;
  onClose: (projectId: number) => void;
}

export default function TerminalDockBar({ entries, activeProjectId, onSelect, onClose }: TerminalDockBarProps) {
  if (entries.length === 0) return null;

  // Don't show dock bar if only one terminal and it's in full/docked mode
  const visibleAsCard = entries.filter((e) => e.viewMode === 'card');
  const hasExpandedPanel = entries.some((e) => e.viewMode === 'full' || e.viewMode === 'docked');

  // Show dock bar when there are minimized cards, or when there are multiple terminals
  if (visibleAsCard.length === 0 && entries.length <= 1) return null;

  return (
    <div
      className="devdash-dock-bar"
      style={hasExpandedPanel ? { bottom: 'auto', top: 8, right: 12, left: 'auto' } : undefined}
    >
      {entries.map((entry) => {
        const isActive = entry.project.id === activeProjectId && entry.viewMode !== 'card';
        return (
          <div
            key={entry.project.id}
            className={`devdash-dock-card ${isActive ? 'active' : ''} ${entry.viewMode !== 'card' ? 'expanded' : ''}`}
            onClick={() => onSelect(entry.project.id)}
          >
            <div className="devdash-dock-card-header">
              <span className={`devdash-dock-dot ${entry.runningCount > 0 ? 'running' : 'idle'}`} />
              <span className="devdash-dock-card-name">{entry.project.name}</span>
              <button
                className="devdash-dock-card-close"
                onClick={(e) => { e.stopPropagation(); onClose(entry.project.id); }}
                title="Close terminal"
              >&times;</button>
            </div>
            <div className="devdash-dock-card-meta">
              {entry.tabCount} tab{entry.tabCount !== 1 ? 's' : ''}
              {entry.runningCount > 0 && (
                <span className="devdash-dock-running"> &middot; {entry.runningCount} running</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
