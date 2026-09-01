import { Pressable, Text, View } from 'react-native';
import { useTheme } from './Theme';
import { radius } from './tokens';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count?: number }[];
}) {
  const t = useTheme();
  return (
    <View style={{
      flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, padding: 3,
      backgroundColor: t.bgSub, borderRadius: radius.pill,
    }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center',
              backgroundColor: on ? t.card : 'transparent',
            }}
          >
            <Text style={{ color: on ? t.txt : t.muted, fontWeight: '600', fontSize: 14 }}>
              {o.label}{typeof o.count === 'number' ? `  ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
