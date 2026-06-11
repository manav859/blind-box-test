import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { api, BlindBox, PoolItem, SessionExpiredError, getShopHandle } from '../lib/api';
import { Modal } from '../components/Modal';
import { ImageUpload } from '../components/ImageUpload';
import { TableSkeleton } from '../components/Skeleton';
import { ProductPicker, ProductThumb, PickedProduct } from '../components/ProductPicker';
import { SessionExpiredBanner } from '../components/SessionExpiredBanner';

type ReadinessReport = {
  status: 'ready' | 'not_ready';
  poolSize: number;
  inStockCount: number;
  issues: Array<{ code: string; message: string }>;
  summary: string;
};

type RewardCandidate = {
  productId: string;
  variantId: string | null;
  productTitle: string | null;
  imageUrl: string | null;
  inventoryQuantity: number | null;
  selectionWeight: number;
};

type ExcludedCandidate = {
  productId: string | null;
  productTitle: string | null;
  imageUrl: string | null;
  reason: string;
  message: string;
  inventoryQuantity: number | null;
};

type CandidatePreview = {
  poolSize?: number;
  inStockCount?: number;
  eligibleCandidates?: RewardCandidate[];
  excludedCandidates?: ExcludedCandidate[];
};

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="card-header">
        <h2>{title}</h2>
        {aside}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

