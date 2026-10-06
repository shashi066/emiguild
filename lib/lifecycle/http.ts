import { NextResponse } from 'next/server';

export function lifecycleJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    // Next.js can normalize the internal URL host; the incoming Host retains the browser origin.
    return source.protocol === target.protocol && source.host === (request.headers.get('host') ?? target.host);
  } catch { return false; }
}
