import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import SettingsForm from "@/components/dashboard/SettingsForm";
import AIModelForm from "@/components/dashboard/AIModelForm";
import { availableModels } from "@/lib/ai/models";
import AccountControls from "@/components/dashboard/AccountControls";
import ChangePassword from "@/components/dashboard/ChangePassword";
import CommunityProfileForm from "@/components/dashboard/CommunityProfileForm";
import ShareProgress, { type ShareLink } from "@/components/dashboard/ShareProgress";
import DigestToggle from "@/components/dashboard/DigestToggle";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  // maybeSingle, not single: an account created through Google/GitHub has no
  // profile row until something writes one, and single() would raise on that
  // empty result instead of falling through to the defaults below.
  const { data: profile } = await supabase
    .from("profiles")
    .select("target_score, test_date, current_score, ai_model, username, digest_opt_in")
    .eq("id", user.id)
    .maybeSingle();

  const { data: shareRows } = await supabase
    .from("share_tokens")
    .select("id, token, expires_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  const shareLinks: ShareLink[] = (shareRows ?? []).map((row) => ({
    id: row.id as string,
    url: `${siteUrl.replace(/\/$/, "")}/share/${row.token}`,
    expiresAt: row.expires_at as string,
  }));

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
      <CommunityProfileForm current={profile?.username ?? ""} />
      <ChangePassword />
      <AIModelForm current={profile?.ai_model ?? null} models={availableModels()} />
      <ShareProgress links={shareLinks} />
      <DigestToggle initial={Boolean(profile?.digest_opt_in)} />
      <AccountControls />
    </div>
  );
}
