import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from './Theme';
import type { Machine } from '../store/auth';

export function MachineFilter({
  machines,
  value,
  counts,
  onChange,
}: {
  machines: (Machine & { isOnline?: boolean })[];
  value: 'all' | number;
  counts?: Record<string, number>;
  onChange: (v: 'all' | number) => void;
}) {
  const t = useTheme();
  const chips: { id: 'all' | number; name: string; online?: boolean }[] = [
    { id: 'all', name: 'All' },
    ...machines.filter((m) => !m.hidden).map((m) => ({ id: m.id, name: m.name, online: m.isOnline })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12, alignItems: 'center' }}
    >
      {chips.map((c) => {
        const on = value === c.id;
        return (
          <Pressable
            key={String(c.id)}
            onPress={() => onChange(c.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: on ? t.accent : t.b1,
              backgroundColor: on ? t.accentWeak : t.card,
            }}
          >
            {c.id !== 'all' && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.online ? t.live : t.offline }} />
            )}
            <Text style={{ color: on ? t.accent : t.muted, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
              {c.name}
            </Text>
            {c.id !== 'all' && counts && (
              <Text style={{ color: t.dim, fontSize: 11 }}>{counts[String(c.id)] ?? 0}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
