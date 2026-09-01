import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/auth';
import { Screen, Title, Sub, Row, StatusDot, Pad } from '../../src/ui/primitives';
import { NewAiSheet } from '../../src/ui/NewAiSheet';
import { useTheme } from '../../src/ui/Theme';

export default function Machines() {
  const t = useTheme();
  const router = useRouter();
  const allMachines = useAuth((s) => s.machines);
  const machines = useMemo(() => allMachines.filter((m) => !m.hidden), [allMachines]);
  const machineId = useAuth((s) => s.machineId);
  const switchMachine = useAuth((s) => s.switchMachine);
  const [aiFor, setAiFor] = useState<number | null>(null);

  const startTerm = (id: number, name: string) => {
    router.push(`/terminal/new-${id}?machineId=${id}&cwd=${encodeURIComponent('~')}&title=${encodeURIComponent(name)}`);
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 }}>
        <Title large>Machines</Title>
        <Sub>Start a terminal or AI session on any online box</Sub>
      </View>
      <Pad>
        {machines.map((m) => {
          const online = m.isOnline !== false;
          return (
            <View key={m.id} style={{ gap: 0 }}>
              <Row onPress={() => { if (m.id !== machineId) void switchMachine(m.id); }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }}>{m.name}</Text>
                  <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>
                    {m.id === machineId ? 'Current JWT machine' : 'Tap to switch session machine'}
                  </Text>
                </View>
                <StatusDot status={online ? 'working' : 'off'} />
              </Row>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4, marginBottom: 10 }}>
                <Mini icon="terminal-outline" label="Terminal" disabled={!online} onPress={() => startTerm(m.id, m.name)} />
                <Mini icon="chatbubbles-outline" label="AI session" disabled={!online} onPress={() => setAiFor(m.id)} />
              </View>
            </View>
          );
        })}
      </Pad>
      <NewAiSheet open={aiFor != null} defaultMachineId={aiFor || undefined} onClose={() => setAiFor(null)} />
    </Screen>
  );
}

function Mini({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: t.b1, opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={icon} size={16} color={t.txt} />
      <Text style={{ color: t.txt, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
