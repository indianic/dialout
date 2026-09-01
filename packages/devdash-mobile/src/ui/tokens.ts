import { Platform } from 'react-native';

export const light = {
  bg: '#f2f2f7',
  bgSub: '#e5e5ea',
  card: '#ffffff',
  txt: '#000000',
  muted: '#3c3c43',
  dim: 'rgba(60,60,67,0.6)',
  b1: 'rgba(60,60,67,0.18)',
  accent: '#1a56db',
  accentWeak: 'rgba(26,86,219,0.10)',
  cta: '#17191f',
  ctaFg: '#ffffff',
  live: '#0f7a3d',
  waiting: '#a55a00',
  offline: '#c2273f',
  toolSearch: '#0d7a72',
  toolRun: '#6b3fc4',
  toolWrite: '#a55a00',
  termBg: '#0c0e13',
  termFg: '#d6dae3',
};

export const dark = {
  bg: '#000000',
  bgSub: '#1c1c1e',
  card: '#1c1c1e',
  txt: '#ffffff',
  muted: '#ebebf5',
  dim: 'rgba(235,235,245,0.6)',
  b1: 'rgba(84,84,88,0.65)',
  accent: '#5b9cf8',
  accentWeak: 'rgba(91,156,248,0.14)',
  cta: '#eceef3',
  ctaFg: '#14161c',
  live: '#3ddc84',
  waiting: '#f0b429',
  offline: '#ff6b7a',
  toolSearch: '#2dd4bf',
  toolRun: '#a78bfa',
  toolWrite: '#f0b429',
  termBg: '#0c0e13',
  termFg: '#d6dae3',
};

export type Tokens = typeof light;

export const radius = {
  sm: Platform.OS === 'ios' ? 10 : 8,
  md: Platform.OS === 'ios' ? 12 : 16,
  lg: Platform.OS === 'ios' ? 14 : 20,
  pill: 999,
};

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string;
export const sans = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string;
