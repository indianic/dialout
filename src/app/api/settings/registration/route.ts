import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getAppSettings, updateAppSettings } from '@/lib/app-settings';

/**
 * Read and write the instance registration policy. Admin only.
 *
 * Kept apart from `/api/settings`, which is per-user preferences. Two things
 * that both answer to the word "settings" but have different owners, different
 * authorization and different blast radius should not share a route — the day
 * they do is the day a preference PATCH quietly opens registration.
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!(await isAdmin(session.userId))) {
    // 404, not 403: whether this instance has an admin surface is not something
    // a signed-in non-admin needs confirmed.
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { session };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  return NextResponse.json(await getAppSettings());
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Only booleans and one capped string get through. Spreading the body would
  // let a caller write `id` or `updatedBy` and rewrite the row's provenance.
  const patch: Parameters<typeof updateAppSettings>[0] = {};
  if (typeof body.signupEnabled === 'boolean') patch.signupEnabled = body.signupEnabled;
  if (typeof body.trialEnabled === 'boolean') patch.trialEnabled = body.trialEnabled;
  if (typeof body.closedSignupNote === 'string') {
    patch.closedSignupNote = body.closedSignupNote.trim().slice(0, 500);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const next = await updateAppSettings(patch, gate.session!.userId);
  return NextResponse.json(next);
}
