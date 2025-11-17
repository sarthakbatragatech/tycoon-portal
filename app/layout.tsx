// app/layout.tsx
import type { Metadata } from "next";
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
                <button className="nav-item active" type="button">
                  <span>Dashboard</span>
                  <span className="nav-item-dot" />
                </button>
                <button className="nav-item" type="button">
                  <span>Punch Order</span>
                  <span className="nav-item-dot" />
                </button>
                <button className="nav-item" type="button">
                  <span>View Orders</span>
                  <span className="nav-item-dot" />
                </button>
              </div>
            </div>

            <div>
              <div className="sidebar-section-title">Reference</div>
              <div className="nav-list">
                <button className="nav-item" type="button">
                  <span>Parties</span>
                  <span className="nav-item-dot" />
                </button>
                <button className="nav-item" type="button">
                  <span>Items</span>
                  <span className="nav-item-dot" />
                </button>
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