import { api, ApiError } from './client';

export type ProcessAction = 'start' | 'stop' | 'restart';

export function processErrorMessage(e: unknown, action: ProcessAction): string {
  const msg = e instanceof ApiError ? e.message : '';
  if (msg === 'no-command') {
    return `No ${action} command saved for this project. Add one on the web app (project → process commands).`;
  }
  if (msg === 'Machine offline') return 'That machine is offline.';
  return msg || `Could not ${action} this project.`;
}

export async function runProjectProcess(projectId: number, action: ProcessAction): Promise<void> {
  await api(`/api/projects/${projectId}/process`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}
