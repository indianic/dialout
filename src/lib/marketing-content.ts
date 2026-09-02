/**
 * Marketing copy, in one place.
 *
 * The pages render from this rather than hard-coding prose, so a feature that
 * is described on /features, /how-it-works and the homepage is described the
 * same way in all three. Copy source is docs/brand/product-inventory.md; voice
 * rules are docs/brand/brand-guidelines.md.
 *
 * Two rules from the brand doc that this file has to keep:
 *   - specific numbers, never adjectives
 *   - banned words: seamless, effortless, revolutionary, blazing-fast,
 *     unlock, supercharge, leverage (as a verb), 10x
 *
 * COUNTS is measured from the repo, not estimated. Re-measure before a
 * release; the commands are in the comment on each entry.
 */

export const GITHUB_URL = 'https://github.com/indianic/dialout';
export const CONTACT_EMAIL = 'hello@dialout.dev';
export const SECURITY_EMAIL = 'security@dialout.dev';

/** Measured 2026-08-31 against the repo. */
export const COUNTS = {
  /** find src/app/api -name route.ts | wc -l */
  apiRoutes: 38,
  /** grep -c 'pgTable(' src/lib/schema.ts */
  dbTables: 19,
  /** wc -l src/ws-server/index.ts */
  wsServerLines: 1753,
  /** grep -c '.command(' packages/dialout/src/cli.ts */
  agentCommands: 19,
  /** mobile screens under packages/devdash-mobile */
  mobileScreens: 18,
  /** AI vendors with a shipped adapter */
  aiVendors: 3,
  /** packages/dialout/package.json */
  agentVersion: '2.7.4',
} as const;

export interface Differentiator {
  id: string;
  title: string;
  claim: string;
  body: string;
}

/** The four things nothing else does together. These lead the site. */
export const DIFFERENTIATORS: Differentiator[] = [
  {
    id: 'outbound',
    title: 'The agent dials out',
    claim: 'No inbound ports, no VPN, no port forwarding.',
    body:
      'The agent connects out to your server and holds the socket open. There is no inbound port to open on the developer machine, no VPN to join, and no firewall rule to write. A laptop on hotel Wi-Fi is as reachable as a rack server. If the machine can reach the internet, you can reach the machine.',
  },
  {
    id: 'tmux',
    title: 'Terminals are real tmux',
    claim: 'Close the browser and the build keeps running.',
    body:
      'Not a web shell. Sessions survive browser reloads, network drops and app switches, and you can reattach from your phone. Open a terminal natively and you join the same session — the agent writes a guarded block into your shell rc so it just happens. A dropped socket detaches rather than kills: the PTY is held for 10 minutes so a reconnect resumes where you were.',
  },
  {
    id: 'ai',
    title: 'AI sessions read as chat',
    claim: 'It reads the transcript, it never scrapes the TUI.',
    body:
      'Claude Code, Codex and Grok each already write a structured JSONL transcript. The agent tails that file and normalises all three into one event type. Scraping the alternate-screen terminal UI would break on every upstream release; reading the transcript does not. Three vendors, one chat surface, across every machine you own.',
  },
  {
    id: 'tunnel',
    title: 'The tunnel rewrites the app',
    claim: 'Real apps work through it, not half-loaded ones.',
    body:
      'Absolute /_next/ and /api/ paths are rewritten in HTML, JS and CSS, and an injected script patches fetch, XMLHttpRequest, history.pushState, anchor clicks and the Navigation API. That is why a Next.js or PHP app served through a path prefix actually works instead of loading its shell and stalling.',
  },
];

