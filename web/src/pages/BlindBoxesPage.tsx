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

function CreateBlindBoxDialog({ open, onClose, onCreated }: CreateDialogProps) {
  const { addToast } = useToast();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [collections, setCollections] = useState<CatalogCollection[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategy, setStrategy] = useState<'uniform' | 'weighted'>('uniform');
  const [productSearch, setProductSearch] = useState('');
  const [collectionSearch, setCollectionSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoadingCatalog(true);
    Promise.all([api.listCatalogProducts(), api.listCatalogCollections()])
      .then(([prods, colls]) => {
        setProducts(prods);
        setCollections(colls);
      })
      .catch(() => addToast('warning', 'Could not load SHOPLINE catalog', 'Check API permissions'))
      .finally(() => setLoadingCatalog(false));
  }, [open]);

  const filteredProducts = products.filter(
    (p) =>
      !productSearch ||
      (p.title ?? '').toLowerCase().includes(productSearch.toLowerCase()) ||
      p.id.includes(productSearch),
  );

  const filteredCollections = collections.filter(
    (c) =>
      !collectionSearch ||
      (c.title ?? '').toLowerCase().includes(collectionSearch.toLowerCase()) ||
      c.id.includes(collectionSearch),
  );

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  async function handleSave() {
    if (!selectedProductId) {
      addToast('error', 'Select a product first');
      return;
    }
    if (!selectedCollectionId) {
      addToast('error', 'Select a reward collection first');
      return;
    }

    setSaving(true);
    try {
      // 1. Refresh blind box list (product must have "blind-box" tag in SHOPLINE)
      const blindBoxes = await api.listBlindBoxes();
      let blindBox = blindBoxes.find((bb) => bb.shoplineProductId === selectedProductId);

      if (!blindBox) {
        addToast(
          'warning',
          'Product not tagged as blind-box',
          'Add the "blind-box" tag to this product in SHOPLINE Admin, then try again.',
        );
        setSaving(false);
        return;
      }

      // 2. Update blind box settings
      blindBox = await api.updateBlindBox(blindBox.id, {
        name: name.trim() || selectedProduct?.title || 'Blind Box',
        description: description.trim() || null,
        status: 'active',
        selectionStrategy: strategy,
      });

      // 3. Create reward group from collection and link it
      const rewardGroup = await api.createRewardGroup({
        shoplineCollectionId: selectedCollectionId,
        status: 'active',
      });

      await api.upsertRewardGroupLink({
        blindBoxId: blindBox.id,
        rewardGroupId: rewardGroup.id,
      });

      addToast('success', 'Blind box configured!', `"${blindBox.name}" is now active`);
      onCreated(blindBox);
      onClose();
    } catch (e: unknown) {
      addToast('error', 'Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setSelectedProductId('');
    setSelectedCollectionId('');
    setName('');
    setDescription('');
    setStrategy('uniform');
    setProductSearch('');
    setCollectionSearch('');
    onClose();
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loadingCatalog}>
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
          <div className="alert alert-info mb-4" style={{ marginBottom: '1.25rem' }}>
            <span className="alert-icon">ℹ</span>
            <div className="alert-body">
              The selected product must have the <strong>blind-box</strong> tag in SHOPLINE Admin for the system to detect it automatically.
            </div>
          </div>

          {/* Blind-box product selector */}
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
              <div className="alert alert-warning" style={{ marginTop: '.25rem' }}>
                <span className="alert-icon">⚠</span>
                <div className="alert-body">
                  No products found from SHOPLINE. Add the <strong>blind-box</strong> tag to a product in SHOPLINE Admin, then re-open this dialog.
                </div>
              </div>
            ) : (
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  const p = products.find((x) => x.id === e.target.value);
                  if (p && !name) setName(p.title ?? '');
                }}
                size={5}
                style={{ height: 'auto' }}
              >
                <option value="">— select product —</option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title ?? p.id}
                    {p.tags.includes('blind-box') ? ' ✓ tagged' : ' ⚠ not tagged'}
                    {' '}({p.variantCount} variant{p.variantCount !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
            )}
            {selectedProductId && !products.find((p) => p.id === selectedProductId)?.tags.includes('blind-box') && (
              <div className="form-error">
                ⚠ This product does not have the "blind-box" tag. Add it in SHOPLINE Admin first.
              </div>
            )}
            <div className="form-hint">Only products tagged "blind-box" will trigger assignments.</div>
          </div>

          <div className="form-row">
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

          {/* Reward collection selector */}
          <div className="form-group">
            <label>Reward Collection *</label>
            <input
              className="search-input"
              style={{ marginBottom: '.5rem' }}
              placeholder="Search collections…"
              value={collectionSearch}
              onChange={(e) => setCollectionSearch(e.target.value)}
            />
            <select
              value={selectedCollectionId}
              onChange={(e) => setSelectedCollectionId(e.target.value)}
              size={5}
              style={{ height: 'auto' }}
            >
              <option value="">— select collection —</option>
              {filteredCollections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ?? c.id}
                  {c.handle ? ` (${c.handle})` : ''}
                </option>
              ))}
            </select>
            <div className="form-hint">
              Products in this SHOPLINE collection will be the reward pool. Rewards are randomly selected from here.
            </div>
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
