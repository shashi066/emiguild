// Per-mounted-consumer cache: never shared between accounts or browser sessions.
export function createVaultReader<T>(url: string) {
  let pending: Promise<T> | undefined;
  let cached: { value: T; at: number } | undefined;
  return (force = false): Promise<T> => {
    if (pending) return pending;
    if (!force && cached && Date.now() - cached.at < 15000) return Promise.resolve(cached.value);
    pending = fetch(url, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Vault unavailable');
      cached = { value: body as T, at: Date.now() };
      return cached.value;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
