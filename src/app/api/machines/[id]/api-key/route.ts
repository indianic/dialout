import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { machineApiKeys, machines } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import { encryptSecret, decryptSecret } from '@/lib/secret-crypto';
import { getSession } from '@/lib/auth';

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = 'mch_' + randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 8);
  return { raw, hash, prefix };
}

// Require a logged-in session that owns the given machine.
// Returns the parsed machineId on success, or a NextResponse to return on failure.
async function requireMachineOwner(
  idParam: string
): Promise<{ machineId: number } | { error: NextResponse }> {
  const machineId = parseInt(idParam, 10);
  if (isNaN(machineId)) {
    return { error: NextResponse.json({ error: 'Invalid machine ID' }, { status: 400 }) };
  }

  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const [machine] = await db.select().from(machines).where(eq(machines.id, machineId));
  if (!machine) {
    return { error: NextResponse.json({ error: 'Machine not found' }, { status: 404 }) };
  }
  if (machine.userId !== session.userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { machineId };
}

// POST — generate or regenerate API key for a machine
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMachineOwner(id);
  if ('error' in auth) return auth.error;
  const { machineId } = auth;

  // Delete existing key if any
  await db.delete(machineApiKeys).where(eq(machineApiKeys.machineId, machineId));

  // Generate new key
  const { raw, hash, prefix } = generateApiKey();

  await db.insert(machineApiKeys).values({
    machineId,
    keyHash: hash,
    keyPrefix: prefix,
    keyEnc: encryptSecret(raw),
  });

  // Return the raw key — this is the only time it's visible
  return NextResponse.json({
    apiKey: raw,
    prefix,
    message: 'Save this key — it will not be shown again.',
  });
}

// GET — show key metadata (prefix, creation date) without revealing the key
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMachineOwner(id);
  if ('error' in auth) return auth.error;
  const { machineId } = auth;

  const [key] = await db
    .select()
    .from(machineApiKeys)
    .where(eq(machineApiKeys.machineId, machineId));

  if (!key) {
    return NextResponse.json({ hasKey: false });
  }

  return NextResponse.json({
    hasKey: true,
    prefix: key.keyPrefix,
    key: key.keyEnc ? decryptSecret(key.keyEnc) : null,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  });
}

// DELETE — revoke the API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireMachineOwner(id);
  if ('error' in auth) return auth.error;
  const { machineId } = auth;

  await db.delete(machineApiKeys).where(eq(machineApiKeys.machineId, machineId));

  return NextResponse.json({ success: true });
}
