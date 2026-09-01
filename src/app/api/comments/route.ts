import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { shareComments, projects, projectShares } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { canReadProject } from '@/lib/project-access';
import { createNotification } from '@/lib/notify';

// GET — list comments for a project
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = parseInt(searchParams.get('projectId') || '');
    if (isNaN(projectId)) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    // Any logged-in user could otherwise read the comment thread of any
    // project just by incrementing the id.
    if (!(await canReadProject(session.userId, projectId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const comments = await db.select().from(shareComments)
      .where(eq(shareComments.projectId, projectId))
      .orderBy(desc(shareComments.createdAt));

    return NextResponse.json(comments);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// POST — add a comment
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { projectId, content } = await request.json();
    if (!projectId || !content) return NextResponse.json({ error: 'projectId and content required' }, { status: 400 });
    // Commenting notifies the owner and every participant, so an unchecked
    // projectId was both an write-anywhere and a notification-spam vector.
    if (!(await canReadProject(session.userId, parseInt(String(projectId), 10)))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [comment] = await db.insert(shareComments).values({
      projectId,
      userId: session.userId,
      userName: session.name,
      content: content.trim(),
    }).returning();

    // Notify project owner + all shared users (except commenter)
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project) {
      const shares = await db.select().from(projectShares).where(eq(projectShares.projectId, projectId));
      const notifyUserIds = new Set<number>();
      if (project.userId) notifyUserIds.add(project.userId);
      shares.forEach((s) => { notifyUserIds.add(s.sharedBy); notifyUserIds.add(s.sharedWith); });
      notifyUserIds.delete(session.userId);

      for (const uid of notifyUserIds) {
        await createNotification({
          userId: uid,
          type: 'comment',
          projectId,
          projectName: project.name,
          fromUserName: session.name,
          message: `${session.name} commented on "${project.name}"`,
        });
      }
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// DELETE — delete own comment
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { commentId } = await request.json();
    if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 });

    // Only delete own comments
    const [comment] = await db.select().from(shareComments).where(eq(shareComments.id, commentId));
    if (!comment || comment.userId !== session.userId) {
      return NextResponse.json({ error: 'Not your comment' }, { status: 403 });
    }

    await db.delete(shareComments).where(eq(shareComments.id, commentId));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
