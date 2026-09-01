// Pure terminal-name rendering. Shared by the /terminals list, the attach
// header, and the mobile list so one name shows everywhere. No React, no I/O.

export interface TerminalNameVars {
  machine_name?: string;
  folder_name?: string;
  folder_path?: string;
  date?: string;
  time?: string;
  ampm?: string;
  git_branch?: string;
  term_program?: string;
  short_id?: string;
}

export const DEFAULT_TERMINAL_TEMPLATE = '[machine_name]-[folder_name]-[date]-[time][ampm]';

export const TERMINAL_NAME_TOKENS = [
  'machine_name', 'folder_name', 'folder_path',
  'date', 'time', 'ampm',
  'git_branch', 'term_program', 'short_id',
];

function timeParts(iso: string | null): { date: string; time: string; ampm: string } {
  if (!iso) return { date: '', time: '', ampm: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '', ampm: '' };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  let h = d.getHours();
  const ampm = h < 12 ? 'am' : 'pm';
  h = h % 12; if (h === 0) h = 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${h}:${min}`, ampm };
}

export function factsFromSession(s: {
  machineName: string;
  folder: string | null;
  folderPath: string | null;
  createdLocal: string | null;
  startedAt: string | null;
  gitBranch: string | null;
  termProgram: string | null;
  tmuxName: string;
}): TerminalNameVars {
  const t = timeParts(s.createdLocal || s.startedAt);
  const shortId = (s.tmuxName.split('-').pop() || s.tmuxName).slice(0, 8);
  return {
    machine_name: s.machineName || '',
    folder_name: s.folder || '',
    folder_path: s.folderPath || '',
    date: t.date,
    time: t.time,
    ampm: t.ampm,
    git_branch: s.gitBranch || '',
    term_program: s.termProgram && s.termProgram !== 'unknown' ? s.termProgram : '',
    short_id: shortId,
  };
}

export function renderTerminalName(
  template: string,
  vars: TerminalNameVars,
  fallback: string
): string {
  if (!template) return fallback;
  let out = template;
  for (const token of TERMINAL_NAME_TOKENS) {
    const value = (vars as Record<string, string | undefined>)[token] ?? '';
    if (value) {
      out = out.split(`[${token}]`).join(value);
    } else {
      const re = new RegExp(`(?:[-_ ]+)?\\[${token}\\]|\\[${token}\\](?:[-_ ]+)?`, 'g');
      out = out.replace(re, '');
    }
  }
  out = out.replace(/\[[a-z_]+\]/g, '');
  out = out.replace(/[-_]{2,}/g, (m) => m[0]).replace(/^[-_ ]+|[-_ ]+$/g, '').trim();
  return out || fallback;
}
