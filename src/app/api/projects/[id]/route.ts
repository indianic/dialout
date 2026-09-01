import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  projects, projectNotes, projectTodos, projectCredentials, projectCommands,
  projectMachines, projectShares, pendingInvites, shareComments,
} from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { canReadProject, isProjectOwner } from '@/lib/project-access';

// Resolve the :id and authorize the caller against it. `mode: 'read'` allows
// the owner or anyone the project is shared with; `mode: 'manage'` is owner-only.
async function authorize(
  idParam: string,
  mode: 'read' | 'manage',
): Promise<{ projectId: number; userId: number } | { error: NextResponse }> {
  const projectId = parseInt(idParam, 10);
  if (Number.isNaN(projectId)) {
    return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const ok = mode === 'manage'
    ? await isProjectOwner(session.userId, projectId)
    : await canReadProject(session.userId, projectId);
  // 404 rather than 403: a project the caller can't touch shouldn't be
  // distinguishable from one that doesn't exist (no id enumeration).
  if (!ok) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { projectId, userId: session.userId };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'read');
  if ('error' in auth) return auth.error;

  const project = await db.select().from(projects).where(eq(projects.id, auth.projectId));
  if (!project.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(project[0]);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorize(id, 'manage');
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { name, port, addonPorts, url, techStack, description, startDate, runner, status, tags, notes, rootPath, startCommand, stopCommand, restartCommand, runInBackground } = body;

    const autoUrl = url || (port ? `http://localhost:${port}` : '');

    const [updated] = await db
      .update(projects)
      .set({
        name,
        port: port || null,
        addonPorts: addonPorts || '',
        url: autoUrl,
        techStack: techStack || '',
        description: description || '',
        startDate: startDate || '',
        runner: runner || 'npm',
        status: status || 'active',
        tags: tags || '',
        notes: notes || '',
        rootPath: rootPath || '',
        startCommand: startCommand || '',
        stopCommand: stopCommand || '',
        restartCommand: restartCommand || '',
        runInBackground: runInBackground ?? true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(projects.id, auth.projectId))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorize(id, 'manage');
    if ('error' in auth) return auth.error;
    const pid = auth.projectId;

    // Delete every child row, not just notes/todos. Leaving these behind
    // orphaned encrypted credentials in the DB and — worse — left
    // project_shares rows alive, so a share grant survived the project it
    // pointed at and would apply to nothing (or to a future row) silently.
    await db.delete(projectNotes).where(eq(projectNotes.projectId, pid));
    await db.delete(projectTodos).where(eq(projectTodos.projectId, pid));
    await db.delete(projectCredentials).where(eq(projectCredentials.projectId, pid));
    await db.delete(projectCommands).where(eq(projectCommands.projectId, pid));
    await db.delete(projectMachines).where(eq(projectMachines.projectId, pid));
    await db.delete(projectShares).where(eq(projectShares.projectId, pid));
    await db.delete(pendingInvites).where(eq(pendingInvites.projectId, pid));
    await db.delete(shareComments).where(eq(shareComments.projectId, pid));
    await db.delete(projects).where(eq(projects.id, pid));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
