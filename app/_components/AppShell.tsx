"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthContext } from "@/app/_components/AuthProvider";
import { supabase } from "@/lib/supabase";

const adminMainNav = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/orders/new", label: "Punch Order", exact: true },
  { href: "/orders", label: "View Orders", exact: false },
  { href: "/dispatch-planning", label: "Dispatch Plan", exact: false },
  { href: "/sales", label: "Customer Sales", exact: true },
  { href: "/sales/models", label: "Model Analysis", exact: false },
];

const adminReferenceNav = [
  { href: "/parties", label: "Parties", exact: false },
  { href: "/items", label: "Items", exact: false },
  { href: "/profile", label: "Profile", exact: false },
];

const readOnlyMainNav = [{ href: "/dispatch-planning", label: "Dispatch Plan", exact: false }];

const readOnlyReferenceNav = [{ href: "/profile", label: "Profile", exact: false }];

function isActivePath(pathname: string, href: string, exact = false) {
  if (href === "/") return pathname === "/";
  if (exact) return pathname === href;
  if (href === "/orders" && pathname.startsWith("/orders/new")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  onNavigate,
  exact,
  pathname,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
  exact?: boolean;
  pathname: string;
}) {
  const active = isActivePath(pathname, href, exact);

  return (
    <Link href={href} className={`nav-item${active ? " active" : ""}`} onClick={onNavigate}>
      <span className="nav-item-label">{label}</span>
      <span className="nav-item-dot" />
    </Link>
  );
}

function NavSection({
  items,
  onNavigate,
  pathname,
  title,
}: {
  items: { href: string; label: string; exact?: boolean }[];
  onNavigate?: () => void;
  pathname: string;
  title: string;
}) {
  return (
    <div>
      <div className="sidebar-section-title">{title}</div>
      <div className="nav-list">
        {items.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            onNavigate={onNavigate}
            exact={item.exact}
            pathname={pathname}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "dark" | "light";
  onToggle: () => void;
}) {
  return (
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
        onClick={onToggle}
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
  );
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuthContext();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isLoginScreen = pathname === "/login";
  const isReadOnlyUser = !!auth && auth.role !== "admin";
  const mainNav = isReadOnlyUser ? readOnlyMainNav : adminMainNav;
  const referenceNav = isReadOnlyUser ? readOnlyReferenceNav : adminReferenceNav;
  const homeHref = isReadOnlyUser ? "/dispatch-planning" : "/";

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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      document.body.style.removeProperty("overflow");
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");

    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setMobileNavOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  async function handleSignOut() {
    await supabase.auth.signOut();
    setMobileNavOpen(false);
    router.replace("/login");
    router.refresh();
  }

  if (isLoginScreen) {
    return (
      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    );
  }

  return (
    <div className={`app-shell${mobileNavOpen ? " nav-open" : ""}`} data-theme={theme}>
      <header className="app-header">
        <div className="header-left">
          <Link href={homeHref} className="logo" aria-label="Go to dashboard">
            <div className="logo-mark">T</div>
            <div className="logo-text">
              <div className="logo-title">TYCOON</div>
              <div className="logo-subtitle">Order Portal</div>
            </div>
          </Link>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="header-utility-button mobile-theme-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span className="header-utility-icon">{theme === "dark" ? "◐" : "◑"}</span>
            <span className="header-utility-text">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          <button
            type="button"
            className={`header-utility-button mobile-nav-button${mobileNavOpen ? " active" : ""}`}
            onClick={() => setMobileNavOpen((current) => !current)}
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          >
            <span className="header-utility-icon">{mobileNavOpen ? "×" : "≡"}</span>
            <span className="header-utility-text">{mobileNavOpen ? "Close" : "Menu"}</span>
          </button>

          <div className="user-badge" title={auth ? `${auth.username} · ${auth.role}` : "Not signed in"}>
            <span className="user-dot" />
            <span>
              {auth ? `${auth.username} · ${auth.role === "admin" ? "Admin" : "View only"}` : "Not signed in"}
            </span>
          </div>

          {auth && (
            <button
              type="button"
              className="header-utility-button"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              <span className="header-utility-icon">↗</span>
              <span className="header-utility-text">Sign out</span>
            </button>
          )}
        </div>
      </header>

      <button
        type="button"
        className="app-shell-backdrop"
        aria-label="Close navigation"
        onClick={() => setMobileNavOpen(false)}
      />

      <aside id="app-sidebar" className={`sidebar${mobileNavOpen ? " open" : ""}`}>
        <NavSection title="Main" items={mainNav} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
        <NavSection title="Reference" items={referenceNav} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />

        <ThemeToggle theme={theme} onToggle={toggleTheme} />

        <div className="sidebar-footer">
          <div>Tycoon · Black &amp; White UI</div>
          <div style={{ opacity: 0.7, marginTop: 2 }}>{isReadOnlyUser ? "View-only access" : "Admin access"}</div>
        </div>
      </aside>

      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
