import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { userOwnsMachine } from '@/lib/machine-access';

const WS_SERVER = process.env.WS_SERVER_URL || 'http://localhost:50052';

type TunnelParams = { machineId: string; port: string; path?: string[] };

async function proxyTunnel(
  req: NextRequest,
  params: Promise<TunnelParams>
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { machineId, port, path } = await params;

  // A session alone only proved "some user". The machineId is path-supplied,
  // so without an ownership check any logged-in user could proxy arbitrary
  // HTTP into any registered machine's localhost.
  const mid = parseInt(machineId, 10);
  if (!(await userOwnsMachine(session.userId, mid))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const tunnelPath = '/' + (path || []).join('/');
  const search = req.nextUrl.search || '';

  const tunnelUrl = `${WS_SERVER}/tunnel/${machineId}/${port}${tunnelPath}${search}`;

  try {
    // Forward headers (strip Next.js internals)
    const headers: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      if (['host', 'connection', 'upgrade', 'transfer-encoding'].includes(key)) return;
      headers[key] = val;
    });

    const fetchOpts: RequestInit = {
      method: req.method,
      headers,
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      const body = await req.arrayBuffer();
      if (body.byteLength > 0) {
        fetchOpts.body = Buffer.from(body);
      }
    }

    const resp = await fetch(tunnelUrl, fetchOpts);
    const respBody = Buffer.from(await resp.arrayBuffer());

    const respHeaders = new Headers();
    resp.headers.forEach((val, key) => {
      if (['transfer-encoding', 'connection', 'content-encoding'].includes(key.toLowerCase())) return;
      respHeaders.set(key, val);
    });

    return new NextResponse(respBody, {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Tunnel failed', message: err.message },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<TunnelParams> }) {
  return proxyTunnel(req, ctx.params);
}

export async function POST(req: NextRequest, ctx: { params: Promise<TunnelParams> }) {
  return proxyTunnel(req, ctx.params);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<TunnelParams> }) {
  return proxyTunnel(req, ctx.params);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<TunnelParams> }) {
  return proxyTunnel(req, ctx.params);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<TunnelParams> }) {
  return proxyTunnel(req, ctx.params);
}
