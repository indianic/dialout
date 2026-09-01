import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import { processErrorMessage, runProjectProcess } from '../../src/api/process';
import { useAuth } from '../../src/store/auth';
import { Screen, Title, Sub, StatusDot, Empty, Loader, Pad } from '../../src/ui/primitives';
import { MachineFilter } from '../../src/ui/MachineFilter';
import { NewProjectSheet } from '../../src/ui/NewProjectSheet';
import { NewAiSheet } from '../../src/ui/NewAiSheet';
import { useTheme } from '../../src/ui/Theme';
import { useTablet } from '../../src/hooks/useTablet';
import { radius } from '../../src/ui/tokens';

type Project = {
  id: number;
  name: string;
  port?: number | null;
  addonPorts?: string | null;
  url?: string | null;
  techStack?: string | null;
  tags?: string | null;
  description?: string | null;
  runner?: string | null;
  rootPath?: string | null;
  status?: string | null;
  machineId: number;
  machineName?: string;
  isRunning?: boolean;
};

function splitCsv(s?: string | null) {
  return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
}

export default function Projects() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const tablet = useTablet();
  const machines = useAuth((s) => s.machines);
  const [filter, setFilter] = useState<'all' | number>('all');
  const [newProject, setNewProject] = useState(false);
  const [aiFor, setAiFor] = useState<{ machineId: number; cwd: string } | null>(null);
  const q = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/api/projects?machineId=all'),
  });

  const rows = useMemo(() => {
    const all = (q.data || []).filter((p) => p.status !== 'archived');
    if (filter === 'all') return all;
    return all.filter((p) => p.machineId === filter);
  }, [q.data, filter]);

  const byMachine = useMemo(() => {
    const map = new Map<number, Project[]>();
    for (const p of rows) {
      const id = p.machineId || 0;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(p);
    }
    return [...map.entries()].sort((a, b) => {
      const an = machines.find((m) => m.id === a[0])?.name || '';
      const bn = machines.find((m) => m.id === b[0])?.name || '';
      return an.localeCompare(bn);
    });
  }, [rows, machines]);

  const startTerm = (p: Project) => {
    const m = machines.find((x) => x.id === p.machineId);
    if (m && m.isOnline === false) return;
    router.push(`/terminal/new-${p.id}?machineId=${p.machineId}&cwd=${encodeURIComponent(p.rootPath || '~')}&title=${encodeURIComponent(p.name)}`);
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Title large>Projects</Title>
          <Sub>{rows.filter((p) => p.isRunning).length} running · {rows.length} total</Sub>
        </View>
        <Pressable onPress={() => setNewProject(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.cta, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={22} color={t.ctaFg} />
        </Pressable>
      </View>
      <MachineFilter machines={machines} value={filter} onChange={setFilter} />
      {q.isLoading ? <Loader /> : (
        <Pad>
          {rows.length === 0 && <Empty title="No projects" body="Add one with +." />}
          {byMachine.map(([mid, list]) => {
            const m = machines.find((x) => x.id === mid);
            const online = m?.isOnline !== false;
            return (
              <View key={mid} style={{ gap: 8, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 }}>
                  <Text style={{ color: t.dim, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, flex: 1 }}>
                    {(m?.name || 'Machine').toUpperCase()} · {list.length}
                  </Text>
                  <StatusDot status={online ? 'working' : 'off'} />
                </View>
                <View style={tablet
                  ? { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }
                  : { gap: 8 }}>
                  {list.map((p) => (
                    <View key={p.id} style={tablet ? { width: '48%' } : { alignSelf: 'stretch' }}>
                      <ProjectCard
                        p={p}
                        machineOnline={online}
                        onOpen={() => router.push(`/project/${p.id}`)}
                        onTerminal={() => startTerm(p)}
                        onAi={() => setAiFor({ machineId: p.machineId, cwd: p.rootPath || '' })}
                        onProcess={async (action) => {
                          try {
                            await runProjectProcess(p.id, action);
                            void qc.invalidateQueries({ queryKey: ['projects'] });
                          } catch (e) {
                            Alert.alert(p.name, processErrorMessage(e, action));
                          }
                        }}
                      />
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </Pad>
      )}
      <NewProjectSheet open={newProject} onClose={() => { setNewProject(false); void qc.invalidateQueries({ queryKey: ['projects'] }); }} />
      <NewAiSheet
        open={!!aiFor}
        defaultMachineId={aiFor?.machineId}
        defaultCwd={aiFor?.cwd}
        onClose={() => setAiFor(null)}
      />
    </Screen>
  );
}

function ProjectCard({
  p, machineOnline, onOpen, onTerminal, onAi, onProcess,
}: {
  p: Project;
  machineOnline: boolean;
  onOpen: () => void;
  onTerminal: () => void;
  onAi: () => void;
  onProcess: (a: 'start' | 'stop' | 'restart') => Promise<void>;
}) {
  const t = useTheme();
  const techs = splitCsv(p.techStack);
  const ports: number[] = [];
  const seenPorts = new Set<number>();
  for (const n of [p.port, ...splitCsv(p.addonPorts).map(Number)]) {
    if (!n || Number.isNaN(n) || seenPorts.has(n)) continue;
    seenPorts.add(n);
    ports.push(n);
  }
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: t.b1, overflow: 'hidden', alignSelf: 'stretch' }}>
      <Pressable onPress={onOpen} style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusDot status={p.isRunning ? 'Up' : 'Down'} />
          <Text style={{ color: t.dim, fontSize: 11 }}>{(p.runner || 'npm').toUpperCase()}</Text>
        </View>
        <Text style={{ color: t.txt, fontSize: 16, fontWeight: '700', marginTop: 6 }} numberOfLines={1}>{p.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {ports.map((port, i) => (
            <Text key={`${port}-${i}`} style={{ color: p.isRunning ? t.accent : t.dim, fontFamily: 'Menlo', fontSize: 13 }}>:{port}</Text>
          ))}
        </View>
        {!!p.description && <Text style={{ color: t.muted, fontSize: 13, marginTop: 6 }} numberOfLines={1}>{p.description}</Text>}
        {techs.length > 0 && (
          <Text style={{ color: t.dim, fontSize: 12, marginTop: 4 }} numberOfLines={1}>{techs.slice(0, 4).join('  ·  ')}</Text>
        )}
      </Pressable>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: t.b1, paddingHorizontal: 4, paddingVertical: 2 }}>
        <IconBtn name="play-outline" disabled={!machineOnline} onPress={() => void onProcess('start')} />
        <IconBtn name="square-outline" disabled={!machineOnline} onPress={() => void onProcess('stop')} />
        <IconBtn name="refresh-outline" disabled={!machineOnline} onPress={() => void onProcess('restart')} />
        <IconBtn name="terminal-outline" disabled={!machineOnline} onPress={onTerminal} />
        <IconBtn name="chatbubbles-outline" disabled={!machineOnline} onPress={onAi} />
      </View>
    </View>
  );
}

function IconBtn({ name, onPress, disabled }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ padding: 10, opacity: disabled ? 0.35 : 1 }}>
      <Ionicons name={name} size={18} color={t.txt} />
    </Pressable>
  );
}
