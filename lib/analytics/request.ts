export const HOMEPAGE_ANALYTICS_MARKER = 'homepage';

function parseUrl(value: string | null): URL | null {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Best-effort provenance validation for the unauthenticated visit endpoint. */
export async function isValidHomepageAnalyticsRequest(
  request: Request,
): Promise<boolean> {
  if (request.method !== 'POST') return false;

  const requestUrl = parseUrl(request.url);
  const suppliedOrigin = request.headers.get('origin');
  const originUrl = parseUrl(suppliedOrigin);
  const referrerUrl = parseUrl(request.headers.get('referer'));
  const fetchSite = request.headers.get('sec-fetch-site');

  if (
    !requestUrl
    || !originUrl
    || suppliedOrigin !== originUrl.origin
    || originUrl.origin !== requestUrl.origin
    || !referrerUrl
    || referrerUrl.origin !== requestUrl.origin
    || referrerUrl.pathname !== '/'
    || (fetchSite !== null && fetchSite !== 'same-origin')
  ) {
    return false;
  }

  const contentLength = request.headers.get('content-length');
  if (
    contentLength !== null
    && contentLength !== String(HOMEPAGE_ANALYTICS_MARKER.length)
  ) {
    return false;
  }

  try {
    return await request.text() === HOMEPAGE_ANALYTICS_MARKER;
  } catch {
    return false;
  }
}
