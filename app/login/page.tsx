"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { internalEmailForUsername, normalizeUsername } from "@/lib/auth/usernames";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "setup";

function getRedirectPath(role: string | null) {
  return role === "admin" ? "/" : "/dispatch-planning";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const email = internalEmailForUsername(normalizedUsername);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setSubmitting(false);
      setError(signInError.message);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (profileError) {
      setSubmitting(false);
      setError(profileError.message);
      return;
    }

    router.replace(getRedirectPath(profileData?.role ?? null));
    router.refresh();
  }

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setSubmitting(false);
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitting(false);
      setError("Passwords do not match.");
      return;
    }

    const response = await fetch("/api/auth/complete-setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: normalizedUsername,
        setupCode: setupCode.trim(),
        password,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitting(false);
      setError(payload?.error || "Could not complete setup.");
      return;
    }

    setMessage("Account created. Signing you in…");

    const email = internalEmailForUsername(normalizedUsername);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setSubmitting(false);
      setError(signInError.message);
      return;
    }

    router.replace(getRedirectPath(payload?.role ?? null));
    router.refresh();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
      }}
    >
      <div
        className="card"
        style={{
          width: "min(100%, 520px)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div>
          <div className="section-title" style={{ marginBottom: 8 }}>
            Tycoon Portal Login
          </div>
          <div className="section-subtitle">
            Sign in with your username and password, or complete first-time setup with a setup code.
          </div>
        </div>

        <div
          style={{
            display: "inline-flex",
            gap: 8,
            padding: 4,
            borderRadius: 999,
            background: "var(--surface-elevated, rgba(255,255,255,0.03))",
            border: "1px solid var(--surface-border)",
            width: "fit-content",
          }}
        >
          {[
            { value: "login", label: "Login" },
            { value: "setup", label: "First-time setup" },
          ].map((option) => {
            const active = mode === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setMode(option.value as AuthMode);
                  setMessage(null);
                  setError(null);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: active ? "1px solid var(--text-primary)" : "1px solid transparent",
                  background: active ? "var(--text-primary)" : "transparent",
                  color: active ? "var(--nav-active-text)" : "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={mode === "login" ? handleLogin : handleSetup}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. sarthakbatra"
              autoComplete="username"
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

          {mode === "setup" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              Setup code
              <input
                value={setupCode}
                onChange={(event) => setSetupCode(event.target.value)}
                placeholder="One-time code shared by admin"
                autoComplete="one-time-code"
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
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
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

          {mode === "setup" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              Confirm password
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
          )}

          {error && (
            <div style={{ fontSize: 12, color: "#f97316" }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ fontSize: 12, color: "#22c55e" }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "12px 16px",
              borderRadius: 14,
              border: "1px solid var(--text-primary)",
              background: "var(--text-primary)",
              color: "var(--nav-active-text)",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {submitting ? "Working…" : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
