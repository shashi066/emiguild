import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const catalogSource = readFileSync(
  new URL('../../components/admin/AdminFnbCatalog.tsx', import.meta.url),
  'utf8',
)
const bookingSource = readFileSync(
  new URL('../../app/admin/bookings/page.tsx', import.meta.url),
  'utf8',
)
const bookingRouteSource = readFileSync(
  new URL('../../app/api/bookings/route.ts', import.meta.url),
  'utf8',
)
const fnbSource = readFileSync(
  new URL('../../lib/fnb.ts', import.meta.url),
  'utf8',
)
const styles = readFileSync(
  new URL('../../app/globals.css', import.meta.url),
  'utf8',
)
const localSchema = readFileSync(
  new URL('../../prisma/schema.prisma', import.meta.url),
  'utf8',
)
const productionSchema = readFileSync(
  new URL('../../prisma/schema.production.prisma', import.meta.url),
  'utf8',
)
const migration = readFileSync(
  new URL(
    '../../prisma/migrations/20260903000000_simplify_fnb_catalog/migration.sql',
    import.meta.url,
  ),
  'utf8',
)

function fnbProductModel(schema: string) {
  const match = schema.match(/model FnbProduct \{[\s\S]*?\n\}/)
  assert.ok(match, 'FnbProduct model must exist')
  return match[0]
}

test('admin F&B is one searchable price-sorted catalog', () => {
  assert.match(catalogSource, /F&amp;B Items/)
  assert.match(catalogSource, /className="fnb-config-card"/)
  assert.match(catalogSource, /> Configure Items/)
  assert.match(catalogSource, /catalogOpen &&/)
  assert.match(catalogSource, /labelledBy="fnb-catalog-modal-title"/)
  assert.match(catalogSource, /size="wide"/)
  assert.match(catalogSource, /aria-label="Search F&B items"/)
  assert.match(catalogSource, /product\.name\.toLowerCase\(\)\.includes\(query\)/)
  assert.match(catalogSource, /left\.sellingPrice - right\.sellingPrice/)
  assert.match(catalogSource, /Show hidden/)
  assert.match(catalogSource, /> Hide</)
  assert.match(catalogSource, /> Restore</)
  assert.doesNotMatch(catalogSource, /role="tablist"|Revenue|Activity/)
})

test('catalog add and edit use one popup at a time and return to the manager', () => {
  assert.match(catalogSource, /setCatalogOpen\(false\)[\s\S]*?setModalProduct\(product\)/)
  assert.match(catalogSource, /setModalProduct\(null\)[\s\S]*?setCatalogOpen\(true\)/)
  assert.match(catalogSource, /onClose=\{returnToCatalog\}/)
  const managerSource = catalogSource.slice(
    catalogSource.indexOf('{catalogOpen && ('),
    catalogSource.indexOf('{modalProduct && ('),
  )
  assert.doesNotMatch(managerSource, /FnbProductModal/)
})

test('admin item popup edits only name and selling price', () => {
  const modalSource = catalogSource.slice(
    catalogSource.indexOf('function FnbProductModal'),
    catalogSource.indexOf('export function AdminFnbCatalog'),
  )

  assert.match(modalSource, />\s*Item name\s*</)
  assert.match(modalSource, />\s*Price\s*</)
  assert.match(modalSource, /lightweight/)
  assert.match(
    modalSource,
    /JSON\.stringify\(\{ name, sellingPrice: priceNumber \}\)/,
  )
  assert.doesNotMatch(
    modalSource,
    /category|sku|costPrice|currentStock|lowStockThreshold/,
  )
})

test('booking add-ons use searchable item boxes, a 1-99 stepper, and local updates', () => {
  const modalSource = bookingSource.slice(
    bookingSource.indexOf('function BookingFnbModal'),
    bookingSource.indexOf('export default function AdminBookingsPage'),
  )

  assert.match(modalSource, /productSearch\.trim\(\)\.toLowerCase\(\)/)
  assert.match(modalSource, /left\.sellingPrice - right\.sellingPrice/)
  assert.match(modalSource, /role="radiogroup" aria-label="Available F&B items"/)
  assert.match(modalSource, /role="radio"/)
  assert.match(modalSource, /max=\{MAX_FNB_QUANTITY\}/)
  assert.match(
    modalSource,
    /selectedProduct\.sellingPrice \* quantityNumber/,
  )
  assert.match(modalSource, /setItems\(\(current\) => \[data\.item, \.\.\.current\]\)/)
  assert.match(modalSource, /method: 'DELETE'/)
  assert.match(modalSource, /lightweight/)
  assert.doesNotMatch(modalSource, /currentStock|lowStock|category|voidReason:/)
})

