"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAIModel } from "@/app/dashboard/actions";

const MODELS = [
  { value: "", label: "Default (SAT_AI_MODEL)" },
  { value: "gpt-4o-mini", label: "GPT-4o mini — cheap & fast", group: "OpenAI" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini", group: "OpenAI" },
  { value: "gpt-4o", label: "GPT-4o — best quality", group: "OpenAI" },
  { value: "gpt-4.1", label: "GPT-4.1", group: "OpenAI" },
  { value: "qwen/qwen3.8-flash", label: "Qwen3.8 Flash — 1M context, agentic ★", group: "Qwen (OpenRouter)" },
  { value: "qwen/qwen3.8-27b", label: "Qwen3.8 27B — open weights", group: "Qwen (OpenRouter)" },
  { value: "qwen/qwen3.8-max", label: "Qwen3.8 Max — deepest reasoning", group: "Qwen (OpenRouter)" },
];

const GROUPS = ["OpenAI", "Qwen (OpenRouter)"] as const;

export default function AIModelForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(v: string) {
    setValue(v);
    setBusy(true);
    setSaved(false);
    await updateAIModel(v || null);
    setBusy(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="dash-card">
      <h2 className="dash-section-title">🤖 AI model</h2>
      <p className="dash-sub" style={{ marginBottom: "1rem" }}>
        Which model powers your study plan, tutor and lesson generation. OpenAI models need{" "}
        <code>SAT_AI_API_KEY</code>; the Qwen models are OpenAI-compatible, so point{" "}
        <code>SAT_AI_BASE_URL</code> at OpenRouter (<code>https://openrouter.ai/api/v1</code>) and use your
        OpenRouter key. Without a key everything still works offline via the book corpus.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <select
          className="qb-select"
          value={value}
          onChange={(e) => save(e.target.value)}
          disabled={busy}
        >
          <option value="">{MODELS[0].label}</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {MODELS.filter((m) => m.group === g).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {saved && <span className="feedback ok">Saved ✓</span>}
      </div>
    </div>
  );
}
