import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { processErrorMessage, runProjectProcess } from '../../src/api/process';
import { KeyboardSafe, StatusDot } from '../../src/ui/primitives';
import { NewAiSheet } from '../../src/ui/NewAiSheet';
import { useTheme } from '../../src/ui/Theme';
import { radius } from '../../src/ui/tokens';

type Tab = 'overview' | 'notes' | 'todos' | 'creds' | 'cmds';

export default function ProjectDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [secret, setSecret] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [todo, setTodo] = useState('');
  const [err, setErr] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const q = useQuery({ queryKey: ['project', id], queryFn: () => api<Record<string, unknown>>(`/api/projects/${id}`) });
  const notes = useQuery({
    queryKey: ['notes', id],
    queryFn: () => api<Array<{ id: number; title: string; content: string }>>(`/api/notes?projectId=${id}`),
    enabled: tab === 'notes',
  });
  const todos = useQuery({
    queryKey: ['todos', id],
    queryFn: () => api<Array<{ id: number; text: string; isDone?: boolean; priority?: string }>>(`/api/todos?projectId=${id}`),
    enabled: tab === 'todos',
  });
  const creds = useQuery({
    queryKey: ['creds', id],
    queryFn: () => api<Array<{ id: number; label: string; environment: string; username?: string; hasSecret?: boolean }>>(`/api/projects/${id}/credentials`),
    enabled: tab === 'creds',
  });
  const cmds = useQuery({
    queryKey: ['cmds', id],
    queryFn: () => api<Array<{ id: number; label: string; command: string }>>(`/api/projects/${id}/commands`),
    enabled: tab === 'cmds',
  });
  const p = q.data;

  const act = async (action: 'start' | 'stop' | 'restart') => {
    setErr('');
    try {
      await runProjectProcess(Number(id), action);
      void qc.invalidateQueries({ queryKey: ['project', id] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    } catch (e) {
      setErr(processErrorMessage(e, action));
    }
  };

  const reveal = async (credId: number) => {
    if (Platform.OS !== 'web') {
      const bio = await LocalAuthentication.authenticateAsync({ promptMessage: 'Reveal credential' });
      if (!bio.success) return;
    }
    const data = await api<{ secret: string }>(`/api/projects/${id}/credentials/${credId}/reveal`, { method: 'POST' });
    setSecret((s) => ({ ...s, [credId]: data.secret }));
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await api('/api/notes', { method: 'POST', body: JSON.stringify({ projectId: Number(id), content: note.trim() }) });
    setNote('');
    void qc.invalidateQueries({ queryKey: ['notes', id] });
  };

  const addTodo = async () => {
    if (!todo.trim()) return;
    await api('/api/todos', { method: 'POST', body: JSON.stringify({ projectId: Number(id), text: todo.trim() }) });
    setTodo('');
    void qc.invalidateQueries({ queryKey: ['todos', id] });
  };

  const toggleTodo = async (row: { id: number; isDone?: boolean }) => {
    await api(`/api/todos/${row.id}`, { method: 'PUT', body: JSON.stringify({ isDone: !row.isDone }) });
    void qc.invalidateQueries({ queryKey: ['todos', id] });
  };

  return (
    <KeyboardSafe>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.txt, fontSize: 22 }}>‹</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: t.txt, fontSize: 28, fontWeight: '700', flex: 1 }}>{String(p?.name || '…')}</Text>
            <StatusDot status={p?.isRunning ? 'Up' : 'Down'} />
          </View>
          <Text style={{ color: t.dim, fontSize: 12, marginTop: 4 }}>{String(p?.rootPath || '')} · {String(p?.techStack || '')}</Text>
          {!!err && <Text style={{ color: t.offline, marginTop: 8 }}>{err}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Mini label="Stop" onPress={() => void act('stop')} />
            <Mini label="Restart" onPress={() => void act('restart')} />
            <Mini label="Start" onPress={() => void act('start')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Mini label="Terminal" onPress={() => {
              const mid = Number(p?.machineId);
              router.push(`/terminal/new-${id}?machineId=${mid}&cwd=${encodeURIComponent(String(p?.rootPath || '~'))}&title=${encodeURIComponent(String(p?.name || 'project'))}`);
            }} />
            <Mini label="AI session" onPress={() => setAiOpen(true)} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ gap: 6 }}>
            {(['overview', 'notes', 'todos', 'creds', 'cmds'] as Tab[]).map((k) => (
              <Pressable key={k} onPress={() => setTab(k)} style={{
                paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
                borderColor: tab === k ? t.accent : t.b1, backgroundColor: tab === k ? t.accentWeak : 'transparent',
              }}>
                <Text style={{ color: tab === k ? t.accent : t.muted, fontSize: 13 }}>
                  {k === 'creds' ? 'Credentials' : k === 'cmds' ? 'Commands' : k[0].toUpperCase() + k.slice(1)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}>
          {tab === 'overview' && p && (
            <View style={{ backgroundColor: t.card, borderRadius: radius.md, overflow: 'hidden' }}>
              {([['Port', p.port], ['Folder', p.rootPath], ['Stack', p.techStack], ['Runner', p.runner]] as const).map(([k, v]) => (
                <View key={String(k)} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderColor: t.b1 }}>
                  <Text style={{ color: t.muted }}>{k}</Text>
                  <Text style={{ color: t.txt, flex: 1, textAlign: 'right' }}>{String(v || '—')}</Text>
                </View>
              ))}
            </View>
          )}
          {tab === 'notes' && (
            <>
              <Field value={note} onChange={setNote} placeholder="A note…" onSubmit={() => void addNote()} />
              {(notes.data || []).length === 0 && <Text style={{ color: t.dim }}>No notes yet.</Text>}
              {(notes.data || []).map((n) => (
                <View key={n.id} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 12 }}>
                  {!!n.title && <Text style={{ color: t.txt, fontWeight: '600', marginBottom: 4 }}>{n.title}</Text>}
                  <Text style={{ color: t.txt }}>{n.content}</Text>
                </View>
              ))}
            </>
          )}
          {tab === 'todos' && (
            <>
              <Field value={todo} onChange={setTodo} placeholder="A todo…" onSubmit={() => void addTodo()} />
              {(todos.data || []).length === 0 && <Text style={{ color: t.dim }}>No todos yet.</Text>}
              {(todos.data || []).map((n) => (
                <Pressable key={n.id} onPress={() => void toggleTodo(n)} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{
                    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
                    borderColor: n.isDone ? t.live : t.b1, backgroundColor: n.isDone ? t.live : 'transparent',
                  }} />
                  <Text style={{ color: n.isDone ? t.dim : t.txt, textDecorationLine: n.isDone ? 'line-through' : 'none', flex: 1 }}>{n.text}</Text>
                </Pressable>
              ))}
            </>
          )}
          {tab === 'creds' && (
            <>
              {(creds.data || []).length === 0 && <Text style={{ color: t.dim }}>No credentials stored.</Text>}
              {(creds.data || []).map((c) => (
                <View key={c.id} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 12 }}>
                  <Text style={{ color: t.txt }}>{c.label} · {c.environment}</Text>
                  <Text style={{ color: t.dim, marginTop: 4 }}>{c.username || ''}</Text>
                  {c.hasSecret !== false && (
                    <Pressable onPress={() => void reveal(c.id)} style={{ marginTop: 8 }}>
                      <Text style={{ color: t.accent, fontFamily: 'Menlo' }}>{secret[c.id] || 'Reveal with Face ID / biometrics'}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </>
          )}
          {tab === 'cmds' && (
            <>
              {p?.startCommand ? <Cmd label="Start" value={String(p.startCommand)} /> : null}
              {p?.stopCommand ? <Cmd label="Stop" value={String(p.stopCommand)} /> : null}
              {p?.restartCommand ? <Cmd label="Restart" value={String(p.restartCommand)} /> : null}
              {(cmds.data || []).map((c) => <Cmd key={c.id} label={c.label} value={c.command} />)}
              {!p?.startCommand && !p?.stopCommand && !p?.restartCommand && (cmds.data || []).length === 0 && (
                <Text style={{ color: t.dim }}>No saved commands</Text>
              )}
            </>
          )}
        </ScrollView>
      </View>
      <NewAiSheet
        open={aiOpen}
        defaultMachineId={Number(p?.machineId) || undefined}
        defaultCwd={String(p?.rootPath || '')}
        onClose={() => setAiOpen(false)}
      />
    </KeyboardSafe>
  );
}

function Field({ value, onChange, placeholder, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; onSubmit: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.dim}
        onSubmitEditing={onSubmit}
        style={{ flex: 1, backgroundColor: t.card, color: t.txt, borderRadius: radius.sm, padding: 12, fontSize: 16 }}
      />
      <Pressable onPress={onSubmit} style={{ backgroundColor: t.cta, borderRadius: radius.sm, paddingHorizontal: 14, justifyContent: 'center' }}>
        <Text style={{ color: t.ctaFg, fontWeight: '600' }}>Add</Text>
      </Pressable>
    </View>
  );
}

function Cmd({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 12 }}>
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: t.txt, fontFamily: 'Menlo', fontSize: 12 }}>{value}</Text>
    </View>
  );
}

function Mini({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: t.b1, alignItems: 'center' }}>
      <Text style={{ color: t.txt, fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
