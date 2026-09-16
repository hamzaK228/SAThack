"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (el: HTMLElement, opts?: Record<string, unknown>) => unknown;
    };
  }
}

/**
 * Desmos is loaded from its CDN.
 *
 * The fallback below is Desmos' shared demo key: it works on any domain but is
 * rate-limited and NOT meant for real traffic. Before launch, get a production
 * API key (desmos.com/api), register the production domain, and set
 * NEXT_PUBLIC_DESMOS_API_KEY — no code change needed.
 */
const DESMOS_API_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY || "dcb31709b452b1cf9dc26972add0fda6";

export default function DesmosCalculator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const calc = useRef<unknown>(null);

  useEffect(() => {
    if (!open) return;

    function init() {
      if (holder.current && !calc.current && window.Desmos) {
        calc.current = window.Desmos.GraphingCalculator(holder.current, {
          expressions: true,
          settingsMenu: false,
          zoomButtons: false,
        });
      }
    }

    if (window.Desmos) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = `https://www.desmos.com/api/v1.7/calculator.js?apiKey=${DESMOS_API_KEY}`;
      script.async = true;
      script.onload = init;
      document.body.appendChild(script);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      calc.current = null;
      if (holder.current) holder.current.innerHTML = "";
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="calc-overlay" onClick={onClose}>
      <div className="calc-panel" onClick={(e) => e.stopPropagation()}>
        <div className="calc-head">
          <span className="calc-title">🧮 Desmos calculator</span>
          <button className="calc-close" onClick={onClose} aria-label="Close calculator">
            ×
          </button>
        </div>
        <div className="calc-body" ref={holder}></div>
      </div>
    </div>
  );
}
