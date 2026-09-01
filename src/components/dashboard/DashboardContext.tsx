'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Project, ProjectFormData, SystemService, SessionInfo, Stats } from '@/types';
import { useToast } from '@/components/Toast';
import { useDashboardSocket } from '@/hooks/useDashboardSocket';
import type { ViewMode } from '@/components/TerminalPanel';

export type SharedProject = Project & {
  shareId: number;
  sharedByName: string;
  sharedByEmail: string;
  allowTerminal?: boolean;
  sharePort?: number;
  shareRootPath?: string;
};

export type TerminalEntry = {
  project: Project;
  viewMode: ViewMode;
  tabCount: number;
  runningCount: number;
};

interface DashboardCtx {
  // session / auth
  session: SessionInfo | null;
  authChecked: boolean;
  checkAuth: () => Promise<void>;
  handleMachineSwitch: (machineId: number) => Promise<void>;
  handleAddMachine: (name: string) => Promise<void>;
  handleLogout: () => Promise<void>;

  // data
  projects: Project[];
  sharedProjects: SharedProject[];
  services: SystemService[];
  onlineMachineIds: number[];
  loading: boolean;
  refreshing: boolean;
  lastRefresh: string;
  stats: Stats;

  // filters
  search: string;
  setSearch: (v: string) => void;
  runnerFilter: string;
  setRunnerFilter: (v: string) => void;

  // data actions
  refreshAll: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  reloadServices: () => Promise<void>;
  reloadShared: () => Promise<void>;
  loadOnlineMachines: () => Promise<void>;
  deleteMachine: (id: number) => Promise<boolean>;
  saveProject: (data: ProjectFormData, id?: number) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  deleteProjects: (ids: number[]) => Promise<void>;
  runProcessAction: (project: Project, action: 'start' | 'stop' | 'restart', extra?: { command?: string; background?: boolean; save?: boolean }) => Promise<{ ok: boolean; needCommand?: boolean }>;
  unsubscribeShare: (shareId: number) => Promise<void>;
  getProject: (id: number) => Project | SharedProject | undefined;

  // overlay navigation (query-param driven)
  openAdd: () => void;
  openEdit: (id: number) => void;
  openDelete: (id: number) => void;
  openShare: (id: number) => void;
  closeOverlay: () => void;
  openAddMachine: () => void;

  // terminal dock
  openTerminals: Map<number, TerminalEntry>;
  setOpenTerminals: React.Dispatch<React.SetStateAction<Map<number, TerminalEntry>>>;
  activeTerminalId: number | null;
  setActiveTerminalId: React.Dispatch<React.SetStateAction<number | null>>;
  dockedHeight: number;
  setDockedHeight: React.Dispatch<React.SetStateAction<number>>;
  openTerminal: (project: Project) => void;

  // notifications drawer toggle
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;

  // search input focus ref (Cmd+K)
  searchRef: React.RefObject<HTMLInputElement | null>;

  toast: (msg: string) => void;
}

const Ctx = createContext<DashboardCtx | null>(null);

