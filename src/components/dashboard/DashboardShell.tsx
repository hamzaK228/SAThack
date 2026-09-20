"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, PanelLeftOpen } from "lucide-react";
import Sidebar from "./Sidebar";

export default function DashboardShell({ email, children, rail }: { email: string; children: ReactNode; rail: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [reopened, setReopened] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const focusedExam = /^\/dashboard\/test\/[^/]+$/.test(pathname);
  function back() {
    if (window.history.length > 1) router.back();
    else router.push(pathname === "/dashboard" ? "/" : "/dashboard");
  }
  if (focusedExam) return <main className="exam-focus-main">{children}</main>;

  return (
    <div className={`dash-layout${collapsed ? " sidebar-collapsed" : ""}`}>
      {!collapsed && <Sidebar email={email} initialOpen={reopened} onClose={() => setCollapsed(true)} />}
      <main className="dash-main">
        <div className="dash-toolbar">
          {collapsed && <button className="dash-tool" onClick={() => { setReopened(true); setCollapsed(false); }} title="Open sidebar" aria-label="Open sidebar"><PanelLeftOpen size={20} /></button>}
          <button className="dash-tool" onClick={back} title="Back" aria-label="Back"><ArrowLeft size={20} /><span>Back</span></button>
        </div>
        {children}
      </main>
      {rail}
    </div>
  );
}
