"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalUserListItem } from "@/lib/admin/types";
import type { AppRole } from "@/lib/auth/types";

type Feedback = {
  tone: "success" | "error";
  text: string;
} | null;

type AdminUsersClientProps = {
  currentUsername: string;
  users: PortalUserListItem[];
};

type MutationAction =
  | "create"
  | "change_role"
  | "regenerate_code"
  | "disable"
  | "enable"
  | "reset_account"
  | "delete";

function formatDate(value: string | null) {
  if (!value) return "Not yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function getStatusLabel(user: PortalUserListItem) {
  if (user.status === "active") return "Active";
  if (user.status === "disabled") return "Disabled";
  return "Invite ready";
}

function getStatusStyle(user: PortalUserListItem) {
  if (user.status === "active") {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      color: "#22c55e",
      border: "1px solid rgba(34, 197, 94, 0.35)",
    };
  }

  if (user.status === "disabled") {
    return {
      background: "rgba(249, 115, 22, 0.14)",
      color: "#f97316",
      border: "1px solid rgba(249, 115, 22, 0.35)",
    };
  }

  return {
    background: "rgba(59, 130, 246, 0.14)",
    color: "#60a5fa",
    border: "1px solid rgba(96, 165, 250, 0.35)",
  };
}

function countUsersByStatus(users: PortalUserListItem[], status: PortalUserListItem["status"]) {
  return users.filter((user) => user.status === status).length;
}

