'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CupSoda,
  Edit2,
  IndianRupee,
  PackagePlus,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { getTodayString } from '@/lib/utils'
import AdminModalShell from '@/components/admin/AdminModalShell'

type Product = {
  id: string
  name: string
  category: string
  sku: string | null
  sellingPrice: number
  costPrice: number | null
  currentStock: number
  lowStockThreshold: number
  isActive: boolean
}

type Movement = {
  id: string
  type: string
  quantityChange: number
  unitCost: number | null
  note: string | null
  createdAt: string
  product: { id: string; name: string }
  actor: { id: string; name: string } | null
  bookingFnbItem: { id: string; bookingId: string; productName: string } | null
}

type Overview = {
  products: Product[]
  recentMovements: Movement[]
  summary: {
    activeProductCount: number
    lowStockCount: number
    outOfStockCount: number
    stockCostValue: number
  }
}

type RevenueReport = {
  from: string
  to: string
  revenue: number
  saleCount: number
  unitsSold: number
  wasteUnits: number
  wasteCost: number
  topProducts: Array<{
    productId: string
    name: string
    quantity: number
    revenue: number
  }>
}

type ProductForm = {
  name: string
  category: string
  sku: string
  sellingPrice: string
  costPrice: string
  lowStockThreshold: string
  initialStock: string
}

const EMPTY_PRODUCT_FORM: ProductForm = {
  name: '',
  category: 'Drinks',
  sku: '',
  sellingPrice: '',
  costPrice: '',
  lowStockThreshold: '0',
  initialStock: '0',
}

const MOVEMENT_LABELS: Record<string, string> = {
  INITIAL_STOCK: 'Initial stock',
  RESTOCK: 'Restock',
  SALE: 'Booking sale',
  SALE_VOID: 'Sale void',
  WASTE: 'Waste',
  ADJUSTMENT: 'Correction',
}

