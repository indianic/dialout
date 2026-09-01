import { pgTable, serial, text, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  otpCode: text('otp_code').notNull(),
  createdAt: text('created_at').default(sql`now()`),
  // Password-reset verification (emailed 6-digit code, single-use, time-limited).
  resetCode: text('reset_code'),
  resetCodeExpires: text('reset_code_expires'),
  resetAttempts: integer('reset_attempts').default(0),
  lastResetRequestAt: text('last_reset_request_at'),
  // Login brute-force protection.
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  lockoutUntil: text('lockout_until'),
  // Two-factor (TOTP authenticator app).
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  twoFactorSecretEnc: text('two_factor_secret_enc'),          // AES-256-GCM (secret-crypto.ts)
  twoFactorPendingSecretEnc: text('two_factor_pending_secret_enc'), // held during enrollment
  twoFactorBackupCodes: text('two_factor_backup_codes'),      // JSON: {hash, usedAt}[]
  deviceTrustKey: text('device_trust_key'),                   // rotates to revoke trusted devices
  // Emailed OTP that gates the QR step during 2FA enrollment.
  enrollCode: text('enroll_code'),
  enrollCodeExpires: text('enroll_code_expires'),
  enrollAttempts: integer('enroll_attempts').default(0),
  // Change-email re-verification (code sent to the NEW address).
  pendingEmail: text('pending_email'),
  emailChangeCode: text('email_change_code'),
  emailChangeExpires: text('email_change_expires'),
  // 2FA email reset — separate columns from the PIN reset so a code minted for
  // one flow can never be redeemed by the other (cross-purpose redemption).
  twoFactorResetCode: text('two_factor_reset_code'),
  twoFactorResetCodeExpires: text('two_factor_reset_code_expires'),
  twoFactorResetAttempts: integer('two_factor_reset_attempts').default(0),
  twoFactorLastResetRequestAt: text('two_factor_last_reset_request_at'),

  // Dedicated 2FA-guess rate limiting — MUST be separate from the PIN-login
  // failedLoginAttempts/lockoutUntil, which login clears on every correct PIN
  // (reusing them lets a PIN-holder reset the 2FA lockout and brute-force TOTP).
  twoFactorAttempts: integer('two_factor_attempts').default(0),
  twoFactorLockoutUntil: text('two_factor_lockout_until'),

  // Instance administrator: may open or close registration, and approve access
  // requests. Self-hosting means there is nobody above the first account, so
  // the migration backfills the lowest user id and `register` grants it to the
  // very first account on an empty instance. ADMIN_EMAILS in the environment
  // is the recovery path when that row is wrong.
  isAdmin: boolean('is_admin').default(false),
});

export const machines = pgTable('machines', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  name: text('name').notNull(),
  hidden: boolean('hidden').default(false),
  terminalNameTemplate: text('terminal_name_template'),
  terminalPreviewLines: integer('terminal_preview_lines').default(3),
  createdAt: text('created_at').default(sql`now()`),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  machineId: integer('machine_id'),
  name: text('name').notNull(),
  port: integer('port'),
  addonPorts: text('addon_ports').default(''),
  url: text('url').default(''),
  techStack: text('tech_stack').default(''),
  description: text('description').default(''),
  startDate: text('start_date'),
  runner: text('runner').default('npm'),
  status: text('status').default('active'),
  tags: text('tags').default(''),
  notes: text('notes').default(''),
  rootPath: text('root_path').default(''),
  startCommand: text('start_command').default(''),
  stopCommand: text('stop_command').default(''),
  restartCommand: text('restart_command').default(''),
  runInBackground: boolean('run_in_background').default(true),
  isRunning: boolean('is_running').default(false),
  lastChecked: text('last_checked'),
  createdAt: text('created_at').default(sql`now()`),
  updatedAt: text('updated_at').default(sql`now()`),
});

export const systemServices = pgTable('system_services', {
  id: serial('id').primaryKey(),
  machineId: integer('machine_id'),
  name: text('name').notNull(),
  port: integer('port').notNull(),
  description: text('description').default(''),
  createdAt: text('created_at').default(sql`now()`),
});

export const projectNotes = pgTable('project_notes', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  title: text('title').default(''),
  content: text('content').default(''),
  tags: text('tags').default(''),
  isArchived: boolean('is_archived').default(false),
  createdAt: text('created_at').default(sql`now()`),
  updatedAt: text('updated_at').default(sql`now()`),
});

export const projectTodos = pgTable('project_todos', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  text: text('text').notNull(),
  priority: text('priority').default('medium'),
  isDone: boolean('is_done').default(false),
  isArchived: boolean('is_archived').default(false),
  createdAt: text('created_at').default(sql`now()`),
  updatedAt: text('updated_at').default(sql`now()`),
});

