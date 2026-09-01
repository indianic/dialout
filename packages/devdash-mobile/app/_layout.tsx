import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/ui/Theme';
import { useAuth } from '../src/store/auth';
import { usePrefs } from '../src/store/prefs';
import { useServer } from '../src/store/server';
import { useDashboard } from '../src/hooks/useDashboard';
import { hrefFromUrl } from '../src/linking';

void SplashScreen.preventAutoHideAsync();

const qc = new QueryClient();

export default function Root() {
  const hydrateAuth = useAuth((s) => s.hydrate);
  const hydratePrefs = usePrefs((s) => s.hydrate);
  const hydrateServer = useServer((s) => s.hydrate);
  // Server first, and not in parallel. auth.hydrate() calls /api/me and wipes
  // the stored token when that request fails, so hydrating it before a URL
  // exists would sign the user out of a build that simply has none baked in.
  useEffect(() => {
    void hydrateServer().then(() => { void hydrateAuth(); });
    void hydratePrefs();
  }, [hydrateAuth, hydratePrefs, hydrateServer]);

  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootNav />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function RootNav() {
  const t = useTheme();
  const theme = usePrefs((s) => s.resolved());
  const authReady = useAuth((s) => s.ready);
  const prefsReady = usePrefs((s) => s.ready);
  const serverReady = useServer((s) => s.ready);
  useDashboard();
  useAuthGate();

  useEffect(() => {
    if (authReady && prefsReady && serverReady) void SplashScreen.hideAsync();
  }, [authReady, prefsReady, serverReady]);

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }} />
    </>
  );
}

function useAuthGate() {
  const ready = useAuth((s) => s.ready);
  const token = useAuth((s) => s.token);
  const pending = useAuth((s) => s.pending);
  const segments = useSegments();
  const router = useRouter();
  const held = useRef<string | null>(null);

  useEffect(() => {
    const apply = (url: string) => {
      const href = hrefFromUrl(url);
      if (!href) return;
      if (useAuth.getState().token) router.push(href as never);
      else held.current = href;
    };
    void Linking.getInitialURL().then((url) => { if (url) apply(url); });
    const sub = Linking.addEventListener('url', (e) => apply(e.url));
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    const root = segments[0];
    const inAuth = root === '(auth)';
    const inIntro = root === 'intro';
    const inServer = root === 'server';
    const introSeen = usePrefs.getState().introSeen;
    const configured = useServer.getState().configured;
    if (!token && pending === '2fa') {
      if (root !== '(auth)') router.replace('/(auth)/totp');
      return;
    }
    if (!token && !inAuth && !inIntro && !inServer) {
      if (!introSeen) router.replace('/intro');
      else router.replace(configured ? '/(auth)/login' : '/server');
      return;
    }
    if (token && inAuth) {
      const next = held.current;
      held.current = null;
      router.replace((next || '/(tabs)/sessions') as never);
    }
    if (token && held.current) {
      const next = held.current;
      held.current = null;
      router.push(next as never);
    }
  }, [ready, token, pending, segments, router]);
}
