import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { useTheme } from './Theme';
import { Cta } from './primitives';
import { radius } from './tokens';

export function NewProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const allMachines = useAuth((s) => s.machines);
  const machines = useMemo(() => allMachines.filter((m) => !m.hidden), [allMachines]);
  const [machineId, setMachineId] = useState<number | undefined>();
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [techStack, setTechStack] = useState('');
  const [startCommand, setStartCommand] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setMachineId(machines.find((m) => m.isOnline)?.id || machines[0]?.id);
    setName(''); setPort(''); setRootPath(''); setTechStack(''); setStartCommand(''); setError('');
  }, [open]);

  const save = async () => {
    if (!name.trim() || !machineId) return;
    setBusy(true); setError('');
    try {
      const created = await api<{ id: number }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          machineId,
          name: name.trim(),
          port: port ? parseInt(port, 10) : null,
          rootPath: rootPath.trim(),
          techStack: techStack.trim(),
          startCommand: startCommand.trim(),
        }),
      });
      onClose();
      router.push(`/project/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create');
    } finally { setBusy(false); }
  };

  if (!open) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 16, maxHeight: '90%' }} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{ color: t.txt, fontSize: 20, fontWeight: '700', marginBottom: 12 }}>New project</Text>
            <Text style={{ color: t.muted, fontSize: 12, marginBottom: 8 }}>Machine</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {machines.map((m) => (
                <Pressable key={m.id} onPress={() => setMachineId(m.id)} style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
                  borderColor: machineId === m.id ? t.accent : t.b1,
                  backgroundColor: machineId === m.id ? t.accentWeak : 'transparent',
                }}>
                  <Text style={{ color: machineId === m.id ? t.accent : t.muted, fontSize: 13 }}>{m.name}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Name" value={name} onChange={setName} />
            <Field label="Folder" value={rootPath} onChange={setRootPath} />
            <Field label="Port" value={port} onChange={setPort} keyboard="number-pad" />
            <Field label="Stack" value={techStack} onChange={setTechStack} />
            <Field label="Start command" value={startCommand} onChange={setStartCommand} />
            {!!error && <Text style={{ color: t.offline }}>{error}</Text>}
            <Cta label={busy ? 'Saving…' : 'Create project'} onPress={() => void save()} />
            <Cta ghost label="Cancel" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, onChange, keyboard }: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'number-pad' }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} autoCapitalize="none" keyboardType={keyboard} style={{
        backgroundColor: t.bgSub, color: t.txt, borderRadius: 10, padding: 11, fontSize: 16,
      }} />
    </View>
  );
}
