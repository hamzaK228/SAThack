"use client";

import { useEffect, useRef } from "react";

export default function Terminal() {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const body = bodyRef.current;
    if (!body || reduce) return;

    const rows = Array.from(body.children);
    rows.forEach((el) => el.classList.add("reveal-hide"));

    let i = 0;
    let timer: number;
    const reveal = () => {
      if (i < rows.length) {
        rows[i].classList.remove("reveal-hide");
        rows[i].classList.add("reveal-in");
        i += 1;
        timer = window.setTimeout(reveal, 90);
      }
    };
    timer = window.setTimeout(reveal, 300);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="hero-terminal" aria-label="Sample diagnostic session">
      <div className="terminal-bar">
        <span className="terminal-dot" aria-hidden="true"></span>
        <span className="terminal-dot" aria-hidden="true"></span>
        <span className="terminal-dot" aria-hidden="true"></span>
        <span className="terminal-title">sathack — diagnostic</span>
        <span className="terminal-tag">sample</span>
      </div>
      <div className="terminal-body" ref={bodyRef}>
        <p className="term-line">
          <span className="term-prompt">&gt;</span> sathack run --diagnostic
        </p>
        <p className="term-line">
          <span className="term-prompt">&gt;</span> loading adaptive modules…
        </p>
        <p className="term-line dim">[1/4] Reading &amp; Writing — Module 1 ......... 27/27</p>
        <p className="term-line dim">[2/4] Reading &amp; Writing — Module 2 (hard) ... 21/27</p>
        <p className="term-line dim">[3/4] Math — Module 1 ...................... 22/22</p>
        <p className="term-line dim">[4/4] Math — Module 2 (hard) ............... 19/22</p>
        <p className="term-line ok">DIAGNOSTIC COMPLETE</p>
        <div className="term-score">
          <div className="term-score-row">
            <span className="term-score-label">RW</span>
            <span className="bar">
              <span className="bar-fill" style={{ ["--w" as string]: "90%" }}></span>
            </span>
            <span className="term-score-val">720</span>
          </div>
          <div className="term-score-row">
            <span className="term-score-label">MATH</span>
            <span className="bar">
              <span className="bar-fill" style={{ ["--w" as string]: "88%" }}></span>
            </span>
            <span className="term-score-val">700</span>
          </div>
          <div className="term-score-total">
            <span className="term-score-label">TOTAL</span>
            <span className="term-score-big">
              1420 <span className="unit">/ 1600</span>
            </span>
          </div>
        </div>
        <p className="term-line warn">GAP ANALYSIS — target 1550</p>
        <div className="term-gap">
          <div className="gap-row">
            <span>Craft &amp; Structure</span>
            <span className="gap-val bad">58%</span>
            <span className="gap-tag bad">weak</span>
          </div>
          <div className="gap-row">
            <span>Algebra</span>
            <span className="gap-val bad">62%</span>
            <span className="gap-tag bad">weak</span>
          </div>
          <div className="gap-row">
            <span>Standard English Conventions</span>
            <span className="gap-val ok">81%</span>
            <span className="gap-tag ok">ok</span>
          </div>
        </div>
        <p className="term-line">
          <span className="term-prompt">&gt;</span>{" "}
          <span className="term-cursor" aria-hidden="true">
            █
          </span>
        </p>
      </div>
    </div>
  );
}
