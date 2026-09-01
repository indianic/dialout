'use client';

import { useEffect, useState } from 'react';

/**
 * What this instance's front door is doing right now.
 *
 * Read from `/api/public/config` rather than baked in at build time, because
 * the whole point of the toggles in Settings is that flipping one takes effect
 * without a redeploy.
 *
 * `null` means "not answered yet" and must stay distinct from "closed". A
 * component that treats the loading state as closed will draw a closed door for
 * one frame and then swap it for an open one, which reads as a glitch on every
 * single page load.
 */
export interface SignupPolicy {
  signupEnabled: boolean;
  trialEnabled: boolean;
  closedSignupNote: string;
}

/**
 * `initial` should be passed wherever a server component can read the policy
 * and hand it down. Without it the primary call to action renders a fallback
 * and then swaps a beat later — which flickers for a reader, and means a
 * crawler only ever sees the fallback. The client fetch still runs, so a page
 * left open across a policy change catches up on its own.
 */
export function useSignupPolicy(initial?: SignupPolicy | null): SignupPolicy | null {
  const [policy, setPolicy] = useState<SignupPolicy | null>(initial ?? null);

  useEffect(() => {
    let live = true;
    fetch('/api/public/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (live) setPolicy(d); })
      // Fail closed. An instance that cannot say whether it is open should not
      // be advertising a way in.
      .catch(() => {
        // Keep whatever the server already told us rather than slamming an
        // open door shut because one background fetch failed.
        if (live && !initial) setPolicy({ signupEnabled: false, trialEnabled: false, closedSignupNote: '' });
      });
    return () => { live = false; };
  }, [initial]);

  return policy;
}

/**
 * The single call to action the front door should show, or `null` for none.
 *
 * Three states collapse to one decision, so every surface that offers a way in
 * — nav, hero, footer, pricing — asks this one function instead of re-deriving
 * the rule. Re-deriving it is how the nav ends up offering something the page
 * below it does not.
 */
export function signupCta(policy: SignupPolicy | null): { href: string; label: string } | null {
  if (!policy) return null;
  if (policy.signupEnabled) return { href: '/login', label: 'Create account' };
  if (policy.trialEnabled) return { href: '/early-access', label: 'Request access' };
  return null;
}
