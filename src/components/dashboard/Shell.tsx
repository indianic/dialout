'use client';

import { useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useViewportHeight } from '@/hooks/useViewportHeight';
import { LogoMark } from '@/components/marketing/Logo';
import { useDashboard } from './DashboardContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import GlobalOverlays from './GlobalOverlays';
import LoginPage from '@/components/LoginPage';
import TwoFactorWizard from '@/components/TwoFactorWizard';

function BrandSplash({ sub }: { sub?: string }) {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <div className="text-center">
        <div className="grid place-items-center mx-auto rounded-2xl mb-4" style={{ width: 60, height: 60, background: 'var(--accent-solid)' }}>
          <LogoMark size={31} className="text-white" />
        </div>
        <div style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: 700, letterSpacing: '-0.02em', fontSize: 40, lineHeight: 1, color: 'var(--txt)' }}>Dialout</div>
        {sub && <div className="font-mono mt-2 text-[11px]" style={{ color: 'var(--dim)', letterSpacing: '.14em' }}>{sub}</div>}
      </div>
    </div>
  );
}

// Routes that render from nothing and must never wait on data. GET /api/projects
// live-checks every port on every request, so the loading splash below can sit
// there for seconds when a machine is asleep — and Help is precisely the page
// someone opens *because* their machines are not connected. Making the docs
// wait on a port scan of the thing they cannot connect to is backwards.
const DATA_FREE_ROUTES = ['/help'];

export default function Shell({ children }: { children: ReactNode }) {
  const { authChecked, session, loading, checkAuth, openTerminals, dockedHeight } = useDashboard();
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = usePathname();
  // Routes that manage their own scrolling and must fill the viewport exactly.
  // An AI session is a chat: its composer belongs at the bottom of the screen,
  // not below 112px of shell padding meant to clear the terminal dock. The /ai
  // LIST is an ordinary padded page — only a session is full bleed.
  const fullBleed = !!pathname && pathname.startsWith('/ai/');
  useViewportHeight(fullBleed);

  // The docked terminal is position:fixed at the bottom, 320px tall by
  // default — it would sit straight on top of a full-bleed page's composer.
  // (pb-28 never cleared it either; 112px of padding against a 320px panel was
  // always going to lose. Ordinary pages scroll, so they get away with it.)
  const dockOpen = Array.from(openTerminals.values()).some((e) => e.viewMode === 'docked');
  const bleedHeight = dockOpen
    ? `calc(var(--app-vh, 100dvh) - ${dockedHeight}px)`
    : 'var(--app-vh, 100dvh)';
  const needsData = !DATA_FREE_ROUTES.some((r) => pathname === r || pathname?.startsWith(`${r}/`));

  if (!authChecked) return <BrandSplash />;
  if (!session) return <LoginPage onSuccess={checkAuth} />;
  if (session.requires2faEnrollment) {
    return (
      <div className="flex items-center justify-center px-4 py-10" style={{ minHeight: '100dvh' }}>
        <TwoFactorWizard requirePin onComplete={checkAuth} />
      </div>
    );
  }

  return (
    <div
      className="flex"
      // minHeight lets an ordinary page grow; a full-bleed route needs an
      // exact height instead, or its own flex:1 child has nothing to fill.
      // --app-vh follows the visual viewport so the on-screen keyboard does
      // not push the composer off-screen; 100dvh is the fallback.
      style={fullBleed
        ? {
            // Pinned to the VISUAL viewport, not the layout one. iOS shrinks
            // it for the keyboard and scrolls it at the same time, so an
            // in-flow element ends up offsetTop pixels too high and leaves a
            // band of background between the composer and whatever iOS is
            // showing along the bottom.
            position: 'fixed',
            top: 'var(--app-vtop, 0px)',
            left: 0,
            right: 0,
            height: bleedHeight,
            minHeight: 0,
            overflow: 'hidden',
          }
        : { minHeight: '100dvh' }}
    >
      <Sidebar mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)} />
      <div className="flex-1 min-w-0 flex flex-col" style={fullBleed ? { minHeight: 0 } : undefined}>
        <Topbar onOpenMobileNav={() => setMobileNav(true)} />
        <main
          className={fullBleed
            ? 'flex-1 min-h-0 w-full flex flex-col'
            : 'flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-28 w-full'}
          style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}
        >
          {loading && needsData ? <BrandSplash sub="CHECKING PORT STATUS…" /> : children}
        </main>
      </div>
      <GlobalOverlays />
    </div>
  );
}
