"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const desktopLinks = [
  { href: "#how", label: "How it works" },
  { href: "#plan", label: "Study plan" },
  { href: "#predictor", label: "Score predictor" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const mobileLinks = [
  { href: "#how", label: "How it works" },
  { href: "#plan", label: "Study plan" },
  { href: "#predictor", label: "Score predictor" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export default function Header({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const header=useRef<HTMLElement>(null);
  const toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);toggle.current?.focus();}};
    const outside=(event:PointerEvent)=>{if(!header.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener("keydown",dismiss);document.addEventListener("pointerdown",outside);
    return ()=>{document.removeEventListener("keydown",dismiss);document.removeEventListener("pointerdown",outside);};
  },[open]);

  return (
    <header className="site-header" ref={header}>
      <div className="header-inner">
        <a className="brand" href="#top" aria-label="SAThack home">
          <span className="brand-prompt" aria-hidden="true">
            &gt;
          </span>
          <span className="brand-name">SAThack</span>
          <span className="brand-cursor" aria-hidden="true"></span>
        </a>

        <nav className="site-nav" aria-label="Primary">
          {desktopLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <a className="btn btn-ghost" href="#predictor">
            Score predictor
          </a>
          <Link className="btn btn-primary" href={signedIn ? "/dashboard" : "/auth"}>
            {signedIn ? "Dashboard" : "Start now"}
          </Link>
        </div>

        <button
          className="nav-toggle"
          ref={toggle}
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nav-toggle-bar"></span>
          <span className="nav-toggle-bar"></span>
          <span className="nav-toggle-bar"></span>
        </button>
      </div>

      <nav
        id="site-nav"
        className={`site-nav-mobile${open ? " open" : ""}`}
        aria-label="Mobile"
      >
        {mobileLinks.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
