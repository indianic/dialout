import { Redirect } from 'expo-router';
import { useAuth } from '../src/store/auth';
import { usePrefs } from '../src/store/prefs';
import { useServer } from '../src/store/server';
import { BrandSplash } from '../src/ui/BrandSplash';

export default function Index() {
  const authReady = useAuth((s) => s.ready);
  const token = useAuth((s) => s.token);
  const pending = useAuth((s) => s.pending);
  const prefsReady = usePrefs((s) => s.ready);
  const introSeen = usePrefs((s) => s.introSeen);
  const serverReady = useServer((s) => s.ready);
  const configured = useServer((s) => s.configured);

  if (!authReady || !prefsReady || !serverReady) return <BrandSplash />;
  if (!introSeen) return <Redirect href="/intro" />;
  if (!configured) return <Redirect href="/server" />;
  if (pending === '2fa') return <Redirect href="/(auth)/totp" />;
  if (token) return <Redirect href="/(tabs)/sessions" />;
  return <Redirect href="/(auth)/login" />;
}
