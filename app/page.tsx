// app/page.tsx

export default function Home() {
  return (
    <>
      <section>
        <h1 className="section-title">Dashboard</h1>
        <p className="section-subtitle">
          Tycoon demand snapshot · This is static for now, we’ll connect live
          data next.
        </p>

        <div className="card-grid">
          <div className="card">
            <div className="card-label">Total Orders (Sample)</div>
            <div className="card-value">42</div>
            <div className="card-meta">Last 30 days · All stakeholders</div>
          </div>

          <div className="card">
            <div className="card-label">Total Pcs (Sample)</div>
            <div className="card-value">864 pcs</div>
            <div className="card-meta">Jeep + Bike + Car + Scooter</div>
          </div>

          <div className="card">
            <div className="card-label">Top Item (Sample)</div>
            <div className="card-value">FR-900 Jeep</div>
            <div className="card-meta">210 pcs ordered</div>
          </div>

          <div className="card">
            <div className="card-label">Active Parties (Sample)</div>
            <div className="card-value">18</div>
            <div className="card-meta">Placed ≥1 order this month</div>
          </div>
        </div>

        <button className="pill-button" type="button">
          Punch new order
          <span>↗</span>
        </button>
      </section>

      <section style={{ marginTop: 28 }}>
        <div className="table-wrapper">
          <div className="table-header">
            <div className="table-title">Latest Orders (Sample)</div>
            <div className="table-filters">Showing 5 most recent</div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Party</th>
                <th>Stakeholder</th>
                <th>Qty</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>TYN-2025-11-0005</td>
                <td>ABC Toys, Pune</td>
                <td>Stakeholder 1</td>
                <td>42 pcs</td>
                <td>₹ 3.25 L</td>
                <td>
                  <span className="badge">Submitted</span>
                </td>
              </tr>
              <tr>
                <td>TYN-2025-11-0004</td>
                <td>XYZ Kids, Indore</td>
                <td>Stakeholder 2</td>
                <td>28 pcs</td>
                <td>₹ 2.10 L</td>
                <td>
                  <span className="badge">In Production</span>
                </td>
              </tr>
              <tr>
                <td>TYN-2025-11-0003</td>
                <td>Fun World, Jaipur</td>
                <td>Stakeholder 1</td>
                <td>16 pcs</td>
                <td>₹ 1.30 L</td>
                <td>
                  <span className="badge">Packed</span>
                </td>
              </tr>
              <tr>
                <td>TYN-2025-11-0002</td>
                <td>Kidz Corner, Nagpur</td>
                <td>Stakeholder 3</td>
                <td>24 pcs</td>
                <td>₹ 1.85 L</td>
                <td>
                  <span className="badge">Dispatched</span>
                </td>
              </tr>
              <tr>
                <td>TYN-2025-11-0001</td>
                <td>Play Time, Mumbai</td>
                <td>Stakeholder 2</td>
                <td>18 pcs</td>
                <td>₹ 1.45 L</td>
                <td>
                  <span className="badge">Dispatched</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}