export function useDashboard() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDashboard must be used within DashboardProvider');
  return c;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [onlineMachineIds, setOnlineMachineIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState('—');

  const [search, setSearch] = useState('');
  const [runnerFilter, setRunnerFilter] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  // ── Terminal dock (persisted to sessionStorage) ──
  const [openTerminals, setOpenTerminals] = useState<Map<number, TerminalEntry>>(() => {
    if (typeof window === 'undefined') return new Map();
    try {
      const saved = sessionStorage.getItem('devdash-open-terminals');
      if (saved) return new Map(JSON.parse(saved) as Array<[number, TerminalEntry]>);
    } catch {}
    return new Map();
  });
  const [activeTerminalId, setActiveTerminalId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try { const s = sessionStorage.getItem('devdash-active-terminal'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [dockedHeight, setDockedHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return 320;
    try { const s = sessionStorage.getItem('devdash-docked-height'); return s ? JSON.parse(s) : 320; } catch { return 320; }
  });

  useEffect(() => { try { sessionStorage.setItem('devdash-open-terminals', JSON.stringify(Array.from(openTerminals.entries()))); } catch {} }, [openTerminals]);
  useEffect(() => { try { sessionStorage.setItem('devdash-active-terminal', JSON.stringify(activeTerminalId)); } catch {} }, [activeTerminalId]);
  useEffect(() => { try { sessionStorage.setItem('devdash-docked-height', JSON.stringify(dockedHeight)); } catch {} }, [dockedHeight]);

  // ── Auth ──
  const checkAuth = useCallback(async () => {
    try {
      const r = await fetch('/api/auth');
      if (r.ok) setSession(await r.json());
      else setSession(null);
    } catch { setSession(null); }
    setAuthChecked(true);
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // ── Loaders ──
  const reloadProjects = useCallback(async () => {
    try {
      const r = await fetch('/api/projects');
      if (!r.ok) throw new Error();
      setProjects(await r.json());
      setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch { toast('Couldn’t load projects'); }
    setLoading(false);
  }, [toast]);

  const reloadServices = useCallback(async () => {
    try { const r = await fetch('/api/services'); if (r.ok) setServices(await r.json()); } catch {}
  }, []);

  const reloadShared = useCallback(async () => {
    try { const r = await fetch('/api/shares'); if (r.ok) setSharedProjects(await r.json()); } catch {}
  }, []);

  const loadOnlineMachines = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(`/api/machines?userId=${session.userId}`);
      if (r.ok) {
        const data = await r.json();
        setOnlineMachineIds(data.filter((m: { isOnline?: boolean }) => m.isOnline).map((m: { id: number }) => m.id));
      }
    } catch {}
  }, [session]);

  useEffect(() => {
    if (session && !session.requires2faEnrollment) { reloadProjects(); reloadServices(); reloadShared(); loadOnlineMachines(); }
  }, [session, reloadProjects, reloadServices, reloadShared, loadOnlineMachines]);

  // Live machine status.
  //
  // `loadOnlineMachines` runs once on mount, which meant a machine that came
  // online afterwards — the usual case, since you generate the key and *then*
  // go and run `dialout init` on the machine — stayed grey until a manual
  // reload. The ws-server already broadcasts machine_online / machine_offline
  // and a machine_status_sync snapshot on connect; nothing on the dashboard was
  // listening to any of it.
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL
    || (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      : '');

  const onMachineStatus = useCallback((machineId: number, online: boolean) => {
    setOnlineMachineIds((prev) => {
      const has = prev.includes(machineId);
      if (online === has) return prev;   // no state change, no re-render
      return online ? [...prev, machineId] : prev.filter((id) => id !== machineId);
    });
  }, []);

  // The sync snapshot is authoritative and replaces the list wholesale — it is
  // how the dashboard recovers after a socket drop, where individual online and
  // offline events were missed and the local list has drifted.
  const onMachineSync = useCallback((ids: number[]) => setOnlineMachineIds(ids), []);

  useDashboardSocket({
    userId: session?.userId ?? 0,
    machineId: session?.machineId ?? 0,
    wsUrl: session && !session.requires2faEnrollment ? wsUrl : '',
    onMachineStatus,
    onMachineSync,
  });

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([reloadProjects(), reloadServices(), reloadShared(), loadOnlineMachines()]);
    setTimeout(() => setRefreshing(false), 500);
  }, [reloadProjects, reloadServices, reloadShared, loadOnlineMachines]);

  // ── Machine actions ──
  const handleMachineSwitch = useCallback(async (machineId: number) => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'switch-machine', machineId }) });
    await checkAuth();
    setLoading(true);
  }, [checkAuth]);

  const handleAddMachine = useCallback(async (name: string) => {
    // A failure used to be silent — the modal closed and no machine appeared,
    // with nothing to explain why. This is now reachable from the UI, so it
    // has to say something.
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add-machine', machineName: name }) });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        toast(data.error || 'Could not add machine');
        return;
      }
      toast('Machine added');
      await checkAuth();
    } catch {
      toast('Could not add machine');
    }
  }, [checkAuth, toast]);

  /**
   * Delete a machine and everything belonging to it.
   *
   * The confirmation lives in the UI; by the time this runs the user has said
   * yes. `checkAuth` afterwards because the session carries the machine list
   * and the sidebar switcher reads it from there — without it the deleted
   * machine stays in the dropdown until the next page load.
   */
  const deleteMachine = useCallback(async (id: number): Promise<boolean> => {
    try {
      const r = await fetch(`/api/machines/${id}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast(data.error || 'Could not delete machine'); return false; }
      const gone = data.deleted?.projects ?? 0;
      toast(gone > 0 ? `Machine deleted, along with ${gone} project${gone === 1 ? '' : 's'}` : 'Machine deleted');
      await checkAuth();
      await Promise.all([reloadProjects(), reloadServices(), loadOnlineMachines()]);
      return true;
    } catch {
      toast('Could not delete machine');
      return false;
    }
  }, [checkAuth, reloadProjects, reloadServices, loadOnlineMachines, toast]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    setSession(null);
  }, []);

  // ── Project CRUD ──
  const saveProject = useCallback(async (data: ProjectFormData, id?: number) => {
    if (!data.name) { toast('Project name is required'); return; }
    const url = id ? `/api/projects/${id}` : '/api/projects';
    const method = id ? 'PUT' : 'POST';
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
      toast(id ? 'Project updated' : 'Project added');
      await reloadProjects();
    } catch { toast('Save failed'); throw new Error('save failed'); }
  }, [reloadProjects, toast]);

  const deleteProject = useCallback(async (id: number) => {
    try { await fetch(`/api/projects/${id}`, { method: 'DELETE' }); toast('Project deleted'); await reloadProjects(); }
    catch { toast('Delete failed'); }
  }, [reloadProjects, toast]);

  const deleteProjects = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const r = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json().catch(() => ({ deleted: ids.length }));
      const n = data.deleted ?? ids.length;
      toast(`Deleted ${n} project${n === 1 ? '' : 's'}`);
      await reloadProjects();
    } catch { toast('Delete failed'); }
  }, [reloadProjects, toast]);

  const runProcessAction = useCallback(async (
    project: Project,
    action: 'start' | 'stop' | 'restart',
    extra?: { command?: string; background?: boolean; save?: boolean },
  ): Promise<{ ok: boolean; needCommand?: boolean }> => {
    try {
      const r = await fetch(`/api/projects/${project.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (r.status === 409) return { ok: false, needCommand: true };
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast(data.error || 'Command failed'); return { ok: false }; }
      if (data.ok === false) { toast(data.error || (data.output ? String(data.output).slice(0, 120) : 'Command failed')); }
      else { toast(action === 'start' ? 'Starting…' : action === 'stop' ? 'Stopping…' : 'Restarting…'); }
      // Re-check status shortly after.
      setTimeout(() => { reloadProjects(); }, 1500);
      return { ok: data.ok !== false };
    } catch { toast('Command failed'); return { ok: false }; }
  }, [reloadProjects, toast]);

  const unsubscribeShare = useCallback(async (shareId: number) => {
    await fetch('/api/shares', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shareId }) });
    toast('Unsubscribed');
    reloadShared();
  }, [reloadShared, toast]);

  const getProject = useCallback((id: number) =>
    projects.find((p) => p.id === id) || sharedProjects.find((p) => p.id === id),
    [projects, sharedProjects]);

  // ── Overlay navigation via query params ──
  const setOverlay = useCallback((qs: string | null) => {
    const base = pathname || '/projects';
    router.push(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [pathname, router]);

  const openAdd    = useCallback(() => setOverlay('new=1'), [setOverlay]);
  const openEdit   = useCallback((id: number) => setOverlay(`edit=${id}`), [setOverlay]);
  const openDelete = useCallback((id: number) => setOverlay(`delete=${id}`), [setOverlay]);
  const openShare  = useCallback((id: number) => setOverlay(`share=${id}`), [setOverlay]);
  const openAddMachine = useCallback(() => setOverlay('add-machine=1'), [setOverlay]);
  const closeOverlay = useCallback(() => setOverlay(null), [setOverlay]);

  // ── Terminal dock ──
  const openTerminal = useCallback((p: Project) => {
    // On a phone the terminal is its own route rather than an overlay stacked
    // on the dashboard — see the comment in app/terminal/mobile/[projectId].
    // Checked at click time, not from a resize listener, so a rotated tablet
    // gets the right surface for the tap that just happened.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
      const qs = new URLSearchParams({
        m: String(p.machineId || session?.machineId || ''),
        name: p.name,
        path: p.rootPath || '~',
      });
      router.push(`/terminal/mobile/${p.id}?${qs.toString()}`);
      return;
    }
    const id = p.id;
    setOpenTerminals((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        const entry = next.get(id)!;
        if (entry.viewMode === 'card') next.set(id, { ...entry, viewMode: 'full' });
        return next;
      }
      for (const [pid, entry] of next) {
        if (entry.viewMode === 'full' || entry.viewMode === 'docked') next.set(pid, { ...entry, viewMode: 'card' });
      }
      next.set(id, { project: p, viewMode: 'full', tabCount: 0, runningCount: 0 });
      return next;
    });
    setActiveTerminalId(id);
  }, [router, session?.machineId]);

  // ── Stats ──
  const stats: Stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    running: projects.filter((p) => p.isRunning).length,
    offline: projects.filter((p) => !p.isRunning && p.status !== 'archived').length,
    archived: projects.filter((p) => p.status === 'archived').length,
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (searchParams?.toString()) closeOverlay();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); openAdd(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchParams, closeOverlay, openAdd]);

  const value: DashboardCtx = {
    session, authChecked, checkAuth, handleMachineSwitch, handleAddMachine, handleLogout, openAddMachine,
    projects, sharedProjects, services, onlineMachineIds, loading, refreshing, lastRefresh, stats,
    loadOnlineMachines, deleteMachine,
    search, setSearch, runnerFilter, setRunnerFilter,
    refreshAll, reloadProjects, reloadServices, reloadShared, saveProject, deleteProject, deleteProjects, runProcessAction, unsubscribeShare, getProject,
    openAdd, openEdit, openDelete, openShare, closeOverlay,
    openTerminals, setOpenTerminals, activeTerminalId, setActiveTerminalId, dockedHeight, setDockedHeight, openTerminal,
    notifOpen, setNotifOpen,
    searchRef,
    toast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
