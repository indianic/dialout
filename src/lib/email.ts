import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Dialout'}" <${process.env.FROM_EMAIL || 'noreply@dialout.dev'}>`,
    to,
    subject,
    html,
  });
}

// Escape user/data-derived values before interpolating into email HTML, to
// prevent markup injection / content-spoofing in notification emails.
function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Shared light-mode shell ──────────────────────────────────────────────────
// A clean, professional light template. `eyebrow` is the small caps label,
// `body` is the inner HTML for the message.
function shell(eyebrow: string, body: string): string {
  const brand = process.env.FROM_NAME || 'Dialout';
  return `
  <div style="background:#f2f3f7; padding:28px 0; margin:0;">
    <div style="font-family:'Helvetica Neue',Arial,sans-serif; max-width:480px; margin:0 auto; background:#ffffff; border:1px solid #e6e7ee; border-radius:14px; overflow:hidden;">
      <!-- Header -->
      <div style="background:#ffffff; border-bottom:1px solid #eef0f5; padding:26px 32px; text-align:center;">
        <div style="font-family:'Helvetica Neue',Arial,sans-serif; font-weight:700; font-size:28px; letter-spacing:-0.5px; color:#17191f; margin-bottom:4px;">Dialout</div>
        <div style="font-family:monospace; font-size:9px; letter-spacing:3px; color:#a2a4b4;">YOUR MACHINES, ONE ROOM</div>
      </div>
      <!-- Body -->
      <div style="padding:32px;">
        <div style="font-family:monospace; font-size:10px; letter-spacing:2px; color:#8b8d9c; margin-bottom:16px;">${eyebrow}</div>
        ${body}
      </div>
      <!-- Footer -->
      <div style="background:#fafbfc; border-top:1px solid #eef0f5; padding:16px 32px; text-align:center;">
        <div style="font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:2px;">Dialout &mdash; ${brand}</div>
      </div>
    </div>
  </div>`;
}

function ctaButton(href: string, label: string): string {
  return `
    <div style="text-align:center; margin:8px 0 4px;">
      <a href="${href}" target="_blank" style="display:inline-block; font-family:monospace; font-size:11px; font-weight:700; letter-spacing:2px; background:#17191f; color:#ffffff; text-decoration:none; padding:12px 34px; border-radius:8px;">
        ${label}
      </a>
    </div>`;
}

// Project share invite (light).
export function inviteEmailHtml(inviterName: string, projectName: string, appUrl: string): string {
  return shell('PROJECT INVITE', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:18px;">
      <strong>${escHtml(inviterName)}</strong> has shared the project
      <strong style="color:#1a56db;">${escHtml(projectName)}</strong> with you on Dialout.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:26px;">
      Register with this email to view the project, its notes, todos, and leave comments.
    </div>
    ${ctaButton(appUrl, 'OPEN DIALOUT')}
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      If you did not expect this invite, you can ignore this email.
    </div>
  `);
}

// Reset verification code (light) — the code the user must enter to reset.
export function otpResetCodeEmailHtml(name: string, code: string, appUrl: string): string {
  return shell('RESET VERIFICATION', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${escHtml(name)}</strong>, use the code below to reset your Dialout login code.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:22px;">
      Enter it on the reset screen to choose a new 4-digit code. This code expires in 15 minutes.
    </div>
    <!-- Code -->
    <div style="text-align:center; margin-bottom:22px;">
      <div style="display:inline-block; font-family:'Courier New',monospace; font-size:34px; font-weight:700; letter-spacing:10px; color:#111225; background:#f4f2ff; border:1px solid #e4defb; border-radius:12px; padding:16px 26px;">
        ${escHtml(code)}
      </div>
    </div>
    ${ctaButton(appUrl, 'OPEN DIALOUT')}
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      If you did not request this, ignore this email — your code will not change.
    </div>
  `);
}

