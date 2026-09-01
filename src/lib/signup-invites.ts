import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { db } from './db';
import { signupInvites } from './schema';
import { and, eq, isNull, sql } from 'drizzle-orm';

/** Fourteen days. Long enough to survive a holiday, short enough that a link
 *  forwarded into a public channel a month later is already dead. */
export const INVITE_TTL_DAYS = 14;

export type InviteSource = 'manual' | 'request';

export interface MintedInvite {
  id: number;
  /** The plaintext token. Exists exactly once, in the email. Never stored. */
  token: string;
  email: string;
  expiresAt: string;
}

/**
 * A signup invite is a bearer credential, so it follows the same rule as a
 * machine API key: the database holds only a SHA-256 hash, and a leaked row is
 * not redeemable. 32 random bytes is well past guessing range, and base64url
 * keeps it safe to drop straight into a URL.
 */
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Plain SHA-256, matching how machine API keys are stored — NOT the salted
 * scrypt in `pin-hash.ts`.
 *
 * The difference matters and is easy to get wrong: scrypt is salted, so it
 * returns a different digest every call and can only ever be *verified* against
 * a known row. Redemption has no row yet — it has to find one by token — so the
 * digest must be deterministic. Salting is what makes scrypt right for a
 * 4-digit PIN, and a 256-bit random token has nothing to slow an attacker down
 * for in the first place.
 */
function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function expiryIso(days = INVITE_TTL_DAYS): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function mintInvite(opts: {
  email: string;
  invitedBy: number | null;
  source: InviteSource;
  note?: string;
}): Promise<MintedInvite> {
  const token = newToken();
  const email = opts.email.toLowerCase().trim();
  const expiresAt = expiryIso();

  const [row] = await db
    .insert(signupInvites)
    .values({
      tokenHash: tokenHash(token),
      email,
      invitedBy: opts.invitedBy,
      source: opts.source,
      note: opts.note?.slice(0, 500) ?? '',
      expiresAt,
    })
    .returning();

  return { id: row.id, token, email, expiresAt };
}

export type InviteRejection =
  | 'not_found'
  | 'used'
  | 'revoked'
  | 'expired';

export interface InviteCheck {
  ok: boolean;
  reason?: InviteRejection;
  invite?: { id: number; email: string; expiresAt: string };
}

/**
 * Look an invite up by its plaintext token.
 *
 * The lookup is by hash, which is unique-indexed, so this is one row and one
 * index probe — it sits on the signup page's first render and must not scan.
 *
 * Rejection reasons are distinguished for the *caller*, not for the visitor:
 * the signup page says "this link is no longer valid" either way. Telling a
 * stranger apart "expired" from "not found" confirms that a token existed.
 */
export async function checkInvite(token: string): Promise<InviteCheck> {
  if (!token || token.length < 16 || token.length > 200) return { ok: false, reason: 'not_found' };

  const rows = await db
    .select()
    .from(signupInvites)
    .where(eq(signupInvites.tokenHash, tokenHash(token)))
    .limit(1);

  if (rows.length === 0) return { ok: false, reason: 'not_found' };
  const row = rows[0];

  if (row.revokedAt) return { ok: false, reason: 'revoked' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  return { ok: true, invite: { id: row.id, email: row.email, expiresAt: row.expiresAt } };
}

/**
 * Burn the invite, atomically.
 *
 * The UPDATE carries `used_at IS NULL` in its WHERE clause and reports how many
 * rows it changed, so two requests redeeming the same token concurrently cannot
 * both succeed — the loser gets zero rows and is told the invite is spent.
 * Checking first and updating second would leave exactly that race open, and an
 * invite that can be redeemed twice is not an invite.
 */
export async function consumeInvite(inviteId: number, userId: number): Promise<boolean> {
  const changed = await db
    .update(signupInvites)
    .set({ usedAt: sql`now()`, usedByUserId: userId })
    .where(and(eq(signupInvites.id, inviteId), isNull(signupInvites.usedAt)))
    .returning({ id: signupInvites.id });
  return changed.length === 1;
}

/**
 * Does this invite authorise this email address?
 *
 * An invite is locked to one address so that forwarding it does not transfer
 * it. Compared in constant time out of habit rather than necessity — the value is
 * not secret, but the comparison sits next to ones that are, and a mixed
 * convention is how the wrong one gets copied.
 */
export function inviteMatchesEmail(inviteEmail: string, candidate: string): boolean {
  const a = Buffer.from(inviteEmail.toLowerCase().trim());
  const b = Buffer.from(candidate.toLowerCase().trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Where an invite link has to land: `/login`, not `/`.
 *
 * `/` is the marketing home page — it renders no signup form and reads no
 * query string, so a token sent there is silently dropped and the recipient
 * sees a product pitch instead of the account they were invited to make.
 * `/login` is the route that mounts LoginPage, which is what looks for the
 * `invite` parameter.
 */
export function inviteUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/login?invite=${encodeURIComponent(token)}`;
}
