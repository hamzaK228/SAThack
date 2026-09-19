"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";

const faqs = [
  {
    q: "Is SAThack free to use?",
    a: "Yes. Question practice, review, analytics, and study plans are free during development. No paid subscription is currently offered. Tutor messages are limited to 50 per day.",
  },
  {
    q: "How accurate is the score prediction?",
    a: "The predictor is an estimate from section scores, not an official College Board scaled score. Use it to gauge where you stand, then confirm with a full practice test.",
  },
  {
    q: "Which exams does SAThack cover?",
    a: "The Digital SAT, with adaptive Reading & Writing and Math modules that mirror the real test structure and timing.",
  },
  {
    q: "Are the questions real College Board questions?",
    a: "Yes — our bank is built from thousands of official College Board SAT questions, organized by domain and difficulty.",
  },
  {
    q: "Can I use SAThack on my phone?",
    a: "Yes. The platform is responsive and works across desktop, tablet, and phone.",
  },
];

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section" id="faq">
      <div className="wrap">
        <div className="section-head">
          <Reveal>
            <p className="eyebrow">FAQ</p>
            <h2>Frequently asked questions</h2>
          </Reveal>
        </div>
        <Reveal>
          <div className="faq-list">
            {faqs.map((faq, i) => {
              const isOpen = openIndex === i;
              return (
                <div className="faq-item" key={faq.q}>
                  <button
                    className="faq-q"
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                  >
                    <span>{faq.q}</span>
                    <span className="faq-icon" aria-hidden="true">
                      +
                    </span>
                  </button>
                  <div className={`faq-a${isOpen ? " open" : ""}`}>
                    <p>{faq.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
