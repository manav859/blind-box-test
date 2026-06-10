import React, { useEffect, useMemo, useState } from 'react';
import { api, CatalogProduct } from '../lib/api';

export interface PickedProduct {
  productId: string;
  productTitle: string | null;
  imageUrl: string | null;
  /** Total stock across the product's variants (for display + odds). */
  stock: number;
}

/** Small square product thumbnail with a neutral placeholder fallback. */
export function ProductThumb({ src, alt, size = 36 }: { src: string | null; alt: string; size?: number }) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    objectFit: 'cover',
    background: 'var(--color-surface-alt, #f1f1f4)',
    border: '1px solid var(--color-border)',
    flexShrink: 0,
  };
  if (!src) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5 }}>
        🎁
      </div>
    );
  }
  return <img src={src} alt={alt} style={style} loading="lazy" />;
}

function totalStock(product: CatalogProduct): number {
  return product.variants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
}

/**
 * SHOPLINE product picker backed by /catalog/products. `excludeIds` hides
 * products already chosen (e.g. the trigger product, or rewards already added).
 */
export function ProductPicker({
  onPick,
  excludeIds = [],
  buttonLabel = 'Add product',
}: {
  onPick: (product: PickedProduct) => void | Promise<void>;
  excludeIds?: string[];
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || products.length > 0) return;
    setLoading(true);
    api
      .listCatalogProducts()
      .then((rows) => setProducts(rows))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, products.length]);

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const filtered = products.filter(
    (p) => !excluded.has(p.id) && (!search || (p.title ?? '').toLowerCase().includes(search.toLowerCase())),
  );

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} type="button">
        + {buttonLabel}
      </button>
    );
  }

  return (
    <div className="card" style={{ marginTop: '.75rem' }}>
      <div className="card-header">
        <h3 style={{ margin: 0, fontSize: '.95rem' }}>Pick a SHOPLINE product</h3>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} type="button">
          Close
        </button>
      </div>
      <div className="card-body">
        <input
          className="input"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: '.75rem' }}
        />
        {loading && (
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <span className="spinner spinner-sm" /> Loading products…
          </div>
        )}
        {error && <div className="alert alert-danger"><div className="alert-body">{error}</div></div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-muted text-sm">No products found.</div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="table-wrapper" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>Product</th><th>Stock</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const stock = totalStock(p);
                  return (
                    <tr key={p.id}>
                      <td className="td-primary">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                          <ProductThumb src={p.imageUrl} alt={p.title ?? p.id} />
                          <span>{p.title ?? p.id}</span>
                        </div>
                      </td>
                      <td>
                        <span className={stock > 0 ? 'badge badge-success' : 'badge badge-danger'}>{stock}</span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          onClick={() => onPick({ productId: p.id, productTitle: p.title, imageUrl: p.imageUrl, stock })}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
