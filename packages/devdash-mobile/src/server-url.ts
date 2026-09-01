// Regex, not URL. React Native's URL is a partial polyfill whose pathname and
// host behaviour differs from the web, and these strings decide whether the app
// can reach a server at all.
const PARTS = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?/i;

export function normalizeApiUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const m = PARTS.exec(hasScheme ? raw : `https://${raw}`);
  if (!m) return null;
  const host = m[2].toLowerCase();
  if (!host || host.startsWith(':') || /\s/.test(host)) return null;
  const path = (m[3] || '').replace(/\/+$/, '');
  return `${m[1].toLowerCase()}://${host}${path}`;
}

export function deriveWsUrl(apiUrl: string): string {
  const m = PARTS.exec(apiUrl);
  if (!m) return '';
  const scheme = m[1].toLowerCase() === 'http' ? 'ws' : 'wss';
  const path = (m[3] || '').replace(/\/+$/, '');
  return `${scheme}://${m[2].toLowerCase()}${path}/ws`;
}