export default function AdminUsersClient({
  currentUsername,
  users,
}: AdminUsersClientProps) {
  const router = useRouter();
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("viewer");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AppRole>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setRoleDrafts(
      Object.fromEntries(users.map((user) => [user.username, user.effectiveRole])) as Record<string, AppRole>
    );
  }, [users]);

  const summary = useMemo(
    () => [
      { label: "Total users", value: String(users.length) },
      { label: "Active accounts", value: String(countUsersByStatus(users, "active")) },
      { label: "Pending invites", value: String(countUsersByStatus(users, "invite_ready")) },
      { label: "Admins", value: String(users.filter((user) => user.effectiveRole === "admin").length) },
    ],
    [users]
  );

  async function runMutation(
    action: MutationAction,
    body: Record<string, unknown>,
    key: string,
    successMessage: (payload: { username?: string; setupCode?: string; role?: AppRole }) => string
  ) {
    setPendingKey(key);
    setFeedback(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        ...body,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      username?: string;
      setupCode?: string;
      role?: AppRole;
    };

    if (!response.ok) {
      setPendingKey(null);
      setFeedback({
        tone: "error",
        text: payload.error || "Could not complete the action.",
      });
      return false;
    }

    if (action === "create") {
      setNewUsername("");
      setNewRole("viewer");
    }

    setFeedback({
      tone: "success",
      text: successMessage(payload),
    });
    setPendingKey(null);
    startTransition(() => router.refresh());
    return true;
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runMutation(
      "create",
      {
        username: newUsername,
        role: newRole,
      },
      "create",
      (payload) =>
        `Created ${payload.username}. Setup code: ${payload.setupCode}. Share that code privately for first-time setup.`
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 className="section-title">Admin Users</h1>
        <p className="section-subtitle">
          Create portal users, issue setup codes, change roles, disable access, and reset accounts without opening
          Supabase.
        </p>
      </div>

      {feedback && (
        <div
          className="card"
          style={{
            borderColor: feedback.tone === "success" ? "rgba(34, 197, 94, 0.35)" : "rgba(249, 115, 22, 0.35)",
            color: feedback.tone === "success" ? "#22c55e" : "#f97316",
          }}
        >
          {feedback.text}
        </div>
      )}

      <div className="card-grid">
        {summary.map((item) => (
          <div key={item.label} className="card">
            <div className="card-label">{item.label}</div>
            <div className="card-value" style={{ fontSize: 22 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-label">Create new user</div>
        <div className="card-meta" style={{ marginTop: 8 }}>
          This generates a setup code immediately. The new user will use that code on the `First-time setup` screen.
        </div>

        <form
          onSubmit={handleCreateUser}
          style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto", marginTop: 14 }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            Username
            <input
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              placeholder="e.g. neha"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid var(--input-border)",
                background: "var(--surface-plain)",
                color: "var(--text-primary)",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            Role
            <select
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as AppRole)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid var(--input-border)",
                background: "var(--surface-plain)",
                color: "var(--text-primary)",
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <button
            type="submit"
            disabled={pendingKey === "create"}
            style={{
              alignSelf: "end",
              padding: "12px 16px",
              borderRadius: 14,
              border: "1px solid var(--text-primary)",
              background: "var(--text-primary)",
              color: "var(--nav-active-text)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {pendingKey === "create" ? "Creating…" : "Create user"}
          </button>
        </form>
      </div>

      <div className="card" style={{ paddingBottom: 10 }}>
        <div className="card-label">How the actions work</div>
        <div className="card-meta" style={{ marginTop: 10, display: "grid", gap: 6 }}>
          <div>`Regenerate code` keeps the invite and issues a fresh setup code.</div>
          <div>`Reset account` removes the current login and issues a new setup code for re-onboarding.</div>
          <div>`Disable access` turns off a pending invite or removes a completed user&apos;s live login.</div>
          <div>`Re-enable` makes a disabled user active again and gives them a fresh setup code.</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {users.map((user) => {
          const isSelf = user.username === currentUsername;
          const roleDraft = roleDrafts[user.username] ?? user.effectiveRole;
          const roleChanged = roleDraft !== user.effectiveRole;
          const statusStyle = getStatusStyle(user);

          return (
            <div
              key={user.username}
              className="card"
              style={{
                display: "grid",
                gap: 16,
                borderColor: isSelf ? "rgba(255,255,255,0.22)" : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div className="card-value" style={{ fontSize: 20 }}>
                    {user.username}
                    {isSelf ? " · you" : ""}
                  </div>
                  <div className="card-meta" style={{ marginTop: 4 }}>
                    {user.internalEmail}
                  </div>
                </div>

                <div
                  style={{
                    ...statusStyle,
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {getStatusLabel(user)}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                }}
              >
                <div>
                  <div className="card-label">Configured role</div>
                  <div className="card-meta" style={{ marginTop: 4 }}>
                    {user.invitedRole === "admin" ? "Admin" : "Viewer"}
                  </div>
                </div>

                <div>
                  <div className="card-label">Live role</div>
                  <div className="card-meta" style={{ marginTop: 4 }}>
                    {user.liveRole ? (user.liveRole === "admin" ? "Admin" : "Viewer") : "Not created yet"}
                  </div>
                </div>

                <div>
                  <div className="card-label">Setup completed</div>
                  <div className="card-meta" style={{ marginTop: 4 }}>
                    {formatDate(user.setupCompletedAt)}
                  </div>
                </div>

                <div>
                  <div className="card-label">Auth account</div>
                  <div className="card-meta" style={{ marginTop: 4 }}>
                    {user.authUserId ? "Linked" : "Not linked"}
                  </div>
                </div>
              </div>

              {user.status === "invite_ready" && (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 14,
                    borderRadius: 16,
                    background: "var(--surface-elevated, rgba(255,255,255,0.03))",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div className="card-label">Current setup code</div>
                  <div className="card-value" style={{ fontSize: 18, fontFamily: "var(--font-geist-mono, monospace)" }}>
                    {user.setupCode}
                  </div>
                  <div className="card-meta">Share this privately with the user for first-time setup.</div>
                </div>
              )}

              {user.status === "disabled" && (
                <div className="card-meta">
                  This user is disabled. Re-enable them to generate a fresh setup code and allow access again.
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "minmax(0, 220px) auto",
                  alignItems: "end",
                }}
              >
                <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                  Change role
                  <select
                    value={roleDraft}
                    onChange={(event) =>
                      setRoleDrafts((current) => ({
                        ...current,
                        [user.username]: event.target.value as AppRole,
                      }))
                    }
                    disabled={isSelf || pendingKey === `role:${user.username}`}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: "1px solid var(--input-border)",
                      background: "var(--surface-plain)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <button
                  type="button"
                  disabled={isSelf || !roleChanged || pendingKey === `role:${user.username}`}
                  onClick={() =>
                    runMutation(
                      "change_role",
                      {
                        username: user.username,
                        role: roleDraft,
                      },
                      `role:${user.username}`,
                      (payload) => `Updated ${payload.username} to ${payload.role}.`
                    )
                  }
                  style={{
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: "1px solid var(--surface-border)",
                    background: "var(--surface-elevated, rgba(255,255,255,0.03))",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {pendingKey === `role:${user.username}` ? "Saving…" : "Save role"}
                </button>
              </div>

              {isSelf && (
                <div className="card-meta">
                  Your own role and account safety actions are locked here so you do not accidentally remove your own
                  admin access.
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {user.status === "invite_ready" && (
                  <button
                    type="button"
                    disabled={pendingKey === `regen:${user.username}`}
                    onClick={() =>
                      runMutation(
                        "regenerate_code",
                        { username: user.username },
                        `regen:${user.username}`,
                        (payload) => `Generated a new setup code for ${payload.username}: ${payload.setupCode}.`
                      )
                    }
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--surface-border)",
                      background: "var(--surface-elevated, rgba(255,255,255,0.03))",
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {pendingKey === `regen:${user.username}` ? "Working…" : "Regenerate code"}
                  </button>
                )}

                {user.status === "active" && (
                  <button
                    type="button"
                    disabled={isSelf || pendingKey === `reset:${user.username}`}
                    onClick={() =>
                      runMutation(
                        "reset_account",
                        { username: user.username },
                        `reset:${user.username}`,
                        (payload) => `Reset ${payload.username}. New setup code: ${payload.setupCode}.`
                      )
                    }
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--surface-border)",
                      background: "var(--surface-elevated, rgba(255,255,255,0.03))",
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {pendingKey === `reset:${user.username}` ? "Working…" : "Reset account"}
                  </button>
                )}

                {user.status === "disabled" && (
                  <button
                    type="button"
                    disabled={pendingKey === `enable:${user.username}`}
                    onClick={() =>
                      runMutation(
                        "enable",
                        { username: user.username },
                        `enable:${user.username}`,
                        (payload) => `Re-enabled ${payload.username}. New setup code: ${payload.setupCode}.`
                      )
                    }
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(34, 197, 94, 0.35)",
                      background: "rgba(34, 197, 94, 0.14)",
                      color: "#22c55e",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {pendingKey === `enable:${user.username}` ? "Working…" : "Re-enable"}
                  </button>
                )}

                {user.status !== "disabled" && (
                  <button
                    type="button"
                    disabled={isSelf || pendingKey === `disable:${user.username}`}
                    onClick={() =>
                      runMutation(
                        "disable",
                        { username: user.username },
                        `disable:${user.username}`,
                        (payload) => `Disabled ${payload.username}.`
                      )
                    }
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(249, 115, 22, 0.35)",
                      background: "rgba(249, 115, 22, 0.14)",
                      color: "#f97316",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {pendingKey === `disable:${user.username}` ? "Working…" : "Disable access"}
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSelf || pendingKey === `delete:${user.username}`}
                  onClick={() =>
                    runMutation(
                      "delete",
                      { username: user.username },
                      `delete:${user.username}`,
                      (payload) => `Deleted ${payload.username}.`
                    )
                  }
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    background: "rgba(239, 68, 68, 0.14)",
                    color: "#ef4444",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {pendingKey === `delete:${user.username}` ? "Working…" : "Delete user"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
