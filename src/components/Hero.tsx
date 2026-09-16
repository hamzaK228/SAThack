"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useRef } from "react";
import Terminal from "./Terminal";
import Magnetic from "./Magnetic";
import Tilt from "./Tilt";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

function Words({ text, baseDelay = 0 }: { text: string; baseDelay?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <span className="hw" key={`${word}-${i}`}>
          <motion.span
            initial={{ opacity: 0, y: 26, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: baseDelay + i * 0.07, ease: EASE }}
          >
            {word}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </>
  );
}

export default function Hero() {
  const ref = useRef<HTMLElement>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--sy", `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  return (
    <section className="hero" id="top" ref={ref} onMouseMove={onMove}>
      <div className="aurora" aria-hidden="true">
        <div className="aurora-blob a"></div>
        <div className="aurora-blob b"></div>
        <div className="aurora-blob c"></div>
      </div>
      <div className="hero-grid-bg" aria-hidden="true"></div>
      <div className="spotlight" aria-hidden="true"></div>

      <div className="wrap hero-grid">
        <div className="hero-copy">
          <motion.p
            className="eyebrow"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            Adaptive Digital SAT platform
          </motion.p>

          <h1 className="hero-title">
            <span className="line">
              <Words text="The SAT is a system." baseDelay={0.06} />
            </span>
            <span className="line grad">
              <Words text="Every system has a hack. Find yours." baseDelay={0.34} />
            </span>
          </h1>

          <motion.p
            className="hero-sub"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
          >
            SAThack starts with your real score — maps the exact domains costing you points, then
            rebuilds your plan every time your accuracy shifts.
          </motion.p>

          <motion.div
            className="hero-ctas"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.72, ease: EASE }}
          >
            <Magnetic>
              <Link className="btn btn-primary btn-lg" href="/auth">
                Start free diagnostic →
              </Link>
            </Magnetic>
            <Magnetic strength={0.2}>
              <a className="btn btn-ghost btn-lg" href="#how">
                See how it works
              </a>
            </Magnetic>
          </motion.div>

          <motion.ul
            className="hero-meta"
            aria-label="Platform facts"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.86, ease: EASE }}
          >
            <li>
              <strong>3,700+</strong> real College Board questions
            </li>
            <li>
              <strong>8</strong> domains tracked
            </li>
            <li>
              <strong>4</strong> adaptive modules
            </li>
          </motion.ul>
        </div>

        <motion.div
          className="hero-visual"
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.85, delay: 0.35, ease: EASE }}
        >
          <Tilt>
            <Terminal />
          </Tilt>

          <motion.div
            className="float-card fc-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5 }}
          >
            <span className="fc-icon">📈</span>
            <span>
              Score lift <strong>+270</strong>
            </span>
          </motion.div>
          <motion.div
            className="float-card fc-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.25, duration: 0.5 }}
          >
            <span className="fc-icon">⚡</span>
            <span>
              Level <strong>12</strong>
            </span>
          </motion.div>
          <motion.div
            className="float-card fc-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            <span className="fc-icon">🏆</span>
            <span>
              <strong>90%</strong> Algebra mastery
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}


