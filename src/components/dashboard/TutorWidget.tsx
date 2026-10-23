"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Sparkles, X, Maximize2 } from "lucide-react";
import AIChat from "@/components/dashboard/AIChat";

/**
 * The tutor as a support widget: a corner button that opens a compact chat
 * instead of navigating away. A student stuck mid-question should not lose their
 * place to ask about it — and the full page is still one tap away.
 *
 * It renders into <body> on purpose. The page content sits inside reveal
 * wrappers that animate with transforms, and a transformed ancestor makes
 * position:fixed behave like position:absolute — which is why the button used to
 * scroll away with the page instead of staying put.
 */
export default function TutorWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- the portal needs a real DOM
  useEffect(() => setMounted(true), []);

  // Escape closes the panel, like every other overlay on the site.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <>
      {open && (
        <section className="tutor-widget" role="dialog" aria-label="AI tutor chat">
          <header className="tutor-widget-head">
            <span>
              <Sparkles size={15} aria-hidden="true" /> AI Tutor
            </span>
            <span className="tutor-widget-tools">
              <Link href="/dashboard/tutor" title="Open the full tutor page" aria-label="Open the full tutor page">
                <Maximize2 size={15} />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close the tutor">
                <X size={15} />
              </button>
            </span>
          </header>
          <div className="tutor-widget-body">
            <AIChat />
          </div>
        </section>
      )}

      <button
        className="tutor-fab"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close the AI tutor" : "Ask the AI tutor"}
        title={open ? "Close the AI tutor" : "Ask the AI tutor"}
      >
        {open ? <X size={21} aria-hidden="true" /> : <Sparkles size={21} aria-hidden="true" />}
      </button>
    </>,
    document.body
  );
}
