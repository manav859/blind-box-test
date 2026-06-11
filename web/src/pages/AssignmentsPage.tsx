import React, { useCallback, useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api, BlindBox, BlindBoxAssignment, InventoryOperation, SessionExpiredError } from '../lib/api';
import { ProductThumb } from '../components/ProductPicker';
import { TableSkeleton } from '../components/Skeleton';
import { SessionExpiredBanner } from '../components/SessionExpiredBanner';

type Tab = 'assignments' | 'operations';
type FulfillFilter = 'all' | 'awaiting' | 'shipped';

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

function shortId(id: string): string {
  return id.slice(-8);
}

/** Order/customer details captured into assignment.metadata at webhook time. */
function parseOrderMeta(metadata: string | null): {
  orderName: string | null;
  customerName: string | null;
  customerEmail: string | null;
} {
  if (!metadata) return { orderName: null, customerName: null, customerEmail: null };
  try {
    const parsed = JSON.parse(metadata) as { order?: { name?: string; customerName?: string; customerEmail?: string } };
    const order = parsed.order ?? {};
    return {
      orderName: order.name ?? null,
      customerName: order.customerName ?? null,
      customerEmail: order.customerEmail ?? null,
    };
  } catch {
    return { orderName: null, customerName: null, customerEmail: null };
  }
}

/** A reward has been picked and is awaiting (manual) fulfillment by the merchant. */
function needsShipping(a: BlindBoxAssignment): boolean {
  return Boolean(a.selectedRewardTitleSnapshot) && a.status !== 'pending';
}

/**
 * Classify an inventory op for display. "Failed" is reserved for genuine,
 * retryable API errors; config/setup gaps surface as "Needs setup" (not failed),
 * and uncommitted ops as "Pending".
 */
type OpDisplay = { label: string; kind: 'success' | 'warning' | 'danger' | 'info'; note: string | null; retryable: boolean };
function classifyOp(op: InventoryOperation): OpDisplay {
  const reason = op.reason ?? '';
  const isNeedsSetup = reason.startsWith('NEEDS_SETUP');
  const setupNote = isNeedsSetup ? reason.replace(/^NEEDS_SETUP:?/, '').trim() : '';
  switch (op.status) {
    case 'succeeded':
      return { label: 'Committed', kind: 'success', note: null, retryable: false };
    case 'processing':
      return { label: 'Processing', kind: 'info', note: op.reason, retryable: false };
    case 'failed':
      return { label: 'Failed', kind: 'danger', note: op.reason, retryable: true };
    case 'pending':
      return isNeedsSetup
        ? { label: 'Needs setup', kind: 'warning', note: setupNote || 'Inventory location/setup required — reward recorded; ship manually.', retryable: true }
        : { label: 'Pending', kind: 'info', note: null, retryable: false };
    default:
      return { label: op.status, kind: 'info', note: op.reason, retryable: false };
  }
}

/** Inventory state for an assignment, derived from its commit operation. */
function inventoryDisplayFor(operation: InventoryOperation | undefined): OpDisplay {
  if (!operation) {
    return { label: 'Pending', kind: 'info', note: null, retryable: false };
  }
  return classifyOp(operation);
}

