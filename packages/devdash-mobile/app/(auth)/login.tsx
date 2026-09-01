import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import { useTheme } from '../../src/ui/Theme';
import { ApiError } from '../../src/api/client';
import { DigitCode } from '../../src/ui/DigitCode';
import { IsoScene } from '../../src/ui/IsoBlocks';
import { radius } from '../../src/ui/tokens';

export default function Login() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (code: string) => {
    if (code.length < 4 || !email.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await login(email.trim(), code);
      const pending = useAuth.getState().pending;
      if (pending === '2fa') router.replace('/(auth)/totp');
      else if (pending === 'enroll') setError('Finish 2FA enrollment on the desktop app first, then come back.');
      else if (useAuth.getState().token) router.replace('/(tabs)/sessions');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in');
      setPin('');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, flexGrow: 1 }}
      >
        <IsoScene variant="stack" height={180} />
        <Text style={{ color: t.txt, fontSize: 36, fontWeight: '800', letterSpacing: -1.2, textAlign: 'center' }}>
          Dev<Text style={{ color: t.accent }}>Dash</Text>
        </Text>
        <Text style={{ color: t.muted, textAlign: 'center', marginTop: 6, fontSize: 15 }}>
          Email, then your 4-digit PIN
        </Text>

        <Text style={{ color: t.dim, fontSize: 12, fontWeight: '600', marginTop: 28, marginBottom: 8 }}>EMAIL</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          placeholder="you@example.com"
          placeholderTextColor={t.dim}
          returnKeyType="next"
          style={{
            backgroundColor: t.card, color: t.txt, fontSize: 17, padding: 16,
            borderRadius: radius.md, borderWidth: 1, borderColor: t.b1,
          }}
        />

        <Text style={{ color: t.dim, fontSize: 12, fontWeight: '600', marginTop: 22, marginBottom: 8 }}>PIN</Text>
        <DigitCode
          length={4}
          value={pin}
          onChange={setPin}
          onComplete={(code) => void submit(code)}
          secure
          autoFocus={false}
        />
        <Pressable
          onPress={() => { Keyboard.dismiss(); void submit(pin); }}
          disabled={busy || pin.length < 4 || !email.trim()}
          style={{
            marginTop: 24, backgroundColor: t.cta, borderRadius: radius.md,
            paddingVertical: 16, alignItems: 'center',
            opacity: busy || pin.length < 4 || !email.trim() ? 0.4 : 1,
          }}
        >
          <Text style={{ color: t.ctaFg, fontSize: 16, fontWeight: '700' }}>{busy ? 'Signing in…' : 'Continue'}</Text>
        </Pressable>
        {!!error && <Text style={{ color: t.offline, marginTop: 14, fontSize: 14, textAlign: 'center' }}>{error}</Text>}
        <Text style={{ color: t.dim, fontSize: 13, marginTop: 22, lineHeight: 19, textAlign: 'center' }}>
          Then a 6-digit code from your authenticator. Two steps — this can open a shell on your machines.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
