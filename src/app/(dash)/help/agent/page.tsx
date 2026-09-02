'use client';

import Link from 'next/link';
import { Plug, ArrowLeft } from 'lucide-react';
import PageHeader from '@/components/dashboard/PageHeader';
import HelpArticle, { HelpSection, Steps, Note } from '@/components/help/HelpArticle';
import CopyBlock from '@/components/help/CopyBlock';

const SECTIONS = [
  { id: 'what', label: 'What the agent is' },
  { id: 'install', label: 'Install it' },
  { id: 'always-on', label: 'Keep it running' },
  { id: 'cowork', label: 'Share your terminals' },
  { id: 'commands', label: 'Every command' },
  { id: 'trouble', label: 'When something is wrong' },
  { id: 'update', label: 'Updating' },
];

export default function AgentHelpPage() {
  return (
    <div>
      <PageHeader
        title="The Dialout agent"
        subtitle="Install it once per machine. Everything else depends on it."
        icon={<Plug size={20} />}
        actions={
          <Link className="btn-ghost" href="/help">
            <ArrowLeft size={16} /> All help
          </Link>
        }
      />

      <HelpArticle sections={SECTIONS}>
        <HelpSection id="what" title="What the agent is">
          <p>
            The agent is a small program that runs quietly on one of your computers. It is the only
            thing that can see that machine — Dialout never touches your machines directly, it asks
            the agent.
          </p>
          <p>The agent is what makes all of this possible:</p>
          <ul>
            <li>Checking whether your projects are actually running, port by port.</li>
            <li>Opening real terminals in your browser, and on your phone.</li>
            <li>Browsing folders and finding projects you have not added yet.</li>
            <li>Starting, stopping and restarting projects from a button.</li>
            <li>Giving a local dev server a public web address.</li>
          </ul>
          <Note>
            The agent <strong>calls out</strong> to the Dialout server — the server never calls in.
            That means no port forwarding, no VPN, and nothing new exposed on your machine. It also
            means the agent must be running for any of the above to work.
          </Note>
        </HelpSection>

        <HelpSection id="install" title="Install it">
          <p>
            You need Node.js 18 or newer, on macOS or Linux. Do this on the machine itself — over
            SSH is fine for a server.
          </p>

          <h3>1. Install the agent</h3>
          <p>Once per machine. It ships for macOS and Linux.</p>
          <CopyBlock label="Terminal" code={`npm install -g @indianic/dialout`} />

          <h3>2. Get an API key</h3>
          <p>
            The key is how the agent proves which machine it is. Go to{' '}
            <Link href="/machines">Machines</Link>, add the machine if it is not there yet, then
            generate a key for it. It starts with <code>mch_</code>. Copy it now — it is shown once.
          </p>

          <h3>3. Connect it</h3>
          <p>
            This asks for the server address and the key you just copied, then saves them to{' '}
            <code>~/.dialout/config.json</code>.
          </p>
          <CopyBlock label="Terminal" code={`dialout init`} />

          <h3>4. Check it worked</h3>
          <CopyBlock label="Terminal" code={`dialout status`} />
          <p>
            The machine&rsquo;s dot on the Machines page should now be green. If it is not, jump to{' '}
            <a href="#trouble">when something is wrong</a>.
          </p>
        </HelpSection>

        <HelpSection id="always-on" title="Keep it running">
          <p>
            An agent that stops when you close your laptop lid is not much use. Install it as a
            service and the machine starts it for you, forever.
          </p>
          <CopyBlock label="Terminal" code={`dialout install-service`} />
          <p>
            On a server, run that as <code>root</code> and it installs a boot service with no
            questions asked — it starts before anyone logs in and keeps running after everyone logs
            out. On your own laptop it asks whether you want it at boot (needs your admin password)
            or at login.
          </p>
          <Note>
            If you are on Linux and installed as a normal user, the agent enables{' '}
            <em>lingering</em> for you. Without it, Linux shuts down your background services the
            moment your last session ends — which on a server means the agent dies every time you
            close the SSH window. <code>dialout status</code> warns you if this is not set.
          </Note>
          <p>To remove it again:</p>
          <CopyBlock label="Terminal" code={`dialout uninstall-service`} />
        </HelpSection>

        <HelpSection id="cowork" title="Share your terminals">
          <p>
            This is optional, and it is the nicest thing the agent does. Run it once and the
            terminal windows you open on that machine — in iTerm, Terminal, VS Code, whatever you
            use — start appearing on the Terminals page under <strong>Local</strong>.
          </p>
          <CopyBlock label="Terminal" code={`dialout setup-cowork`} />
          <p>
            It asks which terminal apps to include and ticks the one you are sitting in. Only the
            apps you choose are affected; every other terminal on the machine stays completely
            untouched.
          </p>
          <p>
            Once it is on, you can start something on your office desktop, walk away, and pick the
            very same session up from your phone — watching with <strong>Peek</strong>, or typing
            with <strong>Drive</strong>. Restart the agent afterwards so it begins reporting:
          </p>
          <CopyBlock label="Terminal" code={`dialout restart`} />
          <Note>
            Under the hood this uses <code>tmux</code>, which is what lets a session outlive the
            window it was opened in. The agent installs tmux for you if it is missing.
          </Note>
        </HelpSection>

        <HelpSection id="commands" title="Every command">
          <p>Everything the agent can do, in one place.</p>

          <h3>Running it</h3>
          <CopyBlock
            label="Terminal"
            code={`dialout start            # run in this window, Ctrl+C to stop
dialout start --daemon   # run in the background
dialout stop             # stop the background agent
dialout restart          # stop, then start again
dialout status           # is it running, and how`}
          />

          <h3>Setting it up</h3>
          <CopyBlock
            label="Terminal"
            code={`dialout init                # server address + API key
dialout install-service     # start automatically, forever
dialout uninstall-service   # stop doing that
dialout setup-cowork        # show your terminals in Dialout
dialout setup-cron          # a watchdog that restarts it if it dies
dialout repair              # fix a watchdog left over from an old version`}
          />

          <h3>Profiles</h3>
          <p>
            If you use both a local Dialout and the hosted one, profiles let you keep both configs
            and switch between them.
          </p>
          <CopyBlock
            label="Terminal"
            code={`dialout profiles              # list what you have saved
dialout use local             # switch to the local one
dialout start --profile local # run against it just this once`}
          />

          <h3>Configuration</h3>
          <CopyBlock
            label="Terminal"
            code={`dialout config show          # current settings, key masked
dialout config path          # where the file lives
dialout config set <k> <v>   # change one setting
dialout config reset         # back to defaults, keeps your key`}
          />
        </HelpSection>

        <HelpSection id="trouble" title="When something is wrong">
          <p>
            Start with <code>dialout status</code>. It tells you whether the agent is running,
            what is supervising it, and whether anything is misconfigured.
          </p>

          <h3>The machine shows as offline</h3>
          <Steps
            items={[
              'Run dialout status on the machine. If it is not running, start it.',
              'Check the machine is actually awake and online — a sleeping laptop is an offline machine.',
              'Confirm the server address is right with dialout config show.',
              'If it says the API key was rejected, the key was removed or regenerated. Make a new one on the Machines page and run dialout init again.',
            ]}
          />

          <h3>It keeps stopping when I close my SSH window</h3>
          <p>
            A Linux service installed for your user is shut down when your last session ends. Either
            install the boot service instead, or turn on lingering:
          </p>
          <CopyBlock
            label="Terminal"
            code={`sudo loginctl enable-linger $USER
# or, better on a server:
sudo dialout install-service --system`}
          />

          <h3>My terminals do not show up under Local</h3>
          <p>
            Run <code>dialout setup-cowork</code>, make sure your terminal app is ticked, then{' '}
            <code>dialout restart</code>. Terminal windows you already had open will not
            appear — open a new one.
          </p>

          <h3>It connects, then drops, over and over</h3>
          <p>
            That is usually two agents fighting over the same machine — a service and a manual one,
            for instance. <code>dialout status</code> lists everything supervising the agent
            and flags duplicates.
          </p>
        </HelpSection>

        <HelpSection id="update" title="Updating">
          <p>The agent tells you when a new version is out. To take it:</p>
          <CopyBlock label="Terminal" code={`dialout update`} />
          <p>Or do it through npm, then restart:</p>
          <CopyBlock
            label="Terminal"
            code={`npm install -g @indianic/dialout
dialout restart`}
          />
          <Note>
            Updating never disturbs your running terminal sessions. They are kept alive across the
            restart on purpose — a deploy must never destroy work you have in progress.
          </Note>
        </HelpSection>
      </HelpArticle>
    </div>
  );
}
