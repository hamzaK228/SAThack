import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ReviewQueueList from "@/components/dashboard/ReviewQueueList";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export default async function TestReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string }>;
}) {
  const { test } = await searchParams;

  // With ?test=<session> this reviews exactly that sitting. Attempts carry no
  // session id, so the scope is the session's own start..finish window — only
  // one test can be open at a time, so nothing else falls inside it.
  let windowRange: { from: string; to: string } | undefined;
  let heading: string | null = null;
  if (test) {
    const supabase = await createClient();
    const user = await getCurrentUser();
    if (user) {
      const { data } = await supabase
        .from("test_sessions")
        .select("started_at, completed_at, total_score")
        .eq("id", test)
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.started_at && data.completed_at) {
        windowRange = { from: data.started_at, to: data.completed_at };
        heading = `Mistakes from your ${new Date(data.completed_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })} test · scored ${data.total_score ?? "—"}`;
      }
    }
  }

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <p className="eyebrow">Practice tests</p>
          <h1 className="dash-title">{windowRange ? "Test mistakes" : "Test review"}</h1>
          <p className="dash-sub">
            {heading ?? "Mistakes from full digital practice tests, separate from your regular drills."}
          </p>
        </div>
        <Link className="btn btn-ghost" href={windowRange ? "/dashboard/test/review" : "/dashboard/test"}>
          <ArrowLeft size={17} /> {windowRange ? "All test mistakes" : "Practice tests"}
        </Link>
      </div>
      <ReviewQueueList
        mode="test"
        window={windowRange}
        emptyMessage={
          windowRange
            ? "No unresolved mistakes on that test — clean run."
            : "No unresolved practice-test mistakes yet."
        }
      />
    </div>
  );
}
