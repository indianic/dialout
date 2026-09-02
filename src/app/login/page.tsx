import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import LoginRoute from '@/components/LoginRoute';

/**
 * /login — but only for people who need it.
 *
 * A signed-in visitor who follows a "Log in" link, or has the URL bookmarked,
 * used to get the form again and have to re-enter a PIN and a TOTP code for a
 * session they already had. The session cookie is the whole answer, so this is
 * decided on the server before anything renders: no form flashes up and no
 * round trip is wasted.
 *
 * `getSession()` reads cookies, so this route is dynamic by nature. That is
 * fine here — it is one route, and it is the app rather than a marketing page.
 * The same check is deliberately NOT done in the marketing layout, which would
 * cost every static marketing page its prerender for the sake of one nav label.
 */
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const session = await getSession();

  // An invite link is the one case where a signed-in visitor should still see
  // this page. The invite is for a *different* address — often forwarded to
  // someone who happens to be signed in already — and redirecting would eat it
  // silently, leaving them on a dashboard with no idea the link did anything.
  if (session && !invite) redirect('/projects');

  return <LoginRoute />;
}
