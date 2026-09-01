import { describe, it, expect, beforeEach, vi } from 'vitest';

// Rows the mocked db returns, keyed by drizzle table name. Each test sets the
// fixture it needs; the mock resolves the table from the `.from()` argument.
const rows: Record<string, unknown[]> = { projects: [], project_shares: [], machines: [] };

const DRIZZLE_NAME = Symbol.for('drizzle:Name');

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (table: Record<symbol, string>) => ({
        where: async () => rows[table[DRIZZLE_NAME]] ?? [],
      }),
    }),
  },
}));

const { isProjectOwner, canReadProject } = await import('@/lib/project-access');
// The machine guard lives in machine-access.ts; project-access re-exports it.
// Exercised here because isProjectOwner falls back to it for legacy rows.
const { userOwnsMachine } = await import('@/lib/machine-access');

beforeEach(() => {
  rows.projects = [];
  rows.project_shares = [];
  rows.machines = [];
});

describe('userOwnsMachine', () => {
  it('is true only for a machine the user owns', async () => {
    rows.machines = [{ id: 7, userId: 1 }];
    expect(await userOwnsMachine(1, 7)).toBe(true);
    expect(await userOwnsMachine(2, 7)).toBe(false);
  });

  it('is false for a machine that does not exist', async () => {
    rows.machines = [];
    expect(await userOwnsMachine(1, 7)).toBe(false);
  });

  it('rejects a non-integer machineId instead of querying', async () => {
    rows.machines = [{ id: 7, userId: 1 }];
    expect(await userOwnsMachine(1, NaN)).toBe(false);
  });
});

describe('isProjectOwner', () => {
  it('is true for the owner and false for anyone else', async () => {
    rows.projects = [{ id: 5, userId: 1, machineId: 7 }];
    expect(await isProjectOwner(1, 5)).toBe(true);
    expect(await isProjectOwner(2, 5)).toBe(false);
  });

  it('is false for a project that does not exist', async () => {
    expect(await isProjectOwner(1, 5)).toBe(false);
  });

  it('is false for a user the project is merely shared with', async () => {
    rows.projects = [{ id: 5, userId: 1, machineId: 7 }];
    rows.project_shares = [{ projectId: 5, sharedWith: 2 }];
    // A share is read-only — it must never confer ownership.
    expect(await isProjectOwner(2, 5)).toBe(false);
  });

  it('falls back to machine ownership for a legacy row with no userId', async () => {
    rows.projects = [{ id: 5, userId: null, machineId: 7 }];
    rows.machines = [{ id: 7, userId: 1 }];
    expect(await isProjectOwner(1, 5)).toBe(true);
  });

  it('does not let the null-userId fallback cross machine ownership', async () => {
    rows.projects = [{ id: 5, userId: null, machineId: 7 }];
    rows.machines = [{ id: 7, userId: 1 }];
    expect(await isProjectOwner(2, 5)).toBe(false);
  });

  it('does not apply the fallback when the project has an owner', async () => {
    rows.projects = [{ id: 5, userId: 1, machineId: 7 }];
    rows.machines = [{ id: 7, userId: 2 }];
    // Owning the machine must not grant ownership of someone else's project.
    expect(await isProjectOwner(2, 5)).toBe(false);
  });
});

describe('canReadProject', () => {
  it('allows the owner', async () => {
    rows.projects = [{ id: 5, userId: 1, machineId: 7 }];
    expect(await canReadProject(1, 5)).toBe(true);
  });

  it('allows a user the project is shared with', async () => {
    rows.projects = [{ id: 5, userId: 1, machineId: 7 }];
    rows.project_shares = [{ projectId: 5, sharedWith: 2 }];
    expect(await canReadProject(2, 5)).toBe(true);
  });

  it('denies a user with neither ownership nor a share', async () => {
    rows.projects = [{ id: 5, userId: 1, machineId: 7 }];
    rows.project_shares = [];
    expect(await canReadProject(3, 5)).toBe(false);
  });
});
