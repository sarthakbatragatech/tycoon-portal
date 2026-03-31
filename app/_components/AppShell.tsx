"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const mainNav = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/orders/new", label: "Punch Order", exact: true },
  { href: "/orders", label: "View Orders", exact: false },
  { href: "/dispatch-planning", label: "Dispatch Plan", exact: false },
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("tycoon-theme");
    const nextTheme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";

    if (nextTheme === "dark") return;

    const frameId = window.requestAnimationFrame(() => {
      setTheme(nextTheme);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    window.localStorage.setItem("tycoon-theme", theme);
  }, [theme]);

  return (
    <div className="app-shell" data-theme={theme}>
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

        <div className="theme-toggle sidebar-theme-toggle">
          <div className="theme-toggle-header">
            <div className="theme-toggle-label">Theme</div>
            <div className="theme-toggle-value">{theme === "dark" ? "Dark" : "Light"}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "light"}
            className={`theme-switch${theme === "light" ? " light" : ""}`}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span className="theme-switch-copy">
              <span className="theme-switch-title">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </span>
            <span className="theme-toggle-track">
              <span className="theme-toggle-thumb" />
            </span>
          </button>
        </div>

        <div className="sidebar-footer">
          <div>Tycoon · Black &amp; White UI</div>
          <div style={{ opacity: 0.7, marginTop: 2 }}>MVP Preview</div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
