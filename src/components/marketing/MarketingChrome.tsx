'use client';

import { ThemeProvider } from '@/components/ThemeProvider';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import type { SignupPolicy } from '@/hooks/useSignupPolicy';

/**
 * The client half of the marketing shell.
 *
 * It exists so the layout above it can stay a server component and read the
 * registration policy once per request. The nav's primary button is the way
 * into the product, so it has to be right in the first HTML — not corrected a
 * beat after hydration, where a reader sees it change and a crawler never sees
 * it at all.
 *
 * The marketing group needs its own ThemeProvider: the root layout has none and
 * the dashboard's lives in (dash). Both read the same stored preference, so
 * moving from the site into the app does not flash a different theme.
 */
export default function MarketingChrome({
  children, initialPolicy,
}: {
  children: React.ReactNode;
  initialPolicy: SignupPolicy;
}) {
  return (
    <ThemeProvider>
      <div className="mk-page" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <MarketingNav initialPolicy={initialPolicy} />
        <main style={{ flex: 1 }}>{children}</main>
        <MarketingFooter />
      </div>
    </ThemeProvider>
  );
}
