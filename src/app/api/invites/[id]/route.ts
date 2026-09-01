import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signupInvites } from '@/lib/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

/**
 * Revoke an invite that has not been used.
 *
 * Revoking sets a timestamp rather than deleting the row, so "who invited whom,
 * and what happened to it" stays answerable. A deleted row would make an
 * invite that was pulled back indistinguishable from one that never existed.
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // The id alone says nothing about who may touch it, so the UPDATE is scoped
  // to the owner as well — an id from someone else's invite list must not be
  // reachable here. An admin may revoke any invite, which is the one case where
  // the ownership clause is deliberately dropped.
  const admin = await isAdmin(session.userId);

  const changed = await db
    .update(signupInvites)
    .set({ revokedAt: sql`now()` })
    .where(
      admin
        ? and(eq(signupInvites.id, id), isNull(signupInvites.usedAt))
        : and(
            eq(signupInvites.id, id),
            eq(signupInvites.invitedBy, session.userId),
            isNull(signupInvites.usedAt),
          ),
    )
    .returning({ id: signupInvites.id });

  // 404 rather than 403 when it is not theirs, so invite ids are not
  // enumerable by watching the status code change.
  if (changed.length === 0) {
    return NextResponse.json({ error: 'Not found, or already used.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
