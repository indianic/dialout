import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PERMISSION_MODES, type PermissionMode } from '@dialout/shared';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { useTheme } from './Theme';
import { Cta } from './primitives';
import { radius } from './tokens';

const MODE_COPY: Record<PermissionMode, { label: string; hint: string }> = {
  plan: { label: 'Plan only', hint: 'Reads and plans. Changes nothing.' },
  default: { label: 'Normal', hint: 'Asks in the chat before risky steps — you answer y.' },
  acceptEdits: { label: 'Auto-edit', hint: 'Edits files without asking. Still asks before commands.' },
  dontAsk: { label: "Don't ask", hint: 'Runs without stopping. For work you can throw away.' },
};

export function NewAiSheet({
  open, onClose, defaultMachineId, defaultCwd,
}: {
  open: boolean;
  onClose: () => void;
  defaultMachineId?: number;
  defaultCwd?: string;
}) {
  const t = useTheme();
  const allMachines = useAuth((s) => s.machines);
  const machines = useMemo(() => allMachines.filter((m) => !m.hidden), [allMachines]);
  const [machineId, setMachineId] = useState<number | undefined>(defaultMachineId);
  const [cwd, setCwd] = useState(defaultCwd || '');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<PermissionMode>('plan');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setMachineId(defaultMachineId || machines.find((m) => m.isOnline)?.id || machines[0]?.id);
    setCwd(defaultCwd || '');
    setPrompt('');
    setError('');
  }, [open, defaultMachineId, defaultCwd]);

  const start = async () => {
    if (!cwd.trim() || !prompt.trim() || !machineId) return;
    setBusy(true); setError('');
    try {
      const data = await api<{ id: string }>('/api/ai-sessions', {
        method: 'POST',
        body: JSON.stringify({ machineId, cwd: cwd.trim(), prompt: prompt.trim(), permissionMode: mode }),
      });
      onClose();
      router.push(`/session/${machineId}/${encodeURIComponent(data.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start');
    } finally { setBusy(false); }
  };

  if (!open) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 16, maxHeight: '88%' }} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{ color: t.txt, fontSize: 20, fontWeight: '700', marginBottom: 12 }}>New AI session</Text>
            <Text style={{ color: t.muted, fontSize: 12, marginBottom: 8 }}>Machine</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {machines.map((m) => (
                <Pressable key={m.id} onPress={() => setMachineId(m.id)} style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
                  borderColor: machineId === m.id ? t.accent : t.b1,
                  backgroundColor: machineId === m.id ? t.accentWeak : 'transparent',
                  opacity: m.isOnline === false ? 0.45 : 1,
                }}>
                  <Text style={{ color: machineId === m.id ? t.accent : t.muted, fontSize: 13 }}>{m.name}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Folder on this machine" value={cwd} onChange={setCwd} />
            <Field label="What should it do?" value={prompt} onChange={setPrompt} />
            <Text style={{ color: t.muted, fontSize: 12, marginBottom: 8 }}>How much should it be allowed to do?</Text>
            {PERMISSION_MODES.map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={{
                flexDirection: 'row', gap: 10, padding: 11, borderRadius: 12, borderWidth: 1,
                borderColor: mode === m ? t.accent : t.b1, backgroundColor: mode === m ? t.accentWeak : 'transparent', marginBottom: 7,
              }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: mode === m ? t.accent : t.b1, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.txt, fontWeight: '600' }}>{MODE_COPY[m].label}</Text>
                  <Text style={{ color: t.dim, fontSize: 12.5 }}>{MODE_COPY[m].hint}</Text>
                </View>
              </Pressable>
            ))}
            <Text style={{ color: t.dim, fontSize: 12.5, marginVertical: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: t.b1 }}>
              This choice lasts the whole session. Per-step Allow/Deny is impossible from the phone.
            </Text>
            {!!error && <Text style={{ color: t.offline }}>{error}</Text>}
            <Cta label={busy ? 'Starting…' : 'Start session'} onPress={() => void start()} />
            <Cta ghost label="Cancel" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} autoCapitalize="none" style={{
        backgroundColor: t.bgSub, color: t.txt, borderRadius: 10, padding: 11, fontSize: 16,
      }} />
    </View>
  );
}
