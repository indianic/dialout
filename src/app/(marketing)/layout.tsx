'use client';

import { ThemeProvider } from '@/components/ThemeProvider';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';

/**
 * The marketing group needs its own ThemeProvider: the root layout has none,
 * and the dashboard's provider lives in (dash). Both groups therefore read the
 * same devdash-theme preference and paint from the same tokens, so moving from
 * the site into the app does not flash a different theme.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="mk-page" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <MarketingNav />
        <main style={{ flex: 1 }}>{children}</main>
        <MarketingFooter />
      </div>
    </ThemeProvider>
  );
}
