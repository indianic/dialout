import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { radius } from '../../src/ui/tokens';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import { useTheme } from '../../src/ui/Theme';
import { ApiError } from '../../src/api/client';
import { DigitCode } from '../../src/ui/DigitCode';
import { IsoScene } from '../../src/ui/IsoBlocks';

export default function Totp() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const verify2fa = useAuth((s) => s.verify2fa);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (next: string) => {
    if (next.length < 6 || busy) return;
    setBusy(true); setError('');
    try {
      await verify2fa(next);
      router.replace('/(tabs)/sessions');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Invalid code');
      setCode('');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 12, paddingHorizontal: 24 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <IsoScene variant="sessions" height={150} />
      <Text style={{ color: t.txt, fontSize: 28, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center' }}>Authenticator</Text>
      <Text style={{ color: t.muted, textAlign: 'center', marginTop: 6, marginBottom: 28 }}>6-digit code from your app</Text>
      <DigitCode
        length={6}
        value={code}
        onChange={setCode}
        onComplete={(c) => void submit(c)}
        autoFocus
      />
      <Pressable
        onPress={() => { Keyboard.dismiss(); void submit(code); }}
        disabled={busy || code.length < 6}
        style={{
          marginTop: 24, backgroundColor: t.cta, borderRadius: radius.md,
          paddingVertical: 16, alignItems: 'center',
          opacity: busy || code.length < 6 ? 0.4 : 1,
        }}
      >
        <Text style={{ color: t.ctaFg, fontSize: 16, fontWeight: '700' }}>{busy ? 'Checking…' : 'Verify'}</Text>
      </Pressable>
      {!!error && <Text style={{ color: t.offline, marginTop: 16, textAlign: 'center' }}>{error}</Text>}
      <View style={{ flex: 1 }} />
    </KeyboardAvoidingView>
  );
}
