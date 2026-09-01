import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XTERM_HTML } from '../../src/xterm/page';
import { Composer } from '../../src/ui/Composer';
import { KeyboardSafe } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/Theme';
import { useAuth } from '../../src/store/auth';
import { getWsUrl } from '../../src/config';

export default function TerminalView() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, machineId, name, cwd, title } = useLocalSearchParams<{
    id: string; machineId?: string; name?: string; cwd?: string; title?: string;
  }>();
  const token = useAuth((s) => s.token);
  const mid = parseInt(String(machineId || ''), 10);
  const tmux = decodeURIComponent(String(name || ''));
  const folder = cwd ? decodeURIComponent(String(cwd)) : '';
  const heading = title ? decodeURIComponent(String(title)) : (tmux || `session ${id}`);
  const webRef = useRef<WebView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [offline, setOffline] = useState('');
  const sessionId = `mobile-${id}`;
  const size = useRef({ cols: 80, rows: 24 });

  const sendPty = (msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const send = (text: string) => {
    sendPty({ type: 'pty_data', id: sessionId, data: text.endsWith('\n') ? text : `${text}\n` });
  };
  const sendKeys = (data: string) => {
    sendPty({ type: 'pty_data', id: sessionId, data });
  };

  const connect = () => {
    if (!token || !mid) return;
    try { wsRef.current?.close(); } catch { /* */ }
    const ws = new WebSocket(`${getWsUrl()}/terminal?token=${encodeURIComponent(token)}&machineId=${mid}`);
    wsRef.current = ws;
    ws.onopen = () => {
      setOffline('');
      ws.send(JSON.stringify({
        type: 'pty_open',
        id: sessionId,
        cols: size.current.cols,
        rows: size.current.rows,
        cwd: folder || '~',
        tmuxSession: tmux || undefined,
      }));
    };
    ws.onmessage = (ev) => {
      let msg: { type?: string; data?: string; error?: string };
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.type === 'pty_data' && msg.data) {
        webRef.current?.postMessage(JSON.stringify({ type: 'out', data: msg.data }));
      }
      if (msg.type === 'pty_error' || msg.type === 'error') {
        setOffline(msg.error || 'Machine offline');
      }
    };
    ws.onclose = () => {
      if (AppState.currentState === 'active') setOffline('Reconnecting…');
    };
  };

  useEffect(() => {
    connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        try { wsRef.current?.close(); } catch { /* */ }
        wsRef.current = null;
      }
      if (state === 'active') connect();
    });
    return () => {
      sub.remove();
      try { wsRef.current?.close(); } catch { /* */ }
    };
  }, [token, mid, tmux, sessionId]);

  return (
    <KeyboardSafe>
      <View style={{ flex: 1, backgroundColor: t.termBg, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: t.bg }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.txt, fontSize: 22 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.txt, fontWeight: '600' }} numberOfLines={1}>{heading}</Text>
            {!!offline && <Text style={{ color: t.offline, fontSize: 12 }}>{offline}</Text>}
          </View>
        </View>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html: XTERM_HTML }}
          style={{ flex: 1, backgroundColor: t.termBg }}
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          textInteractionEnabled
          scrollEnabled={false}
          onMessage={(e) => {
            let msg: { type?: string; data?: string; cols?: number; rows?: number };
            try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
            if (msg.type === 'data' && typeof msg.data === 'string') sendKeys(msg.data);
            if ((msg.type === 'ready' || msg.type === 'size') && msg.cols && msg.rows) {
              size.current = { cols: msg.cols, rows: msg.rows };
              sendPty({ type: 'pty_resize', id: sessionId, cols: msg.cols, rows: msg.rows });
            }
          }}
        />
        <Composer kind="term" placeholder="Type a command… Hold to paste" machineId={mid} onSend={send} onSendKeys={sendKeys} />
      </View>
    </KeyboardSafe>
  );
}
