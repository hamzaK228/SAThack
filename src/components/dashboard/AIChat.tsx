"use client";

import { useState } from "react";
import MathText from "@/components/MathText";
import { askAI } from "@/app/dashboard/actions";

type Msg = { role: "user" | "ai"; text: string };

const GREETING =
  "Hi! I'm your Digital SAT tutor. Ask me about any concept, strategy, or question type — or how to use your time before test day.";

const DEFAULT_SUGGESTIONS = [
  "How do I improve my Reading score?",
  "What's the best way to study Algebra?",
  "How does the adaptive scoring work?",
  "Give me a strategy for the Math section",
];

export default function AIChat({
  suggestions = DEFAULT_SUGGESTIONS,
  initialQuestion = "",
}: {
  suggestions?: string[];
  /** Prefilled when arriving from a lesson or a question — typed in, never auto-sent. */
  initialQuestion?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "ai", text: GREETING }]);
  const [input, setInput] = useState(initialQuestion);
  const [busy, setBusy] = useState(false);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    if (!text) setInput("");
    // Everything except the greeting is a real conversation turn.
    const history = messages
      .slice(1)
      .map((m) => ({ role: m.role === "ai" ? ("assistant" as const) : ("user" as const), content: m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const answer = await askAI({ question: q, history });
      setMessages((m) => [...m, { role: "ai", text: answer }]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Could not reach the tutor. Please try again."}]); }
    finally { setBusy(false); }
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-msgs">
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <MathText text={m.text} />
          </div>
        ))}
        {busy && <div className="ai-msg ai">Thinking…</div>}
      </div>

      {messages.length <= 1 && (
        <div className="ai-suggestions">
          {suggestions.map((s) => (
            <button key={s} className="tutor-chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="ai-chat-input">
        <input
          className="field-input"
          aria-label="Message to tutor"
          maxLength={4000}
          placeholder="Ask anything about the SAT…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        {messages.length > 1 && (
          <button
            className="btn"
            aria-label="Start a new conversation"
            title="Start a new conversation"
            disabled={busy}
            onClick={() => {
              setMessages([{ role: "ai", text: GREETING }]);
              setInput("");
            }}
          >
            ↺
          </button>
        )}
        <button className="btn btn-primary" onClick={() => send()} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}
