'use client';

import { useEffect, useState } from 'react';

/**
 * Whether this browser currently has a session.
 *
 * `null` means "not answered yet" and is deliberately distinct from `false`.
 * The marketing pages are statically rendered, so the first paint cannot know
 * the answer — treating unknown as signed-out would render *Log in* and then
 * swap it for *Dashboard* a beat later, which reads as a glitch to a signed-in
 * visitor on every single page load. Callers render nothing in the `null` state
 * instead, and the button appears once.
 *
 * Fails to `false` on a network error: offering a dashboard link that leads to
 * a login form is worse than offering the login form directly.
 */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/session-state', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (live) setSignedIn(!!d?.signedIn); })
      .catch(() => { if (live) setSignedIn(false); });
    return () => { live = false; };
  }, []);

  return signedIn;
}
