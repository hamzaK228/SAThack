"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
export default function PasswordRecovery({
  reset = false,
  expired = false,
}: {
  reset?: boolean;
  expired?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    expired
      ? "That link is invalid or has expired. Request a new reset link."
      : "",
  );
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (reset && password !== confirm) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (reset) {
        const {
          data: { user },
          error: sessionError,
        } = await supabase.auth.getUser();
        if (!user || sessionError)
          throw new Error("Your reset link has expired. Request another link.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.auth.signOut();
        setMessage("Password updated. Sign in with your new password.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
          },
        );
        if (error) throw error;
        setMessage(
          "If that email has an account, a reset link is on its way. Check your inbox and spam folder.",
        );
      }
      setSuccess(true);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not complete the request. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">
          {reset ? "Set a new password" : "Reset your password"}
        </h1>
        <form className="auth-form" onSubmit={submit}>
          {reset ? (
            <>
              <label className="field">
                New password
                <input
                  className="field-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="field">
                Confirm password
                <input
                  className="field-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="field">
              Email
              <input
                className="field-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          <p role="status">{message}</p>
          <button className="btn btn-primary" disabled={busy || success}>
            {busy
              ? "Working..."
              : reset
                ? "Update password"
                : "Send reset link"}
          </button>
          <Link className="btn btn-ghost" href="/auth">
            Back to sign in
          </Link>
          {reset && !success && (
            <Link href="/auth/forgot">Request a new reset link</Link>
          )}
        </form>
      </div>
    </main>
  );
}
