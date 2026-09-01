import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq, and, ne } from 'drizzle-orm';
import { getSession, createSession } from '@/lib/auth';
import { hashSecret, verifySecret } from '@/lib/pin-hash';
import { verifyTotp } from '@/lib/totp';
import { decryptSecret } from '@/lib/secret-crypto';
import { generateBackupCodes, serializeBackupCodes } from '@/lib/backup-codes';
import { generateDeviceTrustKey, TRUSTED_COOKIE } from '@/lib/trusted-device';
import { sendEmail, emailChangeCodeEmailHtml, emailChangedNoticeHtml } from '@/lib/email';

const CODE_TTL_MINUTES = 15;

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { action } = body;
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (action === 'update-name') {
      const name = String(body.name || '').trim();
      if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
      await db.update(users).set({ name }).where(eq(users.id, user.id));
      await createSession(user.id, session.machineId, user.email, name); // refresh session name
      return NextResponse.json({ success: true, name });
    }

    if (action === 'change-pin') {
      const { currentPin, newPin } = body;
      if (!verifySecret(String(currentPin || ''), user.otpCode)) {
        return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 });
      }
      if (!/^\d{4}$/.test(String(newPin || ''))) {
        return NextResponse.json({ error: 'New PIN must be 4 digits' }, { status: 400 });
      }
      await db.update(users).set({ otpCode: hashSecret(newPin) }).where(eq(users.id, user.id));
      return NextResponse.json({ success: true });
    }

    if (action === 'request-email-change') {
      const newEmail = String(body.newEmail || '').toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
        return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
      }
      const taken = await db.select().from(users).where(and(eq(users.email, newEmail), ne(users.id, user.id)));
      if (taken.length > 0) return NextResponse.json({ error: 'That email is already in use' }, { status: 409 });

      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      await db.update(users).set({
        pendingEmail: newEmail,
        emailChangeCode: hashSecret(code),
        emailChangeExpires: new Date(Date.now() + CODE_TTL_MINUTES * 60000).toISOString(),
      }).where(eq(users.id, user.id));
      try {
        await sendEmail({ to: newEmail, subject: 'Confirm your new DevDash email', html: emailChangeCodeEmailHtml(user.name, code) });
      } catch { /* stored regardless */ }
      return NextResponse.json({ success: true });
    }

    if (action === 'confirm-email-change') {
      const { code } = body;
      const now = Date.now();
      const live = !!user.pendingEmail && !!user.emailChangeCode && !!user.emailChangeExpires
        && new Date(user.emailChangeExpires).getTime() > now;
      if (!live || !verifySecret(String(code || '').trim(), user.emailChangeCode)) {
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
      }
      const oldEmail = user.email;
      const newEmail = user.pendingEmail!;
      const taken = await db.select().from(users).where(and(eq(users.email, newEmail), ne(users.id, user.id)));
      if (taken.length > 0) return NextResponse.json({ error: 'That email is now in use' }, { status: 409 });
      await db.update(users).set({
        email: newEmail, pendingEmail: null, emailChangeCode: null, emailChangeExpires: null,
      }).where(eq(users.id, user.id));
      await createSession(user.id, session.machineId, newEmail, user.name); // session carries email
      try {
        await sendEmail({ to: oldEmail, subject: 'Your DevDash email was changed', html: emailChangedNoticeHtml(user.name, newEmail) });
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, email: newEmail });
    }

    if (action === 'disable-2fa') {
      const { pin, totp } = body;
      if (!user.twoFactorEnabled) return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
      if (!verifySecret(String(pin || ''), user.otpCode)) {
        return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
      }
      const secret = user.twoFactorSecretEnc ? decryptSecret(user.twoFactorSecretEnc) : null;
      if (!secret || !verifyTotp(String(totp || ''), secret)) {
        return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 401 });
      }
      await db.update(users).set({
        twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorPendingSecretEnc: null,
        twoFactorBackupCodes: null, deviceTrustKey: null,
      }).where(eq(users.id, user.id));
      (await cookies()).delete(TRUSTED_COOKIE);
      return NextResponse.json({ success: true });
    }

    if (action === 'regenerate-backup-codes') {
      const { totp } = body;
      const secret = user.twoFactorEnabled && user.twoFactorSecretEnc ? decryptSecret(user.twoFactorSecretEnc) : null;
      if (!secret || !verifyTotp(String(totp || ''), secret)) {
        return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 401 });
      }
      const { plain, stored } = generateBackupCodes();
      await db.update(users).set({ twoFactorBackupCodes: serializeBackupCodes(stored) }).where(eq(users.id, user.id));
      return NextResponse.json({ success: true, backupCodes: plain });
    }

    if (action === 'revoke-trusted-devices') {
      await db.update(users).set({ deviceTrustKey: user.twoFactorEnabled ? generateDeviceTrustKey() : null }).where(eq(users.id, user.id));
      (await cookies()).delete(TRUSTED_COOKIE);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
