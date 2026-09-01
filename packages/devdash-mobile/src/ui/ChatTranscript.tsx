import React, { useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { groupEvents, shouldFollow, toolAppearance, type AiEvent } from '@dialout/shared';
import { useTheme } from './Theme';
import { mono } from './tokens';

export function ChatTranscript({ events, pending }: { events: AiEvent[]; pending?: string[] }) {
  const t = useTheme();
  const ref = useRef<ScrollView>(null);
  const [pinned, setPinned] = useState(true);
  const blocks = groupEvents(events);

  useEffect(() => {
    if (pinned) ref.current?.scrollToEnd({ animated: true });
  }, [events, pending, pinned]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setPinned(shouldFollow(contentOffset.y, contentSize.height, layoutMeasurement.height));
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={ref} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        {blocks.map((b) => {
          if (b.kind === 'user') {
            return (
              <View key={b.key} style={{ alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: t.accent, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 9 }}>
                <Text style={{ color: '#fff', fontSize: 15.5, lineHeight: 22 }}>{b.text}</Text>
              </View>
            );
          }
          if (b.kind === 'assistant') {
            return <Markdown key={b.key} text={b.text} />;
          }
          if (b.kind === 'thinking') {
            return <Text key={b.key} style={{ color: t.dim, fontSize: 13, fontStyle: 'italic' }}>{b.text || 'thinking…'}</Text>;
          }
          if (b.kind === 'status') {
            return <Text key={b.key} style={{ color: t.dim, fontSize: 11, textAlign: 'center' }}>{b.status === 'waiting_input' || b.status === 'waiting_approval' ? 'waiting · your turn' : b.status}</Text>;
          }
          if (b.kind === 'tools') {
            return (
              <View key={b.key} style={{ gap: 8 }}>
                <Text style={{ color: t.dim, fontSize: 11, fontWeight: '600' }}>did {b.items.length} thing{b.items.length === 1 ? '' : 's'}</Text>
                {b.items.map((item) => {
                  const a = toolAppearance(item.name, item.ok !== false);
                  return (
                    <View key={item.id} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: t.accentWeak, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: t.accent, fontSize: 11 }}>{a.glyph}</Text>
                        </View>
                        <Text style={{ color: t.txt, fontWeight: '600', fontSize: 13 }}>{item.name}</Text>
                        <Text style={{ color: item.ok === false ? t.offline : t.dim, fontFamily: mono, fontSize: 11.5, flex: 1 }} numberOfLines={1}>{item.summary}</Text>
                      </View>
                      {item.ok === false && item.resultPreview ? (
                        <Text style={{ color: t.offline, fontFamily: mono, fontSize: 11 }}>{item.resultPreview}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          }
          return null;
        })}
        {(pending || []).map((p, i) => (
          <View key={`p-${i}`} style={{ alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: t.accent, opacity: 0.7, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 }}>
            <Text style={{ color: '#fff', fontSize: 15.5 }}>{p}</Text>
          </View>
        ))}
      </ScrollView>
      {!pinned && (
        <Pressable
          onPress={() => { setPinned(true); ref.current?.scrollToEnd({ animated: true }); }}
          style={{ position: 'absolute', alignSelf: 'center', bottom: 12, backgroundColor: t.cta, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}
        >
          <Text style={{ color: t.ctaFg, fontSize: 12.5, fontWeight: '600' }}>Jump to latest</Text>
        </Pressable>
      )}
    </View>
  );
}

function Markdown({ text }: { text: string }) {
  const t = useTheme();
  const parts = splitFence(text);
  return (
    <View style={{ maxWidth: '92%', gap: 6 }}>
      {parts.map((p, i) => {
        if (p.code) {
          return <Text key={i} style={{ fontFamily: mono, fontSize: 12, color: t.txt, backgroundColor: t.bgSub, padding: 10, borderRadius: 8 }}>{p.body}</Text>;
        }
        return p.body.split('\n').map((line, j) => {
          if (line.startsWith('### ')) return <Text key={`${i}-${j}`} style={{ color: t.txt, fontSize: 16, fontWeight: '700' }}>{line.slice(4)}</Text>;
          if (line.startsWith('## ') || line.startsWith('# ')) return <Text key={`${i}-${j}`} style={{ color: t.txt, fontSize: 16, fontWeight: '700' }}>{line.replace(/^#+\s/, '')}</Text>;
          if (line.startsWith('- ')) return <Text key={`${i}-${j}`} style={{ color: t.txt, fontSize: 15.5, lineHeight: 22 }}>  • {inline(line.slice(2), t.txt)}</Text>;
          if (!line.trim()) return <View key={`${i}-${j}`} style={{ height: 4 }} />;
          return <Text key={`${i}-${j}`} style={{ color: t.txt, fontSize: 15.5, lineHeight: 22 }}>{inline(line, t.txt)}</Text>;
        });
      })}
    </View>
  );
}

function splitFence(text: string): { code: boolean; body: string }[] {
  const out: { code: boolean; body: string }[] = [];
  const bits = text.split(/```/);
  bits.forEach((b, i) => {
    if (!b) return;
    if (i % 2 === 1) out.push({ code: true, body: b.replace(/^\w+\n/, '') });
    else out.push({ code: false, body: b });
  });
  return out.length ? out : [{ code: false, body: text }];
}

function inline(s: string, color: string) {
  const bits = s.split(/(`[^`]+`)/g);
  return bits.map((b, i) => {
    if (b.startsWith('`') && b.endsWith('`')) {
      return <Text key={i} style={{ fontFamily: mono, fontSize: 13, color }}>{b.slice(1, -1)}</Text>;
    }
    const bold = b.replace(/\*\*(.*?)\*\*/g, '$1');
    return <Text key={i} style={{ color }}>{bold}</Text>;
  });
}
