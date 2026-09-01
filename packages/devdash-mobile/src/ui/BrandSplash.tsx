import { ActivityIndicator, Text, View } from 'react-native';
import { IsoScene } from './IsoBlocks';
import { useTheme } from './Theme';

export function BrandSplash({ label = 'Loading DevDash' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.termBg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <IsoScene variant="stack" height={200} />
      <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: 8 }}>
        Dev<Text style={{ color: '#5b9cf8' }}>Dash</Text>
      </Text>
      <Text style={{ color: 'rgba(214,218,227,0.7)', marginTop: 6, fontSize: 14 }}>{label}</Text>
      <ActivityIndicator color="#5b9cf8" style={{ marginTop: 24 }} />
    </View>
  );
}