// Reset confirmation (light) — sent after the code is successfully set.
export function otpResetEmailHtml(name: string, appUrl: string): string {
  return shell('CODE UPDATED', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${escHtml(name)}</strong>, your Dialout login code was changed successfully.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:26px;">
      You can now log in with your new 4-digit code. If this wasn't you, reset it again immediately.
    </div>
    ${ctaButton(appUrl, 'LOG IN TO DEVDASH')}
  `);
}

// 2FA enrollment code (light) — gates the QR step / verifies email ownership.
export function enrollCodeEmailHtml(name: string, code: string): string {
  return shell('2FA SETUP CODE', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${escHtml(name)}</strong>, enter the code below to continue setting up two-factor authentication.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:22px;">
      After this you'll scan a QR code with your authenticator app. This code expires in 15 minutes.
    </div>
    <div style="text-align:center; margin-bottom:22px;">
      <div style="display:inline-block; font-family:'Courier New',monospace; font-size:34px; font-weight:700; letter-spacing:10px; color:#111225; background:#f4f2ff; border:1px solid #e4defb; border-radius:12px; padding:16px 26px;">
        ${escHtml(code)}
      </div>
    </div>
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      If you did not start this, ignore this email.
    </div>
  `);
}

// Email-change verification code (light) — sent to the NEW address.
export function emailChangeCodeEmailHtml(name: string, code: string): string {
  return shell('CONFIRM NEW EMAIL', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${escHtml(name)}</strong>, use the code below to confirm this as your new Dialout email.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:22px;">
      Enter it on the profile screen. This code expires in 15 minutes.
    </div>
    <div style="text-align:center; margin-bottom:22px;">
      <div style="display:inline-block; font-family:'Courier New',monospace; font-size:34px; font-weight:700; letter-spacing:10px; color:#111225; background:#f4f2ff; border:1px solid #e4defb; border-radius:12px; padding:16px 26px;">
        ${escHtml(code)}
      </div>
    </div>
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      If you did not request this, ignore this email.
    </div>
  `);
}

// 2FA enabled confirmation (light).
export function twoFactorEnabledEmailHtml(name: string, appUrl: string): string {
  return shell('2FA ENABLED', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${escHtml(name)}</strong>, two-factor authentication is now active on your Dialout account.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:26px;">
      You'll be asked for a code from your authenticator app when you log in on an untrusted device. Keep your backup codes somewhere safe.
    </div>
    ${ctaButton(appUrl, 'OPEN DIALOUT')}
  `);
}

// 2FA reset/disabled notice (light) — sent after an email-based reset.
export function twoFactorResetEmailHtml(name: string, appUrl: string): string {
  return shell('2FA RESET', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${escHtml(name)}</strong>, two-factor authentication was reset and is now disabled on your account.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:26px;">
      Log in with your email and 4-digit code, then set up 2FA again from your profile. If this wasn't you, reset your 4-digit code immediately.
    </div>
    ${ctaButton(appUrl, 'LOG IN TO DEVDASH')}
  `);
}

// Notice sent to the OLD address after an email change (its own template — not
// the code template).
export function emailChangedNoticeHtml(name: string, newEmail: string): string {
  return shell('EMAIL CHANGED', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:8px;">
      Hi <strong>${escHtml(name)}</strong>, the email on your Dialout account was just changed to <strong>${escHtml(newEmail)}</strong>.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:8px;">
      If you made this change, no action is needed. If you did not, reset your 4-digit code immediately.
    </div>
  `);
}

// ── Enquiry forms (public contact + enterprise) ──────────────────────────────
// Two emails per submission: an acknowledgement to the person who wrote in,
// and a notification to whoever handles enquiries. Both render user-supplied
// text, so every interpolation goes through escHtml — this is the only mail in
// the app built from an unauthenticated request.

export interface EnquiryFields {
  kind: 'contact' | 'enterprise';
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message: string;
  machines?: string;
  teamSize?: string;
  hosting?: string;
  securityReview?: boolean;
  sourcePage?: string;
}

