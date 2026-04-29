import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { api, HealthStatus, WebhookEvent } from '../lib/api';

type Tab = 'health' | 'webhooks';

function ErrorCell({ message }: { message: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!message) return <span className="text-muted">—</span>;
  const short = message.slice(0, 60);
  const isTruncated = message.length > 60;
  return (
    <span
      style={{ cursor: isTruncated ? 'pointer' : 'default', wordBreak: 'break-all' }}
      title={isTruncated && !expanded ? 'Click to expand' : undefined}
      onClick={() => isTruncated && setExpanded((v) => !v)}
    >
      {expanded ? message : short}{isTruncated && !expanded ? '…' : ''}
      {isTruncated && (
        <span style={{ marginLeft: '.3rem', fontSize: '.75rem', color: 'var(--color-text-muted)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      )}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function HealthRow({
  icon,
  label,
  sub,
  value,
  status,
}: {
  icon: string;
  label: string;
  sub?: string;
  value?: string;
  status: 'ok' | 'warn' | 'error' | 'unknown';
}) {
  const badge = status === 'ok' ? 'active' : status === 'warn' ? 'warning' : status === 'error' ? 'danger' : 'draft';
  const text = status === 'ok' ? 'OK' : status === 'warn' ? 'Warning' : status === 'error' ? 'Error' : 'Unknown';
  return (
    <div className="health-row">
      <div className="health-row-left">
        <span className="health-row-icon">{icon}</span>
        <div>
          <div className="health-row-label">{label}</div>
          {sub && <div className="health-row-sub">{sub}</div>}
          {value && (
            <div className="health-row-sub">
              <span className="code">{value}</span>
            </div>
          )}
        </div>
      </div>
      <StatusBadge status={badge} label={text} />
    </div>
  );
}

export function SettingsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('health');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [webhookFilter, setWebhookFilter] = useState('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getHealth(), api.listWebhookEvents()])
      .then(([h, w]) => {
        setHealth(h);
        setWebhookEvents(w);
      })
      .catch((e: Error) => addToast('error', 'Failed to load settings', e.message))
      .finally(() => setLoading(false));
  }, []);

  async function testProductFetch() {
    addToast('info', 'Testing catalog access…', 'Fetching product list from SHOPLINE');
    try {
      const products = await api.listCatalogProducts();
      addToast('success', `Catalog accessible — ${products.length} products found`);
    } catch (e: unknown) {
      addToast('error', 'Catalog access failed', e instanceof Error ? e.message : String(e));
    }
  }

  async function testCollectionFetch() {
    addToast('info', 'Testing collection access…');
    try {
      const cols = await api.listCatalogCollections();
      addToast('success', `Collections accessible — ${cols.length} collections found`);
    } catch (e: unknown) {
      addToast('error', 'Collection access failed', e instanceof Error ? e.message : String(e));
    }
  }

  async function retryEvent(event: WebhookEvent) {
    setRetryingId(event.id);
    try {
      const result = await api.retryWebhookEvent(event.id);
      addToast('success', `Retry ${result.status}`, `Event ${event.eventId.slice(-8)}`);
      await refreshWebhooks();
    } catch (e: unknown) {
      addToast('error', 'Retry failed', e instanceof Error ? e.message : String(e));
    } finally {
      setRetryingId(null);
    }
  }

  async function refreshWebhooks() {
    try {
      const events = await api.listWebhookEvents(
        webhookFilter !== 'all' ? { status: webhookFilter } : undefined,
      );
      setWebhookEvents(events);
    } catch (e: unknown) {
      addToast('error', 'Refresh failed', e instanceof Error ? e.message : String(e));
    }
  }

  const filteredEvents =
    webhookFilter === 'all'
      ? webhookEvents
      : webhookEvents.filter((e) => e.status === webhookFilter);

  return (
    <Layout title="Settings & Connections">
      <div className="tab-bar">
        <button className={`tab-btn${tab === 'health' ? ' active' : ''}`} onClick={() => setTab('health')}>
          🩺 Health & Config
        </button>
        <button className={`tab-btn${tab === 'webhooks' ? ' active' : ''}`} onClick={() => setTab('webhooks')}>
          🔔 Webhook Events ({webhookEvents.length})
        </button>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <span>Loading…</span>
        </div>
      )}

      {/* Health tab */}
      {!loading && tab === 'health' && health && (
        <>
          {/* App config */}
          <div className="card mb-6" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2>App Configuration</h2>
            </div>
            <div className="card-body">
              <div className="health-grid">
                <HealthRow
                  icon="🔑"
                  label="App Key"
                  value={health.appKey}
                  status={health.appKey && health.appKey !== 'missing' ? 'ok' : 'error'}
                />
                <HealthRow
                  icon="🌐"
                  label="App URL"
                  value={health.appUrl}
                  status={health.appUrl && health.appUrl !== 'missing' ? 'ok' : 'error'}
                />
                <HealthRow
                  icon="🗄️"
                  label="Database"
                  sub={`Mode: ${health.databaseMode}, Host: ${health.databaseHost}`}
                  status={health.databaseMode === 'postgres' ? 'ok' : 'warn'}
                />
                <HealthRow
                  icon="🔐"
                  label="Session Storage"
                  sub={health.sessionMode}
                  status={health.sessionMode === 'postgres' ? 'ok' : 'warn'}
                />
                <HealthRow
                  icon="⚙️"
                  label="Inventory Execution Mode"
                  value={health.executionMode}
                  status={
                    health.executionMode === 'execute'
                      ? 'ok'
                      : health.executionMode === 'deferred'
                      ? 'warn'
                      : 'error'
                  }
                  sub={
                    health.executionMode === 'execute'
                      ? 'SHOPLINE inventory will be decremented on assignment'
                      : 'Deferred — inventory will NOT be decremented automatically'
                  }
                />
                <HealthRow
                  icon="📍"
                  label="Inventory Location ID"
                  status={health.locationId === 'set' ? 'ok' : 'warn'}
                  sub={
                    health.locationId === 'set'
                      ? 'Configured — inventory operations will target this location'
                      : 'Not set — required for execute mode. Set BLIND_BOX_SHOPLINE_LOCATION_ID in env.'
                  }
                />
              </div>
            </div>

            {health.executionMode === 'deferred' && (
              <div className="card-footer">
                <div className="alert alert-warning" style={{ margin: 0 }}>
                  <span className="alert-icon">⚠</span>
                  <div className="alert-body">
                    <div className="alert-title">Deferred mode active</div>
                    Assignments are created but SHOPLINE inventory will NOT be decremented. Set{' '}
                    <span className="code">BLIND_BOX_INVENTORY_EXECUTION_MODE=execute</span> in your environment
                    variables for production.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SHOPLINE API access */}
          <div className="card mb-6" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2>SHOPLINE API Access</h2>
            </div>
            <div className="card-body">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                Test live connectivity to your SHOPLINE store API.
              </p>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={testProductFetch}>
                  🛒 Test Product Access
                </button>
                <button className="btn btn-secondary" onClick={testCollectionFetch}>
                  📦 Test Collection Access
                </button>
              </div>
            </div>
          </div>

          {/* Webhook config */}
          <div className="card mb-6" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2>Webhook Configuration</h2>
            </div>
            <div className="card-body">
              <div className="kv-list">
                <div className="kv-row">
                  <span className="kv-label">Endpoint</span>
                  <span className="kv-value code">{health.appUrl}/api/webhooks</span>
                </div>
                <div className="kv-row">
                  <span className="kv-label">Subscribed Topics</span>
                  <div>
                    <span className="badge badge-primary" style={{ marginRight: '.375rem' }}>orders/paid</span>
                    <span className="badge badge-info">apps/installed_uninstalled</span>
                  </div>
                </div>
                <div className="kv-row">
                  <span className="kv-label">Signature Verification</span>
                  <StatusBadge status="active" label="Enabled" />
                </div>
              </div>
            </div>
          </div>

          {/* Storefront extension */}
          <div className="card">
            <div className="card-header">
              <h2>Storefront Theme Extension</h2>
            </div>
            <div className="card-body">
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                <span className="alert-icon">ℹ</span>
                <div className="alert-body">
                  <div className="alert-title">Manual activation required</div>
                  The Blind Box theme block must be manually added to your product page template in the SHOPLINE Theme Editor.
                </div>
              </div>
              <div className="kv-list">
                <div className="kv-row">
                  <span className="kv-label">Block Name</span>
                  <span className="kv-value code">blind-box-product-shell</span>
                </div>
                <div className="kv-row">
                  <span className="kv-label">Trigger Condition</span>
                  <span className="kv-value">Product must have <span className="code">blind-box</span> tag</span>
                </div>
                <div className="kv-row">
                  <span className="kv-label">Public API</span>
                  <span className="kv-value code">{health.appUrl}/api/storefront/blind-box/*</span>
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <p className="text-sm text-muted">Setup steps:</p>
                <ol style={{ paddingLeft: '1.25rem', marginTop: '.5rem', fontSize: '.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                  <li>Go to SHOPLINE Admin → Online Store → Themes</li>
                  <li>Click "Customize" on your active theme</li>
                  <li>Navigate to a product page template</li>
                  <li>Add the "Blind Box Shell" app block to the product page</li>
                  <li>Save the theme</li>
                  <li>Tag any product with <span className="code">blind-box</span> to activate the block</li>
                </ol>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Webhooks tab */}
      {!loading && tab === 'webhooks' && (
        <>
          <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={webhookFilter}
              onChange={(e) => {
                setWebhookFilter(e.target.value);
                setTimeout(refreshWebhooks, 0);
              }}
              style={{ padding: '.5rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '.875rem' }}
            >
              <option value="all">All statuses</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
              <option value="ignored">Ignored</option>
              <option value="processing">Processing</option>
            </select>
            <button className="btn btn-secondary btn-sm" onClick={refreshWebhooks}>
              ↺ Refresh
            </button>
            <span className="text-sm text-muted">{filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}</span>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔔</div>
              <h3>No webhook events</h3>
              <p>Webhook events will appear here when SHOPLINE sends them (e.g. when an order is paid).</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Topic</th>
                    <th>Status</th>
                    <th>Error</th>
                    <th>Received</th>
                    <th>Processed</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.slice(0, 100).map((e) => (
                    <tr key={e.id}>
                      <td><span className="code" style={{ fontSize: '.7rem' }}>{e.eventId.slice(-12)}</span></td>
                      <td><span className="badge badge-primary">{e.topic}</span></td>
                      <td><StatusBadge status={e.status} /></td>
                      <td className="text-xs" style={{ color: 'var(--color-danger-text)', maxWidth: 240 }}>
                        <ErrorCell message={e.errorMessage} />
                      </td>
                      <td className="text-xs text-muted">{formatDate(e.createdAt)}</td>
                      <td className="text-xs text-muted">{e.processedAt ? formatDate(e.processedAt) : '—'}</td>
                      <td>
                        {e.status === 'failed' && e.topic === 'orders/paid' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={retryingId === e.id}
                            onClick={() => retryEvent(e)}
                          >
                            {retryingId === e.id ? <><span className="spinner spinner-sm" /> Retrying…</> : '↺ Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
