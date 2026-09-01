import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { users, machines, pendingInvites, projectShares } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { createSession, getSession, clearSession, switchMachine, wantsRawToken } from '@/lib/auth';
import {
  sendEmail, otpResetEmailHtml, otpResetCodeEmailHtml,
  enrollCodeEmailHtml, twoFactorEnabledEmailHtml, twoFactorResetEmailHtml,
} from '@/lib/email';
import { hashSecret, verifySecret, isHashed } from '@/lib/pin-hash';
import { cookies } from 'next/headers';
import { generateTotpSecret, buildOtpauthUri, verifyTotp } from '@/lib/totp';
import { encryptSecret, decryptSecret } from '@/lib/secret-crypto';
import { consumeBackupCode, parseBackupCodes, serializeBackupCodes, generateBackupCodes } from '@/lib/backup-codes';
import { issuePendingToken, verifyPendingToken, PENDING_COOKIE } from '@/lib/pending-token';
import { getAppSettings } from '@/lib/app-settings';
import { isFirstEverUser } from '@/lib/admin';
import { checkInvite, consumeInvite, inviteMatchesEmail } from '@/lib/signup-invites';
import {
  verifyTrustedCookieValue, issueTrustedCookieValue, generateDeviceTrustKey,
  TRUSTED_COOKIE, TRUSTED_DEVICE_DAYS,
} from '@/lib/trusted-device';

// Login brute-force protection.
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
// Emailed reset code.
const RESET_CODE_TTL_MINUTES = 15;
const MAX_RESET_ATTEMPTS = 5;
// Minimum gap between reset-code emails for one account (anti email-bombing).
const RESET_COOLDOWN_MS = 60_000;
// 2FA pending/trusted-device cookie lifetimes.
const TRUSTED_MAX_AGE = TRUSTED_DEVICE_DAYS * 24 * 60 * 60;
const PENDING_MAX_AGE = 5 * 60;

// An enrollment step is authorized by EITHER a full session (profile-initiated
// enable, or forced-on-load) OR a fresh pending-enroll token (right after
// login/registration). viaSession=true means we must re-check the PIN.
async function resolveEnrollActor(): Promise<{ userId: number; machineId: number; viaSession: boolean } | null> {
  const session = await getSession();
  if (session) return { userId: session.userId, machineId: session.machineId, viaSession: true };
  const cookieStore = await cookies();
  const claims = await verifyPendingToken(cookieStore.get(PENDING_COOKIE)?.value, 'enroll');
  if (claims) return { userId: claims.userId, machineId: claims.machineId, viaSession: false };
  return null;
}