export const projectShares = pgTable('project_shares', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  sharedBy: integer('shared_by').notNull(),
  sharedWith: integer('shared_with').notNull(),
  allowTerminal: boolean('allow_terminal').default(false),
  port: integer('port'),
  rootPath: text('root_path').default(''),
  createdAt: text('created_at').default(sql`now()`),
});

export const shareComments = pgTable('share_comments', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  userId: integer('user_id').notNull(),
  userName: text('user_name').default(''),
  content: text('content').notNull(),
  createdAt: text('created_at').default(sql`now()`),
});

export const pendingInvites = pgTable('pending_invites', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  sharedBy: integer('shared_by').notNull(),
  invitedEmail: text('invited_email').notNull(),
  createdAt: text('created_at').default(sql`now()`),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  type: text('type').notNull(), // 'share' | 'comment'
  projectId: integer('project_id').notNull(),
  projectName: text('project_name').default(''),
  fromUserName: text('from_user_name').default(''),
  message: text('message').default(''),
  isRead: boolean('is_read').default(false),
  createdAt: text('created_at').default(sql`now()`),
});

export const projectMachines = pgTable('project_machines', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  machineId: integer('machine_id').notNull(),
  port: integer('port'),
  addonPorts: text('addon_ports').default(''),
  rootPath: text('root_path').default(''),
  createdAt: text('created_at').default(sql`now()`),
});

export const machineApiKeys = pgTable('machine_api_keys', {
  id: serial('id').primaryKey(),
  machineId: integer('machine_id').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyEnc: text('key_enc'), // AES-256-GCM encrypted key for copy-from-UI (see secret-crypto.ts)
  createdAt: text('created_at').default(sql`now()`),
  lastUsedAt: text('last_used_at'),
});

export const terminalSessions = pgTable('terminal_sessions', {
  id: serial('id').primaryKey(),
  machineId: integer('machine_id').notNull(),
  userId: integer('user_id').notNull(),
  projectId: integer('project_id'),
  command: text('command').notNull(),
  cwd: text('cwd').notNull(),
  startedAt: text('started_at').default(sql`now()`),
  endedAt: text('ended_at'),
  exitCode: integer('exit_code'),
  // Phase 2 (cowork): live tmux-session registry fields — additive only.
  tmuxName: text('tmux_name'),
  termProgram: text('term_program'),
  origin: text('origin'), // 'native' | 'browser'
  isLive: boolean('is_live').default(false),
  lastActiveAt: text('last_active_at'),
  // Server-side receipt time of the last agent report for this session. Unlike
  // lastActiveAt (tmux session activity, which is old for idle-but-alive shells)
  // this refreshes on every report, so a stale row can be detected reliably.
  lastSeenAt: text('last_seen_at'),
  cols: integer('cols'),
  rows: integer('rows'),
  // Terminal naming/preview facts — additive only.
  folder: text('folder'),
  folderPath: text('folder_path'),
  createdLocal: text('created_local'),
  gitBranch: text('git_branch'),
  lastLines: text('last_lines'),
});

export const terminalChunks = pgTable('terminal_chunks', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull(),
  timestamp: integer('timestamp').notNull(),
  type: text('type').notNull(),
  data: text('data').notNull(),
});

export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  recordSessions: boolean('record_sessions').default(true),
  retentionDays: integer('retention_days').default(15),
  defaultCommands: text('default_commands').default('[]'),
});

export const projectCommands = pgTable('project_commands', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  label: text('label').notNull(),
  command: text('command').notNull(),
  sortOrder: integer('sort_order').default(0),
});

export const projectCredentials = pgTable('project_credentials', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  environment: text('environment').default('local'), // 'local' | 'live'
  kind: text('kind').default('login'),               // 'login' | 'email' | 'api' | 'db' | 'other'
  label: text('label').default(''),
  backendUrl: text('backend_url').default(''),
  username: text('username').default(''),
  secretEnc: text('secret_enc').default(''),          // AES-256-GCM ciphertext (never returned in lists)
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`now()`),
  updatedAt: text('updated_at').default(sql`now()`),
});

export const scanHistory = pgTable('scan_history', {
  id: serial('id').primaryKey(),
  fromPort: integer('from_port'),
  toPort: integer('to_port'),
  found: text('found'),
  scannedAt: text('scanned_at').default(sql`now()`),
});

