import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectShares, projects, users, pendingInvites } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { getSession, isEnrolled } from '@/lib/auth';
import { sendEmail, inviteEmailHtml } from '@/lib/email';
import { createNotification } from '@/lib/notify';

// GET — list shares. ?view=by-me returns shares I created, default returns shares with me
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await isEnrolled(session.userId))) return NextResponse.json({ error: 'Two-factor setup required' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');

    if (view === 'by-me') {
      // Shares I created — grouped by project
      const shares = await db.select().from(projectShares).where(eq(projectShares.sharedBy, session.userId));
      const pending = await db.select().from(pendingInvites).where(eq(pendingInvites.sharedBy, session.userId));

      const result = await Promise.all(
        shares.map(async (s) => {
          const [project] = await db.select().from(projects).where(eq(projects.id, s.projectId));
          const [user] = await db.select().from(users).where(eq(users.id, s.sharedWith));
          return {
            shareId: s.id,
            projectId: s.projectId,
            projectName: project?.name || '',
            sharedWithName: user?.name || '',
            sharedWithEmail: user?.email || '',
            allowTerminal: s.allowTerminal || false,
            createdAt: s.createdAt,
            type: 'active' as const,
          };
        })
      );

      const pendingResult = pending.map((p) => ({
        shareId: p.id,
        projectId: p.projectId,
        projectName: '',
        sharedWithName: '',
        sharedWithEmail: p.invitedEmail,
        createdAt: p.createdAt,
        type: 'pending' as const,
      }));

      // Fill in project names for pending
      for (const pr of pendingResult) {
        const [project] = await db.select().from(projects).where(eq(projects.id, pr.projectId));
        if (project) pr.projectName = project.name;
      }

      return NextResponse.json([...result, ...pendingResult]);
    }

    // Default: shared with me
    const shares = await db.select().from(projectShares).where(eq(projectShares.sharedWith, session.userId));

    const sharedProjects = await Promise.all(
      shares.map(async (s) => {
        const [project] = await db.select().from(projects).where(eq(projects.id, s.projectId));
        const [owner] = await db.select().from(users).where(eq(users.id, s.sharedBy));
        if (!project) return null;
        return {
          ...project,
          shareId: s.id,
          sharedByName: owner?.name || '',
          sharedByEmail: owner?.email || '',
          allowTerminal: s.allowTerminal || false,
          sharePort: s.port,
          shareRootPath: s.rootPath || '',
        };
      })
    );

    return NextResponse.json(sharedProjects.filter(Boolean));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// POST — share a project with another user (or invite if not registered)
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { projectId, email, confirmInvite, allowTerminal, port, rootPath } = await request.json();
    if (!projectId || !email) return NextResponse.json({ error: 'projectId and email required' }, { status: 400 });

    const cleanEmail = email.toLowerCase().trim();

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.userId !== session.userId) {
      return NextResponse.json({ error: 'Project not found or not yours' }, { status: 403 });
    }

    if (cleanEmail === session.email) {
      return NextResponse.json({ error: 'Cannot share with yourself' }, { status: 400 });
    }

    const [targetUser] = await db.select().from(users).where(eq(users.email, cleanEmail));

    if (!targetUser) {
      const existingInvite = await db.select().from(pendingInvites)
        .where(and(eq(pendingInvites.projectId, projectId), eq(pendingInvites.invitedEmail, cleanEmail)));

      if (existingInvite.length > 0) {
        return NextResponse.json({ error: 'Invite already sent to this email' }, { status: 409 });
      }

      if (!confirmInvite) {
        return NextResponse.json({ needsConfirm: true, email: cleanEmail }, { status: 200 });
      }

      const [invite] = await db.insert(pendingInvites).values({
        projectId,
        sharedBy: session.userId,
        invitedEmail: cleanEmail,
      }).returning();

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
        await sendEmail({
          to: cleanEmail,
          subject: `${session.name} shared "${project.name}" with you on DevDash`,
          html: inviteEmailHtml(session.name, project.name, appUrl),
        });
      } catch { /* email send failed but invite is still created */ }

      return NextResponse.json({ invited: true, invite }, { status: 201 });
    }

    const existing = await db.select().from(projectShares)
      .where(and(eq(projectShares.projectId, projectId), eq(projectShares.sharedWith, targetUser.id)));
    if (existing.length > 0) return NextResponse.json({ error: 'Already shared with this user' }, { status: 409 });

    const [share] = await db.insert(projectShares).values({
      projectId,
      sharedBy: session.userId,
      sharedWith: targetUser.id,
      allowTerminal: allowTerminal || false,
      port: port || null,
      rootPath: rootPath || '',
    }).returning();

    await createNotification({
      userId: targetUser.id,
      type: 'share',
      projectId,
      projectName: project.name,
      fromUserName: session.name,
      message: `${session.name} shared "${project.name}" with you`,
    });

    return NextResponse.json(share, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// DELETE — unsubscribe (shared with me) or remove user (shared by me)
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { shareId, pendingId } = await request.json();

    // Remove a pending invite (owner only)
    if (pendingId) {
      await db.delete(pendingInvites).where(
        and(eq(pendingInvites.id, pendingId), eq(pendingInvites.sharedBy, session.userId))
      );
      return NextResponse.json({ success: true });
    }

    if (!shareId) return NextResponse.json({ error: 'shareId required' }, { status: 400 });

    // Check if current user is the owner (sharedBy) or the recipient (sharedWith)
    const [share] = await db.select().from(projectShares).where(eq(projectShares.id, shareId));
    if (!share) return NextResponse.json({ error: 'Share not found' }, { status: 404 });

    if (share.sharedWith === session.userId || share.sharedBy === session.userId) {
      await db.delete(projectShares).where(eq(projectShares.id, shareId));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
