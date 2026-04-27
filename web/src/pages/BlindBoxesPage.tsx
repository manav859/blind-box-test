import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api, BlindBox, CatalogProduct, CatalogCollection, RewardGroup } from '../lib/api';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Create dialog ────────────────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onClose(): void;
  onCreated(bb: BlindBox): void;
}

/** Extract the blind-box-collection handle from a product's tags array. */
function deriveCollectionHandle(tags: string[]): string {
  const tag = tags.find((t) => t.startsWith('blind-box-collection:'));
  return tag ? tag.replace('blind-box-collection:', '').trim() : '';
}

function CreateBlindBoxDialog({ open, onClose, onCreated }: CreateDialogProps) {
  const { addToast } = useToast();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [collections, setCollections] = useState<CatalogCollection[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCollectionOverride, setShowCollectionOverride] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [overrideCollectionId, setOverrideCollectionId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategy, setStrategy] = useState<'uniform' | 'weighted'>('uniform');
  const [productSearch, setProductSearch] = useState('');
  const [collectionSearch, setCollectionSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoadingCatalog(true);
    Promise.all([api.listCatalogProducts(), api.listCatalogCollections()])
      .then(([prods, colls]) => { setProducts(prods); setCollections(colls); })
      .catch(() => {})
      .finally(() => setLoadingCatalog(false));
  }, [open]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const tagHandle = selectedProduct ? deriveCollectionHandle(selectedProduct.tags) : '';

  // Effective collection identifier sent to the backend.
  // Priority: manual dropdown override → tag-derived handle.
  // The backend accepts both numeric IDs and slug handles.
  const effectiveCollectionId = overrideCollectionId || tagHandle;

  const isProductSelected = Boolean(selectedProductId);
  const isBlindBoxTagged = selectedProduct?.tags.includes('blind-box') ?? false;
  const hasCollectionTag = Boolean(tagHandle);
  const canSave = isProductSelected && Boolean(effectiveCollectionId) && !loadingCatalog;

  const filteredProducts = products.filter(
    (p) => !productSearch ||
      (p.title ?? '').toLowerCase().includes(productSearch.toLowerCase()) ||
      p.id.includes(productSearch),
  );
  const filteredCollections = collections.filter(
    (c) => !collectionSearch ||
      (c.title ?? '').toLowerCase().includes(collectionSearch.toLowerCase()) ||
      c.id.includes(collectionSearch),
  );

  function handleProductChange(productId: string) {
    setSelectedProductId(productId);
    const p = products.find((x) => x.id === productId);
    if (p && !name) setName(p.title ?? '');
    // Clear any manual override so the tag-derived handle takes effect.
    setOverrideCollectionId('');
    setShowCollectionOverride(false);
  }

  function handleClose() {
    setSelectedProductId('');
    setOverrideCollectionId('');
    setName('');
    setDescription('');
    setStrategy('uniform');
    setProductSearch('');
    setCollectionSearch('');
    setShowCollectionOverride(false);
    onClose();
  }

  async function handleSave() {
    if (!selectedProductId) { addToast('error', 'Select a product first'); return; }
    if (!effectiveCollectionId) {
      addToast('error', 'Reward collection required',
        'Add a blind-box-collection:<handle> tag to the product in SHOPLINE Admin.');
      return;
    }

    setSaving(true);
    try {
      const blindBoxes = await api.listBlindBoxes();
      let blindBox = blindBoxes.find((bb) => bb.shoplineProductId === selectedProductId);
      if (!blindBox) {
        addToast('warning', 'Product not tagged as blind-box',
          'Add the "blind-box" tag to this product in SHOPLINE Admin, then try again.');
        setSaving(false);
        return;
      }

      blindBox = await api.updateBlindBox(blindBox.id, {
        name: name.trim() || selectedProduct?.title || 'Blind Box',
        description: description.trim() || null,
        status: 'active',
        selectionStrategy: strategy,
      });

      // effectiveCollectionId is either a numeric SHOPLINE ID or a slug handle.
      // The backend's validateRewardGroupInput resolves handles automatically.
      const rewardGroup = await api.createRewardGroup({
        shoplineCollectionId: effectiveCollectionId,
        status: 'active',
      });

      await api.upsertRewardGroupLink({ blindBoxId: blindBox.id, rewardGroupId: rewardGroup.id });
      addToast('success', 'Blind box configured!', `"${blindBox.name}" is now active`);
      onCreated(blindBox);
      onClose();
    } catch (e: unknown) {
      addToast('error', 'Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Configure Blind Box"
      subtitle="Link a SHOPLINE product to a reward collection"
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <><span className="spinner spinner-sm" /> Saving…</> : 'Save Configuration'}
          </button>
        </>
      }
    >
      {loadingCatalog ? (
        <div className="loading-overlay" style={{ padding: '2rem' }}>
          <div className="spinner" />
          <span>Loading SHOPLINE catalog…</span>
        </div>
      ) : (
        <>
          {/* ── Product selector ─────────────────────────────────────────── */}
          <div className="form-group">
            <label>Blind-Box Product *</label>
            <input
              className="search-input"
              style={{ marginBottom: '.5rem' }}
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {products.length === 0 ? (
              <div className="alert alert-warning">
                <span className="alert-icon">⚠</span>
                <div className="alert-body">
                  No products found. Add the <strong>blind-box</strong> tag to a product in SHOPLINE Admin, then re-open this dialog.
                </div>
              </div>
            ) : (
              <select
                value={selectedProductId}
                onChange={(e) => handleProductChange(e.target.value)}
                size={5}
                style={{ height: 'auto' }}
              >
                <option value="">— select product —</option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title ?? p.id}
                    {p.tags.includes('blind-box') ? ' ✓' : ' ⚠ missing blind-box tag'}
                    {p.tags.some((t) => t.startsWith('blind-box-collection:')) ? ' 🔗' : ''}
                  </option>
                ))}
              </select>
            )}
            {isProductSelected && !isBlindBoxTagged && (
              <div className="form-error">
                This product does not have the "blind-box" tag. Add it in SHOPLINE Admin first.
              </div>
            )}
          </div>

          {/* ── Reward collection — tag-first ────────────────────────────── */}
          {isProductSelected && (
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Reward Collection</label>

              {hasCollectionTag ? (
                // Primary state: collection handle resolved from product tag.
                <div
                  className="alert alert-success"
                  style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '.25rem' }}
                >
                  <span style={{ fontSize: '1.1rem' }}>✓</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: '.15rem' }}>
                      Auto-linked via product tag
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '.85rem' }}>
                      blind-box-collection:<strong>{tagHandle}</strong>
                    </div>
                    {overrideCollectionId && (
                      <div style={{ fontSize: '.8rem', marginTop: '.2rem', color: 'var(--color-text-muted)' }}>
                        Override active: using collection ID {overrideCollectionId}
                      </div>
                    )}
                  </div>
                  {collections.length > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flexShrink: 0 }}
                      onClick={() => setShowCollectionOverride((v) => !v)}
                    >
                      {showCollectionOverride ? 'Hide override' : 'Override'}
                    </button>
                  )}
                </div>
              ) : (
                // Warning: product has no collection tag.
                <div className="alert alert-warning" style={{ marginTop: '.25rem' }}>
                  <span className="alert-icon">⚠</span>
                  <div className="alert-body">
                    No reward collection linked. Add the tag{' '}
                    <code>blind-box-collection:&lt;handle&gt;</code> to this product in SHOPLINE Admin.
                    {collections.length > 0 && (
                      <> Or{' '}
                        <button
                          className="btn-link"
                          style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onClick={() => setShowCollectionOverride((v) => !v)}
                        >
                          select a collection manually
                        </button>.
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Optional collection dropdown override */}
              {showCollectionOverride && collections.length > 0 && (
                <div style={{ marginTop: '.75rem' }}>
                  <input
                    className="search-input"
                    style={{ marginBottom: '.5rem' }}
                    placeholder="Search collections…"
                    value={collectionSearch}
                    onChange={(e) => setCollectionSearch(e.target.value)}
                  />
                  <select
                    value={overrideCollectionId}
                    onChange={(e) => setOverrideCollectionId(e.target.value)}
                    size={4}
                    style={{ height: 'auto' }}
                  >
                    <option value="">— use tag-derived handle —</option>
                    {filteredCollections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title ?? c.id}
                        {c.handle ? ` (${c.handle})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-hint" style={{ marginTop: '.4rem' }}>
                Products in this collection are the reward pool for assignments.
              </div>
            </div>
          )}

          {/* ── Name, strategy, description ──────────────────────────────── */}
          <div className="form-row" style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label>Internal Name</label>
              <input
                className="input"
                placeholder="e.g. Summer Mystery Box"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Selection Strategy</label>
              <select value={strategy} onChange={(e) => setStrategy(e.target.value as 'uniform' | 'weighted')}>
                <option value="uniform">Uniform (equal chance)</option>
                <option value="weighted">Weighted (custom probability)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Description (optional)</label>
            <textarea
              className="input"
              placeholder="Internal notes about this blind box…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function BlindBoxesPage() {
  const { addToast } = useToast();
  const [blindBoxes, setBlindBoxes] = useState<BlindBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listBlindBoxes()
      .then((data) => {
        setBlindBoxes(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = blindBoxes.filter((bb) => {
    const matchSearch =
      !search ||
      bb.name.toLowerCase().includes(search.toLowerCase()) ||
      (bb.productTitleSnapshot ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (bb.shoplineProductId ?? '').includes(search);
    const matchStatus = statusFilter === 'all' || bb.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleArchive(bb: BlindBox) {
    if (!confirm(`Archive "${bb.name}"? It will no longer accept new assignments.`)) return;
    setArchivingId(bb.id);
    try {
      await api.updateBlindBox(bb.id, { status: 'archived' });
      addToast('success', `"${bb.name}" archived`);
      load();
    } catch (e: unknown) {
      addToast('error', 'Archive failed', e instanceof Error ? e.message : String(e));
    } finally {
      setArchivingId(null);
    }
  }

  async function handleActivate(bb: BlindBox) {
    setArchivingId(bb.id);
    try {
      await api.updateBlindBox(bb.id, { status: 'active' });
      addToast('success', `"${bb.name}" activated`);
      load();
    } catch (e: unknown) {
      addToast('error', 'Activation failed', e instanceof Error ? e.message : String(e));
    } finally {
      setArchivingId(null);
    }
  }

  const headerActions = (
    <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
      + Configure Blind Box
    </button>
  );

  return (
    <Layout title="Blind Boxes" actions={headerActions}>
      <div className="toolbar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search by name or product…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '.5rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '.875rem' }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          ↺ Refresh
        </button>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <span>Loading blind boxes…</span>
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-danger mb-4">
          <span className="alert-icon">✕</span>
          <div className="alert-body">
            <div className="alert-title">Failed to load</div>
            {error}
          </div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎁</div>
          <h3>{blindBoxes.length === 0 ? 'No blind boxes yet' : 'No results'}</h3>
          <p>
            {blindBoxes.length === 0
              ? 'Tag a product with "blind-box" in SHOPLINE Admin, then click "Configure Blind Box" to set up your first one.'
              : 'Try a different search or status filter.'}
          </p>
          {blindBoxes.length === 0 && (
            <button className="btn btn-primary mt-4" onClick={() => setCreateOpen(true)}>
              Configure Blind Box
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Product</th>
                <th>Reward Source</th>
                <th>Strategy</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bb) => (
                <tr key={bb.id}>
                  <td className="td-primary">
                    <Link to={`/blind-boxes/${bb.id}`} style={{ color: 'var(--color-primary)' }}>
                      {bb.name}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={bb.status} />
                  </td>
                  <td>
                    {bb.productTitleSnapshot ? (
                      <span className="text-sm">{bb.productTitleSnapshot}</span>
                    ) : bb.shoplineProductId ? (
                      <span className="code">{bb.shoplineProductId}</span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    {(bb as BlindBox & { rewardGroup?: { collectionTitleSnapshot?: string | null } }).rewardGroup
                      ?.collectionTitleSnapshot ? (
                      <span className="badge badge-info">
                        📦 {(bb as BlindBox & { rewardGroup?: { collectionTitleSnapshot?: string | null } }).rewardGroup!
                          .collectionTitleSnapshot}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">Not configured</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-primary" style={{ textTransform: 'capitalize' }}>
                      {bb.selectionStrategy}
                    </span>
                  </td>
                  <td className="text-xs text-muted">{formatDate(bb.createdAt)}</td>
                  <td>
                    <div className="table-actions">
                      <Link to={`/blind-boxes/${bb.id}`} className="btn btn-secondary btn-sm">
                        Edit
                      </Link>
                      {bb.status !== 'archived' ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleArchive(bb)}
                          disabled={archivingId === bb.id}
                        >
                          {archivingId === bb.id ? <span className="spinner spinner-sm" /> : 'Archive'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleActivate(bb)}
                          disabled={archivingId === bb.id}
                        >
                          {archivingId === bb.id ? <span className="spinner spinner-sm" /> : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateBlindBoxDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => load()}
      />
    </Layout>
  );
}