// POST /api/auth — login, register, request-reset, confirm-reset, switch-machine, logout
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'login') {
      const { email, otpCode } = body;
      if (!email || !otpCode) return NextResponse.json({ error: 'Email and OTP required' }, { status: 400 });

      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (!user) return NextResponse.json({ error: 'Invalid email or code' }, { status: 401 });

      // Locked out?
      const now = Date.now();
      if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > now) {
        const mins = Math.max(1, Math.ceil((new Date(user.lockoutUntil).getTime() - now) / 60000));
        return NextResponse.json({ error: `Too many attempts. Try again in ${mins} min.` }, { status: 429 });
      }

      if (!verifySecret(otpCode, user.otpCode)) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          // Lock and reset the counter.
          await db.update(users)
            .set({ failedLoginAttempts: 0, lockoutUntil: new Date(now + LOCKOUT_MINUTES * 60000).toISOString() })
            .where(eq(users.id, user.id));
          return NextResponse.json({ error: `Too many attempts. Locked for ${LOCKOUT_MINUTES} min.` }, { status: 429 });
        }
        await db.update(users).set({ failedLoginAttempts: attempts }).where(eq(users.id, user.id));
        return NextResponse.json({ error: 'Invalid email or code' }, { status: 401 });
      }

      const userMachines = await db.select().from(machines).where(eq(machines.userId, user.id));
      if (userMachines.length === 0) return NextResponse.json({ error: 'No machines configured' }, { status: 400 });

      // PIN correct. Clear failure state and lazily upgrade a legacy plaintext PIN.
      const successPatch: Record<string, unknown> = {};
      if (user.failedLoginAttempts || user.lockoutUntil) {
        successPatch.failedLoginAttempts = 0;
        successPatch.lockoutUntil = null;
      }
      if (!isHashed(user.otpCode)) successPatch.otpCode = hashSecret(otpCode);
      if (Object.keys(successPatch).length > 0) {
        await db.update(users).set(successPatch).where(eq(users.id, user.id));
      }

      const cookieStore = await cookies();

      // Not enrolled yet → mandatory enrollment (no full session granted).
      if (!user.twoFactorEnabled) {
        const token = await issuePendingToken(user.id, userMachines[0].id, 'enroll');
        cookieStore.set(PENDING_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: PENDING_MAX_AGE });
        return NextResponse.json({
          pending: 'enroll',
          firstTime: false,
          ...(wantsRawToken(request) ? { pendingToken: token } : {}),
        });
      }

      // Enrolled + this device already trusted → straight to a full session.
      const trustCookie = cookieStore.get(TRUSTED_COOKIE)?.value;
      if (verifyTrustedCookieValue(trustCookie, user.id, user.deviceTrustKey)) {
        const token = await createSession(user.id, userMachines[0].id, user.email, user.name);
        return NextResponse.json({
          success: true,
          user: { id: user.id, name: user.name, email: user.email },
          machines: userMachines,
          ...(wantsRawToken(request) ? { token } : {}),
        });
      }

      // Enrolled, untrusted device → issue the 2FA challenge.
      const pendingToken = await issuePendingToken(user.id, userMachines[0].id, '2fa');
      cookieStore.set(PENDING_COOKIE, pendingToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: PENDING_MAX_AGE });
      return NextResponse.json({
        pending: '2fa',
        ...(wantsRawToken(request) ? { pendingToken } : {}),
      });
    }

    if (action === 'verify-2fa') {
      const { code, trustDevice } = body;
      if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

      const cookieStore = await cookies();
      const claims = await verifyPendingToken(
        (typeof body.pendingToken === 'string' && body.pendingToken) || cookieStore.get(PENDING_COOKIE)?.value,
        '2fa',
      );
      if (!claims) return NextResponse.json({ error: 'Session expired. Log in again.' }, { status: 401 });

      const [user] = await db.select().from(users).where(eq(users.id, claims.userId));
      if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEnc) {
        return NextResponse.json({ error: 'Session expired. Log in again.' }, { status: 401 });
      }

      const now = Date.now();
      if (user.twoFactorLockoutUntil && new Date(user.twoFactorLockoutUntil).getTime() > now) {
        const mins = Math.max(1, Math.ceil((new Date(user.twoFactorLockoutUntil).getTime() - now) / 60000));
        return NextResponse.json({ error: `Too many attempts. Try again in ${mins} min.` }, { status: 429 });
      }

      const secret = decryptSecret(user.twoFactorSecretEnc);
      const clean = String(code).replace(/\s/g, '');
      let ok = !!secret && verifyTotp(clean, secret);

      // Fall back to a one-time backup code.
      if (!ok) {
        const codes = parseBackupCodes(user.twoFactorBackupCodes);
        const res = consumeBackupCode(clean, codes);
        if (res.ok) {
          ok = true;
          await db.update(users).set({ twoFactorBackupCodes: serializeBackupCodes(res.updated) }).where(eq(users.id, user.id));
        }
      }

      if (!ok) {
        const attempts = (user.twoFactorAttempts || 0) + 1;
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          await db.update(users).set({ twoFactorAttempts: 0, twoFactorLockoutUntil: new Date(now + LOCKOUT_MINUTES * 60000).toISOString() }).where(eq(users.id, user.id));
          return NextResponse.json({ error: `Too many attempts. Locked for ${LOCKOUT_MINUTES} min.` }, { status: 429 });
        }
        await db.update(users).set({ twoFactorAttempts: attempts }).where(eq(users.id, user.id));
        return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
      }

      if (user.twoFactorAttempts || user.twoFactorLockoutUntil) {
        await db.update(users).set({ twoFactorAttempts: 0, twoFactorLockoutUntil: null }).where(eq(users.id, user.id));
      }

      cookieStore.delete(PENDING_COOKIE);
      const sessionToken = await createSession(user.id, claims.machineId, user.email, user.name);

      if (trustDevice && user.deviceTrustKey) {
        const value = issueTrustedCookieValue(user.id, user.deviceTrustKey);
        cookieStore.set(TRUSTED_COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: TRUSTED_MAX_AGE });
      }

      const userMachines = await db.select().from(machines).where(eq(machines.userId, user.id));
      return NextResponse.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email },
        machines: userMachines,
        ...(wantsRawToken(request) ? { token: sessionToken } : {}),
      });
    }

    if (action === 'enroll-request-code') {
      const actor = await resolveEnrollActor();
      if (!actor) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
      if (!user) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      // Session-driven (profile enable / forced-on-load) must prove the PIN.
      if (actor.viaSession) {
        const nowTs = Date.now();
        if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > nowTs) {
          const mins = Math.max(1, Math.ceil((new Date(user.lockoutUntil).getTime() - nowTs) / 60000));
          return NextResponse.json({ error: `Too many attempts. Try again in ${mins} min.` }, { status: 429 });
        }
        const { pin } = body;
        if (!verifySecret(String(pin || ''), user.otpCode)) {
          const attempts = (user.failedLoginAttempts || 0) + 1;
          if (attempts >= MAX_LOGIN_ATTEMPTS) {
            await db.update(users).set({ failedLoginAttempts: 0, lockoutUntil: new Date(nowTs + LOCKOUT_MINUTES * 60000).toISOString() }).where(eq(users.id, user.id));
            return NextResponse.json({ error: `Too many attempts. Locked for ${LOCKOUT_MINUTES} min.` }, { status: 429 });
          }
          await db.update(users).set({ failedLoginAttempts: attempts }).where(eq(users.id, user.id));
          return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
        }
        if (user.failedLoginAttempts || user.lockoutUntil) {
          await db.update(users).set({ failedLoginAttempts: 0, lockoutUntil: null }).where(eq(users.id, user.id));
        }
      }

      const now = Date.now();
      if (user.enrollCodeExpires) {
        const lastSent = new Date(user.enrollCodeExpires).getTime() - RESET_CODE_TTL_MINUTES * 60000;
        if (now - lastSent < RESET_COOLDOWN_MS) {
          return NextResponse.json({ success: true }); // within cooldown — no resend
        }
      }

      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      await db.update(users).set({
        enrollCode: hashSecret(code),
        enrollCodeExpires: new Date(now + RESET_CODE_TTL_MINUTES * 60000).toISOString(),
        enrollAttempts: 0,
      }).where(eq(users.id, user.id));
      try {
        await sendEmail({ to: user.email, subject: 'Your DevDash 2FA setup code', html: enrollCodeEmailHtml(user.name, code) });
      } catch { /* code stored regardless */ }
      return NextResponse.json({ success: true });
    }

    if (action === 'enroll-verify-email') {
      const actor = await resolveEnrollActor();
      if (!actor) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      const { code } = body;
      const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
      const now = Date.now();
      const live = !!user?.enrollCode && !!user?.enrollCodeExpires && new Date(user!.enrollCodeExpires!).getTime() > now;
      if (!user || !live || !verifySecret(String(code || '').trim(), user.enrollCode)) {
        if (user && live) {
          const attempts = (user.enrollAttempts || 0) + 1;
          if (attempts >= MAX_RESET_ATTEMPTS) {
            await db.update(users).set({ enrollCode: null, enrollCodeExpires: null, enrollAttempts: 0 }).where(eq(users.id, user.id));
          } else {
            await db.update(users).set({ enrollAttempts: attempts }).where(eq(users.id, user.id));
          }
        }
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }

      // Email proven → mint the pending TOTP secret and return QR + manual key.
      const secret = generateTotpSecret();
      await db.update(users).set({
        twoFactorPendingSecretEnc: encryptSecret(secret),
        enrollCode: null, enrollCodeExpires: null, enrollAttempts: 0,
      }).where(eq(users.id, user.id));
      const uri = buildOtpauthUri(secret, user.email);
      const qr = await QRCode.toDataURL(uri);
      return NextResponse.json({ secret, qr });
    }

    if (action === 'enroll-activate') {
      const actor = await resolveEnrollActor();
      if (!actor) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });

      const { code } = body;
      const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
      if (!user || !user.twoFactorPendingSecretEnc) {
        return NextResponse.json({ error: 'Start setup again' }, { status: 400 });
      }
      const secret = decryptSecret(user.twoFactorPendingSecretEnc);
      if (!secret || !verifyTotp(String(code || ''), secret)) {
        return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
      }

      const { plain, stored } = generateBackupCodes();
      await db.update(users).set({
        twoFactorEnabled: true,
        twoFactorSecretEnc: user.twoFactorPendingSecretEnc,
        twoFactorPendingSecretEnc: null,
        twoFactorBackupCodes: serializeBackupCodes(stored),
        deviceTrustKey: generateDeviceTrustKey(),
      }).where(eq(users.id, user.id));

      // Promote to a full session and clear the pending cookie (login/register path).
      const cookieStore = await cookies();
      cookieStore.delete(PENDING_COOKIE);
      const activatedToken = await createSession(user.id, actor.machineId, user.email, user.name);

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
        await sendEmail({ to: user.email, subject: 'Two-factor authentication enabled', html: twoFactorEnabledEmailHtml(user.name, appUrl) });
      } catch { /* non-fatal */ }

      const userMachines = await db.select().from(machines).where(eq(machines.userId, user.id));
      return NextResponse.json({
        success: true,
        backupCodes: plain,
        user: { id: user.id, name: user.name, email: user.email },
        machines: userMachines,
        ...(wantsRawToken(request) ? { token: activatedToken } : {}),
      });
    }

    if (action === 'register') {
      const { name, email, otpCode, machineName, inviteToken } = body;
      if (!name || !email || !otpCode || !machineName) {
        return NextResponse.json({ error: 'All fields required' }, { status: 400 });
      }
      if (!/^\d{4}$/.test(otpCode)) {
        return NextResponse.json({ error: 'OTP must be 4 digits' }, { status: 400 });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // ── The gate ──────────────────────────────────────────────────────────
      // Three ways in, checked in this order:
      //   1. the instance has no users at all — whoever set it up gets in, and
      //      becomes its admin, because otherwise a fresh install is a locked
      //      room with the key inside;
      //   2. open registration is switched on;
      //   3. a valid, unused, unexpired invite issued to this exact address.
      //
      // Enforced here and not only in the UI. Hiding the signup form is a
      // presentation choice; this is the policy, and it is the only thing
      // standing between a closed instance and anyone who can POST.
      const firstEver = await isFirstEverUser();
      const settings = await getAppSettings();

      let redeemInviteId: number | null = null;

      if (!firstEver && !settings.signupEnabled) {
        const token = typeof inviteToken === 'string' ? inviteToken.trim() : '';
        if (!token) {
          return NextResponse.json(
            { error: 'Registration is invite-only on this instance.', needsInvite: true },
            { status: 403 },
          );
        }

        const check = await checkInvite(token);
        // One message for every rejection. Distinguishing "expired" from "never
        // existed" tells a stranger that a token was real, which is the one
        // thing a guesser wants to learn.
        if (!check.ok || !check.invite) {
          return NextResponse.json(
            { error: 'That invite link is no longer valid. Ask for a new one.', needsInvite: true },
            { status: 403 },
          );
        }
        if (!inviteMatchesEmail(check.invite.email, normalizedEmail)) {
          return NextResponse.json(
            { error: `This invite is for ${check.invite.email}. Sign up with that address.` },
            { status: 403 },
          );
        }
        redeemInviteId = check.invite.id;
      }

      const existing = await db.select().from(users).where(eq(users.email, normalizedEmail));
      if (existing.length > 0) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

      const [user] = await db.insert(users).values({
        name: name.trim(),
        email: normalizedEmail,
        otpCode: hashSecret(otpCode),
        // The first account on an empty instance is its operator by definition:
        // they are the one who configured the database and the environment.
        isAdmin: firstEver,
      }).returning();

      // Burn the invite only once the account exists, and check that the burn
      // actually took. consumeInvite is conditional on used_at IS NULL, so two
      // people redeeming the same link concurrently cannot both get through —
      // the loser's account is removed rather than left orphaned.
      if (redeemInviteId !== null) {
        const burned = await consumeInvite(redeemInviteId, user.id);
        if (!burned) {
          await db.delete(users).where(eq(users.id, user.id));
          return NextResponse.json(
            { error: 'That invite link has already been used.', needsInvite: true },
            { status: 409 },
          );
        }
      }

      const [machine] = await db.insert(machines).values({
        userId: user.id,
        name: machineName.trim(),
      }).returning();

      // Resolve pending invites for this email
      const invites = await db.select().from(pendingInvites).where(eq(pendingInvites.invitedEmail, user.email));
      for (const inv of invites) {
        await db.insert(projectShares).values({
          projectId: inv.projectId,
          sharedBy: inv.sharedBy,
          sharedWith: user.id,
        });
      }
      if (invites.length > 0) {
        await db.delete(pendingInvites).where(eq(pendingInvites.invitedEmail, user.email));
      }

      const token = await issuePendingToken(user.id, machine.id, 'enroll');
      const cookieStore = await cookies();
      cookieStore.set(PENDING_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: PENDING_MAX_AGE });
      return NextResponse.json({
        pending: 'enroll', firstTime: true,
        user: { id: user.id, name: user.name, email: user.email },
        machines: [machine], resolvedInvites: invites.length,
      }, { status: 201 });
    }

    // Step 1 of reset: email a one-time verification code. Always returns a
    // generic success so it never reveals whether an email is registered.
    if (action === 'request-reset') {
      const { email } = body;
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (user) {
        const now = Date.now();
        const last = user.lastResetRequestAt ? new Date(user.lastResetRequestAt).getTime() : 0;
        // Anti email-bombing: at most one reset email per RESET_COOLDOWN_MS.
        // Within the window, no-op but still return the same generic success.
        if (now - last >= RESET_COOLDOWN_MS) {
          const code = String(randomInt(0, 1000000)).padStart(6, '0');
          const expires = new Date(now + RESET_CODE_TTL_MINUTES * 60000).toISOString();
          await db.update(users)
            .set({
              resetCode: hashSecret(code),
              resetCodeExpires: expires,
              resetAttempts: 0,
              lastResetRequestAt: new Date(now).toISOString(),
            })
            .where(eq(users.id, user.id));
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
            await sendEmail({
              to: user.email,
              subject: 'Your DevDash reset code',
              html: otpResetCodeEmailHtml(user.name, code, appUrl),
            });
          } catch { /* email send failed; the code is still stored */ }
        }
      }
      return NextResponse.json({ success: true });
    }

    // Step 2 of reset: verify the emailed code, then set the new 4-digit code.
    if (action === 'confirm-reset') {
      const { email, code, newOtpCode } = body;
      if (!email || !code || !newOtpCode) {
        return NextResponse.json({ error: 'Email, code and new OTP required' }, { status: 400 });
      }
      if (!/^\d{4}$/.test(newOtpCode)) return NextResponse.json({ error: 'OTP must be 4 digits' }, { status: 400 });

      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      const now = Date.now();
      const hasCode = !!user && !!user.resetCode && !!user.resetCodeExpires;
      const notExpired = hasCode && new Date(user!.resetCodeExpires!).getTime() > now;

      // Wrong or expired code → generic error (no enumeration, no which-part-failed).
      if (!user || !hasCode || !notExpired || !verifySecret(String(code).trim(), user.resetCode)) {
        // Count attempts against a live code; invalidate after too many tries.
        if (user && hasCode && notExpired) {
          const attempts = (user.resetAttempts || 0) + 1;
          if (attempts >= MAX_RESET_ATTEMPTS) {
            await db.update(users).set({ resetCode: null, resetCodeExpires: null, resetAttempts: 0 }).where(eq(users.id, user.id));
          } else {
            await db.update(users).set({ resetAttempts: attempts }).where(eq(users.id, user.id));
          }
        }
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }

      // Valid — set the new code, clear reset + lockout state (single-use).
      await db.update(users).set({
        otpCode: hashSecret(newOtpCode),
        resetCode: null,
        resetCodeExpires: null,
        resetAttempts: 0,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      }).where(eq(users.id, user.id));

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
        await sendEmail({
          to: user.email,
          subject: 'Your DevDash login code was changed',
          html: otpResetEmailHtml(user.name, appUrl),
        });
      } catch { /* confirmation email failed but reset succeeded */ }

      return NextResponse.json({ success: true });
    }

    // Step 1 of 2FA reset: email a one-time verification code. Reuses the
    // reset-flow columns; only acts if 2FA is actually enabled; generic
    // success so it never reveals whether an email is registered or 2FA-enrolled.
    if (action === 'reset-2fa-request') {
      const { email } = body;
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      if (user && user.twoFactorEnabled) {
        const now = Date.now();
        const last = user.twoFactorLastResetRequestAt ? new Date(user.twoFactorLastResetRequestAt).getTime() : 0;
        if (now - last >= RESET_COOLDOWN_MS) {
          const code = String(randomInt(0, 1000000)).padStart(6, '0');
          await db.update(users).set({
            twoFactorResetCode: hashSecret(code),
            twoFactorResetCodeExpires: new Date(now + RESET_CODE_TTL_MINUTES * 60000).toISOString(),
            twoFactorResetAttempts: 0,
            twoFactorLastResetRequestAt: new Date(now).toISOString(),
          }).where(eq(users.id, user.id));
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
            await sendEmail({ to: user.email, subject: 'Your DevDash 2FA reset code', html: otpResetCodeEmailHtml(user.name, code, appUrl) });
          } catch { /* stored regardless */ }
        }
      }
      return NextResponse.json({ success: true });
    }

    // Step 2 of 2FA reset: verify the emailed code, then disable 2FA and
    // rotate the trust key (revokes all trusted devices).
    if (action === 'reset-2fa-confirm') {
      const { email, code } = body;
      if (!email || !code) return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
      const now = Date.now();
      const live = !!user?.twoFactorResetCode && !!user?.twoFactorResetCodeExpires && new Date(user!.twoFactorResetCodeExpires!).getTime() > now;
      if (!user || !live || !verifySecret(String(code).trim(), user.twoFactorResetCode)) {
        if (user && live) {
          const attempts = (user.twoFactorResetAttempts || 0) + 1;
          if (attempts >= MAX_RESET_ATTEMPTS) {
            await db.update(users).set({ twoFactorResetCode: null, twoFactorResetCodeExpires: null, twoFactorResetAttempts: 0 }).where(eq(users.id, user.id));
          } else {
            await db.update(users).set({ twoFactorResetAttempts: attempts }).where(eq(users.id, user.id));
          }
        }
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }
      // Disable 2FA, wipe secrets, rotate the trust key (kills trusted devices).
      await db.update(users).set({
        twoFactorEnabled: false,
        twoFactorSecretEnc: null,
        twoFactorPendingSecretEnc: null,
        twoFactorBackupCodes: null,
        deviceTrustKey: null,
        twoFactorResetCode: null,
        twoFactorResetCodeExpires: null,
        twoFactorResetAttempts: 0,
      }).where(eq(users.id, user.id));
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:50051';
        await sendEmail({ to: user.email, subject: 'Two-factor authentication reset', html: twoFactorResetEmailHtml(user.name, appUrl) });
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true });
    }

    if (action === 'switch-machine') {
      const session = await getSession();
      if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

      const { machineId } = body;
      const token = await switchMachine(session.userId, machineId);
      if (!token) return NextResponse.json({ error: 'Invalid machine' }, { status: 400 });
      // The JWT is re-minted for the new machine, so a native client holding a
      // Bearer token must be given the replacement or it stays on the old one.
      return NextResponse.json({ success: true, ...(wantsRawToken(request) ? { token } : {}) });
    }

    if (action === 'add-machine') {
      const session = await getSession();
      if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

      const { machineName } = body;
      if (!machineName) return NextResponse.json({ error: 'Machine name required' }, { status: 400 });

      const [machine] = await db.insert(machines).values({
        userId: session.userId,
        name: machineName.trim(),
      }).returning();

      return NextResponse.json(machine, { status: 201 });
    }

    if (action === 'logout') {
      await clearSession();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// GET /api/auth — get current session info
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const userMachines = await db.select().from(machines).where(eq(machines.userId, session.userId));
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    const twoFactorEnabled = !!user?.twoFactorEnabled;

    return NextResponse.json({
      userId: session.userId,
      machineId: session.machineId,
      email: session.email,
      name: session.name,
      machines: userMachines,
      twoFactorEnabled,
      requires2faEnrollment: !twoFactorEnabled,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
