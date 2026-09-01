import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/ui/Theme';
import { useAuth } from '../../src/store/auth';

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const token = useAuth((s) => s.token);
  const ready = useAuth((s) => s.ready);
  if (ready && !token) return <Redirect href="/(auth)/login" />;
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.dim,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.b1,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 49 + bottom + 6,
          paddingTop: 6,
          paddingBottom: bottom,
        },
        tabBarLabelStyle: {
          fontSize: Platform.OS === 'ios' ? 10 : 12,
          fontWeight: '500',
        },
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
      <Tabs.Screen name="sessions" options={{ title: 'Sessions', tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={26} color={color} /> }} />
      <Tabs.Screen name="terminals" options={{ title: 'Terminals', tabBarIcon: ({ color }) => <Ionicons name="terminal" size={26} color={color} /> }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects', tabBarIcon: ({ color }) => <Ionicons name="folder" size={26} color={color} /> }} />
      <Tabs.Screen name="machines" options={{ title: 'Machines', tabBarIcon: ({ color }) => <Ionicons name="desktop" size={26} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings" size={26} color={color} /> }} />
    </Tabs>
  );
}
