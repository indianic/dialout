import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectCredentials } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { decryptSecret } from '@/lib/secret-crypto';
import { canAccessProjectCredentials } from '@/lib/project-access';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; credId: string }> }) {
  const { id, credId } = await params;
  const projectId = parseInt(id, 10);
  const credentialId = parseInt(credId, 10);
  if (Number.isNaN(projectId) || Number.isNaN(credentialId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await canAccessProjectCredentials(session.userId, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [row] = await db.select().from(projectCredentials)
    .where(and(eq(projectCredentials.id, credentialId), eq(projectCredentials.projectId, projectId)));
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const secret = row.secretEnc ? decryptSecret(row.secretEnc) : '';
  if (secret === null) return NextResponse.json({ error: 'Could not decrypt' }, { status: 500 });

  return NextResponse.json({ secret });
}
