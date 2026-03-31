"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const mainNav = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/orders/new", label: "Punch Order", exact: true },
  { href: "/orders", label: "View Orders", exact: false },
  { href: "/sales", label: "Customer Sales", exact: true },
  { href: "/sales/models", label: "Model Analysis", exact: false },
];

const referenceNav = [
  { href: "/parties", label: "Parties", exact: false },
  { href: "/items", label: "Items", exact: false },
];

function isActivePath(pathname: string, href: string, exact = false) {
  if (href === "/") return pathname === "/";
  if (exact) return pathname === href;
  if (href === "/orders" && pathname.startsWith("/orders/new")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  exact,
  pathname,
}: {
  href: string;
  label: string;
  exact?: boolean;
  pathname: string;
}) {
  const active = isActivePath(pathname, href, exact);

  return (
    <Link href={href} className={`nav-item${active ? " active" : ""}`}>
      <span className="nav-item-label">{label}</span>
      <span className="nav-item-dot" />
    </Link>
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-mark">T</div>
            <div className="logo-text">
              <div className="logo-title">TYCOON</div>
              <div className="logo-subtitle">Order Portal</div>
            </div>
          </div>
        </div>

        <div className="user-badge">
          <span className="user-dot" />
          <span>Admin (Preview)</span>
        </div>
      </header>

      <aside className="sidebar">
        <div>
          <div className="sidebar-section-title">Main</div>
          <div className="nav-list">
            {mainNav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                exact={item.exact}
                pathname={pathname}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="sidebar-section-title">Reference</div>
          <div className="nav-list">
            {referenceNav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                exact={item.exact}
                pathname={pathname}
              />
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          Tycoon · Black &amp; White UI
          <br />
          <span style={{ opacity: 0.7 }}>MVP Preview</span>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
