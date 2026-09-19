"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { PanelLeftClose } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";

const mobileQuery="(max-width: 1100px)";
const subscribe=(callback:()=>void)=>{const query=window.matchMedia(mobileQuery);query.addEventListener("change",callback);return ()=>query.removeEventListener("change",callback);};

const nav = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/dashboard/plan", label: "Study Plan", icon: "▤" },
  { href: "/dashboard/tutor", label: "AI Tutor", icon: "🤖" },
  { href: "/dashboard/community", label: "Community", icon: "◎" },
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

export default function Sidebar({ email, onClose, initialOpen = false }: { email: string; onClose: () => void; initialOpen?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(initialOpen);
  const mobile=useSyncExternalStore(subscribe,()=>window.matchMedia(mobileQuery).matches,()=>false);
  const dialog=useDialog<HTMLElement>(open && mobile,()=>setOpen(false));

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

      {open && mobile && <div className="sidebar-scrim" onClick={()=>setOpen(false)} aria-hidden="true"/>}
      <aside ref={dialog} tabIndex={-1} role={open && mobile ? "dialog" : undefined} aria-modal={open && mobile ? true : undefined} aria-label="Navigation" className={`dash-sidebar${open ? " open" : ""}`}>
        <div className="dash-sidebar-head"><Link className="brand dash-brand" href="/dashboard" onClick={() => setOpen(false)}>
          <span className="brand-prompt">&gt;</span>
          <span>SAThack</span>
        </Link>
        <button className="dash-tool" onClick={onClose} title="Close sidebar" aria-label="Close sidebar"><PanelLeftClose size={20} /></button></div>

        <nav className="dash-nav" aria-label="Dashboard">
          <span className="dash-nav-label">Menu</span>
          {nav.map((item) => (
            <Link
              prefetch={false}
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
              prefetch={false}
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
