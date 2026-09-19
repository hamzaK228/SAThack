"use client";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/lib/use-dialog";
import { Calculator, X, ExternalLink } from "lucide-react";

type CalculatorInstance = { destroy(): void };
declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator(
        el: HTMLElement,
        opts?: Record<string, unknown>,
      ): CalculatorInstance;
    };
  }
}
let loader: Promise<void> | null = null;
function loadCalculator(key: string) {
  if (window.Desmos) return Promise.resolve();
  if (!loader)
    loader = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.desmos.com/api/v1.7/calculator.js?apiKey=${encodeURIComponent(key)}`;
      script.onload = () => resolve();
      script.onerror = () => {
        loader = null;
        script.remove();
        reject(new Error("Calculator failed to load."));
      };
      document.body.appendChild(script);
    });
  return loader;
}
export default function DesmosCalculator({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const dialog = useDialog(open, onClose);
  const [error, setError] = useState(false);
  const key = process.env.NEXT_PUBLIC_DESMOS_API_KEY;
  useEffect(() => {
    if (!open || !key) return;
    let active = true;
    let instance: CalculatorInstance | undefined;
    loadCalculator(key)
      .then(() => {
        if (active && holder.current && window.Desmos)
          instance = window.Desmos.GraphingCalculator(holder.current, {
            expressions: true,
            settingsMenu: false,
          });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      instance?.destroy();
    };
  }, [open, key]);
  if (!open) return null;
  return (
    <div className="calc-overlay" onClick={onClose}>
      <div
        className="calc-panel"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Calculator"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="calc-head">
          <span className="calc-title">
            <Calculator size={18} /> Calculator
          </span>
          <button
            className="calc-close"
            aria-label="Close calculator"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {!key || error ? (
          <div className="exam-review">
            <p>
              {error
                ? "The calculator could not load."
                : "Use the Desmos graphing calculator in a separate tab."}
            </p>
            <a
              className="btn btn-primary"
              href="https://www.desmos.com/calculator"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Desmos <ExternalLink size={18} />
            </a>
          </div>
        ) : (
          <div className="calc-body" ref={holder} />
        )}
      </div>
    </div>
  );
}
