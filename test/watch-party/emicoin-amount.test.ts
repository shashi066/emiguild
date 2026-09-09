import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmicoinAmount } from '../../components/watch-party/EmicoinAmount';

function renderAmount(value: number | null | undefined, className?: string) {
  return renderToStaticMarkup(React.createElement(EmicoinAmount, { value, className }));
}

test('renders one accessible EMIC label and hides its visual duplicate', () => {
  const html = renderAmount(1_234_567.8, 'wallet-total');

  assert.match(html, /class="emicoin-amount wallet-total"/);
  assert.equal((html.match(/class="emicoin-sr"/g) ?? []).length, 1);
  assert.match(html, /class="emicoin-sr"[^>]*>12,34,567\.8 EMIC<\/span>/);
  assert.match(html, /class="emicoin-value"[^>]*aria-hidden="true"[^>]*>12,34,567\.8<\/span>/);
});

test('renders a plain 22px coin and separate number without decorative styles', () => {
  const html = renderAmount(500);

  const wrapper = html.match(/<span class="emicoin-amount"[^>]*>/)![0];
  assert.match(wrapper, /display:inline-flex/);
  assert.match(wrapper, /gap:6px/);
  assert.doesNotMatch(wrapper, /(?:;|")(?:height|padding|border|border-radius|background|box-shadow):/);
  assert.doesNotMatch(html, /gradient|box-shadow|drop-shadow|filter:/);
  assert.match(html, /<img alt="" aria-hidden="true"[^>]*width="22" height="22"/);
  assert.match(html, /class="emicoin-value"[^>]*>500<\/span>/);
  assert.match(html, /font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(html, /emicoin-badge/);
  assert.doesNotMatch(html, /emicoin-badge-inner/);
  assert.doesNotMatch(html, /\ssizes=/);
});

test('renders unavailable semantics for null, undefined, and non-finite values', () => {
  for (const value of [null, undefined, Number.NaN, Infinity, -Infinity]) {
    const html = renderAmount(value);

    assert.equal((html.match(/class="emicoin-sr"/g) ?? []).length, 1);
    assert.match(html, /class="emicoin-sr"[^>]*>EMIC amount unavailable<\/span>/);
    assert.match(html, /class="emicoin-value"[^>]*aria-hidden="true"[^>]*>--<\/span>/);
  }
});

test('preserves Indian grouping, zero, and one-decimal precision', () => {
  for (const [value, expected] of [[0, '0'], [50.25, '50.3'], [1_234_567.8, '12,34,567.8']] as const) {
    const html = renderAmount(value);
    assert.ok(html.includes(`>${expected}</span>`));
    assert.ok(html.includes(`>${expected} EMIC</span>`));
  }
});

test('keeps the main wallet unframed without styling nested amount spans as labels', () => {
  const source = readFileSync('components/WatchPartyClient.tsx', 'utf8');
  const walletStyle = source.match(/\.watch-wallet \{([^}]+)\}/)![1];
  assert.doesNotMatch(walletStyle, /border|background|shadow/);
  assert.ok(source.includes('.watch-wallet > span'));
  assert.doesNotMatch(source, /watch-shop-wallet/);
});
