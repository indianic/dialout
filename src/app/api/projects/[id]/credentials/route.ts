import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectCredentials } from '@/lib/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { encryptSecret } from '@/lib/secret-crypto';
import { canAccessProjectCredentials, isProjectOwner } from '@/lib/project-access';

const VALID_ENVIRONMENTS = ['local', 'live'];
const VALID_KINDS = ['login', 'email', 'api', 'db', 'other'];

// mode 'read' → owner or shared-with (GET); mode 'manage' → owner only (POST/PUT/DELETE).
async function authorize(idParam: string, mode: 'read' | 'manage'): Promise<{ projectId: number; userId: number } | { error: NextResponse }> {
  const projectId = parseInt(idParam, 10);
  if (Number.isNaN(projectId)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const ok = mode === 'manage'
    ? await isProjectOwner(session.userId, projectId)
    : await canAccessProjectCredentials(session.userId, projectId);
  if (!ok) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { projectId, userId: session.userId };
}

// GET — list credentials WITHOUT secrets (owner or shared-with)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'read');
  if ('error' in auth) return auth.error;

  const rows = await db.select().from(projectCredentials)
    .where(eq(projectCredentials.projectId, auth.projectId))
    .orderBy(asc(projectCredentials.sortOrder), asc(projectCredentials.id));

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    environment: r.environment,
    kind: r.kind,
    label: r.label,
    backendUrl: r.backendUrl,
    username: r.username,
    hasSecret: !!r.secretEnc,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
}

// POST — create (owner only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { environment, kind, label, backendUrl, username, secret } = body;

  if (environment !== undefined && !VALID_ENVIRONMENTS.includes(environment)) {
    return NextResponse.json({ error: 'invalid environment' }, { status: 400 });
  }
  if (kind !== undefined && !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  const [created] = await db.insert(projectCredentials).values({
    projectId: auth.projectId,
    environment: environment || 'local',
    kind: kind || 'login',
    label: label || '',
    backendUrl: backendUrl || '',
    username: username || '',
    secretEnc: secret ? encryptSecret(String(secret)) : '',
    sortOrder: body.sortOrder ?? 0,
  }).returning();

  return NextResponse.json({ id: created.id, hasSecret: !!created.secretEnc }, { status: 201 });
}

// PUT — update by { credentialId, ...fields }. If `secret` present, re-encrypt; if absent, leave stored secret.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const credentialId = parseInt(body.credentialId, 10);
  if (Number.isNaN(credentialId)) return NextResponse.json({ error: 'credentialId required' }, { status: 400 });

  if (body.environment !== undefined && !VALID_ENVIRONMENTS.includes(body.environment)) {
    return NextResponse.json({ error: 'invalid environment' }, { status: 400 });
  }
  if (body.kind !== undefined && !VALID_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const f of ['environment', 'kind', 'label', 'backendUrl', 'username', 'sortOrder'] as const) {
    if (body[f] !== undefined) set[f] = body[f];
  }
  if (typeof body.secret === 'string') set.secretEnc = body.secret ? encryptSecret(body.secret) : '';

  const updated = await db.update(projectCredentials).set(set)
    .where(and(eq(projectCredentials.id, credentialId), eq(projectCredentials.projectId, auth.projectId)))
    .returning();

  if (updated.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}

// DELETE — remove by { credentialId }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, 'manage');
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const credentialId = parseInt(body.credentialId, 10);
  if (Number.isNaN(credentialId)) return NextResponse.json({ error: 'credentialId required' }, { status: 400 });

  const deleted = await db.delete(projectCredentials)
    .where(and(eq(projectCredentials.id, credentialId), eq(projectCredentials.projectId, auth.projectId)))
    .returning();

  if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
