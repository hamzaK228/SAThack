"use client";

import { useState, useTransition } from "react";
import { AtSign, Save } from "lucide-react";
import { updateUsername } from "@/app/dashboard/actions";

export default function CommunityProfileForm({ current }: { current: string }) {
  const [username, setUsername] = useState(current);
  const [notice, setNotice] = useState({ text: "", bad: false });
  const [pending, startTransition] = useTransition();

  function save() {
    setNotice({ text: "", bad: false });
    startTransition(async () => {
      const result = await updateUsername(username);
      setNotice({
        text: result.ok ? "Username updated." : result.error ?? "Could not update your username.",
        bad: !result.ok,
      });
    });
  }

  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <AtSign size={19} />
        <div>
          <h2 className="dash-section-title">Community identity</h2>
          <p>Other students can find you by this unique username.</p>
        </div>
      </div>
      <form className="settings-inline-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label className="field">
          <span className="field-label">Username</span>
          <span className="field-prefixed">
            <span aria-hidden="true">@</span>
            <input
              className="field-input"
              value={username}
              minLength={3}
              maxLength={24}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              required
            />
          </span>
        </label>
        <button className="btn btn-primary" disabled={pending || username === current}>
          <Save size={17} /> {pending ? "Saving..." : "Save username"}
        </button>
      </form>
      {notice.text && <p className={`feedback ${notice.bad ? "bad" : "ok"}`} role="status">{notice.text}</p>}
    </section>
  );
}
