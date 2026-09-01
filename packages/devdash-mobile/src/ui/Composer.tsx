import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  commandQuery, rankCommands,
  type AiCommand, type AiCapabilities, type McpServerInfo,
} from '@dialout/shared';
import { api } from '../api/client';
import { usePrefs } from '../store/prefs';
import { useTheme } from './Theme';
import { radius } from './tokens';

const AI_KEYS = ['y', 'n', 'esc', '^C', 'tab', '↑', '↓'];
const TERM_KEYS = ['esc', 'tab', '^C', '^D', '↑', '↓', '|', '~'];
const KEY_BYTES: Record<string, string> = {
  esc: '\x1b', '^C': '\x03', '^D': '\x04', '^Z': '\x1a',
  tab: '\t', '↑': '\x1b[A', '↓': '\x1b[B', '←': '\x1b[D', '→': '\x1b[C',
};

type SavedCmd = { label: string; command: string; project?: string };

export function Composer({
  kind, placeholder, machineId, tmuxName, onSend, onSendKeys,
}: {
  kind: 'ai' | 'term';
  placeholder: string;
  machineId?: number;
  tmuxName?: string;
  onSend: (text: string) => void;
  onSendKeys?: (data: string) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const keysOn = usePrefs((s) => s.keysVisible);
  const setKeysVisible = usePrefs((s) => s.setKeysVisible);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<null | 'commands' | 'mcp' | 'project'>(null);
  const [caps, setCaps] = useState<AiCapabilities | null>(null);
  const [capState, setCapState] = useState<'idle' | 'loading' | 'unavailable' | 'ready'>('idle');
  const [saved, setSaved] = useState<SavedCmd[]>([]);
  const [savedState, setSavedState] = useState<'idle' | 'loading' | 'ready'>('idle');

  const loadCaps = async () => {
    if (kind !== 'ai' || machineId == null || !tmuxName) return;
    setCapState('loading');
    try {
      const data = await api<AiCapabilities>(
        `/api/ai-sessions/${machineId}/${encodeURIComponent(tmuxName)}/capabilities`,
      );
      if (data.unavailable) setCapState('unavailable');
      else { setCaps(data); setCapState('ready'); }
    } catch { setCapState('unavailable'); }
  };

  const loadProjectCmds = async () => {
    if (machineId == null) return;
    setSavedState('loading');
    try {
      const projects = await api<Array<{
        id: number; name: string; startCommand?: string; stopCommand?: string; restartCommand?: string;
      }>>(`/api/projects?machineId=${machineId}`);
      const rows: SavedCmd[] = [];
      await Promise.all((projects || []).map(async (p) => {
        if (p.startCommand) rows.push({ label: `Start ${p.name}`, command: p.startCommand, project: p.name });
        if (p.stopCommand) rows.push({ label: `Stop ${p.name}`, command: p.stopCommand, project: p.name });
        if (p.restartCommand) rows.push({ label: `Restart ${p.name}`, command: p.restartCommand, project: p.name });
        try {
          const extra = await api<Array<{ label: string; command: string }>>(`/api/projects/${p.id}/commands`);
          for (const c of extra || []) rows.push({ label: c.label, command: c.command, project: p.name });
        } catch { /* optional */ }
      }));
      setSaved(rows);
      setSavedState('ready');
    } catch {
      setSaved([]);
      setSavedState('ready');
    }
  };

  const typed = kind === 'ai' ? commandQuery(text) : null;
  useEffect(() => {
    if (typed !== null && capState === 'idle') void loadCaps();
  }, [typed]);

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
    setSheet(null);
    setMenu(false);
  };

  const keys = kind === 'ai' ? AI_KEYS : TERM_KEYS;
  const matches = caps && typed !== null ? rankCommands(caps.commands, typed) : [];

  return (
    <View style={{
      borderTopWidth: 1, borderColor: t.b1, backgroundColor: t.card,
      padding: 10, paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 10),
    }}>
      {menu && (
        <View style={{ backgroundColor: t.bgSub, borderRadius: radius.md, marginBottom: 8, overflow: 'hidden' }}>
          <MenuItem label="Function keys" hint="Opt-in. Persist on this device." onPress={() => {
            void setKeysVisible(!keysOn); setMenu(false);
          }} />
          {kind === 'ai' ? (
            <>
              <MenuItem label="Slash commands" hint="Filter as you type /" onPress={() => { setMenu(false); setSheet('commands'); void loadCaps(); }} />
              <MenuItem label="MCP servers" hint="As configured — not claimed as in use" onPress={() => { setMenu(false); setSheet('mcp'); void loadCaps(); }} />
            </>
          ) : (
            <MenuItem label="Project commands" hint="Saved start / restart commands" onPress={() => { setMenu(false); setSheet('project'); void loadProjectCmds(); }} />
          )}
        </View>
      )}

      {sheet === 'commands' && (
        <CapSheet title={capState === 'ready' ? `${matches.length || caps?.commands.length} commands` : 'Commands'} onClose={() => setSheet(null)}>
          {capState === 'unavailable' && <Hint>Commands need agent 2.7.2 or newer on this machine — or the machine is offline.</Hint>}
          {capState === 'ready' && (caps?.commands.length === 0) && <Hint>None configured for this session.</Hint>}
          {capState === 'ready' && (typed !== null ? matches : caps!.commands).map((c: AiCommand) => (
            <Pressable key={c.name} onPress={() => { setText(`/${c.name} `); setSheet(null); }} style={{ padding: 10 }}>
              <Text style={{ color: t.accent, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>/{c.name}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{c.description}</Text>
            </Pressable>
          ))}
        </CapSheet>
      )}

      {sheet === 'mcp' && (
        <CapSheet title={capState === 'ready' ? `${caps!.mcpServers.length} servers as configured` : 'MCP'} onClose={() => setSheet(null)}>
          {capState === 'unavailable' && <Hint>MCP details need agent 2.7.2 or newer on this machine — or the machine is offline.</Hint>}
          {capState === 'ready' && caps!.mcpServers.map((s: McpServerInfo) => (
            <View key={`${s.origin}:${s.name}`} style={{ padding: 10 }}>
              <Text style={{ color: t.txt, fontWeight: '600' }}>{s.name}  <Text style={{ color: t.dim, fontWeight: '400', fontSize: 11 }}>{s.scope}{s.enabled ? '' : ' · disabled'}</Text></Text>
              {!!s.command && <Text style={{ color: t.dim, fontSize: 11 }} numberOfLines={1}>{s.command} {(s.args || []).join(' ')}</Text>}
            </View>
          ))}
          {capState === 'ready' && caps!.mcpServers.length === 0 && <Hint>None configured for this session.</Hint>}
        </CapSheet>
      )}

      {sheet === 'project' && (
        <CapSheet title={savedState === 'ready' ? `${saved.length} commands` : 'Project commands'} onClose={() => setSheet(null)}>
          {savedState === 'ready' && saved.length === 0 && <Hint>No saved commands on this machine. Add them from the project on the web app.</Hint>}
          {saved.map((c, i) => (
            <Pressable key={`${c.label}-${i}`} onPress={() => { onSend(c.command); setSheet(null); }} style={{ padding: 10 }}>
              <Text style={{ color: t.txt, fontWeight: '600' }}>{c.label}</Text>
              <Text style={{ color: t.dim, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }} numberOfLines={1}>{c.command}</Text>
            </Pressable>
          ))}
        </CapSheet>
      )}

      {keysOn && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {keys.map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                if (k === 'y' || k === 'n') onSend(k);
                else onSendKeys?.(KEY_BYTES[k] || k);
              }}
              style={{
                marginRight: 6, paddingHorizontal: 11, paddingVertical: 7,
                borderRadius: 8, borderWidth: 1, borderColor: k === 'y' ? t.accent : t.b1,
                backgroundColor: k === 'y' ? t.accentWeak : t.bgSub,
              }}
            >
              <Text style={{ color: k === 'y' ? t.accent : t.muted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 }}>{k}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {typed !== null && capState === 'ready' && matches.length > 0 && sheet === null && (
        <View style={{ maxHeight: 160, marginBottom: 8, backgroundColor: t.bgSub, borderRadius: radius.md }}>
          <ScrollView>
            {matches.slice(0, 8).map((c) => (
              <Pressable key={c.name} onPress={() => setText(`/${c.name} `)} style={{ padding: 10 }}>
                <Text style={{ color: t.accent, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>/{c.name}</Text>
                <Text style={{ color: t.dim, fontSize: 12 }} numberOfLines={1}>{c.description}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Pressable
          onPress={() => { setSheet(null); setMenu((m) => !m); }}
          style={{
            width: 38, height: 38, borderRadius: 12, borderWidth: 1,
            borderColor: menu ? t.accent : t.b1, backgroundColor: menu ? t.accentWeak : t.bgSub,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: t.txt, fontSize: 20, lineHeight: 22 }}>+</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={t.dim}
          multiline
          blurOnSubmit={false}
          contextMenuHidden={false}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
          style={{
            flex: 1, minHeight: 38, maxHeight: 110, paddingHorizontal: 14, paddingVertical: 8,
            borderRadius: Platform.OS === 'ios' ? 19 : 8, backgroundColor: t.bgSub, color: t.txt, fontSize: 16,
          }}
        />
        <Pressable onPress={submit} style={{ width: 38, height: 38, borderRadius: Platform.OS === 'ios' ? 19 : 12, backgroundColor: t.cta, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.ctaFg, fontSize: 16 }}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MenuItem({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ padding: 12 }}>
      <Text style={{ color: t.txt, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: t.dim, fontSize: 12 }}>{hint}</Text>
    </Pressable>
  );
}

function CapSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ maxHeight: 240, backgroundColor: t.bgSub, borderRadius: radius.md, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10 }}>
        <Text style={{ color: t.dim, fontSize: 12, fontWeight: '600' }}>{title}</Text>
        <Pressable onPress={onClose}><Text style={{ color: t.accent, fontSize: 12 }}>Close</Text></Pressable>
      </View>
      <ScrollView>{children}</ScrollView>
    </View>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.dim, fontSize: 13.5, padding: 12, lineHeight: 20 }}>{children}</Text>;
}