function AssignmentDetailModal({
  assignment,
  blindBoxName,
  operation,
  onClose,
  onShippedChange,
}: {
  assignment: BlindBoxAssignment;
  blindBoxName: string | null;
  operation: InventoryOperation | undefined;
  onClose(): void;
  onShippedChange(updated: BlindBoxAssignment): void;
}) {
  const { addToast } = useToast();
  const [rewardImage, setRewardImage] = useState<string | null>(null);
  const [shipBusy, setShipBusy] = useState(false);

  const meta = parseOrderMeta(assignment.metadata);
  const invDisplay = inventoryDisplayFor(operation);
  const shipped = Boolean(assignment.shippedAt);

  useEffect(() => {
    if (!assignment.selectedRewardProductId) return;
    api
      .getCatalogProduct(assignment.selectedRewardProductId)
      .then((p) => setRewardImage(p.imageUrl))
      .catch(() => {});
  }, [assignment.selectedRewardProductId]);

  async function toggleShipped() {
    setShipBusy(true);
    try {
      const updated = await api.setAssignmentShipped(assignment.id, !shipped);
      onShippedChange(updated);
      addToast('success', !shipped ? 'Marked as shipped' : 'Marked as not shipped');
    } catch (e: unknown) {
      addToast('error', 'Could not update shipped state', e instanceof Error ? e.message : String(e));
    } finally {
      setShipBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={meta.orderName ? `Order ${meta.orderName.startsWith('#') ? meta.orderName : `#${meta.orderName}`}` : `Order #${shortId(assignment.orderId)}`}
      subtitle="Blind-box reward assignment"
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button
            className={shipped ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={toggleShipped}
            disabled={shipBusy || !assignment.selectedRewardTitleSnapshot}
          >
            {shipBusy ? <><span className="spinner spinner-sm" /> Saving…</> : shipped ? 'Mark as not shipped' : '📦 Mark as shipped'}
          </button>
        </>
      }
    >
      {/* Reward hero */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <ProductThumb src={rewardImage} alt={assignment.selectedRewardTitleSnapshot ?? 'Reward'} size={72} />
        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Reward won
          </div>
          <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>
            {assignment.selectedRewardTitleSnapshot ?? 'Not yet assigned'}
          </div>
          {assignment.selectedRewardVariantTitleSnapshot && (
            <div className="text-sm text-muted">{assignment.selectedRewardVariantTitleSnapshot}</div>
          )}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {shipped ? (
            <span className="badge badge-success">✓ Shipped {assignment.shippedAt ? formatDate(assignment.shippedAt) : ''}</span>
          ) : (
            <span className="badge badge-warning">Awaiting fulfillment</span>
          )}
        </div>
      </div>

      <div className="kv-list" style={{ marginBottom: '1.25rem' }}>
        <div className="kv-row">
          <span className="kv-label">Order</span>
          <span className="kv-value code">{meta.orderName ?? assignment.orderId}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Date</span>
          <span className="kv-value">{formatDate(assignment.createdAt)}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Customer</span>
          <span className="kv-value">
            {meta.customerName ?? <span className="text-muted">See order in SHOPLINE</span>}
            {meta.customerEmail && <div className="text-xs text-muted">{meta.customerEmail}</div>}
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Blind box purchased</span>
          <span className="kv-value">{blindBoxName ?? assignment.blindBoxId}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Inventory</span>
          <span className="kv-value">
            <span className={`badge badge-${invDisplay.kind === 'danger' ? 'danger' : invDisplay.kind === 'success' ? 'success' : invDisplay.kind === 'warning' ? 'warning' : 'info'}`}>
              {invDisplay.label}
            </span>
            {invDisplay.note && <div className="text-xs text-muted" style={{ marginTop: '.2rem' }}>{invDisplay.note}</div>}
          </span>
        </div>
      </div>

      <div className="alert alert-neutral">
        <span className="alert-icon">ℹ</span>
        <div className="alert-body" style={{ fontSize: '.83rem' }}>
          "Mark as shipped" tracks fulfillment inside this app only. Remember to fulfill the actual
          order in SHOPLINE Admin (shipping label, tracking, customer notification) separately.
        </div>
      </div>
    </Modal>
  );
}

export function AssignmentsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('assignments');
  const [assignments, setAssignments] = useState<BlindBoxAssignment[]>([]);
  const [operations, setOperations] = useState<InventoryOperation[]>([]);
  const [blindBoxes, setBlindBoxes] = useState<BlindBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fulfillFilter, setFulfillFilter] = useState<FulfillFilter>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.listAssignments(),
      api.listInventoryOperations(),
      api.listBlindBoxes().catch(() => [] as BlindBox[]),
    ])
      .then(([a, o, boxes]) => {
        setAssignments(a);
        setOperations(o);
        setBlindBoxes(boxes);
        setError(null);
      })
      .catch((e: Error) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const blindBoxNameById = new Map(blindBoxes.map((bb) => [bb.id, bb.name]));

  const filteredAssignments = assignments.filter((a) => {
    const meta = parseOrderMeta(a.metadata);
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      a.orderId.includes(search) ||
      (meta.orderName ?? '').toLowerCase().includes(q) ||
      (meta.customerName ?? '').toLowerCase().includes(q) ||
      (meta.customerEmail ?? '').toLowerCase().includes(q) ||
      (a.selectedRewardTitleSnapshot ?? '').toLowerCase().includes(q) ||
      (a.selectedRewardVariantTitleSnapshot ?? '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchFulfill =
      fulfillFilter === 'all' ||
      (fulfillFilter === 'shipped' ? Boolean(a.shippedAt) : !a.shippedAt && needsShipping(a));
    return matchSearch && matchStatus && matchFulfill;
  });

  const toShipCount = assignments.filter((a) => needsShipping(a) && !a.shippedAt).length;
  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId) ?? null;

  const filteredOps = operations.filter((o) => {
    const matchSearch = !search || o.id.includes(search) || (o.rewardTitleSnapshot ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function retryOperation(opId: string) {
    setRetryingId(opId);
    try {
      await api.retryInventoryOperation(opId);
      addToast('success', 'Retry queued');
      load();
    } catch (e: unknown) {
      addToast('error', 'Retry failed', e instanceof Error ? e.message : String(e));
    } finally {
      setRetryingId(null);
    }
  }

  const failedCount = assignments.filter((a) => a.status === 'inventory_failed').length;
  const failedOps = operations.filter((o) => o.status === 'failed').length;

  return (
    <Layout
      title="Orders & Assignments"
      actions={
        <button className="btn btn-secondary btn-sm" onClick={load}>
          ↺ Refresh
        </button>
      }
    >
      {/* Summary pills */}
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ padding: '1rem 1.25rem', flex: '1 1 150px' }}>
          <div className="stat-card-label">Total Assignments</div>
          <div className="stat-card-value">{assignments.length}</div>
        </div>
        <div className={`stat-card${failedCount > 0 ? ' stat-danger' : ''}`} style={{ padding: '1rem 1.25rem', flex: '1 1 150px' }}>
          <div className="stat-card-label">Failed Assignments</div>
          <div className="stat-card-value">{failedCount}</div>
        </div>
        <div className="stat-card" style={{ padding: '1rem 1.25rem', flex: '1 1 150px' }}>
          <div className="stat-card-label">Inventory Operations</div>
          <div className="stat-card-value">{operations.length}</div>
        </div>
        <div className={`stat-card${failedOps > 0 ? ' stat-warning' : ''}`} style={{ padding: '1rem 1.25rem', flex: '1 1 150px' }}>
          <div className="stat-card-label">Failed Operations</div>
          <div className="stat-card-value">{failedOps}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn${tab === 'assignments' ? ' active' : ''}`} onClick={() => setTab('assignments')}>
          🎯 Assignments ({assignments.length})
        </button>
        <button className={`tab-btn${tab === 'operations' ? ' active' : ''}`} onClick={() => setTab('operations')}>
          📦 Inventory Ops ({operations.length})
        </button>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder={tab === 'assignments' ? 'Search by order or reward…' : 'Search by reward…'}
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
          {tab === 'assignments' ? (
            <>
              <option value="assigned">Assigned</option>
              <option value="inventory_pending">Inv. Pending</option>
              <option value="inventory_processing">Processing</option>
              <option value="inventory_committed">Committed</option>
              <option value="inventory_failed">Failed</option>
            </>
          ) : (
            <>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </>
          )}
        </select>
        {tab === 'assignments' && (
          <select
            value={fulfillFilter}
            onChange={(e) => setFulfillFilter(e.target.value as FulfillFilter)}
            style={{ padding: '.5rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '.875rem' }}
          >
            <option value="all">All fulfillment</option>
            <option value="awaiting">Awaiting fulfillment{toShipCount > 0 ? ` (${toShipCount})` : ''}</option>
            <option value="shipped">Shipped</option>
          </select>
        )}
      </div>

      {loading && <TableSkeleton rows={6} />}

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

      {/* Assignments table */}
      {!loading && tab === 'assignments' && (
        <>
          {filteredAssignments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎯</div>
              <h3>{assignments.length === 0 ? 'No assignments yet' : 'No results'}</h3>
              <p>
                {assignments.length === 0
                  ? 'Assignments are created automatically when customers purchase a blind-box product and the order is paid.'
                  : 'Try adjusting your search or status filter.'}
              </p>
            </div>
          ) : (
            <>
              {/* Manual-fulfillment guidance — this app records the won reward and
                  decrements its stock, but the merchant ships the reward. */}
              <div className="alert alert-neutral" style={{ marginBottom: '1rem' }}>
                <span className="alert-icon">📦</span>
                <div className="alert-body">
                  <div className="alert-title">
                    Ship the won reward to each customer
                    {toShipCount > 0 ? ` — ${toShipCount} awaiting fulfillment` : ''}
                  </div>
                  <div style={{ fontSize: '.85rem' }}>
                    Each row below is a paid blind-box order and the reward the customer won. Open the order
                    in SHOPLINE Admin (by its order number) and ship the listed reward product to the customer.
                  </div>
                </div>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Reward to ship</th>
                      <th>Status</th>
                      <th>Fulfillment</th>
                      <th>Assigned At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssignments.map((a) => {
                      const meta = parseOrderMeta(a.metadata);
                      const shipped = Boolean(a.shippedAt);
                      return (
                        <tr
                          key={a.id}
                          className={`row-clickable${shipped ? ' row-shipped' : ''}`}
                          onClick={() => setSelectedAssignmentId(a.id)}
                          title="Click to view details"
                        >
                          <td className="td-primary">
                            {meta.orderName ? (
                              <span>{meta.orderName.startsWith('#') ? meta.orderName : `#${meta.orderName}`}</span>
                            ) : (
                              <span className="code">#{shortId(a.orderId)}</span>
                            )}
                          </td>
                          <td>
                            {meta.customerName || meta.customerEmail ? (
                              <div>
                                {meta.customerName && <div className="text-sm">{meta.customerName}</div>}
                                {meta.customerEmail && (
                                  <div className="text-xs text-muted">{meta.customerEmail}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted text-xs">See order in SHOPLINE</span>
                            )}
                          </td>
                          <td className="td-primary">
                            {a.selectedRewardTitleSnapshot ?? (
                              <span className="text-muted text-xs">
                                {a.status === 'assigned' || a.status.startsWith('inventory') ? 'Assigned' : 'Pending'}
                              </span>
                            )}
                            {a.selectedRewardVariantTitleSnapshot && (
                              <div className="text-xs text-muted">{a.selectedRewardVariantTitleSnapshot}</div>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                          <td>
                            {shipped ? (
                              <span className="badge badge-success" title={`Shipped ${a.shippedAt ? formatDate(a.shippedAt) : ''}`}>
                                ✓ Shipped
                              </span>
                            ) : needsShipping(a) ? (
                              <span className="badge badge-warning" title="Ship this reward to the customer">
                                📦 Ship to customer
                              </span>
                            ) : (
                              <span className="text-muted text-xs">—</span>
                            )}
                          </td>
                          <td className="text-xs text-muted">{formatDate(a.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Operations table */}
      {!loading && tab === 'operations' && (
        <>
          {filteredOps.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <h3>{operations.length === 0 ? 'No inventory operations' : 'No results'}</h3>
              <p>
                {operations.length === 0
                  ? 'Inventory operations are created when assignments are processed in execute mode.'
                  : 'Try adjusting your search.'}
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Operation ID</th>
                    <th>Reward</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Qty</th>
                    <th>Attempts</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOps.map((op) => {
                    const display = classifyOp(op);
                    return (
                    <tr key={op.id}>
                      <td>
                        <span className="code" style={{ fontSize: '.7rem' }}>
                          {shortId(op.id)}
                        </span>
                      </td>
                      <td className="td-primary truncate" style={{ maxWidth: 180 }}>
                        {op.rewardTitleSnapshot ?? '—'}
                      </td>
                      <td>
                        <StatusBadge status={op.operationType} dot={false} label={op.operationType} />
                      </td>
                      <td>
                        <span className={`badge badge-${display.kind === 'danger' ? 'danger' : display.kind === 'success' ? 'success' : display.kind === 'warning' ? 'warning' : 'info'}`}>
                          {display.label}
                        </span>
                        {display.note && (
                          <div className="text-xs text-muted" style={{ maxWidth: 280, marginTop: '.2rem' }}>{display.note}</div>
                        )}
                      </td>
                      <td className="code">{op.quantity}</td>
                      <td className="text-sm">{op.attemptCount}</td>
                      <td className="text-xs text-muted">{formatDate(op.createdAt)}</td>
                      <td>
                        {display.retryable && (
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => retryOperation(op.id)}
                            disabled={retryingId === op.id}
                          >
                            {retryingId === op.id ? (
                              <span className="spinner spinner-sm" />
                            ) : (
                              display.label === 'Needs setup' ? '↺ Retry after setup' : '↺ Retry'
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Assignment detail (click a row) */}
      {selectedAssignment && (
        <AssignmentDetailModal
          assignment={selectedAssignment}
          blindBoxName={blindBoxNameById.get(selectedAssignment.blindBoxId) ?? null}
          operation={operations.find((op) => op.assignmentId === selectedAssignment.id)}
          onClose={() => setSelectedAssignmentId(null)}
          onShippedChange={(updated) =>
            setAssignments((rows) => rows.map((row) => (row.id === updated.id ? updated : row)))
          }
        />
      )}
    </Layout>
  );
}
