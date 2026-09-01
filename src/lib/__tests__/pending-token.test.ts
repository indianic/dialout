import { describe, it, expect } from 'vitest';
import { issuePendingToken, verifyPendingToken } from '../pending-token';

describe('pending-token', () => {
  it('round-trips a token for the matching purpose', async () => {
    const token = await issuePendingToken(7, 3, '2fa');
    const claims = await verifyPendingToken(token, '2fa');
    expect(claims).toEqual({ userId: 7, machineId: 3 });
  });

  it('rejects a token used for the wrong purpose', async () => {
    const token = await issuePendingToken(7, 3, 'enroll');
    expect(await verifyPendingToken(token, '2fa')).toBeNull();
  });

  it('rejects garbage / undefined', async () => {
    expect(await verifyPendingToken(undefined, '2fa')).toBeNull();
    expect(await verifyPendingToken('not.a.jwt', '2fa')).toBeNull();
  });
});
