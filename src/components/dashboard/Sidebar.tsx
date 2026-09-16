"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const nav = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/dashboard/plan", label: "Study Plan", icon: "▤" },
  { href: "/dashboard/tutor", label: "AI Tutor", icon: "🤖" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "◔" },
  { href: "/dashboard/question-bank", label: "Question Bank", icon: "▦" },
  { href: "/dashboard/review", label: "Review Queue", icon: "↻" },
  { href: "/dashboard/saved", label: "Saved", icon: "★" },
  { href: "/dashboard/vocab", label: "Vocab", icon: "Aa" },
  { href: "/dashboard/leaderboard", label: "Progress", icon: "🏆" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

const quick = [
  { href: "/dashboard/session", label: "Study Session", icon: "⚡" },
  { href: "/dashboard/test", label: "Practice Test", icon: "▣" },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      <button
        className="dash-nav-toggle"
        aria-label="Toggle menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <aside className={`dash-sidebar${open ? " open" : ""}`}>
        <Link className="brand dash-brand" href="/dashboard" onClick={() => setOpen(false)}>
          <span className="brand-prompt">&gt;</span>
          <span>SAThack</span>
        </Link>

        <nav className="dash-nav" aria-label="Dashboard">
          <span className="dash-nav-label">Menu</span>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`dash-nav-link${isActive(item.href) ? " active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <span className="dash-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <nav className="dash-nav" aria-label="Quick actions">
          <span className="dash-nav-label">Quick start</span>
          {quick.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="dash-nav-link dash-nav-quick"
              onClick={() => setOpen(false)}
            >
              <span className="dash-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="dash-sidebar-foot">
          <Link className="dash-nav-link" href="/" onClick={() => setOpen(false)}>
            <span className="dash-nav-icon" aria-hidden="true">
              ↖
            </span>
            Back to site
          </Link>
          <div className="dash-user" title={email}>
            <span className="dash-user-dot" aria-hidden="true"></span>
            <span className="dash-user-email">{email}</span>
          </div>
        </div>
      </aside>
    </>
  );
}
