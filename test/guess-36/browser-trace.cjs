// Local test diagnostics only. Do not collect cookies, request bodies or URL queries.
const fs = require('node:fs');
const path = require('node:path');

const safeUrl = value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return ''; } };
async function traceExpedition(page, directory, name) {
  const events = [];
  let saved = false;
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  session.on('Network.requestWillBeSent', event => {
    const url = new URL(event.request.url);
    if (event.type === 'Document' || url.pathname === '/guess-36' || url.searchParams.has('_rsc')) {
      events.push({ kind: event.type, url: safeUrl(event.request.url), routeRequest: url.searchParams.has('_rsc'), initiator: event.initiator.type, source: safeUrl(event.initiator.stack?.callFrames?.[0]?.url), timestamp: event.timestamp });
    }
  });
  session.on('Network.webSocketCreated', event => {
    if (event.url.includes('webpack-hmr')) events.push({ kind: 'hot-reload-socket', url: safeUrl(event.url) });
  });
  page.on('response', response => {
    if (response.fromServiceWorker() && new URL(response.url()).pathname.startsWith('/_next/')) events.push({ kind: 'worker-served-asset', url: safeUrl(response.url()) });
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) events.push({ kind: 'main-frame-navigation', url: safeUrl(frame.url()) });
  });
  return async () => {
    if (saved) return;
    saved = true;
    const workers = await page.evaluate(async () => ({
      controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
      registrations: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).map(item => ({ scope: item.scope, script: item.active?.scriptURL ?? null })) : [],
    })).catch(() => ({ inaccessible: true }));
    fs.writeFileSync(path.join(directory, `${name}-navigation.json`), JSON.stringify({ workers, events }, null, 2));
  };
}
module.exports = { traceExpedition };
