import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
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
  assert.match(html, /class="emicoin-value"[^>]*aria-hidden="true"[^>]*>12,34,567\.8 EMIC<\/span>/);
});

test('renders one 36px tech pill with a direct 28px coin and no responsive sizes hint', () => {
  const html = renderAmount(500);

  assert.match(html, /class="emicoin-amount"[^>]*height:36px/);
  assert.match(html, /<img alt="" aria-hidden="true"[^>]*width="28" height="28"/);
  assert.doesNotMatch(html, /emicoin-badge/);
  assert.doesNotMatch(html, /emicoin-badge-inner/);
  assert.doesNotMatch(html, /\ssizes=/);
});

test('renders unavailable semantics for null, undefined, and non-finite values', () => {
  for (const value of [null, undefined, Number.NaN]) {
    const html = renderAmount(value);

    assert.equal((html.match(/class="emicoin-sr"/g) ?? []).length, 1);
    assert.match(html, /class="emicoin-sr"[^>]*>EMIC amount unavailable<\/span>/);
    assert.match(html, /class="emicoin-value"[^>]*aria-hidden="true"[^>]*>-- EMIC<\/span>/);
  }
});
