import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tycoon Order Portal",
  description: "Internal order portal for Tycoon battery-operated vehicles",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          {/* HEADER */}
          <header className="app-header">
            <div className="logo">
              <div className="logo-mark">T</div>
              <div className="logo-text">
                <div className="logo-title">TYCOON</div>
                <div className="logo-subtitle">Order Portal</div>
              </div>
            </div>
            <div className="user-badge">
              <span className="user-dot" />
              <span>Admin (Preview)</span>
            </div>
          </header>

          {/* SIDEBAR */}
          <aside className="sidebar">
            <div>
              <div className="sidebar-section-title">Main</div>
              <div className="nav-list">
                <Link href="/" className="nav-item">
                  <span>Dashboard</span>
                  <span className="nav-item-dot" />
                </Link>
                <Link href="/orders/new" className="nav-item">
                  <span>Punch Order</span>
                  <span className="nav-item-dot" />
                </Link>
                <Link href="/orders" className="nav-item">
                  <span>View Orders</span>
                  <span className="nav-item-dot" />
                </Link>
              </div>
            </div>

            <div>
              <div className="sidebar-section-title">Reference</div>
              <div className="nav-list">
                <Link href="/parties" className="nav-item">
                  <span>Parties</span>
                  <span className="nav-item-dot" />
                </Link>
                <Link href="/items" className="nav-item">
                  <span>Items</span>
                  <span className="nav-item-dot" />
                </Link>
              </div>
            </div>

            <div className="sidebar-footer">
              Tycoon · Black &amp; White UI
              <br />
              <span style={{ opacity: 0.7 }}>MVP Preview</span>
            </div>
          </aside>

          {/* MAIN CONTENT */}
          <main className="main">
            <div className="main-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}