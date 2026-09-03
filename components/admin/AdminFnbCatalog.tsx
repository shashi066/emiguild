'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CupSoda, Edit2, Eye, EyeOff, Plus, Search, X } from 'lucide-react'
import AdminModalShell from '@/components/admin/AdminModalShell'
import { formatCurrency } from '@/lib/utils'

type FnbProduct = {
  id: string
  name: string
  sellingPrice: number
  isActive: boolean
}

function errorMessage(data: unknown, fallback: string) {
  return typeof data === 'object'
    && data !== null
    && 'error' in data
    && typeof data.error === 'string'
    ? data.error
    : fallback
}

function sortProducts(products: FnbProduct[]) {
  return [...products].sort(
    (left, right) =>
      left.sellingPrice - right.sellingPrice
      || left.name.localeCompare(right.name),
  )
}

function FnbProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: FnbProduct | null
  onClose: () => void
  onSaved: (savedProduct: FnbProduct) => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(
    product ? String(product.sellingPrice) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const priceNumber = Number(price)
  const valid = Boolean(
    name.trim()
    && price !== ''
    && Number.isInteger(priceNumber)
    && priceNumber >= 0,
  )

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        product
          ? `/api/admin/fnb/products/${product.id}`
          : '/api/admin/fnb/products',
        {
          method: product ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, sellingPrice: priceNumber }),
        },
      )
      const data = await response.json()
      if (!response.ok) {
        throw new Error(errorMessage(data, 'Could not save F&B item.'))
      }
      onSaved(data.product)
      onClose()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not save F&B item.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminModalShell
      onClose={onClose}
      labelledBy="fnb-item-title"
      lightweight
    >
      <div className="admin-modal-header">
        <div>
          <h2 id="fnb-item-title">
            {product ? 'Edit F&B item' : 'Add F&B item'}
          </h2>
          <p>This price is used for new booking add-ons.</p>
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
          Item name
          <input
            className="form-input"
            required
            maxLength={120}
            autoFocus
            placeholder="Red Bull"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Price
          <input
            className="form-input"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            required
            placeholder="125"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <div className="fnb-modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary fnb-primary-action"
            disabled={!valid || busy}
          >
            {busy ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </form>
    </AdminModalShell>
  )
}

export function AdminFnbCatalog() {
  const [products, setProducts] = useState<FnbProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [modalProduct, setModalProduct] = useState<FnbProduct | 'new' | null>(
    null,
  )
  const [updatingId, setUpdatingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/fnb/products?includeInactive=true', {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(errorMessage(data, 'Could not load F&B items.'))
      }
      setProducts(sortProducts(data.products ?? []))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not load F&B items.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => (
      (showHidden || product.isActive)
      && (!query || product.name.toLowerCase().includes(query))
    ))
  }, [products, search, showHidden])

  const storeProduct = (savedProduct: FnbProduct) => {
    setProducts((current) => sortProducts([
      ...current.filter((product) => product.id !== savedProduct.id),
      savedProduct,
    ]))
  }

  const toggleProduct = async (product: FnbProduct) => {
    if (updatingId) return
    setUpdatingId(product.id)
    setError('')
    try {
      const response = await fetch(`/api/admin/fnb/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !product.isActive }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(errorMessage(data, 'Could not update F&B item.'))
      }
      storeProduct(data.product)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not update F&B item.',
      )
    } finally {
      setUpdatingId('')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">F&amp;B Items</h1>
          <p className="page-subtitle">
            Set the items and prices available for booking add-ons.
          </p>
        </div>
        <button
          className="btn btn-primary fnb-primary-action"
          onClick={() => setModalProduct('new')}
        >
          <Plus size={17} /> Add Item
        </button>
      </div>

      {error && (
        <div className="fnb-error fnb-error--retry" role="alert">
          <span>{error}</span>
          {products.length === 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void load()}
              disabled={loading}
            >
              Retry
            </button>
          )}
        </div>
      )}

      <section className="fnb-catalog" aria-label="F&B item catalog">
        <div className="fnb-catalog-toolbar">
          <div className="fnb-catalog-search">
            <Search size={16} aria-hidden="true" />
            <input
              className="form-input"
              type="search"
              aria-label="Search F&B items"
              placeholder="Search items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="fnb-hidden-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
            />
            Show hidden
          </label>
        </div>

        {loading && products.length === 0 ? (
          <div className="loading-state">
            <div className="spinner" />
            Loading F&amp;B items...
          </div>
        ) : (
          <div className="fnb-catalog-list">
            <div className="fnb-catalog-head" aria-hidden="true">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {visibleProducts.length === 0 ? (
              <div className="fnb-empty">
                {products.length === 0
                  ? 'Add your first F&B item.'
                  : 'No items match this view.'}
              </div>
            ) : (
              visibleProducts.map((product) => (
                <article className="fnb-catalog-row" key={product.id}>
                  <div className="fnb-catalog-name" data-label="Item">
                    <CupSoda size={17} aria-hidden="true" />
                    <strong>{product.name}</strong>
                  </div>
                  <strong className="fnb-catalog-price" data-label="Price">
                    {formatCurrency(product.sellingPrice)}
                  </strong>
                  <span
                    className={`fnb-item-state${product.isActive ? '' : ' is-hidden'}`}
                    data-label="Status"
                  >
                    {product.isActive ? 'Available' : 'Hidden'}
                  </span>
                  <div className="fnb-catalog-actions" data-label="Actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setModalProduct(product)}
                      disabled={updatingId === product.id}
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void toggleProduct(product)}
                      disabled={Boolean(updatingId)}
                    >
                      {product.isActive
                        ? <><EyeOff size={14} /> Hide</>
                        : <><Eye size={14} /> Restore</>}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </section>

      {modalProduct && (
        <FnbProductModal
          product={modalProduct === 'new' ? null : modalProduct}
          onClose={() => setModalProduct(null)}
          onSaved={storeProduct}
        />
      )}
    </div>
  )
}
