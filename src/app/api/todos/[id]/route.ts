import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectTodos } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isProjectOwner } from '@/lib/project-access';

// A todo id alone says nothing about who may touch it — resolve the todo to
// its project and require ownership of that project.
async function authorizeTodo(
  idParam: string,
): Promise<{ todoId: number } | { error: NextResponse }> {
  const todoId = parseInt(idParam, 10);
  if (Number.isNaN(todoId)) {
    return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const [todo] = await db.select().from(projectTodos).where(eq(projectTodos.id, todoId));
  if (!todo || !(await isProjectOwner(session.userId, todo.projectId))) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { todoId };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeTodo(id);
    if ('error' in auth) return auth.error;

    const body = await request.json();
    const { text, priority, isDone, isArchived } = body;

    const [updated] = await db.update(projectTodos).set({
      text: text ?? undefined,
      priority: priority ?? undefined,
      isDone: isDone ?? undefined,
      isArchived: isArchived ?? undefined,
      updatedAt: new Date().toISOString(),
    }).where(eq(projectTodos.id, auth.todoId)).returning();

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeTodo(id);
    if ('error' in auth) return auth.error;

    await db.delete(projectTodos).where(eq(projectTodos.id, auth.todoId));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
