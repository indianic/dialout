import { create } from 'zustand';
import { storageDel, storageGet, storageSet } from '../storage';
import { BAKED_API_URL, BAKED_WS_URL, setServerUrls } from '../config';
import { deriveWsUrl } from '../server-url';
import { TOKEN_KEY } from './auth';

const API_KEY = 'devdash-api-url';
const WS_KEY = 'devdash-ws-url';

interface ServerState {
  ready: boolean;
  apiUrl: string;
  wsUrl: string;
  configured: boolean;
  hydrate: () => Promise<void>;
  setServer: (apiUrl: string, wsUrl: string) => Promise<void>;
  clearServer: () => Promise<void>;
}

export const useServer = create<ServerState>((set) => ({
  ready: false,
  apiUrl: BAKED_API_URL,
  wsUrl: BAKED_WS_URL,
  configured: false,

  hydrate: async () => {
    try {
      const [storedApi, storedWs, token] = await Promise.all([
        storageGet(API_KEY),
        storageGet(WS_KEY),
        storageGet(TOKEN_KEY),
      ]);

      if (storedApi) {
        const ws = storedWs || deriveWsUrl(storedApi);
        setServerUrls({ apiUrl: storedApi, wsUrl: ws });
        set({ ready: true, apiUrl: storedApi, wsUrl: ws, configured: true });
        return;
      }

      // Upgrade path. Someone already signed in against the baked server must
      // not be dumped on a setup screen by an update they did not ask for.
      if (token && BAKED_API_URL) {
        const ws = BAKED_WS_URL || deriveWsUrl(BAKED_API_URL);
        await storageSet(API_KEY, BAKED_API_URL);
        await storageSet(WS_KEY, ws);
        setServerUrls({ apiUrl: BAKED_API_URL, wsUrl: ws });
        set({ ready: true, apiUrl: BAKED_API_URL, wsUrl: ws, configured: true });
        return;
      }

      set({ ready: true, configured: false });
    } catch {
      // Same contract as usePrefs: always reach ready, so a keychain fault
      // cannot hang the splash screen forever.
      set({ ready: true, configured: false });
    }
  },

  setServer: async (apiUrl, wsUrl) => {
    await storageSet(API_KEY, apiUrl);
    await storageSet(WS_KEY, wsUrl);
    setServerUrls({ apiUrl, wsUrl });
    set({ apiUrl, wsUrl, configured: true });
  },

  clearServer: async () => {
    await storageDel(API_KEY);
    await storageDel(WS_KEY);
    setServerUrls({ apiUrl: BAKED_API_URL, wsUrl: BAKED_WS_URL });
    set({ apiUrl: BAKED_API_URL, wsUrl: BAKED_WS_URL, configured: false });
  },
}));
