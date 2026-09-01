'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import GithubIcon from './GithubIcon';
import { GITHUB_URL } from '@/lib/marketing-content';
import { useSignupPolicy, signupCta, type SignupPolicy } from '@/hooks/useSignupPolicy';

/**
 * The hero's call to action, and the one line of small print under it.
 *
 * Both depend on what the instance is actually offering, which is why this is a
 * client component in an otherwise static page: the answer comes from
 * `/api/public/config` and changes the moment an operator flips a switch in
 * Settings.
 *
 * When there is no way in, the primary button becomes "Read the docs" rather
 * than disappearing — a hero with only a ghost button reads as an unfinished
 * page. GitHub is always there, because self-hosting is always available and is
 * the honest answer to "can I use this today".
 */
export default function HeroCta({ initialPolicy }: { initialPolicy?: SignupPolicy | null }) {
  const policy = useSignupPolicy(initialPolicy);
  const cta = signupCta(policy);

  return (
    <>
      <div className="mk-cta-row" style={{ marginTop: 30 }}>
        {cta ? (
          <Link href={cta.href} className="mk-cta">
            {cta.label} <ArrowRight size={16} />
          </Link>
        ) : (
          <Link href="/docs/quick-start" className="mk-cta">
            Read the quick start <ArrowRight size={16} />
          </Link>
        )}
        <a href={GITHUB_URL} className="mk-cta-ghost" target="_blank" rel="noreferrer noopener">
          <GithubIcon size={15} /> View on GitHub
        </a>
      </div>

      <p className="mk-small" style={{ marginTop: 18 }}>
        {/* Rendered only once the policy has answered, so the line never
            changes under the reader a beat after the page paints. */}
        {policy === null
          ? ' '
          : policy.signupEnabled
            ? 'Free and MIT licensed. Self-host it, or use an account here.'
            : policy.trialEnabled
              ? 'Free and MIT licensed. Accounts here are invite-only — or self-host it today, no waiting.'
              : 'Free and MIT licensed. Self-hosted: your data stays on your server.'}
      </p>
    </>
  );
}
