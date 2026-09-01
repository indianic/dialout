import { useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IsoScene } from '../src/ui/IsoBlocks';
import { useTheme } from '../src/ui/Theme';
import { usePrefs } from '../src/store/prefs';
import { useAuth } from '../src/store/auth';
import { radius } from '../src/ui/tokens';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    variant: 'stack' as const,
    title: 'Your machines, one room',
    body: 'The agent connects out. No VPN, no open ports. Phone talks to the server; the server already holds the socket.',
  },
  {
    variant: 'sessions' as const,
    title: 'AI sessions as chat',
    body: 'Claude, Codex, Grok — one list across every machine. Reply, launch, skip the vendor apps.',
    preview: [
      { name: 'devdash', meta: 'grok · SKM Office Desktop', status: 'Waiting' },
      { name: 'spintrainer', meta: 'grok · SKM Office Desktop', status: 'Idle' },
      { name: 'integratex', meta: 'claude · main', status: 'Idle' },
    ],
  },
  {
    variant: 'terminal' as const,
    title: 'Real terminals',
    body: 'tmux-backed shells from the laptop, named the same way as the web app. Peek or type from the phone.',
  },
  {
    variant: 'projects' as const,
    title: 'Every project, every machine',
    body: 'Ports, notes, todos, credentials. Start, stop, restart — the live list, not a squeeze of the desktop.',
    preview: [
      { name: 'devdash', meta: ':50051 · running' },
      { name: 'spintrainer', meta: ':3000 · idle' },
      { name: 'integratex', meta: ':8080 · running' },
    ],
  },
];

export default function Intro() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const markIntroSeen = usePrefs((s) => s.markIntroSeen);
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const finish = async () => {
    await markIntroSeen();
    if (useAuth.getState().token) router.replace('/(tabs)/sessions');
    else router.replace('/(auth)/login');
  };

  const next = () => {
    if (page >= SLIDES.length - 1) { void finish(); return; }
    scroller.current?.scrollTo({ x: width * (page + 1), animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== page) setPage(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 8 }}>
        <Pressable onPress={() => void finish()} hitSlop={12}>
          <Text style={{ color: t.accent, fontSize: 16, fontWeight: '600' }}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((s) => (
          <View key={s.title} style={{ width, paddingHorizontal: 24 }}>
            <IsoScene variant={s.variant} height={210} />
            <Text style={{ color: t.txt, fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 8 }}>{s.title}</Text>
            <Text style={{ color: t.muted, fontSize: 16, lineHeight: 22, marginTop: 8 }}>{s.body}</Text>
            {s.preview && (
              <View style={{ marginTop: 18, gap: 8 }}>
                {s.preview.map((row) => (
                  <View key={row.name} style={{ backgroundColor: t.card, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: t.b1 }}>
                    <Text style={{ color: t.txt, fontWeight: '600' }}>{row.name}</Text>
                    <Text style={{ color: t.dim, fontSize: 12, marginTop: 2 }}>{row.meta}{'status' in row ? ` · ${row.status}` : ''}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={{
              width: i === page ? 18 : 6, height: 6, borderRadius: 3,
              backgroundColor: i === page ? t.accent : t.b1,
            }} />
          ))}
        </View>
        <Pressable
          onPress={next}
          style={{ backgroundColor: t.cta, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ color: t.ctaFg, fontSize: 16, fontWeight: '700' }}>
            {page === SLIDES.length - 1 ? 'Get started' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