/** Sent to the person who submitted the form. */
export function enquiryAckEmailHtml(fields: EnquiryFields, appUrl: string): string {
  const isEnterprise = fields.kind === 'enterprise';
  return shell(isEnterprise ? 'ENTERPRISE ENQUIRY' : 'MESSAGE RECEIVED', `
    <p style="font-size:15px; color:#1c1f27; margin:0 0 14px;">Hi ${escHtml(fields.name)},</p>
    <p style="font-size:14px; line-height:1.6; color:#5b6274; margin:0 0 14px;">
      Thanks for getting in touch. Your ${isEnterprise ? 'enterprise enquiry' : 'message'} has
      reached us and a person will reply — usually within one working day.
    </p>
    <p style="font-size:14px; line-height:1.6; color:#5b6274; margin:0 0 6px;">Here is what you sent:</p>
    <div style="background:#f7f8fa; border:1px solid #eef0f5; border-radius:10px; padding:14px 16px; margin:0 0 18px;">
      <div style="font-family:monospace; font-size:12px; line-height:1.7; color:#5b6274; white-space:pre-wrap;">${escHtml(fields.message)}</div>
    </div>
    <p style="font-size:14px; line-height:1.6; color:#5b6274; margin:0 0 18px;">
      In the meantime, everything is installable today — nothing sits behind this conversation.
    </p>
    ${ctaButton(appUrl + '/docs/quick-start', 'QUICK START')}
    <p style="font-size:12px; line-height:1.6; color:#8b8d9c; margin:20px 0 0;">
      If you did not send this, you can ignore it — nothing was created and no account exists.
    </p>
  `);
}

/** Sent to whoever handles enquiries. */
export function enquiryNotifyEmailHtml(fields: EnquiryFields): string {
  const row = (label: string, value?: string) =>
    value && value.trim()
      ? `<tr>
           <td style="padding:5px 12px 5px 0; font-family:monospace; font-size:11px; color:#8b8d9c; vertical-align:top; white-space:nowrap;">${escHtml(label)}</td>
           <td style="padding:5px 0; font-size:13px; color:#1c1f27; vertical-align:top;">${escHtml(value)}</td>
         </tr>`
      : '';

  const isEnterprise = fields.kind === 'enterprise';
  return shell(isEnterprise ? 'NEW ENTERPRISE ENQUIRY' : 'NEW CONTACT ENQUIRY', `
    <p style="font-size:15px; color:#1c1f27; margin:0 0 16px;">
      ${escHtml(fields.name)}${fields.company ? ' &middot; ' + escHtml(fields.company) : ''}
    </p>
    <table style="width:100%; border-collapse:collapse; margin:0 0 18px;">
      ${row('Email', fields.email)}
      ${row('Phone', fields.phone)}
      ${row('Company', fields.company)}
      ${row('Machines', fields.machines)}
      ${row('Team size', fields.teamSize)}
      ${row('Hosting', fields.hosting)}
      ${isEnterprise ? row('Security review', fields.securityReview ? 'Yes' : 'No') : ''}
      ${row('From page', fields.sourcePage)}
    </table>
    <div style="background:#f7f8fa; border:1px solid #eef0f5; border-radius:10px; padding:14px 16px;">
      <div style="font-family:monospace; font-size:12px; line-height:1.7; color:#1c1f27; white-space:pre-wrap;">${escHtml(fields.message)}</div>
    </div>
    <p style="font-size:12px; line-height:1.6; color:#8b8d9c; margin:18px 0 0;">
      Reply straight to ${escHtml(fields.email)}. The enquiry is also stored in the
      <span style="font-family:monospace;">enquiries</span> table.
    </p>
  `);
}

// ─── Gated signup ────────────────────────────────────────────────────────────

