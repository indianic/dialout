import { db } from '@/lib/db';
import { projects, projectShares } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';
import { userOwnsMachine } from '@/lib/machine-access';

// Authorization helpers. Two levels, matching the product rule that a share is
// read-only: the owner may modify, an owner-or-shared-with user may read.
//
// Every route that accepts a projectId/machineId from the client MUST run one
// of these — the id is attacker-controlled, so a session check alone only
// proves "some user", not "this user's project".

// Owner-only: create/update/delete a project and everything hanging off it
// (notes, todos, credentials, quick-launch commands).
export async function isProjectOwner(userId: number, projectId: number): Promise<boolean> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return false;
  if (project.userId === userId) return true;
  // projects.user_id is nullable and pre-multi-user rows can have it unset.
  // Those rows are still reachable from the dashboard (GET /api/projects
  // selects by machine_id), so falling through to a bare owner check would
  // lock their real owner out of editing them. Fall back to machine
  // ownership, which is still a scoped check — not a bypass.
  if (project.userId == null && project.machineId != null) {
    return userOwnsMachine(userId, project.machineId);
  }
  return false;
}

// Owner OR shared-with: read a project and its notes/todos/credentials/comments.
export async function canReadProject(userId: number, projectId: number): Promise<boolean> {
  if (await isProjectOwner(userId, projectId)) return true;
  const [share] = await db.select().from(projectShares)
    .where(and(eq(projectShares.projectId, projectId), eq(projectShares.sharedWith, userId)));
  return !!share;
}

// Kept as a named alias so credential routes read explicitly at the call site.
export const canAccessProjectCredentials = canReadProject;

// Machine ownership lives in machine-access.ts (`userOwnsMachine`) — one guard,
// not two. Re-exported here so a project route needing the machine check does
// not have to import from both modules.
export { userOwnsMachine } from '@/lib/machine-access';
