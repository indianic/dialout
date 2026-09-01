import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './Theme';
import { useOnline } from '../hooks/useOnline';
import { mono, radius, sans } from './tokens';

export function Screen({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      {!online && (
        <View style={{ paddingTop: insets.top, backgroundColor: t.waiting, paddingBottom: 6 }}>
          <Text style={{ textAlign: 'center', color: '#14161c', fontSize: 12, fontWeight: '600' }}>
            Offline — lists are last seen, not live
          </Text>
        </View>
      )}
      {children}
    </View>
  );
}

export function KeyboardSafe({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

export function Title({ children, large }: { children: React.ReactNode; large?: boolean }) {
  const t = useTheme();
  const size = large && Platform.OS === 'ios' ? 32 : Platform.OS === 'android' ? 22 : 28;
  return (
    <Text style={{ color: t.txt, fontSize: size, fontWeight: '700', letterSpacing: -0.5, fontFamily: sans }}>
      {children}
    </Text>
  );
}

export function Sub({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.dim, fontSize: 13, marginTop: 3 }}>{children}</Text>;
}

export function Row({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.card,
          borderColor: t.b1,
          borderRadius: radius.md,
          opacity: pressed ? 0.7 : 1,
          ...Platform.select({ android: { elevation: 1 }, ios: { borderWidth: StyleSheet.hairlineWidth } }),
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function StatusDot({ status }: { status: string }) {
  const t = useTheme();
  const color =
    status === 'working' || status === 'Up' || status === 'Live' ? t.live
      : status === 'waiting_input' || status === 'waiting_approval' || status === 'Needs you' ? t.waiting
        : status === 'off' || status === 'offline' || status === 'Down' ? t.offline
          : t.dim;
  const label =
    status === 'waiting_input' || status === 'waiting_approval' ? 'Waiting'
      : status === 'working' ? 'Working'
        : status === 'idle' ? 'Idle'
          : status;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Banner({ warn, children }: { warn?: boolean; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{
      padding: 12, borderRadius: radius.md, backgroundColor: warn ? `${t.waiting}22` : t.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: warn ? t.waiting : t.b1, marginBottom: 8,
    }}>
      <Text style={{ color: t.muted, fontSize: 13.5, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <Text style={{ color: t.txt, fontSize: 18, fontWeight: '600', marginBottom: 6 }}>{title}</Text>
      <Text style={{ color: t.dim, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{body}</Text>
    </View>
  );
}

export function Cta({ label, onPress, ghost }: { label: string; onPress: () => void; ghost?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: ghost ? 'transparent' : t.cta,
        borderRadius: Platform.OS === 'android' ? 20 : 12,
        padding: 14, alignItems: 'center', marginTop: 8,
        borderWidth: ghost ? 1 : 0, borderColor: t.b1,
      }}
    >
      <Text style={{ color: ghost ? t.muted : t.ctaFg, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontFamily: mono, fontSize: 11, color: t.dim }}>{children}</Text>;
}

export function Loader() {
  const t = useTheme();
  return <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />;
}

export function Pad({ children, columns }: { children: React.ReactNode; columns?: boolean }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: 16, paddingBottom: 32, gap: 8, flexGrow: 1,
        ...(columns ? { flexDirection: 'row', flexWrap: 'wrap' } : {}),
      }}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
