import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { useTheme } from '../src/ui/Theme';

export default function NotFound() {
  const t = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Missing', headerShown: true }} />
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: t.txt, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>That screen is not here</Text>
        <Link href="/(tabs)/sessions"><Text style={{ color: t.accent }}>Back to sessions</Text></Link>
      </View>
    </>
  );
}
