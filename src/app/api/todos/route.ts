import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectTodos } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { canReadProject, isProjectOwner } from '@/lib/project-access';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = parseInt(searchParams.get('projectId') || '');
  if (isNaN(projectId)) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  // Read is owner-or-shared-with; the shared project drawer reads todos too.
  if (!(await canReadProject(session.userId, projectId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const todos = await db.select().from(projectTodos)
      .where(eq(projectTodos.projectId, projectId))
      .orderBy(desc(projectTodos.createdAt));
    return NextResponse.json(todos);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { projectId, text, priority } = body;
    if (!projectId || !text) return NextResponse.json({ error: 'projectId and text required' }, { status: 400 });
    // Writing is owner-only — a share is read-only.
    if (!(await isProjectOwner(session.userId, parseInt(String(projectId), 10)))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [created] = await db.insert(projectTodos).values({
      projectId,
      text,
      priority: priority || 'medium',
    }).returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
