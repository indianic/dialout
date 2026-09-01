import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_TERMINAL_TEMPLATE, factsFromSession, renderTerminalName } from '@dialout/shared';
import { api } from '../../src/api/client';
import { type AiRow } from '../../src/api/ai-sessions';
import { useAiSessions } from '../../src/hooks/useAiSessions';
import { useAuth } from '../../src/store/auth';
import { Screen, Title, Sub, Row, StatusDot, Empty, Loader, Pad } from '../../src/ui/primitives';
import { MachineFilter } from '../../src/ui/MachineFilter';
import { Segmented } from '../../src/ui/Segmented';
import { useTheme } from '../../src/ui/Theme';

const CLIENT_LABELS: Record<string, string> = {
  Apple_Terminal: 'Terminal',
  'iTerm.app': 'iTerm2',
  vscode: 'VS Code',
  Hyper: 'Hyper',
  WezTerm: 'WezTerm',
  DevDash: 'DevDash',
  unknown: '—',
};

type Term = {
  id: number;
  machineId: number;
  tmuxName: string;
  origin?: string | null;
  folder?: string | null;
  folderPath?: string | null;
  gitBranch?: string | null;
  termProgram?: string | null;
  createdLocal?: string | null;
  startedAt?: string | null;
  lastActiveAt?: string | null;
  cols?: number | null;
  rows?: number | null;
  isLive?: boolean;
  machineName?: string;
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Terminals() {
  const t = useTheme();
  const router = useRouter();
  const machines = useAuth((s) => s.machines);
  const [filter, setFilter] = useState<'all' | number>('all');
  const [tab, setTab] = useState<'native' | 'ai'>('native');

  const liveQ = useQuery({
    queryKey: ['live-sessions'],
    queryFn: async () => (await api<{ sessions: Term[] }>('/api/live-sessions')).sessions || [],
    refetchInterval: 15_000,
  });
  const aiQ = useAiSessions();

  const byId = new Map(machines.map((m) => [m.id, m]));
  const native = useMemo(() => {
    const all = (liveQ.data || [])
      .filter((s) => s.origin !== 'browser')
      .map((s) => ({ ...s, machineName: byId.get(s.machineId)?.name }));
    const filtered = filter === 'all' ? all : all.filter((s) => s.machineId === filter);
    // ws-server can double-insert the same tmux session (no unique constraint).
    // React also needs a unique key: session.id alone collides when the same
    // row is listed twice, and it is a serial that can equal a well-known port.
    const byKey = new Map<string, Term>();
    for (const s of filtered) {
      const k = `${s.machineId}:${s.tmuxName || ''}`;
      const prev = byKey.get(k);
      if (!prev || (s.id || 0) > (prev.id || 0)) byKey.set(k, s);
    }
    return [...byKey.values()];
  }, [liveQ.data, filter, machines]);

  const ai = useMemo(() => {
    const all = aiQ.data || [];
    if (filter === 'all') return all;
    return all.filter((s) => s.machineId === filter);
  }, [aiQ.data, filter]);

  const loading = tab === 'native' ? liveQ.isPending : aiQ.isPending;

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 }}>
        <Title large>Terminals</Title>
        <Sub>Native shells and AI CLIs — same names as the web app</Sub>
      </View>
      <MachineFilter machines={machines} value={filter} onChange={setFilter} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'native', label: 'Native', count: native.length },
          { id: 'ai', label: 'AI', count: ai.length },
        ]}
      />
      {loading ? <Loader /> : (
        <Pad>
          {tab === 'native' && native.length === 0 && (
            <Empty title="No native terminals" body="tmux sessions from iTerm, Terminal, VS Code. Run setup-cowork on the machine if the list is empty." />
          )}
          {tab === 'native' && native.map((s) => (
            <NativeRow
              key={`${s.machineId}:${s.tmuxName}:${s.id}`}
              s={s}
              template={byId.get(s.machineId)?.terminalNameTemplate}
              onPress={() => router.push(`/terminal/${s.id}?machineId=${s.machineId}&name=${encodeURIComponent(s.tmuxName)}`)}
            />
          ))}
          {tab === 'ai' && ai.length === 0 && (
            <Empty title="No AI terminals" body="Claude, Codex and Grok sessions show here with the same titles as the website (the folder name)." />
          )}
          {tab === 'ai' && ai.map((s) => (
            <AiRowView key={`${s.machineId}-${s.tmuxName}`} s={s} onPress={() => router.push(`/session/${s.machineId}/${encodeURIComponent(s.tmuxName)}`)} />
          ))}
        </Pad>
      )}
    </Screen>
  );
}

function NativeRow({ s, template, onPress }: { s: Term; template?: string | null; onPress: () => void }) {
  const t = useTheme();
  const displayName = renderTerminalName(
    template || DEFAULT_TERMINAL_TEMPLATE,
    factsFromSession({
      machineName: s.machineName || '',
      folder: s.folder || null,
      folderPath: s.folderPath || null,
      createdLocal: s.createdLocal || null,
      startedAt: s.startedAt || null,
      gitBranch: s.gitBranch || null,
      termProgram: s.termProgram || null,
      tmuxName: s.tmuxName,
    }),
    s.tmuxName,
  );
  const client = CLIENT_LABELS[s.termProgram || 'unknown'] || s.termProgram || '';
  const size = s.cols && s.rows ? `${s.cols}×${s.rows}` : '';
  const active = timeAgo(s.lastActiveAt);
  const meta = [s.tmuxName, client, size, active ? `active ${active}` : ''].filter(Boolean).join(' · ');
  return (
    <Row onPress={onPress}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }} numberOfLines={2}>{displayName}</Text>
        {!!s.folderPath && <Text style={{ color: t.accent, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{s.folderPath}</Text>}
        <Text style={{ color: t.dim, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{meta}</Text>
      </View>
      <StatusDot status={s.isLive ? 'Live' : 'Idle'} />
    </Row>
  );
}

function AiRowView({ s, onPress }: { s: AiRow; onPress: () => void }) {
  const t = useTheme();
  const bits = [s.kind, s.folder || s.title, s.gitBranch, s.machineName].filter(Boolean);
  return (
    <Row onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{s.title || s.folder || s.tmuxName}</Text>
        <Text style={{ color: t.dim, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{bits.join(' · ')}</Text>
      </View>
      <StatusDot status={s.status} />
    </Row>
  );
}
