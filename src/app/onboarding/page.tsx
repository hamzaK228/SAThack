import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "@/components/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, target_score, current_score, test_date")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main id="main" className="auth-shell">
      <OnboardingForm
        initial={{
          fullName: profile?.full_name ?? null,
          targetScore: profile?.target_score ?? null,
          currentScore: profile?.current_score ?? null,
          testDate: profile?.test_date ?? null,
        }}
      />
    </main>
  );
}
