import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HOME_POPUP, normalizePopupLink, parseHomePopup, popupActionHref, validateHomePopup, whatsappHref,
} from '../../lib/home-popup';

test('missing, malformed or invalid settings fall back to the default popup', () => {
  assert.deepEqual(parseHomePopup(undefined), DEFAULT_HOME_POPUP);
  assert.deepEqual(parseHomePopup('{not json'), DEFAULT_HOME_POPUP);
  assert.deepEqual(parseHomePopup(JSON.stringify({ ...DEFAULT_HOME_POPUP, title: '' })), DEFAULT_HOME_POPUP);
});

test('default popup announces GTA 6 pre-bookings at 250 / 450 / 600', () => {
  assert.equal(DEFAULT_HOME_POPUP.title, 'GTA 6');
  assert.deepEqual(DEFAULT_HOME_POPUP.prices.map((price) => price.amount), [250, 450, 600]);
  assert.equal(validateHomePopup(DEFAULT_HOME_POPUP).ok, true);
});

test('a valid custom config round-trips, and older saves without an action default to WhatsApp', () => {
  const custom = { ...DEFAULT_HOME_POPUP, title: 'Weekend Cup', prices: [{ label: 'Entry', amount: 99 }] };
  assert.deepEqual(parseHomePopup(JSON.stringify(custom)), custom);
  const { actionType: _action, linkUrl: _link, ...legacy } = DEFAULT_HOME_POPUP;
  assert.equal(parseHomePopup(JSON.stringify(legacy)).actionType, 'whatsapp');
});

test('validation rejects bad prices, too many rows and a bad WhatsApp number', () => {
  assert.equal(validateHomePopup({ ...DEFAULT_HOME_POPUP, prices: [{ label: '1 hr', amount: 2.5 }] }).ok, false);
  assert.equal(validateHomePopup({ ...DEFAULT_HOME_POPUP, prices: Array(7).fill({ label: 'x', amount: 1 }) }).ok, false);
  assert.equal(validateHomePopup({ ...DEFAULT_HOME_POPUP, whatsappNumber: '99895abc' }).ok, false);
  assert.equal(validateHomePopup({ ...DEFAULT_HOME_POPUP, prices: [] }).ok, true);
});

test('custom links accept bare domains and only allow http(s)', () => {
  assert.equal(normalizePopupLink('emiguildwars.in'), 'https://emiguildwars.in/');
  assert.equal(normalizePopupLink('https://emiguildwars.in/play'), 'https://emiguildwars.in/play');
  assert.equal(normalizePopupLink('javascript:alert(1)'), '');
  assert.equal(normalizePopupLink('not a link'), '');
  assert.equal(validateHomePopup({ ...DEFAULT_HOME_POPUP, actionType: 'link', linkUrl: 'javascript:alert(1)' }).ok, false);
  const link = validateHomePopup({ ...DEFAULT_HOME_POPUP, actionType: 'link', linkUrl: 'emiguildwars.in', whatsappNumber: '' });
  assert.ok(link.ok);
  assert.equal(popupActionHref(link.config), 'https://emiguildwars.in/');
});

test('"No button" needs no label, number or link, and has no destination', () => {
  const none = validateHomePopup({ ...DEFAULT_HOME_POPUP, actionType: 'none', buttonLabel: '', whatsappNumber: '', linkUrl: '' });
  assert.ok(none.ok);
  assert.equal(popupActionHref(none.config), null);
  assert.equal(validateHomePopup({ ...DEFAULT_HOME_POPUP, actionType: 'whatsapp', buttonLabel: '' }).ok, false);
  assert.equal(validateHomePopup({ ...DEFAULT_HOME_POPUP, actionType: 'email' }).ok, false);
});

test('WhatsApp links strip non-digits and encode the message', () => {
  assert.equal(
    whatsappHref({ whatsappNumber: '+91 99895-62474', whatsappMessage: 'Hi, GTA 6 & more?' }),
    'https://wa.me/919989562474?text=Hi%2C%20GTA%206%20%26%20more%3F',
  );
  assert.equal(popupActionHref(DEFAULT_HOME_POPUP), whatsappHref(DEFAULT_HOME_POPUP));
});
