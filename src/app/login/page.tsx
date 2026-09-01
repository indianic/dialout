'use client';

import { useRouter } from 'next/navigation';
import { ThemeProvider } from '@/components/ThemeProvider';
import LoginPage from '@/components/LoginPage';

/**
 * A real /login route.
 *
 * The login screen has always existed, but only as something Shell renders in
 * place of the dashboard when there is no session — so there was no URL to
 * send anyone to. The marketing site needs one, because "Log in" in a nav has
 * to be a link.
 *
 * It lives outside the (marketing) group deliberately: it is the app, not a
 * page about the app, and it should not carry the marketing nav and footer.
 * It brings its own ThemeProvider for the same reason the marketing layout
 * does — the root layout has none, and this route is in neither group.
 *
 * LoginPage owns the whole flow (PIN, two-factor, enrolment, resets) and
 * signals completion through onSuccess, so there is nothing to coordinate
 * here beyond where to go next.
 */
export default function LoginRoute() {
  const router = useRouter();

  return (
    <ThemeProvider>
      <LoginPage
        onSuccess={() => {
          // replace, not push: the back button should not return to a login
          // form for a session that now exists.
          router.replace('/projects');
        }}
      />
    </ThemeProvider>
  );
}
