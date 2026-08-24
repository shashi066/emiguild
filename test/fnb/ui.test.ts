import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const inventorySource = readFileSync(
  new URL('../../components/admin/AdminFnbInventory.tsx', import.meta.url),
  'utf8',
)
const bookingSource = readFileSync(
  new URL('../../app/admin/bookings/page.tsx', import.meta.url),
  'utf8',
)
const styles = readFileSync(
  new URL('../../app/globals.css', import.meta.url),
  'utf8',
)

test('admin F&B separates products, activity, and lazy revenue views', () => {
  assert.match(inventorySource, /useState<FnbView>\('products'\)/)
  assert.match(inventorySource, /role="tablist" aria-label="F&B views"/)
  assert.match(inventorySource, /activeView !== 'revenue' \|\| reportRequested/)
  assert.match(inventorySource, /activeView === 'revenue' &&/)
  assert.match(inventorySource, /activeView === 'products' &&/)
  assert.match(inventorySource, /activeView === 'activity' &&/)
})

test('admin F&B uses compact scrollable rows and stock action buttons', () => {
  assert.match(inventorySource, /fnb-product-list/)
  assert.match(inventorySource, /fnb-activity-list/)
  assert.match(inventorySource, /aria-pressed=\{selected\}/)
  assert.doesNotMatch(inventorySource, /<option value="RESTOCK">/)
  assert.match(styles, /\.fnb-list \{[\s\S]*?max-height: 520px;[\s\S]*?overflow-y: auto;/)
  assert.match(styles, /\.fnb-stock-action-grid \{[^}]*repeat\(3/)
})

test('booking F&B chooser uses local search, product boxes, and a stock-aware stepper', () => {
  const modalSource = bookingSource.slice(
    bookingSource.indexOf('function BookingFnbModal'),
    bookingSource.indexOf('// ── Main Page'),
  )

  assert.match(modalSource, /productSearch\.trim\(\)\.toLowerCase\(\)/)
  assert.match(modalSource, /left\.sellingPrice - right\.sellingPrice/)
  assert.match(modalSource, /role="radiogroup" aria-label="In-stock F&B products"/)
  assert.match(modalSource, /role="radio"/)
  assert.match(modalSource, /aria-label="Decrease quantity"/)
  assert.match(modalSource, /aria-label="Increase quantity"/)
  assert.match(modalSource, /quantityNumber <= selectedProduct\.currentStock/)
  assert.doesNotMatch(modalSource, /Select in-stock F&amp;B item/)
  assert.match(styles, /\.booking-fnb-product-grid \{[^}]*max-height: 240px;[^}]*overflow-y: auto;/)
})

test('both F&B product views sort prices from low to high', () => {
  assert.match(inventorySource, /left\.sellingPrice - right\.sellingPrice/)
  assert.match(bookingSource, /left\.sellingPrice - right\.sellingPrice/)
})