// The invite itself. The link is the credential, so this email says plainly
// that it works once and for one address — a recipient who forwards it to a
// colleague should learn that from the email, not from a failed signup.
export function signupInviteEmailHtml(
  inviterName: string,
  recipientEmail: string,
  link: string,
  expiresInDays: number,
): string {
  return shell('YOU ARE INVITED', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:14px;">
      <strong>${escHtml(inviterName)}</strong> has invited you to Dialout — one place to
      reach every computer you code on, from any browser or your phone.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:24px;">
      Registration is invite-only right now, so this link is your way in.
      It works <strong>once</strong>, only for <strong>${escHtml(recipientEmail)}</strong>,
      and expires in ${expiresInDays} days.
    </div>
    ${ctaButton(link, 'CREATE MY ACCOUNT')}
    <div style="font-size:12px; color:#6b6d7e; line-height:1.6; margin-top:22px;">
      Setting up takes about ten minutes: create your account, add a machine, install the
      agent on it with <code style="font-family:monospace; background:#f4f5f8; padding:2px 6px; border-radius:4px;">npm install -g @indianic/dialout</code>,
      and it appears in your dashboard.
    </div>
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      If you were not expecting this, you can ignore this email. Nothing happens until you use the link.
    </div>
  `);
}

// Acknowledgement for someone who asked for access. Deliberately promises a
// human decision rather than a timeframe — an unattended queue that promised
// "within 24 hours" is worse than one that promised nothing.
export function accessRequestAckEmailHtml(name: string): string {
  return shell('REQUEST RECEIVED', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:14px;">
      Thanks <strong>${escHtml(name)}</strong> — your request for access to Dialout is in.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:8px;">
      Someone reviews these by hand. When it is approved you will get a second email with a
      link to create your account.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6;">
      In the meantime everything is open source, so you can also self-host it today —
      the code and the setup guide are on GitHub.
    </div>
    <div style="border-top:1px solid #eef0f5; margin-top:26px; padding-top:18px; font-family:monospace; font-size:9px; color:#b6b8c6; letter-spacing:1px;">
      Questions? Reply to this email.
    </div>
  `);
}

// Admin notification that a request is waiting. Carries enough to triage
// without opening the dashboard, because the whole point of the queue is that
// somebody actually gets to it.
export function accessRequestAdminEmailHtml(
  fields: { name: string; email: string; company?: string; role?: string; machineCount?: string; useCase?: string },
  reviewUrl: string,
): string {
  const row = (label: string, value?: string) => value
    ? `<tr><td style="padding:6px 12px 6px 0; font-family:monospace; font-size:10px; color:#9598a8; letter-spacing:1px; vertical-align:top; white-space:nowrap;">${label}</td><td style="padding:6px 0; font-size:13px; color:#1f2033;">${escHtml(value)}</td></tr>`
    : '';
  return shell('ACCESS REQUEST', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:18px;">
      <strong>${escHtml(fields.name)}</strong> has requested access.
    </div>
    <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
      ${row('EMAIL', fields.email)}
      ${row('COMPANY', fields.company)}
      ${row('ROLE', fields.role)}
      ${row('MACHINES', fields.machineCount)}
      ${row('USE CASE', fields.useCase)}
    </table>
    ${ctaButton(reviewUrl, 'REVIEW THE QUEUE')}
  `);
}

// Approval. The link is a real invite token, so this is the same credential
// rules as signupInviteEmailHtml — say so.
export function accessApprovedEmailHtml(
  name: string,
  recipientEmail: string,
  link: string,
  expiresInDays: number,
): string {
  return shell('YOU ARE IN', `
    <div style="font-size:15px; color:#1f2033; line-height:1.6; margin-bottom:14px;">
      Good news, <strong>${escHtml(name)}</strong> — your request for Dialout access was approved.
    </div>
    <div style="font-size:13px; color:#6b6d7e; line-height:1.6; margin-bottom:24px;">
      Use the link below to create your account. It works <strong>once</strong>, only for
      <strong>${escHtml(recipientEmail)}</strong>, and expires in ${expiresInDays} days.
    </div>
    ${ctaButton(link, 'CREATE MY ACCOUNT')}
    <div style="font-size:12px; color:#6b6d7e; line-height:1.6; margin-top:22px;">
      After you sign up: add a machine in Settings, copy the key it gives you, then run
      <code style="font-family:monospace; background:#f4f5f8; padding:2px 6px; border-radius:4px;">npm install -g @indianic/dialout</code>
      on that computer and paste the key when it asks. That is the whole setup.
    </div>
  `);
}
