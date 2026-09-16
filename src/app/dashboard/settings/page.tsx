import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/dashboard/SettingsForm";
import AIModelForm from "@/components/dashboard/AIModelForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("target_score, test_date, current_score, ai_model")
    .eq("id", user.id)
    .single();

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Settings</h1>
          <p className="dash-sub">Personalize your prep.</p>
        </div>
      </div>
      <SettingsForm
        targetScore={profile?.target_score ?? 1400}
        currentScore={profile?.current_score ?? null}
        testDate={profile?.test_date ?? null}
      />
      <div style={{ height: "1.25rem" }} />
      <AIModelForm current={profile?.ai_model ?? null} />
    </div>
  );
}
