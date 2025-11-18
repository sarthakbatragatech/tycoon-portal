"use client";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1 className="section-title">Dashboard</h1>
      <p className="section-subtitle">
        Welcome to the Tycoon Order Portal. Manage orders and track demand.
      </p>

      {/* TOP CARDS */}
      <div className="card-grid">
        <div className="card">
          <div className="card-label">Orders Today</div>
          <div className="card-value">—</div>
          <div className="card-meta">Coming soon</div>
        </div>

        <div className="card">
          <div className="card-label">Total Value</div>
          <div className="card-value">—</div>
          <div className="card-meta">Coming soon</div>
        </div>

        <div className="card">
          <div className="card-label">Pending Production</div>
          <div className="card-value">—</div>
          <div className="card-meta">Coming soon</div>
        </div>
      </div>

      {/* PUNCH ORDER QUICK LINK */}
      <div style={{ marginTop: 28, marginBottom: 20 }}>
        <Link href="/orders/new" className="pill-button" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Punch new order
          <span style={{ fontSize: 16 }}>↗</span>
        </Link>
      </div>

      {/* FUTURE SECTIONS */}
      <div className="card" style={{ marginTop: 10 }}>
        <div className="card-label">Recent Updates</div>
        <div className="card-value" style={{ fontSize: 16 }}>
          Coming soon…
        </div>
        <div className="card-meta">This section will show recent changes and activity.</div>
      </div>
    </>
  );
}