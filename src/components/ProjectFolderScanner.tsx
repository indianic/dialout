'use client';

import { useMemo, useState } from 'react';
import {
  FolderSearch, Loader2, Plus, Pencil, CheckCircle2, AlertTriangle, X,
} from 'lucide-react';
import { useToast } from './Toast';
import { useDashboard } from './dashboard/DashboardContext';
import FsBrowserModal from './FsBrowserModal';
import ProjectModal from './ProjectModal';
import { ProjectFormData, ScannedProject } from '@/types';

function today() {
  return new Date().toISOString().split('T')[0];
}

export function toFormData(d: ScannedProject): ProjectFormData {
  const runner =
    d.packageManager === 'yarn' ? 'yarn'
    : d.packageManager === 'pnpm' || d.packageManager === 'bun' ? 'custom'
    : d.stack === 'node' ? 'npm'
    : d.stack === 'php' || d.stack === 'static' ? 'php'
    : d.stack === 'python' ? 'python'
    : 'custom';
  const stackBits = [d.framework, d.language].filter(
    (s, i, arr) => s && arr.indexOf(s) === i
  );
  return {
    name: d.name,
    port: d.port,
    addonPorts: '',
    url: d.url || '',
    techStack: stackBits.join(', '),
    description: `Detected ${d.framework}`,
    startDate: today(),
    runner,
    status: 'active',
    tags: 'scanned',
    notes: d.startCommand || '',
    rootPath: d.path,
    startCommand: '',
    stopCommand: '',
    restartCommand: '',
    runInBackground: true,
  };
}

type RowState = 'idle' | 'adding' | 'added' | 'error';

