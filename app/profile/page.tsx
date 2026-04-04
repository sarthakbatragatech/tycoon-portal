"use client";

import { FormEvent, useState } from "react";
import { useAuthContext } from "@/app/_components/AuthProvider";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const auth = useAuthContext();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    if (newPassword.length < 8) {
      setSaving(false);
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSaving(false);
      setError("New passwords do not match.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setSaving(false);
    setMessage("Password updated.");
  }

  return (
    <>
      <h1 className="section-title">Profile</h1>
      <p className="section-subtitle">Manage your account and change your password.</p>

      <div className="card-grid" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-label">Username</div>
          <div className="card-value" style={{ fontSize: 18 }}>
            {auth?.username || "Unknown"}
          </div>
          <div className="card-meta">Used to sign in to the portal</div>
        </div>

        <div className="card">
          <div className="card-label">Role</div>
          <div className="card-value" style={{ fontSize: 18 }}>
            {auth?.role === "admin" ? "Admin" : "View only"}
          </div>
          <div className="card-meta">
            {auth?.role === "admin" ? "Full portal access" : "Dispatch plan and masked order details only"}
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-label">Change password</div>
        <div className="card-meta" style={{ marginTop: 8 }}>
          This updates the password for your current signed-in account.
        </div>

        <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
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
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
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

          {error && <div style={{ fontSize: 12, color: "#f97316" }}>{error}</div>}
          {message && <div style={{ fontSize: 12, color: "#22c55e" }}>{message}</div>}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: "fit-content",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--text-primary)",
              background: "var(--text-primary)",
              color: "var(--nav-active-text)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </>
  );
}
