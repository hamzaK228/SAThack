import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";
import RightRail from "@/components/dashboard/RightRail";
import TutorWidget from "@/components/dashboard/TutorWidget";
import { Suspense } from "react";
import { getIsAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/auth");
  const isAdmin = await getIsAdmin();

  return (
    <DashboardShell email={user.email ?? ""} isAdmin={isAdmin} rail={<Suspense fallback={<aside className="dash-rail" aria-busy="true" />}>
        <RightRail />
      </Suspense>}>
      {children}
      {/* The mentor, as a support widget: the corner button opens a compact chat
          instead of throwing the student onto another page mid-practice. */}
      <TutorWidget />
    </DashboardShell>
  );
}
