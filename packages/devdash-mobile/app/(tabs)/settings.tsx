import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, Title, Sub, Row, StatusDot, Pad, Cta } from '../../src/ui/primitives';
import { useServer } from '../../src/store/server';
import { resetSocket } from '../../src/ws/manager';
import { useAuth } from '../../src/store/auth';
import { usePrefs, type ThemePref } from '../../src/store/prefs';
import { useTheme } from '../../src/ui/Theme';
import { registerPush } from '../../src/push';
import { getApiUrl, APP_VARIANT } from '../../src/config';

export default function Settings() {
  const t = useTheme();
  const user = useAuth((s) => s.user);
  const machines = useAuth((s) => s.machines);
  const machineId = useAuth((s) => s.machineId);
  const logout = useAuth((s) => s.logout);
  const switchMachine = useAuth((s) => s.switchMachine);
  const themePref = usePrefs((s) => s.themePref);
  const setThemePref = usePrefs((s) => s.setThemePref);
  const [pushMsg, setPushMsg] = useState('');
  const router = useRouter();
  const qc = useQueryClient();
  const clearServer = useServer((s) => s.clearServer);

  const changeServer = () => {
    Alert.alert(
      'Change server',
      'This signs you out. Your session belongs to the current server and cannot be carried across.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change server',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              // Order matters. Clearing the URL first would leave a live socket
              // pointed at a server the app no longer admits to knowing.
              resetSocket();
              qc.clear();
              await logout();
              await clearServer();
              router.replace('/server');
            })();
          },
        },
      ],
    );
  };

  const cycleTheme = () => {
    const order: ThemePref[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(themePref) + 1) % order.length];
    void setThemePref(next);
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 }}>
        <Title large>Settings</Title>
        <Sub>{user?.email}</Sub>
      </View>
      <Pad>
        <Text style={{ color: t.dim, fontSize: 11, fontWeight: '700' }}>ALERTS</Text>
        <Row onPress={async () => {
          const r = await registerPush();
          setPushMsg(r.reason || (r.ok ? 'On' : 'Off'));
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }}>When an agent needs me</Text>
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>
              Only working → waiting. Never mid-task.{pushMsg ? ` ${pushMsg}` : ' Firebase credentials are not configured yet.'}
            </Text>
          </View>
        </Row>
        <Text style={{ color: t.dim, fontSize: 11, fontWeight: '700', marginTop: 12 }}>MACHINES</Text>
        {machines.map((m) => (
          <Row key={m.id} onPress={() => { if (m.id !== machineId) void switchMachine(m.id); }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }}>{m.name}</Text>
              <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>
                {m.id === machineId ? 'Current session machine' : 'Tap to switch'}
              </Text>
            </View>
            <StatusDot status={m.isOnline ? 'working' : 'off'} />
          </Row>
        ))}
        <Text style={{ color: t.dim, fontSize: 11, fontWeight: '700', marginTop: 12 }}>APPEARANCE</Text>
        <Row onPress={cycleTheme}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }}>Theme</Text>
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>System, light, or dark</Text>
          </View>
          <Text style={{ color: t.accent, fontWeight: '600' }}>{themePref}</Text>
        </Row>
        <Text style={{ color: t.dim, fontSize: 11, fontWeight: '700', marginTop: 12 }}>SERVER</Text>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }}>
              {APP_VARIANT === 'development' ? 'Dev client' : 'Live build'}
            </Text>
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>
              {APP_VARIANT === 'development'
                ? 'JS from Metro on this Mac. API is still production.'
                : 'Standalone. No Metro. API is production.'}
            </Text>
          </View>
        </Row>
        <Row onPress={changeServer}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.txt, fontSize: 16, fontWeight: '600' }}>Server</Text>
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 3 }}>{getApiUrl()}</Text>
          </View>
          <Text style={{ color: t.accent, fontSize: 14, fontWeight: '600' }}>Change</Text>
        </Row>
        <Cta ghost label="Sign out" onPress={() => void logout()} />
      </Pad>
    </Screen>
  );
}
