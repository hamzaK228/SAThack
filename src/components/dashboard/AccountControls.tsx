"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
export default function AccountControls() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (confirmation !== "DELETE" || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Please sign in again.");
      const reauth = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (reauth.error) throw new Error("The password could not be verified.");
      const { error } = await supabase.rpc("delete_my_account");
      if (error)
        throw new Error("Could not delete your account. Please retry.");
      await supabase.auth.signOut({ scope: "local" });
      for (const key of Object.keys(localStorage))
        if (key.includes(user.id)) localStorage.removeItem(key);
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed.");
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/auth");
      router.refresh();
    } catch {
      setError("Could not sign out. Please retry.");
      setBusy(false);
    }
  }
  return (
    <section className="account-controls">
      <h2 className="dash-section-title">Your data</h2>
      <a className="btn btn-ghost" href="/account/export">
        <Download size={18} /> Export account data
      </a>
      <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
        <Trash2 size={18} /> Delete account
      </button>
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => void signOut()}
      >
        <LogOut size={18} /> Sign out
      </button>
      {!open && error && <p role="alert">{error}</p>}
      {open && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
        >
          <p>
            Deleting your account permanently removes your saved questions,
            answers, and study progress. This cannot be undone.
          </p>
          <label className="field">
            Current password
            <input
              className="field-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field">
            Type DELETE to confirm
            <input
              className="field-input"
              autoComplete="off"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <p role="alert">{error}</p>
          <button
            className="btn btn-ghost"
            disabled={busy || confirmation !== "DELETE" || !password}
          >
            {busy ? "Deleting..." : "Permanently delete my account"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}
