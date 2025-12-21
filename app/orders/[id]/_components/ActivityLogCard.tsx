// @ts-nocheck
"use client";

export default function ActivityLogCard({ logs }: { logs: any[] }) {
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-label">Activity log</div>

      {logs.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          No activity recorded yet.
        </div>
      )}

      {logs.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            marginTop: 6,
            fontSize: 12,
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {logs.map((log) => (
            <li
              key={log.id}
              style={{
                padding: "4px 0",
                borderBottom: "1px solid #1f2933",
              }}
            >
              <div
                style={{ opacity: 0.75, fontSize: 10, marginBottom: 2 }}
              >
                {log.created_at
                  ? new Date(log.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </div>
              <div>{log.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
