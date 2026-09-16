import { createClient } from "@/lib/supabase/server";
import AIChat from "@/components/dashboard/AIChat";

export const dynamic = "force-dynamic";

export default async function TutorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">AI Tutor</h1>
          <p className="dash-sub">
            Your personal SAT expert — grounded in the official books and your question bank.
          </p>
        </div>
      </div>
      <AIChat />
    </div>
  );
}
