"use client";

import { useState } from "react";
import MathText from "@/components/MathText";
import { askAI } from "@/app/dashboard/actions";

type Msg = { role: "ai" | "user"; text: string };

export default function Tutor({
  open,
  onClose,
  question,
  skill,
  domain,
  explanation,
  correctAnswer,
}: {
  open: boolean;
  onClose: () => void;
  question: string;
  skill: string | null;
  domain: string;
  explanation: string | null;
  correctAnswer: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      text: "Hey! 👋 I'm your tutor and I know the SAT books inside out. Ask me for a hint, a strategy, or anything about this question.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  function add(role: Msg["role"], text: string) {
    setMessages((m) => [...m, { role, text }]);
  }

  async function run(prompt: string) {
    setBusy(true);
    const answer = await askAI({
      question: prompt,
      questionText: question,
      domain,
      skill,
      explanation,
    });
    setBusy(false);
    add("ai", answer);
  }

  function hint() {
    run("Give me a hint for this question — don't reveal the answer yet.");
  }

  function explain() {
    add("ai", explanation ? `📖 Step-by-step:\n\n${explanation}` : "📖 No explanation available for this one yet.");
  }

  function reveal() {
    add("ai", `🎯 The correct answer is ${correctAnswer}.`);
  }

  function send() {
    if (!input.trim() || busy) return;
    add("user", input);
    setInput("");
    run(input);
  }

  if (!open) return null;

  return (
    <div className="tutor-panel">
      <div className="tutor-head">
        <span className="tutor-title">💬 Tutor</span>
        <button className="tutor-close" onClick={onClose} aria-label="Close tutor">
          ×
        </button>
      </div>

      <div className="tutor-msgs">
        {messages.map((m, i) => (
          <div key={i} className={`tutor-msg ${m.role}`}>
            <MathText text={m.text} />
          </div>
        ))}
        {busy && <div className="tutor-msg ai">Thinking…</div>}
      </div>

      <div className="tutor-quick">
        <button className="tutor-chip" onClick={hint} disabled={busy}>
          💡 Hint
        </button>
        <button className="tutor-chip" onClick={explain}>
          📖 Explain step-by-step
        </button>
        <button className="tutor-chip" onClick={reveal}>
          🎯 Show answer
        </button>
      </div>

      <div className="tutor-input-row">
        <input
          className="tutor-input"
          placeholder="Ask anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn btn-primary" onClick={send} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}