test('booking list totals use one admin-only active-item aggregate', () => {
  assert.match(fnbSource, /bookingFnbItem\.groupBy\(/)
  assert.match(fnbSource, /bookingId: \{ in: uniqueBookingIds \}/)
  assert.match(fnbSource, /status: 'ACTIVE'/)
  assert.match(fnbSource, /_sum: \{ subtotal: true \}/)
  assert.match(
    bookingRouteSource,
    /const fnbSubtotals = isAdmin[\s\S]*?getActiveFnbSubtotals\(bookings\.map/,
  )
  assert.match(
    bookingRouteSource,
    /fnbSubtotals[\s\S]*?\? \{ fnbSubtotal: fnbSubtotals\.get\(booking\.id\) \?\? 0 \}[\s\S]*?: \{\}/,
  )
})

test('booking rows show subtotal, Add Items, and cancelled View Items states', () => {
  assert.match(bookingSource, /fnbSubtotal: number/)
  assert.match(bookingSource, /\? formatCurrency\(b\.fnbSubtotal\)/)
  assert.match(bookingSource, /b\.status === 'CANCELLED'[\s\S]*?\? 'View Items'[\s\S]*?: 'Add Items'/)
  assert.match(bookingSource, /aria-label=\{fnbActionDescription\}/)
  assert.match(bookingSource, /booking-fnb-total-action/)
})

test('modal load, add, and remove synchronize the existing booking row locally', () => {
  const modalSource = bookingSource.slice(
    bookingSource.indexOf('function BookingFnbModal'),
    bookingSource.indexOf('export default function AdminBookingsPage'),
  )

  assert.match(modalSource, /itemsData\.activeSubtotal/)
  assert.match(modalSource, /activeSubtotal \+ data\.item\.subtotal/)
  assert.match(modalSource, /activeSubtotal - removeCandidate\.subtotal/)
  assert.match(modalSource, /onSubtotalChange/)
  assert.match(modalSource, /disabled=\{adding \|\| Boolean\(removingId\)\}/)
  assert.doesNotMatch(modalSource, /fetchBookings/)
})

test('F&B popups use only the modal scroll', () => {
  const catalogListStyles = styles.match(/\.fnb-catalog-list \{[^}]*\}/)?.[0] ?? ''
  assert.doesNotMatch(catalogListStyles, /max-height|overflow|overscroll/)
  const catalogHeadStyles = styles.match(/\.fnb-catalog-head \{[^}]*\}/)?.[0] ?? ''
  assert.doesNotMatch(catalogHeadStyles, /position:\s*sticky|top:\s*0/)
  const productGridStyles = styles.match(/\.booking-fnb-product-grid \{[^}]*\}/)?.[0] ?? ''
  assert.doesNotMatch(productGridStyles, /max-height|overflow|overscroll/)
  assert.doesNotMatch(styles, /\.booking-fnb-item-list \{[^}]*overflow/)
  assert.doesNotMatch(styles, /\.fnb-stock-action-grid|\.fnb-report|\.fnb-tabs/)
  assert.match(styles, /\.admin-modal-overlay--lightweight \{[\s\S]*?backdrop-filter: none/)
  assert.match(styles, /\.fnb-primary-action \{[\s\S]*?box-shadow: none/)
})

test('both Prisma schemas keep only catalog fields and booking history', () => {
  for (const schema of [localSchema, productionSchema]) {
    const product = fnbProductModel(schema)
    assert.match(product, /name\s+String/)
    assert.match(product, /sellingPrice\s+Int/)
    assert.match(product, /isActive\s+Boolean/)
    assert.match(product, /@@index\(\[isActive, sellingPrice\]\)/)
    assert.doesNotMatch(
      product,
      /category|sku|costPrice|currentStock|lowStockThreshold|stockMovements/,
    )
    assert.doesNotMatch(schema, /model FnbStockMovement/)
    assert.match(schema, /model BookingFnbItem/)
  }
})

test('production migration removes stock data without dropping catalog or add-on history', () => {
  assert.match(migration, /DROP TABLE "fnb_stock_movements"/)
  assert.match(migration, /DROP COLUMN "currentStock"/)
  assert.match(migration, /DROP COLUMN "lowStockThreshold"/)
  assert.match(migration, /DROP COLUMN "category"/)
  assert.match(migration, /fnb_products_selling_price_nonnegative/)
  assert.doesNotMatch(migration, /DROP TABLE "fnb_products"/)
  assert.doesNotMatch(migration, /DROP TABLE "booking_fnb_items"/)
})

test('stock, overview, and revenue endpoints are removed', () => {
  const removedRoutes = [
    '../../app/api/admin/fnb/overview/route.ts',
    '../../app/api/admin/fnb/revenue/route.ts',
    '../../app/api/admin/fnb/products/[id]/stock-movements/route.ts',
  ]

  for (const route of removedRoutes) {
    assert.equal(existsSync(new URL(route, import.meta.url)), false)
  }
})