export function BlindBoxDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [blindBox, setBlindBox] = useState<BlindBox | null>(null);
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);

  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [busy, setBusy] = useState(false);

  // Backing SHOPLINE product (for current price/image shown in the Edit modal).
  const [productInfo, setProductInfo] = useState<{ imageUrl: string | null; price: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .getBlindBox(id)
      .then((bb) => {
        setBlindBox(bb);
        setName(bb.name);
        setDescription(bb.description ?? '');
        setPoolItems(bb.poolItems ?? []);
        setError(null);
        // Pull the live reward preview (stock + odds) — non-fatal.
        api.getRewardCandidates(id).then((p) => setPreview(p as CandidatePreview)).catch(() => {});
        api.getReadiness(id).then((r) => setReadiness(r as ReadinessReport)).catch(() => {});
        // Backing product info (image; price isn't in the catalog list shape, so
        // it stays blank in the Edit form unless the merchant sets a new one).
        if (bb.triggerProductId) {
          api.getCatalogProduct(bb.triggerProductId)
            .then((p) => setProductInfo({ imageUrl: p.imageUrl, price: '' }))
            .catch(() => {});
        }
      })
      .catch((e: Error) => setError(e))
      .finally(() => setLoading(false));
  }, [id]);

  function openEdit() {
    if (!blindBox) return;
    setEditName(blindBox.name);
    setEditPrice('');
    setEditDescription(blindBox.description ?? '');
    setEditImageUrl(productInfo?.imageUrl ?? '');
    setEditOpen(true);
  }

  async function handleEditSave() {
    if (!blindBox) return;
    if (!editName.trim()) {
      addToast('error', 'Name is required');
      return;
    }
    if (editPrice.trim() && (!Number.isFinite(Number(editPrice)) || Number(editPrice) < 0)) {
      addToast('error', 'Enter a valid price');
      return;
    }
    setEditSaving(true);
    try {
      const updated = await api.updateBlindBoxProduct(blindBox.id, {
        name: editName.trim(),
        price: editPrice.trim() || undefined,
        description: editDescription.trim() || null,
        // Only send the image when it changed — avoids re-attaching the same media.
        imageUrl: editImageUrl.trim() && editImageUrl.trim() !== (productInfo?.imageUrl ?? '') ? editImageUrl.trim() : null,
      });
      setBlindBox(updated);
      setEditOpen(false);
      addToast('success', 'Blind box & SHOPLINE product updated');
      load();
    } catch (e: unknown) {
      addToast('error', 'Update failed', e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  }

  useEffect(() => { load(); }, [load]);

  // Refresh ONLY the reward pool + its preview/readiness — no full-page spinner.
  const refreshRewards = useCallback(async () => {
    if (!id) return;
    const [items, p, r] = await Promise.all([
      api.listRewards(id),
      api.getRewardCandidates(id).catch(() => null),
      api.getReadiness(id).catch(() => null),
    ]);
    setPoolItems(items);
    if (p) setPreview(p as CandidatePreview);
    if (r) setReadiness(r as ReadinessReport);
  }, [id]);

  async function handleSaveSettings(nextStatus?: BlindBox['status']) {
    if (!blindBox) return;
    setSaving(true);
    try {
      const updated = await api.updateBlindBox(blindBox.id, {
        name: name.trim() || blindBox.name,
        description: description.trim() || null,
        status: nextStatus ?? blindBox.status,
      });
      setBlindBox(updated);
      setDirty(false);
      addToast('success', nextStatus === 'active' ? 'Blind box activated' : 'Settings saved');
      load();
    } catch (e: unknown) {
      addToast('error', nextStatus === 'active' ? 'Cannot activate' : 'Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function addReward(product: PickedProduct) {
    if (!blindBox) return;
    setBusy(true);
    try {
      await api.addReward(blindBox.id, {
        rewardProductId: product.productId,
        rewardTitleSnapshot: product.productTitle,
      });
      addToast('success', 'Reward added to pool');
      await refreshRewards();
    } catch (e: unknown) {
      addToast('error', 'Could not add reward', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeReward(poolItemId: string) {
    if (!blindBox) return;
    // Optimistic: drop it from the list immediately, then confirm with the server.
    const previous = poolItems;
    setPoolItems((items) => items.filter((i) => i.id !== poolItemId));
    setBusy(true);
    try {
      await api.removeReward(blindBox.id, poolItemId);
      addToast('success', 'Reward removed');
      await refreshRewards();
    } catch (e: unknown) {
      setPoolItems(previous); // rollback on failure
      addToast('error', 'Could not remove reward', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Blind Box Detail">
        <TableSkeleton rows={6} />
      </Layout>
    );
  }

  if (error instanceof SessionExpiredError) {
    return <Layout title="Session expired"><SessionExpiredBanner authUrl={error.authUrl} /></Layout>;
  }

  if (error || !blindBox) {
    return (
      <Layout title="Blind Box Not Found">
        <div className="alert alert-danger">
          <span className="alert-icon">✕</span>
          <div className="alert-body">
            <div className="alert-title">{error?.message ?? 'Blind box not found'}</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '.75rem' }} onClick={() => navigate('/blind-boxes')}>
              ← Back to list
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // Build a stock + odds + image lookup from the live preview (product-level).
  const eligible = preview?.eligibleCandidates ?? [];
  const excluded = preview?.excludedCandidates ?? [];
  const totalWeight = eligible.reduce((sum, c) => sum + c.selectionWeight, 0);
  type RewardInfo = { stock: number | null; eligible: boolean; reason?: string; imageUrl: string | null };
  const infoByProduct = new Map<string, RewardInfo>();
  for (const c of eligible) infoByProduct.set(c.productId, { stock: c.inventoryQuantity, eligible: true, imageUrl: c.imageUrl });
  for (const c of excluded) if (c.productId) infoByProduct.set(c.productId, { stock: c.inventoryQuantity, eligible: false, reason: c.reason, imageUrl: c.imageUrl });

  // Map raw exclusion reasons to short, merchant-friendly status notes.
  const reasonNote = (reason?: string): string => {
    switch (reason) {
      case 'OUT_OF_STOCK': return 'Out of stock — won’t be selected';
      case 'INACTIVE_PRODUCT': return 'Inactive — won’t be selected';
      case 'SELF_REWARD_PRODUCT': return 'Same as trigger — won’t be selected';
      case 'VARIANT_NOT_FOUND': return 'Variant missing — won’t be selected';
      case 'PRODUCT_FETCH_FAILED': return 'Could not load from SHOPLINE';
      default: return reason ? 'Won’t be selected' : '';
    }
  };
  const excludedProductIds = new Set([blindBox.triggerProductId, ...poolItems.map((p) => p.rewardProductId)].filter(Boolean) as string[]);

  return (
    <Layout
      title={blindBox.name}
      actions={
        <>
          <StatusBadge status={blindBox.status} />
          <button className="btn btn-primary btn-sm" onClick={openEdit}>✏ Edit</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/blind-boxes')}>← Back</button>
        </>
      }
    >
      <div className="breadcrumb">
        <Link to="/">Dashboard</Link>
        <span className="breadcrumb-sep">›</span>
        <Link to="/blind-boxes">Blind Boxes</Link>
        <span className="breadcrumb-sep">›</span>
        <span>{blindBox.name}</span>
      </div>

      {/* General settings */}
      <Section
        title="General Settings"
        aside={dirty && (
          <button className="btn btn-primary btn-sm" onClick={() => handleSaveSettings()} disabled={saving}>
            {saving ? <><span className="spinner spinner-sm" /> Saving…</> : 'Save Changes'}
          </button>
        )}
      >
        <div className="form-group">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Description (optional)</label>
          <textarea className="input" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} rows={2} />
        </div>
        {dirty && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.75rem' }}>
            <button className="btn btn-primary" onClick={() => handleSaveSettings()} disabled={saving}>Save Changes</button>
            <button className="btn btn-secondary" onClick={() => { setName(blindBox.name); setDescription(blindBox.description ?? ''); setDirty(false); }}>Discard</button>
          </div>
        )}
      </Section>

      {/* Trigger product */}
      <Section title="Trigger Product (what customers buy)">
        <div className="kv-list">
          <div className="kv-row">
            <span className="kv-label">Product</span>
            <span className="kv-value">{blindBox.triggerProductTitleSnapshot ?? blindBox.triggerProductId ?? <span className="text-muted">Not set</span>}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">Product ID</span>
            <span className="kv-value code">{blindBox.triggerProductId ?? '—'}</span>
          </div>
          {blindBox.triggerProductId && getShopHandle() && (
            <div className="kv-row">
              <span className="kv-label">In SHOPLINE</span>
              <span className="kv-value">
                <a
                  href={`https://${getShopHandle()}.myshopline.com/admin/products/${blindBox.triggerProductId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open product in SHOPLINE ↗
                </a>
              </span>
            </div>
          )}
        </div>
        <div style={{ marginTop: '.75rem' }}>
          <ProductPicker
            buttonLabel="Change trigger product"
            excludeIds={poolItems.map((p) => p.rewardProductId)}
            onPick={async (p) => {
              setBusy(true);
              try {
                await api.updateBlindBox(blindBox.id, { triggerProductId: p.productId });
                addToast('success', 'Trigger product updated');
                load();
              } catch (e: unknown) {
                addToast('error', 'Update failed', e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      </Section>

      {/* Reward pool */}
      <Section
        title={`Reward Pool (${poolItems.length})`}
        aside={<span className="text-xs text-muted">Selection is weighted by live stock — more stock = higher chance</span>}
      >
        {poolItems.length === 0 ? (
          <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
            <span className="alert-icon">⚠</span>
            <div className="alert-body">No reward products yet. Add at least one in-stock product to activate this blind box.</div>
          </div>
        ) : (
          <div className="table-wrapper" style={{ marginBottom: '1rem' }}>
            <table>
              <thead>
                <tr><th>Reward product</th><th>Current stock</th><th>Selection odds</th><th></th></tr>
              </thead>
              <tbody>
                {poolItems.map((item) => {
                  const info = infoByProduct.get(item.rewardProductId);
                  const stock = info?.stock ?? null;
                  // Odds are PRODUCT-LEVEL: stock / Σ(in-stock pool stock). Always a %.
                  const odds = info?.eligible && totalWeight > 0 ? (info.stock ?? 0) / totalWeight : 0;
                  const note = info && !info.eligible ? reasonNote(info.reason) : '';
                  return (
                    <tr key={item.id}>
                      <td className="td-primary">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                          <ProductThumb src={info?.imageUrl ?? null} alt={item.rewardTitleSnapshot ?? item.rewardProductId} />
                          <div>
                            <div>{item.rewardTitleSnapshot ?? item.rewardProductId}</div>
                            {note && <div className="text-xs" style={{ color: 'var(--color-danger-text, #b42318)' }}>{note}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        {stock === null ? (
                          <span className="text-muted text-xs">—</span>
                        ) : (
                          <span className={stock > 0 ? 'badge badge-success' : 'badge badge-danger'}>{stock}</span>
                        )}
                      </td>
                      <td>
                        {info?.eligible ? (
                          <span className="code">{(odds * 100).toFixed(1)}%</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => removeReward(item.id)}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <ProductPicker buttonLabel="Add reward product" excludeIds={[...excludedProductIds]} onPick={addReward} />
      </Section>

      {/* Activation */}
      <Section
        title="Activation"
        aside={
          blindBox.status !== 'active' ? (
            <button className="btn btn-primary btn-sm" onClick={() => handleSaveSettings('active')} disabled={saving}>
              {saving ? <><span className="spinner spinner-sm" /> Activating…</> : '▶ Activate'}
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => handleSaveSettings('draft')} disabled={saving}>
              Pause (set draft)
            </button>
          )
        }
      >
        {readiness ? (
          <div className={`alert ${readiness.status === 'ready' ? 'alert-success' : 'alert-warning'}`}>
            <span className="alert-icon">{readiness.status === 'ready' ? '✓' : '⚠'}</span>
            <div className="alert-body">
              <div className="alert-title">{readiness.status === 'ready' ? 'Ready to activate' : 'Not ready'}</div>
              <div style={{ fontSize: '.85rem' }}>{readiness.summary}</div>
              {readiness.issues.length > 0 && (
                <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem', fontSize: '.85rem' }}>
                  {readiness.issues.map((i) => <li key={i.code}>{i.message}</li>)}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="text-muted text-sm">Readiness will appear here.</div>
        )}
        <div className="form-hint" style={{ marginTop: '.6rem' }}>
          Only <strong>active</strong> blind boxes assign rewards when the trigger product is purchased.
        </div>
      </Section>

      {/* Edit blind box + backing SHOPLINE product */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Blind Box"
        subtitle="Changes update the SHOPLINE product too (name, price, image, description)"
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <><span className="spinner spinner-sm" /> Saving…</> : 'Save changes'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label>Name *</label>
            <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Price</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="leave blank to keep current price"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Product image</label>
          <ImageUpload value={editImageUrl} onChange={setEditImageUrl} disabled={editSaving} />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Description</label>
          <textarea
            className="input"
            rows={3}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </div>
      </Modal>
    </Layout>
  );
}
