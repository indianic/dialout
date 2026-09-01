import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AiEvent } from '@dialout/shared';
import { api, ApiError } from '../../../src/api/client';
import { useAuth } from '../../../src/store/auth';
import { getSocket } from '../../../src/ws/manager';
import { ChatTranscript } from '../../../src/ui/ChatTranscript';
import { Composer } from '../../../src/ui/Composer';
import { KeyboardSafe, StatusDot } from '../../../src/ui/primitives';
import { useTheme } from '../../../src/ui/Theme';

export default function SessionChat() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { machineId: mid, tmuxName: rawName } = useLocalSearchParams<{ machineId: string; tmuxName: string }>();
  const machineId = parseInt(String(mid), 10);
  const tmuxName = decodeURIComponent(String(rawName || ''));
  const token = useAuth((s) => s.token);
  const machines = useAuth((s) => s.machines);
  const machineName = machines.find((m) => m.id === machineId)?.name || `machine ${machineId}`;
  const [events, setEvents] = useState<AiEvent[]>([]);
  const [status, setStatus] = useState('idle');
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState('');
  const launched = tmuxName.startsWith('launch:');

  useEffect(() => {
    if (!token) return;
    const sock = getSocket(token);
    const unsub = sock.onDashboard((msg) => {
      if (msg.type !== 'ai_session_events') return;
      if (msg.machineId !== machineId || msg.tmuxName !== tmuxName) return;
      setEvents((msg.events as AiEvent[]) || []);
      if (typeof msg.status === 'string') setStatus(msg.status);
      setPending([]);
      setError('');
    });
    const open = () => {
      void api(`/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'open' }),
      }).catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not open this session');
      });
    };
    const unopen = sock.onOpen(open);
    open();
    return () => {
      unsub();
      unopen();
      void api(`/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'close' }),
      }).catch(() => { /* leaving the screen */ });
    };
  }, [token, machineId, tmuxName]);

  const send = (text: string) => {
    setPending((p) => [...p, text]);
    void api(`/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'input', text }),
    }).catch((e) => {
      setError(e instanceof ApiError ? e.message : 'Send failed');
    });
  };

  const remove = () => {
    Alert.alert('Delete this session?', 'Only sessions DevDash launched can be deleted. A terminal session is yours to close.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          void api(`/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}`, { method: 'DELETE' })
            .then(() => router.back())
            .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not delete'));
        },
      },
    ]);
  };

  return (
    <KeyboardSafe>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 6 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.txt, fontSize: 22 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{tmuxName}</Text>
            <Text style={{ color: t.dim, fontSize: 12 }}>{machineName}</Text>
          </View>
          <StatusDot status={status} />
          {launched && (
            <Pressable onPress={remove} style={{ paddingHorizontal: 10, height: 36, justifyContent: 'center' }}>
              <Text style={{ color: t.offline, fontSize: 13 }}>Delete</Text>
            </Pressable>
          )}
        </View>
        {!!error && (
          <Text style={{ color: t.offline, paddingHorizontal: 16, paddingBottom: 8, fontSize: 13 }}>{error}</Text>
        )}
        <ChatTranscript events={events} pending={pending} />
        <Composer
          kind="ai"
          placeholder="Message the agent…"
          machineId={machineId}
          tmuxName={tmuxName}
          onSend={send}
          onSendKeys={(data) => send(data)}
        />
      </View>
    </KeyboardSafe>
  );
}