export default function ProjectFolderScanner() {
  const { session, onlineMachineIds, reloadProjects } = useDashboard();
  const { toast } = useToast();

  const machineId = session?.machineId;
  const online = machineId != null && onlineMachineIds.includes(machineId);

  const [browseOpen, setBrowseOpen] = useState(false);
  const [folder, setFolder] = useState('');
  const [depth, setDepth] = useState(2);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ScannedProject[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [bulkAdding, setBulkAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<ScannedProject | null>(null);

  async function runScan() {
    if (!folder.trim()) { setError('Choose a folder to scan first.'); return; }
    setScanning(true);
    setError('');
    setResults(null);
    setSelected(new Set());
    setRowState({});
    try {
      const r = await fetch('/api/scan/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folder.trim(), depth }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(
          data.error === 'Machine offline'
            ? 'Machine offline — start the dialout on this machine and try again.'
            : data.error || 'Scan failed'
        );
      } else {
        setResults(data.projects as ScannedProject[]);
      }
    } catch {
      setError('Scan failed — server unreachable or request timed out.');
    }
    setScanning(false);
  }

  async function postProject(data: ProjectFormData): Promise<boolean> {
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async function addOne(p: ScannedProject, data?: ProjectFormData): Promise<boolean> {
    setRowState((s) => ({ ...s, [p.path]: 'adding' }));
    const ok = await postProject(data || toFormData(p));
    setRowState((s) => ({ ...s, [p.path]: ok ? 'added' : 'error' }));
    if (ok) setSelected((sel) => { const n = new Set(sel); n.delete(p.path); return n; });
    return ok;
  }

  async function quickAdd(p: ScannedProject) {
    const ok = await addOne(p);
    toast(ok ? `Added ${p.name}` : `Failed to add ${p.name}`);
    if (ok) await reloadProjects();
  }

  async function addSelected() {
    if (!results) return;
    const targets = results.filter(
      (p) => selected.has(p.path) && !p.existing && rowState[p.path] !== 'added'
    );
    if (!targets.length) { toast('Nothing selected'); return; }
    setBulkAdding(true);
    let ok = 0;
    for (const p of targets) {
      if (await addOne(p)) ok++;
    }
    setBulkAdding(false);
    toast(`Added ${ok} of ${targets.length} project${targets.length === 1 ? '' : 's'}`);
    await reloadProjects();
  }

  function toggle(path: string) {
    setSelected((sel) => {
      const n = new Set(sel);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  }

  const addable = (results || []).filter((p) => !p.existing && rowState[p.path] !== 'added');
  const allSelected = addable.length > 0 && addable.every((p) => selected.has(p.path));

  const editInitial = useMemo(
    () => (editTarget ? toFormData(editTarget) : undefined),
    [editTarget]
  );

  return (
    <div className="glass" style={{ borderRadius: 'var(--r-sm)', padding: '20px 22px', marginBottom: 24 }}>
      <div className="label flex items-center gap-1.5" style={{ marginBottom: 12 }}>
        <FolderSearch size={14} style={{ color: 'var(--muted)' }} />
        Scan a folder for projects
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          className="inp flex-1 font-mono"
          style={{ minWidth: 220, fontSize: 13 }}
          placeholder="/Users/you/www"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setBrowseOpen(true)}
          disabled={!machineId}
        >
          Browse
        </button>
        <select
          className="inp"
          style={{ width: 110 }}
          value={depth}
          onChange={(e) => setDepth(parseInt(e.target.value, 10))}
          title="How many folder levels deep to look for projects"
        >
          <option value={1}>Depth 1</option>
          <option value={2}>Depth 2</option>
          <option value={3}>Depth 3</option>
        </select>
        <button className="btn-grad flex items-center gap-1.5" onClick={runScan} disabled={scanning || !online}>
          {scanning ? <Loader2 size={15} className="animate-spin" /> : <FolderSearch size={15} />}
          {scanning ? 'Scanning…' : 'Scan projects'}
        </button>
      </div>

      {!online && (
        <p className="text-[12.5px] mt-2" style={{ color: 'var(--offline)' }}>
          This machine&apos;s agent is offline — start <code className="font-mono">dialout</code> to scan folders.
        </p>
      )}
      {error && (
        <p className="text-[13px] mt-3" style={{ color: 'var(--offline)' }}>{error}</p>
      )}

      {/* Results */}
      {results && (
        <div style={{ marginTop: 18 }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 10 }}>
            <div className="text-[13px]" style={{ color: 'var(--muted)' }}>
              Found <strong style={{ color: 'var(--txt)' }}>{results.length}</strong> project{results.length === 1 ? '' : 's'}
              {results.some((p) => p.existing) &&
                ` · ${results.filter((p) => p.existing).length} already added`}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(addable.map((p) => p.path)))
                }
                disabled={addable.length === 0}
              >
                {allSelected ? 'Clear selection' : 'Select all new'}
              </button>
              <button
                className="btn-grad flex items-center gap-1.5"
                onClick={addSelected}
                disabled={bulkAdding || selected.size === 0}
              >
                {bulkAdding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Add {selected.size} selected
              </button>
              <button className="btn-icon" onClick={() => { setResults(null); setSelected(new Set()); setRowState({}); }} aria-label="Clear results">
                <X size={15} />
              </button>
            </div>
          </div>

          {results.length === 0 && (
            <p className="text-[13px]" style={{ color: 'var(--dim)' }}>
              No projects detected in this folder. Try increasing the depth.
            </p>
          )}

          <div style={{ overflowX: 'auto' }}>
            {results.map((p) => {
              const state = rowState[p.path] || 'idle';
              const disabled = p.existing || state === 'added';
              return (
                <div
                  key={p.path}
                  className="flex items-center gap-3 py-2 px-2 rounded"
                  style={{
                    borderBottom: '1px solid var(--b1)',
                    opacity: disabled ? 0.5 : 1,
                    minWidth: 640,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.path)}
                    onChange={() => toggle(p.path)}
                    disabled={disabled}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span title={p.running ? 'Port is responding' : 'Port not responding'}>
                    {p.running ? '🟢' : '⚪'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-[13.5px]" style={{ color: 'var(--txt)' }}>{p.name}</strong>
                      <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--b1)', color: 'var(--accent)' }}>
                        {p.framework}
                      </span>
                      {p.existing && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'var(--b1)', color: 'var(--muted)' }}>
                          <CheckCircle2 size={11} /> already added{p.existingName && p.existingName !== p.name ? ` as ${p.existingName}` : ''}
                        </span>
                      )}
                      {state === 'added' && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'var(--b1)', color: 'var(--live, var(--accent))' }}>
                          <CheckCircle2 size={11} /> added
                        </span>
                      )}
                      {state === 'error' && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: 'var(--b1)', color: 'var(--offline)' }}>
                          add failed
                        </span>
                      )}
                      {p.portConflict && !p.existing && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: 'var(--b1)', color: 'var(--offline)' }} title={`Port ${p.port} is already used by ${p.portConflictWith}`}>
                          <AlertTriangle size={11} /> port in use by {p.portConflictWith}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11.5px] truncate" style={{ color: 'var(--dim)' }}>
                      {p.path}{p.startCommand ? `  ·  ${p.startCommand}` : ''}
                    </div>
                  </div>
                  <div className="font-mono text-[12.5px] shrink-0" style={{ color: 'var(--muted)' }}>
                    :{p.port ?? '—'}
                    {p.port == null ? (
                      <span className="text-[10px]" style={{ color: 'var(--dim)' }}> (set port)</span>
                    ) : p.portSource === 'assigned' ? (
                      <span className="text-[10px]" style={{ color: 'var(--dim)' }}> (suggested)</span>
                    ) : null}
                  </div>
                  {!disabled && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="btn-icon"
                        title="Edit & add"
                        onClick={() => setEditTarget(p)}
                        disabled={state === 'adding' || bulkAdding}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn-icon"
                        title="Add project"
                        onClick={() => quickAdd(p)}
                        disabled={state === 'adding' || bulkAdding}
                      >
                        {state === 'adding' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Folder picker */}
      {machineId != null && (
        <FsBrowserModal
          open={browseOpen}
          machineId={machineId}
          currentPath={folder || '/'}
          onSelect={(p) => setFolder(p)}
          onClose={() => setBrowseOpen(false)}
        />
      )}

      {/* Edit & add */}
      <ProjectModal
        open={editTarget !== null}
        editingProject={null}
        machineId={machineId}
        initialData={editInitial}
        onClose={() => setEditTarget(null)}
        onSave={async (data) => {
          const target = editTarget!;
          setEditTarget(null);
          const ok = await addOne(target, data);
          toast(ok ? `Added ${data.name}` : `Failed to add ${data.name}`);
          if (ok) await reloadProjects();
        }}
      />
    </div>
  );
}
