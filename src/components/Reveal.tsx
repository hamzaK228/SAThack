"use client";

import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animates a number counting up from 0 (or from a given start) when scrolled
 * into view. Use `prefix`/`suffix` for labels and `comma` for thousands.
 */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  comma = false,
  duration = 1.4,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  comma?: boolean;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });

  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, to, mv]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => {
      if (ref.current) {
        const r = Math.round(v);
        const body = comma ? r.toLocaleString() : r.toString();
        ref.current.textContent = prefix + body + suffix;
      }
    });
    return unsub;
  }, [spring, prefix, suffix, comma]);

  const initial = Math.round(0);
  return <span ref={ref}>{prefix + (comma ? initial.toLocaleString() : initial.toString()) + suffix}</span>;
}
