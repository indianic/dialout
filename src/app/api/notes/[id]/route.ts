import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectNotes } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isProjectOwner } from '@/lib/project-access';

// A note id alone says nothing about who may touch it — resolve the note to
// its project and require ownership of that project.
async function authorizeNote(
  idParam: string,
): Promise<{ noteId: number } | { error: NextResponse }> {
  const noteId = parseInt(idParam, 10);
  if (Number.isNaN(noteId)) {
    return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const [note] = await db.select().from(projectNotes).where(eq(projectNotes.id, noteId));
  if (!note || !(await isProjectOwner(session.userId, note.projectId))) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { noteId };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeNote(id);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { title, content, tags, isArchived } = body;

    const autoTitle = title || (content || '').split('\n').find((l: string) => l.trim())?.replace(/^#+\s*/, '').substring(0, 40).trim() || 'Untitled';

    const [updated] = await db.update(projectNotes).set({
      title: autoTitle,
      content: content ?? undefined,
      tags: tags ?? undefined,
      isArchived: isArchived ?? undefined,
      updatedAt: new Date().toISOString(),
    }).where(eq(projectNotes.id, auth.noteId)).returning();

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeNote(id);
    if ('error' in auth) return auth.error;

    await db.delete(projectNotes).where(eq(projectNotes.id, auth.noteId));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