function formatRupees(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

function errorMessage(data: unknown, fallback: string) {
  return typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string'
    ? data.error
    : fallback
}

function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProductForm>(
    product
      ? {
          name: product.name,
          category: product.category,
          sku: product.sku ?? '',
          sellingPrice: String(product.sellingPrice),
          costPrice: product.costPrice == null ? '' : String(product.costPrice),
          lowStockThreshold: String(product.lowStockThreshold),
          initialStock: '0',
        }
      : EMPTY_PRODUCT_FORM,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (key: keyof ProductForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      name: form.name,
      category: form.category,
      sku: form.sku || null,
      sellingPrice: Number(form.sellingPrice),
      costPrice: form.costPrice === '' ? null : Number(form.costPrice),
      lowStockThreshold: Number(form.lowStockThreshold),
      ...(!product ? { initialStock: Number(form.initialStock) } : {}),
    }
    try {
      const response = await fetch(
        product
          ? `/api/admin/fnb/products/${product.id}`
          : '/api/admin/fnb/products',
        {
          method: product ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const data = await response.json()
      if (!response.ok)
        throw new Error(errorMessage(data, 'Could not save product.'))
      onSaved()
      onClose()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not save product.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModalShell onClose={onClose} labelledBy="fnb-product-title">
      <div className="admin-modal-header">
        <div>
          <h2 id="fnb-product-title">
            {product ? 'Edit F&B product' : 'Add F&B product'}
          </h2>
          <p>Prices are in rupees. Stock changes are tracked separately.</p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
      <form className="fnb-form" onSubmit={save}>
        {error && (
          <p className="fnb-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Product name
          <input
            className="form-input"
            required
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
          />
        </label>
        <label>
          Category
          <input
            className="form-input"
            required
            placeholder="Drinks, Snacks…"
            value={form.category}
            onChange={(event) => update('category', event.target.value)}
          />
        </label>
        <label>
          <span>
            SKU / barcode <span className="fnb-optional">(optional)</span>
          </span>
          <input
            className="form-input"
            value={form.sku}
            onChange={(event) => update('sku', event.target.value)}
          />
        </label>
        <div className="fnb-form-grid">
          <label>
            Selling price
            <input
              className="form-input"
              type="number"
              min="0"
              step="1"
              required
              value={form.sellingPrice}
              onChange={(event) => update('sellingPrice', event.target.value)}
            />
          </label>
          <label>
            <span>
              Cost price
            </span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="1"
              required
              value={form.costPrice}
              onChange={(event) => update('costPrice', event.target.value)}
            />
          </label>
        </div>
        <div className="fnb-form-grid">
          <label>
            Low-stock alert at
            <input
              className="form-input"
              type="number"
              min="0"
              step="1"
              required
              value={form.lowStockThreshold}
              onChange={(event) =>
                update('lowStockThreshold', event.target.value)
              }
            />
          </label>
          {!product && (
            <label>
              Opening stock
              <input
                className="form-input"
                type="number"
                min="0"
                step="1"
                required
                value={form.initialStock}
                onChange={(event) => update('initialStock', event.target.value)}
              />
            </label>
          )}
        </div>
        <div className="fnb-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save product'}
          </button>
        </div>
      </form>
    </AdminModalShell>
  )
}

function StockModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product
  onClose: () => void
  onSaved: () => void
}) {
  const [type, setType] = useState<'RESTOCK' | 'WASTE' | 'ADJUSTMENT'>(
    'RESTOCK',
  )
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState(
    product.costPrice == null ? '' : String(product.costPrice),
  )
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stockChange = Number(quantity) * (type === 'WASTE' ? -1 : 1)

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/admin/fnb/products/${product.id}/stock-movements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            quantityChange: stockChange,
            unitCost: unitCost === '' ? null : Number(unitCost),
            note,
          }),
        },
      )
      const data = await response.json()
      if (!response.ok)
        throw new Error(errorMessage(data, 'Could not update stock.'))
      onSaved()
      onClose()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not update stock.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModalShell onClose={onClose} labelledBy="fnb-stock-title">
      <div className="admin-modal-header">
        <div>
          <h2 id="fnb-stock-title">Adjust stock</h2>
          <p>
            <strong>{product.name}</strong> · {product.currentStock} unit(s)
            currently in stock
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
      <form className="fnb-form" onSubmit={save}>
        {error && (
          <p className="fnb-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Action
          <select
            className="form-input"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
          >
            <option value="RESTOCK">Restock</option>
            <option value="WASTE">Waste / damaged</option>
            <option value="ADJUSTMENT">Manual correction</option>
          </select>
        </label>
        <label>
          {type === 'ADJUSTMENT'
            ? 'Change in units (use - to reduce)'
            : 'Units'}
          <input
            className="form-input"
            type="number"
            required
            min={type === 'ADJUSTMENT' ? undefined : 1}
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        {type === 'RESTOCK' && (
          <label>
            <span>
              Cost per unit <span className="fnb-optional">(optional)</span>
            </span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="1"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
            />
          </label>
        )}
        <label>
          Reason / note
          <textarea
            className="form-input"
            required
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              type === 'RESTOCK'
                ? 'Supplier or invoice reference'
                : 'Explain this change'
            }
          />
        </label>
        <div className="fnb-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update stock'}
          </button>
        </div>
      </form>
    </AdminModalShell>
  )
}

