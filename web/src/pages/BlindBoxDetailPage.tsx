import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { api, BlindBox, CatalogCollection, CatalogProduct } from '../lib/api';

/** Extract the blind-box-collection handle from a product's tags array. */
function deriveCollectionHandle(tags: string[]): string {
  const tag = tags.find((t) => t.startsWith('blind-box-collection:'));
  return tag ? tag.replace('blind-box-collection:', '').trim() : '';
}

type ReadinessReport = {
  ready: boolean;
  checks: Array<{ name: string; passed: boolean; message: string }>;
};

type RewardCandidate = {
  productId: string;
  variantId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  inventoryQuantity: number | null;
  selectionWeight: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BlindBoxDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [blindBox, setBlindBox] = useState<BlindBox | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'archived'>('draft');
  const [strategy, setStrategy] = useState<'uniform' | 'weighted'>('uniform');
  const [dirty, setDirty] = useState(false);

  // Reward collection
  const [collections, setCollections] = useState<CatalogCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [savingCollection, setSavingCollection] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(false);

  // SHOPLINE product (fetched for tags — the DB record has no tags field)
  const [shoplineProduct, setShoplineProduct] = useState<CatalogProduct | null>(null);

  // Readiness
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);

  // Reward preview
  const [candidates, setCandidates] = useState<RewardCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .getBlindBox(id)
      .then((bb) => {
        setBlindBox(bb);
        setName(bb.name);
        setDescription(bb.description ?? '');
        setStatus(bb.status);
        setStrategy(bb.selectionStrategy);
        if (bb.rewardGroup) {
          setSelectedCollectionId(bb.rewardGroup.shoplineCollectionId);
        }
        setError(null);

        // Fetch the live SHOPLINE product so we can read its tags.
        // The DB record (BlindBox) does not store tags.
        if (bb.shoplineProductId) {
          api.getCatalogProduct(bb.shoplineProductId)
            .then((p) => {
              setShoplineProduct(p);
              console.log('[BlindBoxDetail] SHOPLINE product loaded', {
                productId: p.id,
                productTitle: p.title,
                tags: p.tags,
                extractedCollectionHandle: deriveCollectionHandle(p.tags),
              });
            })
            .catch(() => {
              // Non-fatal — fall back to DB-only state
            });
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setLoadingCollections(true);
    api.listCatalogCollections()
      .then((cols) => setCollections(cols))
      .catch(() => {})
      .finally(() => setLoadingCollections(false));
  }, []);

  async function handleSaveSettings() {
    if (!blindBox) return;
    setSaving(true);
    try {
      const updated = await api.updateBlindBox(blindBox.id, {
        name: name.trim() || blindBox.name,
        description: description.trim() || null,
        status,
        selectionStrategy: strategy,
      });
      setBlindBox(updated);
      setDirty(false);
      addToast('success', 'Settings saved');
    } catch (e: unknown) {
      addToast('error', 'Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Tag-derived collection handle — primary source for "is linked" state.
  const tagHandle = shoplineProduct ? deriveCollectionHandle(shoplineProduct.tags) : '';
  // Effective identifier: dropdown override first, then tag, then DB snapshot.
  const effectiveCollectionId =
    selectedCollectionId ||
    tagHandle ||
    blindBox?.rewardGroup?.shoplineCollectionId ||
    '';

  async function handleSaveCollection() {
    if (!blindBox || !effectiveCollectionId) {
      addToast('error', 'No collection to link',
        'Add a blind-box-collection:<handle> tag to the product or select a collection below.');
      return;
    }
    setSavingCollection(true);
    try {
      const rg = await api.createRewardGroup({
        shoplineCollectionId: effectiveCollectionId,
        status: 'active',
      });
      await api.upsertRewardGroupLink({ blindBoxId: blindBox.id, rewardGroupId: rg.id });
      addToast('success', 'Reward collection linked!');
      load();
    } catch (e: unknown) {
      addToast('error', 'Failed to link collection', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCollection(false);
    }
  }

  async function checkReadiness() {
    if (!id) return;
    setLoadingReadiness(true);
    try {
      const data = await api.getReadiness(id);
      setReadiness(data as ReadinessReport);
    } catch (e: unknown) {
      addToast('error', 'Readiness check failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingReadiness(false);
    }
  }

  async function previewCandidates() {
    if (!id) return;
    setLoadingCandidates(true);
    try {
      const data = await api.getRewardCandidates(id);
      const d = data as { eligible?: RewardCandidate[] };
      setCandidates(d.eligible ?? (Array.isArray(data) ? (data as RewardCandidate[]) : []));
    } catch (e: unknown) {
      addToast('error', 'Preview failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCandidates(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Blind Box Detail">
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <span>Loading…</span>
        </div>
      </Layout>
    );
  }

  if (error || !blindBox) {
    return (
      <Layout title="Blind Box Not Found">
        <div className="alert alert-danger">
          <span className="alert-icon">✕</span>
          <div className="alert-body">
            <div className="alert-title">{error ?? 'Blind box not found'}</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '.75rem' }} onClick={() => navigate('/blind-boxes')}>
              ← Back to list
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const collectionTitleDisplay =
    blindBox.rewardGroup?.collectionTitleSnapshot ??
    collections.find((c) => c.id === effectiveCollectionId)?.title ??
    null;

  return (
    <Layout
      title={blindBox.name}
      actions={
        <>
          <StatusBadge status={blindBox.status} />
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/blind-boxes')}>
            ← Back
          </button>
        </>
      }
    >
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link to="/">Dashboard</Link>
        <span className="breadcrumb-sep">›</span>
        <Link to="/blind-boxes">Blind Boxes</Link>
        <span className="breadcrumb-sep">›</span>
        <span>{blindBox.name}</span>
      </div>

      {/* Settings */}
      <Section
        title="General Settings"
        aside={
          dirty && (
            <button className="btn btn-primary btn-sm" onClick={handleSaveSettings} disabled={saving}>
              {saving ? <><span className="spinner spinner-sm" /> Saving…</> : 'Save Changes'}
            </button>
          )
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label>Internal Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
              placeholder="e.g. Summer Mystery Box"
            />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value as 'draft' | 'active' | 'archived'); setDirty(true); }}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <div className="form-hint">
              Only "Active" blind boxes trigger reward assignments on purchase.
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
            placeholder="Internal notes…"
            rows={2}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Selection Strategy</label>
          <select value={strategy} onChange={(e) => { setStrategy(e.target.value as 'uniform' | 'weighted'); setDirty(true); }}>
            <option value="uniform">Uniform — equal probability for all rewards</option>
            <option value="weighted">Weighted — custom probability per reward</option>
          </select>
          <div className="form-hint">
            Uniform is recommended for most cases. Weighted requires pool items with configured weights.
          </div>
        </div>

        {dirty && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '.75rem' }}>
            <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
              {saving ? <><span className="spinner spinner-sm" /> Saving…</> : 'Save Changes'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setName(blindBox.name); setDescription(blindBox.description ?? ''); setStatus(blindBox.status); setStrategy(blindBox.selectionStrategy); setDirty(false); }}>
              Discard
            </button>
          </div>
        )}
      </Section>

      {/* Product info */}
      <Section title="Linked Storefront Product">
        <div className="kv-list">
          <div className="kv-row">
            <span className="kv-label">SHOPLINE Product</span>
            <span className="kv-value">
              {blindBox.productTitleSnapshot ?? blindBox.shoplineProductId ?? (
                <span className="text-muted">Not linked</span>
              )}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-label">Product ID</span>
            <span className="kv-value code">{blindBox.shoplineProductId ?? '—'}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">Variant ID</span>
            <span className="kv-value code">{blindBox.shoplineVariantId ?? 'Product-level (all variants)'}</span>
          </div>
        </div>
        <div className="alert alert-neutral" style={{ marginTop: '1rem' }}>
          <span className="alert-icon">ℹ</span>
          <div className="alert-body">
            The product link is set automatically when a SHOPLINE product has the <strong>blind-box</strong> tag.
            To change the linked product, update the tag in SHOPLINE Admin.
          </div>
        </div>
      </Section>

      {/* Reward collection */}
      <Section title="Reward Collection">
        {/* ── Status badge ── */}
        {tagHandle ? (
          <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
            <span className="alert-icon">✓</span>
            <div className="alert-body">
              <div className="alert-title">Auto-linked via product tag</div>
              <div style={{ fontFamily: 'monospace', fontSize: '.85rem', marginTop: '.2rem' }}>
                blind-box-collection:<strong>{tagHandle}</strong>
              </div>
              {(collectionTitleDisplay || blindBox.rewardGroup?.collectionTitleSnapshot) && (
                <div style={{ fontSize: '.85rem', marginTop: '.25rem', color: 'var(--color-text-muted)' }}>
                  {collectionTitleDisplay ?? blindBox.rewardGroup?.collectionTitleSnapshot}
                </div>
              )}
              {blindBox.rewardGroup && (
                <div style={{ fontSize: '.8rem', marginTop: '.2rem', color: 'var(--color-text-muted)' }}>
                  Saved to DB — collection ID: <span className="code">{blindBox.rewardGroup.shoplineCollectionId}</span>
                </div>
              )}
            </div>
          </div>
        ) : blindBox.rewardGroup ? (
          <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
            <span className="alert-icon">✓</span>
            <div className="alert-body">
              <div className="alert-title">Collection linked</div>
              {blindBox.rewardGroup.collectionTitleSnapshot}{' '}
              (ID: <span className="code">{blindBox.rewardGroup.shoplineCollectionId}</span>)
            </div>
          </div>
        ) : (
          <div className="alert alert-warning" style={{ marginBottom: '1.25rem' }}>
            <span className="alert-icon">⚠</span>
            <div className="alert-body">
              <div className="alert-title">No reward collection linked</div>
              Add a <code>blind-box-collection:&lt;handle&gt;</code> tag to the SHOPLINE product,
              or select a collection below to link manually.
            </div>
          </div>
        )}

        {/* ── Optional collection dropdown override ── */}
        {collections.length > 0 && (
          <div className="form-group">
            <label>Override Collection{tagHandle && <span className="form-hint" style={{ display: 'inline', marginLeft: '.5rem' }}>(optional — tag value used by default)</span>}</label>
            {loadingCollections ? (
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.5rem 0' }}>
                <span className="spinner spinner-sm" /> Loading…
              </div>
            ) : (
              <select value={selectedCollectionId} onChange={(e) => setSelectedCollectionId(e.target.value)}>
                <option value="">{tagHandle ? `— use tag: ${tagHandle} —` : '— select a collection —'}</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title ?? c.id}{c.handle ? ` (${c.handle})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveCollection}
            disabled={savingCollection || !effectiveCollectionId}
          >
            {savingCollection ? <><span className="spinner spinner-sm" /> Saving…</> : '💾 Link Collection'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={previewCandidates}
            disabled={loadingCandidates || (!blindBox.rewardGroup && !tagHandle)}
          >
            {loadingCandidates ? <><span className="spinner spinner-sm" /> Loading…</> : '👁 Preview Reward Pool'}
          </button>
        </div>

        {candidates.length > 0 && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '.75rem', fontSize: '.875rem' }}>
              Reward Pool Preview ({candidates.length} items)
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>Inventory</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i}>
                      <td className="td-primary">{c.productTitle ?? c.productId}</td>
                      <td>{c.variantTitle ?? '—'}</td>
                      <td>
                        {c.inventoryQuantity !== null ? (
                          <span className={c.inventoryQuantity > 0 ? 'badge badge-success' : 'badge badge-danger'}>
                            {c.inventoryQuantity}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="code">{c.selectionWeight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Readiness */}
      <Section
        title="Activation Readiness"
        aside={
          <button
            className="btn btn-secondary btn-sm"
            onClick={checkReadiness}
            disabled={loadingReadiness}
          >
            {loadingReadiness ? <><span className="spinner spinner-sm" /> Checking…</> : '▶ Run Check'}
          </button>
        }
      >
        {!readiness && !loadingReadiness && (
          <div className="text-muted text-sm">
            Click "Run Check" to verify this blind box is ready for assignments.
          </div>
        )}

        {readiness && (
          <>
            <div className={`alert ${readiness.ready ? 'alert-success' : 'alert-warning'} mb-4`} style={{ marginBottom: '1rem' }}>
              <span className="alert-icon">{readiness.ready ? '✓' : '⚠'}</span>
              <div className="alert-body">
                <div className="alert-title">
                  {readiness.ready ? 'Ready for assignments' : 'Not ready — resolve issues below'}
                </div>
              </div>
            </div>
            <div className="health-grid">
              {(readiness.checks ?? []).map((check, i) => (
                <div className="health-row" key={i}>
                  <div className="health-row-left">
                    <span className="health-row-icon">{check.passed ? '✅' : '❌'}</span>
                    <div>
                      <div className="health-row-label">{check.name}</div>
                      <div className="health-row-sub">{check.message}</div>
                    </div>
                  </div>
                  <StatusBadge status={check.passed ? 'active' : 'failed'} label={check.passed ? 'Pass' : 'Fail'} />
                </div>
              ))}
            </div>
          </>
        )}
      </Section>
    </Layout>
  );
}
