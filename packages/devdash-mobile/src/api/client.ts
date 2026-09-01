import { getApiUrl } from '../config';

export type TokenListener = (token: string) => void;

let accessToken: string | null = null;
let onToken: TokenListener | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setTokenListener(fn: TokenListener | null) {
  onToken = fn;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { pendingToken?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-DevDash-Client', 'native');
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${getApiUrl()}${path}`, { ...init, headers });
  const refreshed = res.headers.get('X-DevDash-Session');
  if (refreshed) {
    accessToken = refreshed;
    onToken?.(refreshed);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data)
      ? String((data as { error: string }).error)
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}
