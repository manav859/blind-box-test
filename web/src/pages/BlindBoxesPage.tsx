import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api, BlindBox, SessionExpiredError } from '../lib/api';
import { ImageUpload } from '../components/ImageUpload';
import { TableSkeleton } from '../components/Skeleton';
import { SessionExpiredBanner } from '../components/SessionExpiredBanner';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Create dialog ────────────────────────────────────────────────────────────

function CreateBlindBoxDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose(): void;
  onCreated(bb: BlindBox): void;
}) {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setName('');
    setPrice('');
    setDescription('');
    setImageUrl('');
    onClose();
  }

  async function handleSave() {
    if (!name.trim()) {
      addToast('error', 'Name your blind box');
      return;
    }
    const priceNum = Number(price);
    if (!price.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      addToast('error', 'Enter a valid price', 'The blind box is a sellable product, so it needs a price.');
      return;
    }
    setSaving(true);
    try {
      const blindBox = await api.createBlindBox({
        name: name.trim(),
        price: price.trim(),
        description: description.trim() || null,
        imageUrl: imageUrl.trim() || null,
      });
      addToast('success', 'Blind box + product created', 'A SHOPLINE product was created. Now add rewards to the pool.');
      onCreated(blindBox);
      handleClose();
    } catch (e: unknown) {
      addToast('error', 'Create failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create Blind Box"
      subtitle="This creates a sellable SHOPLINE product customers buy"
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner spinner-sm" /> Creating…</> : 'Create blind box'}
          </button>
        </>
      }
    >
      <div className="alert alert-neutral" style={{ marginBottom: '1rem' }}>
        <span className="alert-icon">ℹ</span>
        <div className="alert-body">
          Saving creates a live, one-variant SHOPLINE product with this name &amp; price (set to oversell so it
          never goes out of stock). Customers buy it; they receive one reward from the pool you configure next.
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Name *</label>
          <input
            className="input"
            placeholder="e.g. Winter Blind Box"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Price *</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 19.99"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Product image (optional)</label>
        <ImageUpload value={imageUrl} onChange={setImageUrl} disabled={saving} />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Description (optional)</label>
        <textarea
          className="input"
          placeholder="Shown on the product page…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
    </Modal>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function BlindBoxesPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [blindBoxes, setBlindBoxes] = useState<BlindBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listBlindBoxes()
      .then((data) => {
        setBlindBoxes(data);
        setError(null);
      })
      .catch((e: Error) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = blindBoxes.filter((bb) => {
    const matchSearch =
      !search ||
      bb.name.toLowerCase().includes(search.toLowerCase()) ||
      (bb.triggerProductTitleSnapshot ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (bb.triggerProductId ?? '').includes(search);
    const matchStatus = statusFilter === 'all' || bb.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleArchive(bb: BlindBox) {
    if (!confirm(`Archive "${bb.name}"? It will no longer accept new assignments.`)) return;
    setBusyId(bb.id);
    try {
      await api.updateBlindBox(bb.id, { status: 'archived' });
      addToast('success', `"${bb.name}" archived`);
      load();
    } catch (e: unknown) {
      addToast('error', 'Archive failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const headerActions = (
    <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
      + Create Blind Box
    </button>
  );

  return (
    <Layout title="Blind Boxes" actions={headerActions}>
      <div className="toolbar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search by name or trigger product…"
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

      {loading && <TableSkeleton rows={4} />}

      {error && !loading && (
        error instanceof SessionExpiredError ? (
          <SessionExpiredBanner authUrl={error.authUrl} />
        ) : (
          <div className="alert alert-danger mb-4">
            <span className="alert-icon">✕</span>
            <div className="alert-body">
              <div className="alert-title">Failed to load</div>
              {error.message}
            </div>
          </div>
        )
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎁</div>
          <h3>{blindBoxes.length === 0 ? 'No blind boxes yet' : 'No results'}</h3>
          <p>
            {blindBoxes.length === 0
              ? 'Click "Create Blind Box", pick the product customers buy, then add reward products to its pool.'
              : 'Try a different search or status filter.'}
          </p>
          {blindBoxes.length === 0 && (
            <button className="btn btn-primary mt-4" onClick={() => setCreateOpen(true)}>
              Create Blind Box
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
                <th>Trigger product</th>
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
                    {bb.triggerProductTitleSnapshot ? (
                      <span className="text-sm">{bb.triggerProductTitleSnapshot}</span>
                    ) : bb.triggerProductId ? (
                      <span className="code">{bb.triggerProductId}</span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="text-xs text-muted">{formatDate(bb.createdAt)}</td>
                  <td>
                    <div className="table-actions">
                      <Link to={`/blind-boxes/${bb.id}`} className="btn btn-secondary btn-sm">
                        Edit rewards
                      </Link>
                      {bb.status !== 'archived' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleArchive(bb)}
                          disabled={busyId === bb.id}
                        >
                          {busyId === bb.id ? <span className="spinner spinner-sm" /> : 'Archive'}
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
        onCreated={(bb) => {
          setCreateOpen(false);
          navigate(`/blind-boxes/${bb.id}`);
        }}
      />
    </Layout>
  );
}
