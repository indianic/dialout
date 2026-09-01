import { NextResponse } from 'next/server';
import { createChallenge } from '@/lib/captcha';

// Public and unauthenticated by design — it serves the marketing forms, which
// anyone can reach. It hands out a code and an opaque sealed token; the answer
// itself never reaches the browser.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { code, token } = createChallenge();
  return NextResponse.json(
    { code, token },
    // A cached captcha is not a captcha.
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
