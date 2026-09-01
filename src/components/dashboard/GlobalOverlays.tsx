'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Project } from '@/types';
import { useDashboard } from './DashboardContext';
import ProjectModal from '@/components/ProjectModal';
import DeleteModal from '@/components/DeleteModal';
import ShareModal from '@/components/ShareModal';
import AddMachineModal from '@/components/AddMachineModal';
import NotificationDrawer from '@/components/NotificationDrawer';
import TerminalPanel from '@/components/TerminalPanel';
import TerminalDockBar from '@/components/TerminalDockBar';
import type { DockEntry } from '@/components/TerminalDockBar';
import type { Notification } from '@/types';

export default function GlobalOverlays() {
  const router = useRouter();
  const sp = useSearchParams();
  const {
    session, projects, sharedProjects, getProject,
    saveProject, deleteProject, closeOverlay, reloadProjects, reloadShared,
    notifOpen, setNotifOpen, handleAddMachine,
    openTerminals, setOpenTerminals, activeTerminalId, setActiveTerminalId, dockedHeight, setDockedHeight,
  } = useDashboard();

  if (!session) return null;

  const newParam = sp.get('new');
  const editId = sp.get('edit');
  const deleteId = sp.get('delete');
  const shareId = sp.get('share');
  const addingMachine = sp.get('add-machine') === '1';

  const editingProject = editId ? (projects.find((p) => p.id === Number(editId)) || null) : null;
  const quickAddPort = newParam && Number(newParam) > 1 ? Number(newParam) : null;

  const quickAddStub: Project | null = quickAddPort ? {
    id: 0, userId: null, machineId: null, name: '', port: quickAddPort, addonPorts: '', url: `http://localhost:${quickAddPort}`,
    techStack: '', description: '', startDate: new Date().toISOString().split('T')[0],
    runner: 'npm', status: 'active', tags: '', notes: '', rootPath: '',
    startCommand: '', stopCommand: '', restartCommand: '', runInBackground: true,
    isRunning: false, lastChecked: null, createdAt: '', updatedAt: '',
  } : null;

  const modalOpen = !!newParam || !!editId;
  const deletingProject = deleteId ? projects.find((p) => p.id === Number(deleteId)) : null;
  const sharingProject = shareId ? projects.find((p) => p.id === Number(shareId)) || null : null;

  function handleNotificationClick(n: Notification) {
    setNotifOpen(false);
    const own = projects.find((x) => x.id === n.projectId);
    const shared = sharedProjects.find((x) => x.id === n.projectId);
    if (own) {
      router.push(`/projects/${own.id}?tab=${n.type === 'comment' ? 'comments' : 'notes'}`);
    } else if (shared) {
      router.push(`/shared`);
    } else if (n.type === 'share') {
      router.push('/shared');
    }
  }

  return (
    <>
      <ProjectModal
        open={modalOpen}
        editingProject={quickAddStub || editingProject}
        machineId={session.machineId}
        onClose={closeOverlay}
        onSave={async (data, id) => { await saveProject(data, id); closeOverlay(); }}
      />

      <DeleteModal
        open={!!deletingProject}
        projectName={deletingProject?.name || ''}
        onClose={closeOverlay}
        onConfirm={async () => { if (deletingProject) await deleteProject(deletingProject.id); closeOverlay(); }}
      />

      <ShareModal
        open={!!sharingProject}
        project={sharingProject}
        machines={session.machines}
        currentMachineId={session.machineId}
        onClose={closeOverlay}
        onReload={() => { reloadProjects(); reloadShared(); }}
      />

      <AddMachineModal
        open={addingMachine}
        existingNames={session.machines.map((m) => m.name)}
        onClose={closeOverlay}
        onAdd={handleAddMachine}
      />

      <NotificationDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onClickNotification={handleNotificationClick}
      />

      {/* Persistent multi-project terminals */}
      {Array.from(openTerminals.entries()).map(([pid, entry]) => (
        <TerminalPanel
          key={pid}
          machineId={entry.project.machineId || session.machineId}
          userId={session.userId}
          wsUrl={process.env.NEXT_PUBLIC_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`}
          projectName={entry.project.name}
          projectPath={entry.project.rootPath || '~'}
          projectId={entry.project.id}
          viewMode={entry.viewMode}
          onViewModeChange={(mode) => {
            setOpenTerminals((prev) => {
              const next = new Map(prev);
              if (mode === 'full' || mode === 'docked') {
                for (const [id, e] of next) {
                  if (id !== pid && (e.viewMode === 'full' || e.viewMode === 'docked')) next.set(id, { ...e, viewMode: 'card' });
                }
                setActiveTerminalId(pid);
              }
              next.set(pid, { ...next.get(pid)!, viewMode: mode });
              return next;
            });
          }}
          onClose={() => {
            setOpenTerminals((prev) => { const next = new Map(prev); next.delete(pid); return next; });
            if (activeTerminalId === pid) setActiveTerminalId(null);
          }}
          dockedHeight={dockedHeight}
          onDockedHeightChange={setDockedHeight}
        />
      ))}

      <TerminalDockBar
        entries={Array.from(openTerminals.entries()).map(([, entry]): DockEntry => ({
          project: entry.project,
          tabCount: entry.tabCount,
          runningCount: entry.runningCount,
          viewMode: entry.viewMode,
        }))}
        activeProjectId={activeTerminalId}
        onSelect={(pid) => {
          const entry = openTerminals.get(pid);
          if (!entry) return;
          if (entry.viewMode === 'full' || entry.viewMode === 'docked') {
            setOpenTerminals((prev) => { const next = new Map(prev); next.set(pid, { ...entry, viewMode: 'card' }); return next; });
            setActiveTerminalId(null);
            return;
          }
          setOpenTerminals((prev) => {
            const next = new Map(prev);
            for (const [id, e] of next) {
              if (id !== pid && (e.viewMode === 'full' || e.viewMode === 'docked')) next.set(id, { ...e, viewMode: 'card' });
            }
            next.set(pid, { ...entry, viewMode: 'full' });
            return next;
          });
          setActiveTerminalId(pid);
        }}
        onClose={(pid) => {
          try { sessionStorage.removeItem(`devdash-tabs-${pid}`); } catch {}
          setOpenTerminals((prev) => { const next = new Map(prev); next.delete(pid); return next; });
          if (activeTerminalId === pid) setActiveTerminalId(null);
        }}
      />
    </>
  );
}
