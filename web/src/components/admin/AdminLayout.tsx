import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useEmbeddedPath } from "../../hooks/useEmbeddedRouting";

const navigationItems = [
  { to: "/blind-box/pools", label: "Blind Boxes" },
  { to: "/blind-box/assignments", label: "Assignments" },
  { to: "/blind-box/failures", label: "Operations" },
  { to: "/blind-box/debug", label: "Debug" },
];

export interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const embeddedPath = useEmbeddedPath();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-eyebrow">SHOPLINE Admin</span>
          <h1>Blind Box Console</h1>
          <p>
            Merchant tooling for detected blind boxes, collection linking,
            assignments, and operational visibility.
          </p>
        </div>

        <nav className="admin-nav" aria-label="Blind box navigation">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={embeddedPath(item.to)}
              className={({ isActive }) =>
                isActive ? "admin-nav-link is-active" : "admin-nav-link"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-note">
          Blind-box identity now comes from tagged SHOPLINE products. Prize selection,
          assignment, and webhook processing remain backend-owned.
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
