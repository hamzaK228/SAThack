import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ReviewQueueList from "@/components/dashboard/ReviewQueueList";

export const dynamic = "force-dynamic";

export default function TestReviewPage() {
  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <p className="eyebrow">Practice tests</p>
          <h1 className="dash-title">Test review</h1>
          <p className="dash-sub">Mistakes from full digital practice tests, separate from your regular drills.</p>
        </div>
        <Link className="btn btn-ghost" href="/dashboard/test"><ArrowLeft size={17} /> Practice tests</Link>
      </div>
      <ReviewQueueList mode="full_test" emptyMessage="No unresolved practice-test mistakes yet." />
    </div>
  );
}
