import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/dashboard/Sidebar";
import RightRail from "@/components/dashboard/RightRail";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <div className="dash-layout">
      <Sidebar email={user.email ?? ""} />
      <main className="dash-main">{children}</main>
      <RightRail userId={user.id} />
    </div>
  );
}
