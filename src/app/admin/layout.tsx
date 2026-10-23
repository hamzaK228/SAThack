import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowLeft, BookOpenCheck, FileQuestion, Flag, Gauge, LayoutDashboard, Library, MessageSquareText, ShieldCheck, Users } from "lucide-react";
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
          <Link href="/admin"><LayoutDashboard size={17} /> Overview</Link>
          <Link href="/admin/questions"><FileQuestion size={17} /> Questions</Link>
          <Link href="/admin/vocab"><Library size={17} /> Vocabulary</Link>
          <Link href="/admin/tests"><BookOpenCheck size={17} /> Practice tests</Link>
          <Link href="/admin/users"><Users size={17} /> Users</Link>
          <Link href="/admin/reports"><Flag size={17} /> Question reports</Link>
          <Link href="/admin/calibration"><Gauge size={17} /> Calibration</Link>
          <a href="/admin#community"><MessageSquareText size={17} /> Community</a>
          <a href="/admin#logs"><Activity size={17} /> Logs</a>
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
