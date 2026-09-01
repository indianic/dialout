import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AI_SESSIONS_KEY } from '../../src/api/ai-sessions';
import { useAiSessions } from '../../src/hooks/useAiSessions';
import { useAuth } from '../../src/store/auth';
import { Screen, Title, Sub, Row, StatusDot, Empty, Loader, Pad } from '../../src/ui/primitives';
import { MachineFilter } from '../../src/ui/MachineFilter';
import { NewAiSheet } from '../../src/ui/NewAiSheet';
import { useTheme } from '../../src/ui/Theme';

export default function Sessions() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const machines = useAuth((s) => s.machines);
  const [filter, setFilter] = useState<'all' | number>('all');
  const [sheet, setSheet] = useState(false);
  const q = useAiSessions();

  const sessions = useMemo(() => {
    const all = q.data || [];
    if (filter === 'all') return all;
    return all.filter((s) => s.machineId === filter);
  }, [q.data, filter]);

  const counts: Record<string, number> = {};
  for (const s of q.data || []) {
    counts[String(s.machineId)] = (counts[String(s.machineId)] || 0) + 1;
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Title large>AI Sessions</Title>
          <Sub>{sessions.length} agent CLIs · Claude, Codex, Grok</Sub>
        </View>
        <Pressable onPress={() => setSheet(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.cta, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={22} color={t.ctaFg} />
        </Pressable>
      </View>
      <MachineFilter machines={machines} value={filter} counts={counts} onChange={setFilter} />
      {q.isPending ? <Loader /> : (
        <Pad>
          {sessions.length === 0 && (
            <Empty
              title="No AI sessions"
              body="These are Claude / Codex / Grok chats — not the shells on Terminals. Start one with +, or open claude in a tmux terminal on the machine."
            />
          )}
          {sessions.map((s) => {
            const bits = [s.kind, s.folder || s.title, s.gitBranch, s.machineName].filter(Boolean);
            return (
              <Row key={`${s.machineId}-${s.tmuxName}`} onPress={() => router.push(`/session/${s.machineId}/${encodeURIComponent(s.tmuxName)}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{s.title || s.folder || s.tmuxName}</Text>
                  <Text style={{ color: t.dim, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{bits.join(' · ')}</Text>
                </View>
                <StatusDot status={s.status} />
              </Row>
            );
          })}
        </Pad>
      )}
      <NewAiSheet open={sheet} onClose={() => { setSheet(false); void qc.invalidateQueries({ queryKey: AI_SESSIONS_KEY }); }} />
    </Screen>
  );
}
