import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";
import RightRail from "@/components/dashboard/RightRail";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/auth");

  return (
    <DashboardShell email={user.email ?? ""} rail={<Suspense fallback={<aside className="dash-rail" aria-busy="true" />}>
        <RightRail />
      </Suspense>}>
      {children}
    </DashboardShell>
  );
}
