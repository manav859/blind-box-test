import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface NavItem {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: '⬛', label: 'Dashboard', end: true },
  { to: '/blind-boxes', icon: '🎁', label: 'Blind Boxes' },
  { to: '/assignments', icon: '🎯', label: 'Orders & Assignments' },
  { to: '/settings', icon: '⚙️', label: 'Settings & Connections' },
];

function getShopName(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop') || '';
    return shop.replace('.myshopline.com', '') || 'Your Shop';
  } catch {
    return 'Your Shop';
  }
}

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}

export function Layout({ children, title, actions }: LayoutProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🎁</div>
          <div>
            <div className="sidebar-logo-name">Blind Box</div>
            <div className="sidebar-logo-sub">Admin Panel</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-shop-pill">
            <div className="sidebar-shop-dot" />
            <div className="sidebar-shop-name">{getShopName()}</div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <h1>{title}</h1>
          {actions && <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>{actions}</div>}
        </header>
        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}
