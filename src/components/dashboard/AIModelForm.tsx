"use client";
import { useState } from "react";
import { updateAIModel } from "@/app/dashboard/actions";

export default function AIModelForm({
  current,
  models,
}: {
  current: string | null;
  models: string[];
}) {
  const [value, setValue] = useState(
    models.includes(current ?? "") ? current! : "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(next: string) {
    setBusy(true);
    setMessage("");
    try {
      await updateAIModel(next || null);
      setValue(next);
      setMessage("Saved");
    } catch {
      setMessage("Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2 className="dash-section-title">AI tutor</h2>
      <label className="field">
        <span className="field-label">Model</span>
        <select
          className="qb-select"
          value={value}
          disabled={busy}
          onChange={(e) => void save(e.target.value)}
        >
          <option value="">Default</option>
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <p className="field-help">Up to 50 tutor messages per day.</p>
      <p role="status">{message}</p>
    </section>
  );
}
