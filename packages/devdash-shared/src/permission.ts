// Trust levels offered when launching a session. Order is safest-first.
// `bypassPermissions` is deliberately absent — nothing arriving from a phone
// should be able to disable every permission check.
export type PermissionMode = 'plan' | 'default' | 'acceptEdits' | 'dontAsk';

export const PERMISSION_MODES: PermissionMode[] = ['plan', 'default', 'acceptEdits', 'dontAsk'];

export function isPermissionMode(value: string): value is PermissionMode {
  return (PERMISSION_MODES as string[]).includes(value);
}
