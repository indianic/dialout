'use client';

import Link from 'next/link';
import { LifeBuoy, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/dashboard/PageHeader';
import HelpArticle, { HelpSection, Steps, Note } from '@/components/help/HelpArticle';

// One long article rather than a grid of feature cards. Someone opening Help
// has a question, not a shopping list — they scan headings for their word
// ("terminal", "port", "share") and read the two paragraphs under it. A card
// grid makes every topic look equally important and holds about a sentence
// each, which is never enough to actually answer anything.
const SECTIONS = [
  { id: 'what', label: 'What Dialout is' },
  { id: 'pieces', label: 'The three pieces' },
  { id: 'machines', label: 'Machines' },
  { id: 'projects', label: 'Projects' },
  { id: 'terminals', label: 'Terminals' },
  { id: 'ai', label: 'AI Sessions' },
  { id: 'scanner', label: 'Scanner' },
  { id: 'services', label: 'Services' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'tunnel', label: 'Public links' },
  { id: 'security', label: 'Signing in safely' },
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader
        title="Help"
        subtitle="What everything does, in plain language."
        icon={<LifeBuoy size={20} />}
        actions={
          <Link className="btn-grad" href="/help/agent">
            Install the agent <ArrowRight size={16} />
          </Link>
        }
      />

      <HelpArticle sections={SECTIONS}>
        <HelpSection id="what" title="What Dialout is">
          <p>
            If you write software, your work is scattered. One project runs on your laptop, another
            on the office desktop, a third on a server somewhere. Each one uses a different port,
            has its own start command, and half of them you have to open a terminal and{' '}
            <code>ssh</code> in just to check whether they are still running.
          </p>
          <p>
            Dialout puts all of that on one screen. It keeps a list of your projects across every
            computer you work on, tells you at a glance which ones are running right now, and lets
            you open a real terminal on any of those machines from this browser tab — including
            from your phone.
          </p>
          <p>
            Nothing is a simulation. When you open a terminal here you are typing into a real shell
            on a real machine, and when Dialout says a project is running it has just checked the
            port a moment ago.
          </p>
        </HelpSection>

        <HelpSection id="pieces" title="The three pieces">
          <p>
            It helps to know what talks to what, because it explains why things sometimes say
            &ldquo;machine offline&rdquo;.
          </p>
          <ol className="help-flow">
            <li>
              <strong>Your machines.</strong> Your laptop, your desktop, your servers. This is where
              your code actually lives and runs.
            </li>
            <li>
              <strong>The agent.</strong> A small program you install once on each machine. It is
              the only thing that can see that machine, and it{' '}
              <strong>calls out</strong> to the Dialout server rather than waiting to be called.
            </li>
            <li>
              <strong>This dashboard.</strong> What you are looking at. It never touches your
              machines directly — it asks the agent, and the agent answers.
            </li>
          </ol>
          <Note>
            That middle piece is why Dialout needs no port forwarding, no VPN, and no open ports on
            your machine. Nothing on the internet can reach your laptop; your laptop reaches out.
            If a machine shows as offline, it almost always means the agent is not running there —
            see <Link href="/help/agent">the agent guide</Link>.
          </Note>
        </HelpSection>

        <HelpSection id="machines" title="Machines">
          <p>
            A machine is one computer. Everything else — projects, terminals, API keys — belongs to
            a machine, and the machine picker at the top of the sidebar decides which one you are
            looking at.
          </p>
          <Steps
            items={[
              'Go to Machines and press Add Machine. Give it a name you will recognise, like "MacBook Pro" or "build-box".',
              'Generate an API key for it. This is the password the agent uses to prove it is that machine.',
              'Install the agent on the machine itself and paste the key in. The full walkthrough is on the agent page.',
              'The dot next to the machine turns green once its agent connects.',
            ]}
          />
          <p>
            A green dot means the agent is connected right now. A grey one means it is not — the
            machine may be asleep, off, or the agent may have stopped.
          </p>
        </HelpSection>

        <HelpSection id="projects" title="Projects">
          <p>
            A project is one thing you are building: a website, an API, an app. You tell Dialout its
            name, which folder it lives in, and which port it runs on, and from then on the projects
            list shows you whether it is up.
          </p>
          <p>
            Every time you load the list, Dialout actually checks each port — it does not trust a
            cached answer. Green means something is listening on that port right now.
          </p>
          <p>Open a project and you get everything attached to it in one place:</p>
          <ul>
            <li>
              <strong>Notes</strong> — anything you need to remember about it.
            </li>
            <li>
              <strong>Todos</strong> — a short list of what is left.
            </li>
            <li>
              <strong>Credentials</strong> — logins and keys, encrypted, hidden until you press
              reveal.
            </li>
            <li>
              <strong>Commands</strong> — your own start, stop and restart commands, so you can
              start the project from a button instead of typing.
            </li>
          </ul>
          <p>
            If you would rather not add projects one by one, the Scanner can find them for you.
          </p>
        </HelpSection>

        <HelpSection id="terminals" title="Terminals">
          <p>
            This is the part people use most. You can open a real terminal on any machine that has
            the agent running, straight from the browser, and type into it exactly as you would
            locally.
          </p>
          <p>The Terminals page has two tabs, and the difference matters:</p>
          <ul>
            <li>
              <strong>Local</strong> — terminal windows you opened yourself, in your own terminal
              app on that machine. They show up here so you can pick one up from another device.
            </li>
            <li>
              <strong>Web</strong> — terminals you started inside Dialout. These keep running after
              you close the browser tab, so a long job carries on and you can resume it later.
            </li>
          </ul>
          <p>
            On a Local session you get two choices. <strong>Peek</strong> watches without touching
            anything — useful when a build is running and you only want to see the output.{' '}
            <strong>Drive</strong> lets you type, and whatever you type appears in the real terminal
            window too, as if you were sat in front of it.
          </p>
          <Note>
            Web terminals survive closing the tab, losing your connection, restarting the agent, and
            deploying Dialout itself. They stop when you close the terminal on purpose, press Kill,
            or the machine reboots.
          </Note>
          <p>
            For Local sessions to appear here at all, run{' '}
            <code>dialout setup-cowork</code> once on that machine. It is explained on the
            agent page.
          </p>
        </HelpSection>

        <HelpSection id="ai" title="AI Sessions">
          <p>
            If you use coding assistants from the command line &mdash; Claude Code, Codex &mdash;
            this page shows every one of them running across your machines, as a{' '}
            <strong>chat you can read and reply to from your phone</strong>.
          </p>
          <p>
            It works two ways round. Sessions you started yourself, in your own terminal, appear
            here automatically so you can pick one up from anywhere. And you can start a brand new
            one from this page with <strong>New session</strong>: give it a folder and a first
            instruction, and it runs on that machine whether or not your laptop lid is open.
          </p>
          <p>
            If you pay for more than one assistant subscription, they all appear in the same list.
            Dialout never sees your subscription &mdash; it only sees which one a session was
            started under, and labels it.
          </p>
          <Note>
            When you start a session here you choose how much it is allowed to do, once, up front:
            plan only, normal, auto-edit, or don&rsquo;t ask. That choice lasts for the whole
            session. Dialout <strong>cannot</strong> ask you to approve individual steps from your
            phone, so pick the level you are comfortable leaving unattended.
          </Note>
          <p>
            Turn on <strong>Alerts</strong> and your phone will tell you when an agent finishes or
            needs you &mdash; the point being that you can start something long, put the phone
            away, and get pulled back only when it matters. On an iPhone you have to add Dialout to
            your home screen first; Apple does not allow notifications from a normal Safari tab.
          </p>
        </HelpSection>

        <HelpSection id="scanner" title="Scanner">
          <p>
            Two different jobs share this page, both about finding things you have not told Dialout
            about yet.
          </p>
          <p>
            <strong>Port scan</strong> checks a range of ports on the selected machine and tells you
            what is listening. Handy when something is running and you have forgotten what it is, or
            when a port is taken and you want to know by what. Anything it finds can be turned into
            a project in one click.
          </p>
          <p>
            <strong>Folder scan</strong> looks through a folder on the machine — your{' '}
            <code>~/projects</code> or <code>/var/www</code> — and recognises the projects inside it
            by their <code>package.json</code>, <code>composer.json</code> and similar. Pick the
            ones you want and they are added with their names and paths already filled in.
          </p>
        </HelpSection>

        <HelpSection id="services" title="Services">
          <p>
            Projects are things you are building. Services are the things they depend on — the
            database, the cache, the search engine, the mail catcher. They rarely change, so they
            get their own quieter page instead of cluttering the projects list.
          </p>
          <p>
            It answers one question quickly: is Postgres actually up, or is that why nothing works?
          </p>
        </HelpSection>

        <HelpSection id="sharing" title="Sharing">
          <p>
            You can share a single project with someone else without giving them access to
            everything. They see that project and nothing more.
          </p>
          <p>
            A share is <strong>read-only</strong>. The other person can look at the project and
            leave comments, but cannot edit it, delete it, or touch your other projects. If you
            explicitly allow it, a share can also include terminal access to that project — only
            turn that on for people you would hand your laptop to.
          </p>
          <p>
            Shared projects arrive on the other person&rsquo;s Shared page. If they do not have a
            Dialout account yet, the invite waits for them until they sign up with that email.
          </p>
        </HelpSection>

        <HelpSection id="tunnel" title="Public links">
          <p>
            Sometimes you need to show someone what is running on your laptop — a client, a
            designer, someone testing on their phone. Normally that means deploying it somewhere
            first.
          </p>
          <p>
            Dialout can give you a public web address that points at a port on your machine. Open
            the link and you see your local dev server, wherever you are. It works through the same
            outbound agent connection, so you still do not open a single port on your machine.
          </p>
          <Note>
            Anyone with the link can reach that port while the tunnel is up. Treat the address like
            a password: send it to the person who needs it, and do not post it anywhere public.
          </Note>
        </HelpSection>

        <HelpSection id="security" title="Signing in safely">
          <p>
            Signing in takes two things: a short PIN you choose, and a six-digit code from an
            authenticator app on your phone. The second one is not optional, and that is
            deliberate — this dashboard can open a shell on your machines, so a leaked password
            alone must never be enough.
          </p>
          <p>
            When you first sign up, Dialout walks you through pairing an authenticator app. Save
            the recovery codes it gives you somewhere that is not your phone. If you lose the phone,
            those codes are how you get back in.
          </p>
          <p>
            Passwords and keys you store in a project&rsquo;s Credentials tab are encrypted before
            they are saved, and are never included when a list of credentials is loaded — they are
            fetched only at the moment you press reveal.
          </p>
          <Note>
            If a six-digit code keeps being rejected, check your phone&rsquo;s clock. Authenticator
            codes are generated from the current time, so a phone a minute out of sync produces
            codes that are already expired.
          </Note>
        </HelpSection>

        <div className="help-next">
          <div>
            <h3 className="font-display" style={{ fontSize: 18, color: 'var(--txt)' }}>
              Next: get a machine connected
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 4 }}>
              Nothing here works until a machine has the agent running on it. It takes about two
              minutes.
            </p>
          </div>
          <Link className="btn-grad" href="/help/agent">
            Agent guide <ArrowRight size={16} />
          </Link>
        </div>
      </HelpArticle>
    </div>
  );
}
