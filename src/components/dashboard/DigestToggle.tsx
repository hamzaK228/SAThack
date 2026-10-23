"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { setDigestOptIn } from "@/app/dashboard/feature-actions";

export default function DigestToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !enabled;
    const previous = enabled;
    setEnabled(next);
    setMessage("");
    startTransition(async () => {
      const result = await setDigestOptIn(next);
      if (!result.ok) {
        setEnabled(previous);
        setMessage(result.error ?? "Could not save that preference.");
      } else {
        setMessage(next ? "Weekly digest on." : "Weekly digest off.");
      }
    });
  }

  return (
    <section className="settings-section digest-toggle">
      <div className="settings-section-head">
        <Mail size={19} />
        <div>
          <h2 className="dash-section-title">Weekly digest</h2>
          <p>One email a week with questions practised, accuracy, weakest skill and the next two steps.</p>
        </div>
      </div>
      <button
        className={`btn ${enabled ? "btn-primary" : "btn-ghost"}`}
        type="button"
        aria-pressed={enabled}
        onClick={toggle}
        disabled={pending}
      >
        {enabled ? "On — email me weekly" : "Off — keep it in the app"}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
