import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { api, DashboardStats, HealthStatus } from '../lib/api';

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

function StatCard({
  label,
  value,
  sub,
  icon,
  variant,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: string;
  variant?: 'success' | 'warning' | 'danger' | 'primary';
}) {
  return (
    <div className={`stat-card${variant ? ` stat-${variant}` : ''}`}>
      <div className="stat-card-label">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

function HealthRow({
  icon,
  label,
  sub,
  status,
}: {
  icon: string;
  label: string;
  sub?: string;
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
        </div>
      </div>
      <StatusBadge status={badge} label={text} />
    </div>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.getStats(), api.getHealth()])
      .then(([s, h]) => {
        setStats(s);
        setHealth(h);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const headerActions = (
    <Link to="/blind-boxes" className="btn btn-primary btn-sm">
      + New Blind Box
    </Link>
  );

  return (
    <Layout title="Dashboard" actions={headerActions}>
      {loading && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <span>Loading dashboard…</span>
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-warning mb-6" style={{ alignItems: 'center' }}>
          <span className="alert-icon">⚠</span>
          <div className="alert-body">
            <div className="alert-title">
              {error.includes('Session expired') ? 'Session expired' : 'Could not load stats'}
            </div>
            {error.includes('Session expired')
              ? 'Your SHOPLINE session is missing. Open this app from SHOPLINE Admin to authenticate.'
              : error}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={load}>
            ↺ Retry
          </button>
        </div>
      )}

      {stats && (
        <>
          {/* KPI cards */}
          <div className="stats-grid">
            <StatCard label="Total Blind Boxes" value={stats.totalBlindBoxes} icon="🎁" />
            <StatCard
              label="Active"
              value={stats.activeBlindBoxes}
              sub="Ready for purchases"
              icon="✅"
              variant="success"
            />
            <StatCard
              label="Total Assignments"
              value={stats.totalAssignments}
              sub="Rewards assigned"
              icon="🎯"
              variant="primary"
            />
            <StatCard
              label="Failed Assignments"
              value={stats.failedAssignments}
              sub={stats.failedAssignments > 0 ? 'Needs attention' : 'All clear'}
              icon="⚠"
              variant={stats.failedAssignments > 0 ? 'danger' : undefined}
            />
            <StatCard
              label="Webhooks Processed"
              value={stats.webhookProcessed}
              icon="🔔"
            />
            <StatCard
              label="Webhook Failures"
              value={stats.webhookFailed}
              sub={stats.webhookFailed > 0 ? 'Check webhook events' : 'All healthy'}
              icon="🔕"
              variant={stats.webhookFailed > 0 ? 'warning' : undefined}
            />
          </div>

          {/* Two-column layout */}
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            {/* Recent assignments */}
            <div className="card">
              <div className="card-header">
                <h2>Recent Assignments</h2>
                <Link to="/assignments" className="btn btn-secondary btn-sm">
                  View all
                </Link>
              </div>
              {stats.recentAssignments.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <div className="empty-state-icon">🎯</div>
                  <h3>No assignments yet</h3>
                  <p>Assignments appear here after customers purchase a blind-box product.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Reward</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentAssignments.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <span className="code">#{a.orderId.slice(-8)}</span>
                          </td>
                          <td className="td-primary truncate" style={{ maxWidth: 160 }}>
                            {a.rewardTitle ?? '—'}
                          </td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                          <td className="text-xs text-muted">{formatDate(a.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Health checks */}
            <div>
              <div className="card">
                <div className="card-header">
                  <h2>Connection Health</h2>
                  <Link to="/settings" className="btn btn-secondary btn-sm">
                    Details
                  </Link>
                </div>
                <div className="card-body">
                  <div className="health-grid">
                    <HealthRow
                      icon="🔑"
                      label="App Authentication"
                      sub={health?.appKey ? `Key: ${health.appKey}` : 'Not configured'}
                      status={health?.appKey && health.appKey !== 'missing' ? 'ok' : 'error'}
                    />
                    <HealthRow
                      icon="🗄️"
                      label="Database"
                      sub={health?.databaseHost ?? 'Checking…'}
                      status={health?.databaseMode === 'postgres' ? 'ok' : 'warn'}
                    />
                    <HealthRow
                      icon="⚙️"
                      label="Inventory Mode"
                      sub={health?.executionMode ?? 'Unknown'}
                      status={
                        health?.executionMode === 'execute'
                          ? 'ok'
                          : health?.executionMode === 'deferred'
                          ? 'warn'
                          : 'unknown'
                      }
                    />
                    <HealthRow
                      icon="📍"
                      label="Location ID"
                      sub={health?.locationId === 'set' ? 'Configured' : 'Not set'}
                      status={health?.locationId === 'set' ? 'ok' : 'warn'}
                    />
                    <HealthRow
                      icon="🔔"
                      label="Webhook Health"
                      sub={
                        stats.webhookFailed > 0
                          ? `${stats.webhookFailed} failed events`
                          : 'No failed events'
                      }
                      status={stats.webhookFailed > 0 ? 'warn' : 'ok'}
                    />
                  </div>
                </div>
              </div>

              {/* Quick links */}
              <div className="card" style={{ marginTop: '1.25rem' }}>
                <div className="card-header">
                  <h2>Quick Actions</h2>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                  <Link to="/blind-boxes" className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start' }}>
                    🎁 Manage Blind Boxes
                  </Link>
                  <Link to="/assignments" className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start' }}>
                    🎯 View Order Assignments
                  </Link>
                  <Link to="/settings" className="btn btn-secondary w-full" style={{ justifyContent: 'flex-start' }}>
                    ⚙️ Settings & Connections
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!loading && !stats && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <h3>No data yet</h3>
          <p>Stats will appear after your first blind-box is configured.</p>
        </div>
      )}
    </Layout>
  );
}
