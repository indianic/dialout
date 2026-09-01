import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectNotes } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { canReadProject, isProjectOwner } from '@/lib/project-access';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = parseInt(searchParams.get('projectId') || '');
  if (isNaN(projectId)) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  // Read is owner-or-shared-with; the shared project drawer reads notes too.
  if (!(await canReadProject(session.userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const notes = await db.select().from(projectNotes)
      .where(eq(projectNotes.projectId, projectId))
      .orderBy(desc(projectNotes.createdAt));
    return NextResponse.json(notes);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { projectId, content, tags } = body;
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    // Writing is owner-only — a share is read-only, which the UI already
    // assumes (DrawerNotes hides the editor for non-owners).
    if (!(await isProjectOwner(session.userId, parseInt(String(projectId), 10)))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const autoTitle = (content || '').split('\n').find((l: string) => l.trim())?.replace(/^#+\s*/, '').substring(0, 40).trim() || 'Untitled';

    const [created] = await db.insert(projectNotes).values({
      projectId,
      title: body.title || autoTitle,
      content: content || '',
      tags: tags || '',
    }).returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
