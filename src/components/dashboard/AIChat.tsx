"use client";

import { useState } from "react";
import MathText from "@/components/MathText";
import { askAI } from "@/app/dashboard/actions";

type Msg = { role: "user" | "ai"; text: string };

const SUGGESTIONS = [
  "How do I improve my Reading score?",
  "What's the best way to study Algebra?",
  "Explain my weakest area",
  "Give me a strategy for the Math section",
];

export default function AIChat() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      text: "Hi! I'm your SAT tutor. I know the official books and your question bank. Ask me anything — concepts, strategies, or how to improve your score.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    if (!text) setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const answer = await askAI({ question: q });
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
          {SUGGESTIONS.map((s) => (
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
        <button className="btn btn-primary" onClick={() => send()} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}
