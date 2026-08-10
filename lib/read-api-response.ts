export async function readApiResponse<T = any>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const raw = await response.text();
  const body = raw.trim();

  if (!body) {
    throw new Error(
      response.ok
        ? `${fallbackMessage}: empty response from server.`
        : `${fallbackMessage} (${response.status}).`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    if (response.redirected || response.url.includes('/login')) {
      throw new Error('Session expired. Please login again.');
    }

    const contentType = response.headers.get('content-type') || 'non-JSON';
    throw new Error(`${fallbackMessage}: server returned ${contentType}.`);
  }
}