// Web push endpoints, one row per browser/device a user has subscribed from.
// Keyed by endpoint because that is what the push service issues and what
// uniquely identifies a device; a user can have several.
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent').default(''),
  createdAt: text('created_at').default(sql`now()`),
  // web = VAPID endpoint; fcm/apns = native device token stored in deviceToken
  // (and mirrored into endpoint as `fcm:<token>` so the unique index still
  // de-duplicates a re-subscribe).
  platform: text('platform').default('web'),
  deviceToken: text('device_token').default(''),
});

// Marketing enquiries from the public contact and enterprise forms.
//
// The row is written before any email is attempted, deliberately. Delivery is
// the part most likely to fail — SMTP unset on a fresh install, a bad
// credential, a provider outage — and an enquiry that only ever existed as an
// email is an enquiry lost. `notifiedAt` records whether the admin
// notification actually went out, so a failure is visible rather than silent.
//
// This is the only table written by an unauthenticated request. Everything on
// it is user-supplied and must be treated as untrusted when rendered.
export const enquiries = pgTable('enquiries', {
  id: serial('id').primaryKey(),
  // 'contact' | 'enterprise' — which form it came from.
  kind: text('kind').notNull().default('contact'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').default(''),
  phone: text('phone').default(''),
  message: text('message').notNull(),
  // Enterprise-only qualifying answers; empty for a general contact enquiry.
  machines: text('machines').default(''),
  teamSize: text('team_size').default(''),
  hosting: text('hosting').default(''),
  securityReview: boolean('security_review').default(false),
  // Where the form was submitted from, for attribution.
  sourcePage: text('source_page').default(''),
  userAgent: text('user_agent').default(''),
  // Set when the admin notification email was sent. Null means it was never
  // delivered and the enquiry needs picking up out of the table by hand.
  notifiedAt: text('notified_at'),
  createdAt: text('created_at').default(sql`now()`),
});

// ─── Gated signup ────────────────────────────────────────────────────────────
// A self-hosted instance and a public one need opposite defaults: the person
// who installs this wants to be the only account, while dialout.dev wants a
// front door it can open and close. One global row settles it for both, and it
// is deliberately NOT in user_settings — those are per-user preferences, and
// "can strangers register" is not a preference, it is instance policy.
//
// Single row, id always 1. Reads go through src/lib/app-settings.ts, which
// seeds it on first read so a fresh database has no bootstrap step.
export const appSettings = pgTable('app_settings', {
  id: integer('id').primaryKey().default(1),
  // Open registration. Off by default: a new instance that is reachable before
  // its owner has finished setting it up must not accept strangers.
  signupEnabled: boolean('signup_enabled').default(false),
  // Show the "request early access" route on the marketing site. Independent of
  // signupEnabled — the usual public posture is closed signup plus an open
  // request queue, which is exactly these two flags in opposite positions.
  trialEnabled: boolean('trial_enabled').default(false),
  // Copy shown on the marketing site when signup is closed, so the operator can
  // explain the wait without a redeploy. Empty falls back to built-in wording.
  closedSignupNote: text('closed_signup_note').default(''),
  updatedAt: text('updated_at').default(sql`now()`),
  updatedBy: integer('updated_by'),
});

// An invitation to create an account. The token is stored ONLY as a SHA-256
// hash, the same rule machine_api_keys follows: a leaked database row must not
// be redeemable. The plaintext exists once, in the email.
//
// Single-use is enforced by usedAt rather than by deleting the row, so an
// admin can still see who invited whom after the fact.
export const signupInvites = pgTable('signup_invites', {
  id: serial('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  // Locked to one address. The signup form shows it read-only, so an invite
  // forwarded to someone else still lands on the person who was invited.
  email: text('email').notNull(),
  invitedBy: integer('invited_by'),          // null when the system issued it
  // 'manual'   — a user invited a colleague from Settings
  // 'request'  — an admin approved an early-access request
  source: text('source').notNull().default('manual'),
  note: text('note').default(''),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  usedByUserId: integer('used_by_user_id'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').default(sql`now()`),
});

// A request from the marketing site to be let in. Kept separate from
// `enquiries` on purpose: an enquiry is a message someone reads and replies to,
// while this is a queue item with a state machine and a side effect (approving
// one mints an invite). Merging them would put a status column on a table where
// most rows can never have a status.
export const accessRequests = pgTable('access_requests', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').default(''),
  role: text('role').default(''),
  machineCount: text('machine_count').default(''),
  useCase: text('use_case').default(''),
  // 'pending' | 'approved' | 'declined'
  status: text('status').notNull().default('pending'),
  reviewedBy: integer('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  // The invite minted on approval, so the queue can show whether it was used.
  inviteId: integer('invite_id'),
  sourcePage: text('source_page').default(''),
  userAgent: text('user_agent').default(''),
  createdAt: text('created_at').default(sql`now()`),
});
