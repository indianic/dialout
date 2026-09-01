import { describe, expect, it } from 'vitest';
import { deriveWsUrl, normalizeApiUrl } from './server-url';

describe('normalizeApiUrl', () => {
  it('adds https when no scheme is given', () => {
    expect(normalizeApiUrl('dash.example.com')).toBe('https://dash.example.com');
  });
  it('trims whitespace and a trailing slash', () => {
    expect(normalizeApiUrl('  https://dash.example.com/  ')).toBe('https://dash.example.com');
  });
  it('keeps an explicit http scheme and port', () => {
    expect(normalizeApiUrl('http://192.168.1.5:50051')).toBe('http://192.168.1.5:50051');
  });
  it('keeps a sub-path but drops its trailing slash', () => {
    expect(normalizeApiUrl('https://example.com/devdash/')).toBe('https://example.com/devdash');
  });
  it('lowercases the host', () => {
    expect(normalizeApiUrl('HTTPS://Dash.Example.COM')).toBe('https://dash.example.com');
  });
  it('rejects an empty string', () => {
    expect(normalizeApiUrl('   ')).toBeNull();
  });
  it('rejects a non-http scheme', () => {
    expect(normalizeApiUrl('ftp://example.com')).toBeNull();
  });
  it('rejects a host containing whitespace', () => {
    expect(normalizeApiUrl('not a url')).toBeNull();
  });
});

describe('deriveWsUrl', () => {
  it('maps https to wss and appends /ws', () => {
    expect(deriveWsUrl('https://dash.example.com')).toBe('wss://dash.example.com/ws');
  });
  it('maps http to ws and keeps the port', () => {
    expect(deriveWsUrl('http://192.168.1.5:50051')).toBe('ws://192.168.1.5:50051/ws');
  });
  it('preserves a sub-path', () => {
    expect(deriveWsUrl('https://example.com/devdash')).toBe('wss://example.com/devdash/ws');
  });
});
