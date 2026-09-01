import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { probeServer, verdictMessage } from '../src/api/probe';
import { deriveWsUrl, normalizeApiUrl } from '../src/server-url';
import { useServer } from '../src/store/server';
import { BAKED_API_URL } from '../src/config';
import { useTheme } from '../src/ui/Theme';
import { radius } from '../src/ui/tokens';

export default function ServerScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const storedApi = useServer((s) => s.apiUrl);
  const configured = useServer((s) => s.configured);
  const setServer = useServer((s) => s.setServer);

  const [input, setInput] = useState(configured ? storedApi : BAKED_API_URL);
  const [advanced, setAdvanced] = useState(false);
  const [wsOverride, setWsOverride] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = normalizeApiUrl(input);
  const derivedWs = normalized ? deriveWsUrl(normalized) : '';
  const effectiveWs = wsOverride.trim() || derivedWs;

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!normalized) {
      setError('That does not look like a web address.');
      return;
    }
    setBusy(true);
    try {
      const verdict = await probeServer(normalized);
      if (verdict !== 'ok') {
        setError(verdictMessage(verdict));
        return;
      }
      await setServer(normalized, effectiveWs);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  const field = {
    backgroundColor: t.card, color: t.txt, fontSize: 17, padding: 16,
    borderRadius: radius.md, borderWidth: 1, borderColor: t.b1,
  } as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.bg }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: t.txt, fontSize: 28, fontWeight: '700' }}>Connect to your server</Text>
        <Text style={{ color: t.muted, fontSize: 15, marginTop: 8, lineHeight: 21 }}>
          DevDash is self-hosted. Enter the address of the server you run.
        </Text>

        <Text style={{ color: t.dim, fontSize: 12, fontWeight: '600', marginTop: 28, marginBottom: 8 }}>
          SERVER URL
        </Text>
        <TextInput
          value={input}
          onChangeText={(v) => { setInput(v); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          placeholder="dash.example.com"
          placeholderTextColor={t.dim}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          style={field}
        />

        {!!derivedWs && !advanced && (
          <Text style={{ color: t.dim, fontSize: 12, marginTop: 8 }}>Sockets: {effectiveWs}</Text>
        )}

        <Pressable onPress={() => setAdvanced((v) => !v)} style={{ marginTop: 16 }}>
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>
            {advanced ? '▾ Advanced' : '▸ Advanced'}
          </Text>
        </Pressable>

        {advanced && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: t.dim, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              WEBSOCKET URL
            </Text>
            <TextInput
              value={wsOverride || derivedWs}
              onChangeText={setWsOverride}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="wss://dash.example.com/ws"
              placeholderTextColor={t.dim}
              style={field}
            />
            <Text style={{ color: t.dim, fontSize: 12, marginTop: 8 }}>
              Only change this if your server sets a custom WS_PATH_PREFIX.
            </Text>
          </View>
        )}

        {!!error && (
          <Text style={{ color: t.offline, fontSize: 14, marginTop: 16 }}>{error}</Text>
        )}

        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          style={{
            backgroundColor: t.cta, borderRadius: radius.md, paddingVertical: 16,
            alignItems: 'center', marginTop: 28, opacity: busy ? 0.6 : 1,
          }}
        >
          {busy
            ? <ActivityIndicator color={t.ctaFg} />
            : <Text style={{ color: t.ctaFg, fontSize: 16, fontWeight: '700' }}>Continue</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
