import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowLeft, Database, LayoutDashboard, MessageSquareText, ShieldCheck, Users } from "lucide-react";
import { getIsAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth?next=/admin");
  if (!(await getIsAdmin())) redirect("/dashboard");

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <Link href="/admin" className="admin-brand"><span>&gt;</span><strong>SAThack</strong><small>ADMIN</small></Link>
        <nav aria-label="Admin sections">
          <a href="#overview"><LayoutDashboard size={17} /> Overview</a>
          <a href="#content"><Database size={17} /> Content</a>
          <a href="#community"><MessageSquareText size={17} /> Community</a>
          <a href="#users"><Users size={17} /> Users</a>
          <a href="#logs"><Activity size={17} /> Logs</a>
        </nav>
        <div className="admin-nav-foot">
          <span><ShieldCheck size={14} /> Admin session</span>
          <small>{user.email}</small>
          <Link href="/dashboard"><ArrowLeft size={15} /> Student dashboard</Link>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
