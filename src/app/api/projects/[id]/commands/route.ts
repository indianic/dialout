import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectCommands } from '@/lib/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { canReadProject, isProjectOwner } from '@/lib/project-access';

// These rows are shell commands the owner later executes on their own machine
// via the daemon. An unauthorized write here is remote code execution with the
// owner's own click as the trigger, so writes are strictly owner-only and every
// commandId is scoped to the project in the URL.
async function authorize(
  idParam: string,
  mode: 'read' | 'manage',
): Promise<{ projectId: number } | { error: NextResponse }> {
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
  if (!ok) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { projectId };
}

// GET — list commands for a project
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(id, 'read');
  if ('error' in auth) return auth.error;

  const commands = await db
    .select()
    .from(projectCommands)
    .where(eq(projectCommands.projectId, auth.projectId))
    .orderBy(asc(projectCommands.sortOrder));

  return NextResponse.json(commands);
}

// POST — add a new command
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const { label, command, sortOrder } = await request.json();

  if (!label || !command) {
    return NextResponse.json({ error: 'label and command required' }, { status: 400 });
  }

  const [created] = await db
    .insert(projectCommands)
    .values({
      projectId: auth.projectId,
      label,
      command,
      sortOrder: sortOrder ?? 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

// PUT — update a command
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const { commandId, label, command, sortOrder } = await request.json();

  if (!commandId) {
    return NextResponse.json({ error: 'commandId required' }, { status: 400 });
  }

  // Scoped to the authorized project, so a commandId belonging to someone
  // else's project can't be edited through a project the caller does own.
  const [updated] = await db
    .update(projectCommands)
    .set({
      ...(label !== undefined && { label }),
      ...(command !== undefined && { command }),
      ...(sortOrder !== undefined && { sortOrder }),
    })
    .where(and(eq(projectCommands.id, commandId), eq(projectCommands.projectId, auth.projectId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

// DELETE — remove a command
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const { commandId } = await request.json();

  if (!commandId) {
    return NextResponse.json({ error: 'commandId required' }, { status: 400 });
  }

  const deleted = await db
    .delete(projectCommands)
    .where(and(eq(projectCommands.id, commandId), eq(projectCommands.projectId, auth.projectId)))
    .returning();

  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