export function AdminFnbInventory() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [reportFrom, setReportFrom] = useState(getTodayString())
  const [reportTo, setReportTo] = useState(getTodayString())
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/fnb/overview', {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error(errorMessage(data, 'Could not load F&B inventory.'))
      setOverview(data)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not load F&B inventory.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  const loadReport = useCallback(async () => {
    setReportLoading(true)
    setReportError('')
    try {
      const response = await fetch(
        `/api/admin/fnb/revenue?${new URLSearchParams({ from: reportFrom, to: reportTo })}`,
        { cache: 'no-store' },
      )
      const data = await response.json()
      if (!response.ok)
        throw new Error(errorMessage(data, 'Could not load F&B revenue.'))
      setReport(data)
    } catch (requestError) {
      setReportError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not load F&B revenue.',
      )
    } finally {
      setReportLoading(false)
    }
  }, [reportFrom, reportTo])
  useEffect(() => {
    void loadReport()
  }, [loadReport])
  const products = useMemo(
    () =>
      (overview?.products ?? []).filter(
        (product) =>
          (showInactive || product.isActive) &&
          `${product.name} ${product.category} ${product.sku ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [overview, search, showInactive],
  )

  const toggleActive = async (product: Product) => {
    const response = await fetch(`/api/admin/fnb/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !product.isActive }),
    })
    if (!response.ok) {
      const data = await response.json()
      setError(errorMessage(data, 'Could not update product.'))
      return
    }
    void load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">F&amp;B Inventory</h1>
          <p className="page-subtitle">
            Track refrigerator stock and booking-linked food &amp; beverage
            sales.
          </p>
        </div>
        <div className="fnb-header-actions">
          <button
            className="btn btn-ghost"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setProductModal('new')}
          >
            <Plus size={17} /> Add product
          </button>
        </div>
      </div>
      {error && (
        <div className="fnb-error" role="alert">
          {error}
        </div>
      )}
      {loading && !overview ? (
        <div className="loading-state">
          <div className="spinner" />
          Loading F&amp;B inventory…
        </div>
      ) : (
        <>
          <section className="card fnb-panel" aria-label="F&B revenue report">
            <div className="fnb-report-heading">
              <div>
                <h2 className="fnb-section-title">
                  <IndianRupee size={17} /> F&amp;B revenue
                </h2>
                <p>
                  Standalone F&amp;B sales only. Gaming revenue is not included.
                </p>
              </div>
              <div className="fnb-report-filters">
                <input
                  className="form-input"
                  type="date"
                  aria-label="F&B report start date"
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                />
                <input
                  className="form-input"
                  type="date"
                  aria-label="F&B report end date"
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void loadReport()}
                  disabled={reportLoading}
                >
                  Apply
                </button>
              </div>
            </div>
            {reportError && (
              <div className="fnb-error" role="alert">
                {reportError}
              </div>
            )}
            {reportLoading && !report ? (
              <div className="loading-state">
                <div className="spinner" />
                Loading F&amp;B revenue…
              </div>
            ) : (
              report && (
                <>
                  <div className="fnb-report-metrics">
                    <div>
                      <span>F&amp;B revenue</span>
                      <strong>{formatRupees(report.revenue)}</strong>
                    </div>
                    <div>
                      <span>Recorded sales</span>
                      <strong>{report.saleCount}</strong>
                    </div>
                    <div>
                      <span>Units sold</span>
                      <strong>{report.unitsSold}</strong>
                    </div>
                    <div>
                      <span>Wastage</span>
                      <strong>
                        {report.wasteUnits} units ·{' '}
                        {formatRupees(report.wasteCost)}
                      </strong>
                    </div>
                  </div>
                  {report.topProducts.length > 0 && (
                    <div className="fnb-top-products">
                      <span>Top products in this period</span>
                      {report.topProducts.map((product) => (
                        <div key={product.productId}>
                          <strong>{product.name}</strong>
                          <span>
                            {product.quantity} sold ·{' '}
                            {formatRupees(product.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </section>
          <section
            className="fnb-summary-grid"
            aria-label="F&B inventory summary"
          >
            <div className="fnb-summary-card">
              <CupSoda size={30} />
              <div>
                <span>Active products</span>
                <strong>{overview?.summary.activeProductCount ?? 0}</strong>
              </div>
            </div>
            <div className="fnb-summary-card fnb-summary-card--alert">
              <AlertTriangle size={30} />
              <div>
                <span>Low stock</span>
                <strong>{overview?.summary.lowStockCount ?? 0}</strong>
              </div>
            </div>
            <div className="fnb-summary-card fnb-summary-card--danger">
              <PackagePlus size={30} />
              <div>
                <span>Out of stock</span>
                <strong>{overview?.summary.outOfStockCount ?? 0}</strong>
              </div>
            </div>
            <div className="fnb-summary-card">
              <SlidersHorizontal size={30} />
              <div>
                <span>Stock cost value</span>
                <strong>
                  {formatRupees(overview?.summary.stockCostValue ?? 0)}
                </strong>
              </div>
            </div>
          </section>
          <section className="card fnb-panel">
            <div className="fnb-toolbar">
              <input
                className="form-input"
                aria-label="Search F&B products"
                value={search}
                placeholder="Search product, category, or SKU"
                onChange={(event) => setSearch(event.target.value)}
              />
              <label className="fnb-inactive-toggle">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                />{' '}
                Show inactive
              </label>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>In stock</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="fnb-empty">
                        No F&amp;B products match this view.
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => {
                      const outOfStock = product.currentStock === 0
                      const lowStock =
                        !outOfStock && product.currentStock <= product.lowStockThreshold
                      const status = !product.isActive
                        ? { label: 'Inactive', className: 'fnb-status--inactive' }
                        : outOfStock
                          ? { label: 'Out of stock', className: 'fnb-status--out' }
                          : lowStock
                            ? { label: 'Low stock', className: 'fnb-status--low' }
                            : { label: 'Active', className: 'fnb-status--active' }
                      return (
                        <tr key={product.id}>
                          <td>
                            <strong>{product.name}</strong>
                            <div className="fnb-table-meta">
                              {product.category}
                              {product.sku ? ` · ${product.sku}` : ''}
                            </div>
                          </td>
                          <td>
                            <strong>
                              {formatRupees(product.sellingPrice)}
                            </strong>
                            {product.costPrice != null && (
                              <div className="fnb-table-meta">
                                Cost {formatRupees(product.costPrice)}
                              </div>
                            )}
                          </td>
                          <td>
                            <strong>{product.currentStock}</strong>
                            <div className="fnb-table-meta">
                              Alert at {product.lowStockThreshold}
                            </div>
                          </td>
                          <td>
                            <span className={`fnb-status ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                          <td>
                            <div className="fnb-row-actions">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setStockProduct(product)}
                                disabled={!product.isActive}
                              >
                                <PackagePlus size={14} /> Stock
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setProductModal(product)}
                              >
                                <Edit2 size={14} /> Edit
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => void toggleActive(product)}
                              >
                                {product.isActive ? 'Archive' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card fnb-panel">
            <h2 className="fnb-section-title">Recent stock activity</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th>Action</th>
                    <th>Change</th>
                    <th>Staff / note</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.recentMovements ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="fnb-empty">
                        Stock activity will appear here.
                      </td>
                    </tr>
                  ) : (
                    overview!.recentMovements.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDateTime(movement.createdAt)}</td>
                        <td>
                          <strong>{movement.product.name}</strong>
                        </td>
                        <td>
                          {MOVEMENT_LABELS[movement.type] ?? movement.type}
                        </td>
                        <td>
                          <strong>
                            {movement.quantityChange > 0 ? '+' : ''}
                            {movement.quantityChange}
                          </strong>
                        </td>
                        <td>
                          <div>{movement.actor?.name ?? 'System'}</div>
                          <div className="fnb-table-meta">
                            {movement.note ?? '—'}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {productModal && (
        <ProductModal
          product={productModal === 'new' ? null : productModal}
          onClose={() => setProductModal(null)}
          onSaved={() => void load()}
        />
      )}
      {stockProduct && (
        <StockModal
          product={stockProduct}
          onClose={() => setStockProduct(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  )
}