export interface FeatureGroup {
  id: string;
  title: string;
  summary: string;
  items: { name: string; body: string }[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'projects',
    title: 'Projects',
    summary: 'Every project on every machine, with what is actually running right now.',
    items: [
      {
        name: 'Live port checks',
        body:
          'Every dashboard load checks every port. If the machine’s agent is online the check is batched through it; otherwise it falls back to an 800 ms TCP probe. Projects that are a URL rather than a port are checked through the tunnel.',
      },
      {
        name: 'Multi-machine projects',
        body:
          'One project can map onto several machines, with a per-machine port and root path where they differ.',
      },
      {
        name: 'Process control',
        body:
          'Start, stop and restart from the browser or the phone, using quick-launch commands you saved on the project.',
      },
      {
        name: 'Notes and todos',
        body:
          'Kept on the project, so the context travels with it instead of living in your head.',
      },
      {
        name: 'Credentials',
        body:
          'AES-256-GCM at rest. Never returned by a list endpoint — only by an explicit reveal route, behind Face ID on mobile.',
      },
      {
        name: 'Sharing',
        body:
          'Read-only access for a teammate, with comments and an optional terminal grant. Non-owners never get edit paths.',
      },
      {
        name: 'Discovery',
        body:
          'Scan a port range to find what is running. Scan a folder tree to find projects you never registered.',
      },
    ],
  },
  {
    id: 'terminals',
    title: 'Terminals',
    summary: 'tmux-backed, shared with your native terminal, resumable by name.',
    items: [
      { name: 'tmux-backed', body: 'Survives browser reloads, network drops and app switches.' },
      { name: 'Cowork', body: 'Your native terminal and the browser attach to the same session.' },
      {
        name: 'Resumable by name',
        body:
          'Session names are deterministic, so reopening a tab attaches to the running session instead of creating a duplicate.',
      },
      {
        name: 'Recording and playback',
        body: 'Sessions record to chunks and replay later, purged on a retention policy you set.',
      },
      {
        name: 'Local and web, split',
        body: 'The registry separates sessions you started natively from ones the browser opened.',
      },
      {
        name: 'Phone terminal',
        body: 'A real terminal on the phone, with a key-chip bar for the keys a soft keyboard does not have.',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI sessions',
    summary: 'Claude Code, Codex and Grok across your whole fleet, as chat.',
    items: [
      {
        name: 'Three vendors, one surface',
        body:
          'Each CLI has its own transcript layout and its own scheme for escaping the working directory. All three normalise to one event type.',
      },
      {
        name: 'Every machine, one list',
        body: 'See which agents are working, which are waiting on you, and which are idle.',
      },
      {
        name: 'Launch mode',
        body:
          'Start a session from your phone. Each message runs one turn and exits, so an agent restart loses nothing — the transcript is the state.',
      },
      {
        name: 'Push when it needs you',
        body:
          'A notification fires only on the working → waiting transition, with a two-minute cooldown, and never on a first sighting.',
      },
    ],
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    summary: 'Tunnels, files, services and machine enrolment.',
    items: [
      {
        name: 'HTTP tunnel',
        body:
          'Any local port, or a named vhost for PHP and static sites, on a public URL. 10 MB body cap, with styled pages for "machine offline" and "server not running".',
      },
      { name: 'File browser', body: 'Browse any machine’s filesystem from the dashboard.' },
      { name: 'System services', body: 'Track the services that are not projects.' },
      {
        name: 'Machines and API keys',
        body: 'Each machine enrols with an mch_ key, SHA-256 compared server-side.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account and platform',
    summary: 'Two-factor that is actually enforced, on web and on native.',
    items: [
      {
        name: 'PIN and mandatory TOTP',
        body:
          'Two-factor is enforced at the API layer, not only in the UI. The 2FA lockout counters are separate from the PIN ones on purpose.',
      },
      {
        name: 'Browser and native sessions',
        body:
          'One JWT, delivered as an HttpOnly cookie to browsers and as a bearer token to native clients. Page scripts can never read it.',
      },
      { name: 'Web push', body: 'For shares, comments, and AI sessions that are waiting on you.' },
      { name: 'PWA and mobile app', body: 'Installable web app, plus native iOS and Android builds.' },
      { name: 'Light and dark', body: 'Both contrast-measured, not one theme with the colours flipped.' },
    ],
  },
];

export interface UseCase {
  title: string;
  who: string;
  body: string;
}

export const USE_CASES: UseCase[] = [
  {
    title: 'Show a client the branch, right now',
    who: 'Agencies and freelancers',
    body:
      'Open a tunnel on the port the feature branch is running on and send the URL. No deploy, no staging environment to keep in sync, and no explaining why staging is three commits behind.',
  },
  {
    title: 'Keep a build running while you leave',
    who: 'Anyone with a long build',
    body:
      'The terminal is tmux. Close the laptop, open the phone app, and reattach to the same session. The build never knew you left.',
  },
  {
    title: 'Find out what is on port 3000',
    who: 'Anyone with more than one machine',
    body:
      'Scan a port range and see what answers. Scan a folder tree and register the projects you forgot you had. The dashboard then checks those ports on every load.',
  },
  {
    title: 'Watch a fleet of coding agents',
    who: 'Anyone running Claude Code, Codex or Grok',
    body:
      'One list of every AI session on every machine, showing which are working and which are waiting on a reply. Get a push when one needs you, rather than checking four terminals.',
  },
  {
    title: 'Hand a teammate read-only access',
    who: 'Small teams',
    body:
      'Share a project. They see it, they can comment, and they get a terminal only if you grant one. They never see an edit path, because the API does not have one for them.',
  },
  {
    title: 'Work from a machine you do not own',
    who: 'Anyone travelling',
    body:
      'The dashboard is a URL. Terminals, ports, files and AI sessions on your own machines, from a borrowed browser or the phone in your pocket.',
  },
];

export const AUDIENCES = [
  {
    title: 'Solo developers with more than one machine',
    body:
      'A laptop, a desktop, and a box under the desk. The problem is not any one of them — it is remembering which is running what.',
  },
  {
    title: 'Agencies and consultancies',
    body:
      'Many projects, many ports, many clients who want to see progress. Sharing is read-only by default and terminal access is a deliberate grant.',
  },
  {
    title: 'Small product teams',
    body:
      'Shared visibility into who is running what, without standing up a platform team to provide it.',
  },
  {
    title: 'People running AI coding agents',
    body:
      'Claude Code, Codex and Grok sessions across machines, read as chat, with a push when one is waiting on you.',
  },
  {
    title: 'Anyone who self-hosts on principle',
    body:
      'One Postgres database and two Node processes on your own server. Nothing is held back for a paid tier, and self-hosting is what this is built for — an account on dialout.dev is a convenience, not the product.',
  },
];

export const INTEGRATIONS = [
  { name: 'tmux', body: 'Every terminal is a real tmux session. Cowork attaches your native shell to the same one.' },
  { name: 'Claude Code', body: 'Sessions read as chat from the JSONL transcript the CLI already writes.' },
  { name: 'Codex', body: 'Date-partitioned rollout transcripts, normalised to the same event type.' },
  { name: 'Grok', body: 'Reads the pid-to-session map the CLI publishes, so two sessions in one folder cannot collide.' },
  { name: 'PostgreSQL', body: `One database, ${COUNTS.dbTables} tables, on your server. Your data does not leave it.` },
  { name: 'PM2', body: 'The deployment runs the web app and the WebSocket process as two PM2 apps.' },
  { name: 'launchd and systemd', body: 'The agent installs as a service on macOS and Linux, with a cron watchdog.' },
  { name: 'Web Push (VAPID)', body: 'Notifications for shares, comments and AI sessions. Disabled, not broken, when unset.' },
  { name: 'Apache, Nginx or Caddy', body: 'Any reverse proxy that can forward a WebSocket upgrade.' },
];

/**
 * Getting started, end to end — account first, then the machine.
 *
 * Written for two readers at once rather than in two versions. `plain` says
 * what happens in words a non-technical reader can follow; `detail` and
 * `command` are the specifics an engineer wants. Splitting these into separate
 * pages means one of them goes stale, and it is always the plain one.
 *
 * The order matters and is the thing the old copy got wrong: it opened with
 * `npm install`, which is step four. You cannot connect a machine before you
 * have an account and a key for it to use.
 */
export interface GettingStartedStep {
  title: string;
  /** One sentence, no jargon. This is the line a non-technical reader reads. */
  plain: string;
  /** The specifics. Shown underneath, smaller. */
  detail: string;
  /** Present only on the steps that are literally a command to run. */
  command?: string;
  note?: string;
  /** Where this step happens, so nobody runs step 4 on the wrong computer. */
  where: 'browser' | 'machine';
}

export const GETTING_STARTED: GettingStartedStep[] = [
  {
    title: 'Get an account',
    plain: 'Sign up on dialout.dev, or run your own copy — both give you the same thing.',
    detail:
      'New accounts on dialout.dev are invite-only while we help each person get set up, so ask for one and we will send you a link. If you would rather not wait, Dialout is MIT licensed: clone it, point it at a PostgreSQL database, and you are your own instance.',
    where: 'browser',
  },
  {
    title: 'Set up sign-in',
    plain: 'Choose a 4-digit code and scan a QR code with your phone. Takes two minutes.',
    detail:
      'Two-factor is required, not optional, and is enforced by the API rather than only hidden in the interface. This is a tool that opens terminals on your computers — an account with one factor is not one worth having.',
    where: 'browser',
  },
  {
    title: 'Add your first computer',
    plain:
      'Tell Dialout which computer you want to reach — your office desktop, your home machine, whatever it is — and it gives you a key to copy.',
    detail:
      'Settings → Machines → Add machine, then Generate key. The key starts with mch_ and is shown once, because only its hash is stored. Name the machine something you will recognise from a phone.',
    where: 'browser',
  },
  {
    title: 'Install the agent on that computer',
    plain: 'One command, on the computer you just added. Not on the one you are browsing from.',
    detail:
      'A small program that runs in the background. macOS and Linux, Node 18 or newer.',
    command: 'npm install -g @indianic/dialout',
    note: 'Run this on the computer you want to reach',
    where: 'machine',
  },
  {
    title: 'Paste the key',
    plain: 'It asks two questions: where your Dialout is, and the key you just copied.',
    detail:
      'Server URL is the WebSocket address of your instance — wss://www.dialout.dev/ws, or your own. Then it offers to start itself automatically whenever the computer boots, which is what you want on a machine you are trying to reach from somewhere else.',
    command: 'dialout init',
    note: 'Choose "start at boot" when it asks',
    where: 'machine',
  },
  {
    title: 'That is it',
    plain:
      'The computer turns green in your dashboard. You can now see its ports, open a terminal on it, and read your AI sessions — from any browser or your phone.',
    detail:
      'Repeat steps 3 to 5 for every other computer you want in the room. Nothing was opened on your network to make this work: the agent dials out and holds the connection open.',
    command: 'dialout status',
    note: 'Confirms it is connected',
    where: 'machine',
  },
];

/** The agent commands alone, for the docs and the install page. */
export const INSTALL_STEPS = [
  {
    title: 'Install the agent',
    command: 'npm install -g @indianic/dialout',
    note: 'macOS and Linux',
  },
  {
    title: 'Point it at your server',
    command: 'dialout init',
    note: 'Asks for the server URL and an mch_ key from Settings → Machines',
  },
  {
    title: 'Install it as a service',
    command: 'dialout install-service',
    note: 'launchd on macOS, systemd on Linux, plus a cron watchdog',
  },
  {
    title: 'Check it is connected',
    command: 'dialout status',
    note: 'The machine turns green in the dashboard',
  },
];

export const FAQ = [
  {
    q: 'Do I have to open a port on my laptop?',
    a: 'No. The agent connects outbound to your server and holds the socket open. Nothing connects in to the developer machine, so there is no port to open, no VPN to join and no firewall rule to write.',
  },
  {
    q: 'Where does my data live?',
    a: 'If you self-host — which is what Dialout is built for — everything lives in your own PostgreSQL database, on your own server, with no telemetry. If you use an account on dialout.dev instead, your data is in that instance. Either way, credentials, 2FA secrets and machine API keys are AES-256-GCM encrypted at rest.',
  },
  {
    q: 'What do I need to run it?',
    a: 'A server that can run Node and PostgreSQL, and a reverse proxy that can forward a WebSocket upgrade. The web app runs on port 50051 and the WebSocket process on 50052.',
  },
  {
    q: 'Is the terminal a real terminal?',
    a: 'Yes — every session is tmux. Close the browser and it keeps running. Attach from your native terminal and you are in the same session.',
  },
  {
    q: 'What happens if my connection drops mid-session?',
    a: 'A dropped socket detaches, it does not kill. The PTY is held for 10 minutes so a reconnect resumes where you were. Past that the tmux session is still running and you reattach to it by name.',
  },
  {
    q: 'Does it work on Windows?',
    a: 'The server runs anywhere Node runs. The agent ships for macOS and Linux only, because it depends on tmux and on process inspection that has no Windows equivalent yet.',
  },
  {
    q: 'How do I get started?',
    a: 'Get an account — sign up on dialout.dev, or run your own copy from GitHub. Set a 4-digit code and two-factor. Add your first computer in Settings and copy the key it gives you. Then, on that computer, run npm install -g @indianic/dialout followed by dialout init and paste the key. It turns green in your dashboard. About ten minutes end to end.',
  },
  {
    q: 'Why is signing up invite-only?',
    a: 'Because we would rather help a few people get properly set up than let a lot of people bounce off a half-configured instance. Ask for access and you will get a link. Or skip the queue entirely — the whole thing is open source and you can run it yourself today.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes, MIT licensed, with no feature held back for a paid tier. We sell installation on your infrastructure, and enterprise support and development — not the software.',
  },
  {
    q: 'Can I use it for a team?',
    a: 'Yes. Each person has their own account and their own machines, and projects can be shared read-only, with comments and an optional terminal grant.',
  },
];
