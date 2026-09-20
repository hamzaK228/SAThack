"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ text: "", bad: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (next.length < 8) return setNotice({ text: "Use at least 8 characters.", bad: true });
    if (next !== confirm) return setNotice({ text: "The new passwords do not match.", bad: true });
    if (current === next) return setNotice({ text: "Choose a password you have not just used.", bad: true });

    setBusy(true);
    setNotice({ text: "", bad: false });
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Sign in again before changing your password.");
      const reauth = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (reauth.error) throw new Error("Your current password is incorrect.");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw new Error(error.message);
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice({ text: "Password changed.", bad: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Could not change your password.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <KeyRound size={19} />
        <div>
          <h2 className="dash-section-title">Change password</h2>
          <p>Confirm your current password before choosing a new one.</p>
        </div>
      </div>
      <form className="settings-password-form" onSubmit={submit}>
        <label className="field"><span className="field-label">Current password</span><input className="field-input" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required /></label>
        <label className="field"><span className="field-label">New password</span><input className="field-input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(event) => setNext(event.target.value)} required /></label>
        <label className="field"><span className="field-label">Confirm new password</span><input className="field-input" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Changing..." : "Change password"}</button>
      </form>
      {notice.text && <p className={`feedback ${notice.bad ? "bad" : "ok"}`} role="status">{notice.text}</p>}
    </section>
  );
}
