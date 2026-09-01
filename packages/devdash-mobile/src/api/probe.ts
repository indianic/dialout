export type Verdict = 'ok' | 'not-devdash' | 'unreachable' | 'tls';

export function verdictMessage(v: Verdict): string {
  switch (v) {
    case 'not-devdash': return 'That address answered, but it is not a DevDash server.';
    case 'unreachable': return 'Could not reach that address. Check the URL and your network.';
    case 'tls': return "The server's certificate was rejected.";
    case 'ok': return '';
  }
}

// Every DevDash route calls getSession(), so there is no anonymous endpoint to
// ask "are you DevDash?". An unauthenticated GET answering 401 with a JSON body
// is the proof: something is listening, it speaks the API, and it enforces auth.
// Anything else is a different server or a wrong address.
export async function probeServer(apiUrl: string, timeoutMs = 8000): Promise<Verdict> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/api/projects`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-DevDash-Client': 'native' },
      signal: ctl.signal,
    });
    if (res.status !== 401) return 'not-devdash';
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? 'ok' : 'not-devdash';
  } catch (e) {
    // React Native reports a rejected certificate through the same TypeError as
    // a DNS failure. The message is the only thing that separates them, so a
    // missed keyword degrades to 'unreachable' rather than lying.
    const msg = String((e as Error)?.message || '').toLowerCase();
    if (msg.includes('certificate') || msg.includes('ssl') || msg.includes('trust anchor')) return 'tls';
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
