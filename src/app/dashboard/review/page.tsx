import ReviewQueueList from "@/components/dashboard/ReviewQueueList";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Review queue</h1>
          <p className="dash-sub">Questions you got wrong and haven&apos;t mastered yet.</p>
        </div>
      </div>

      <ReviewQueueList />
    </div>
  );
}
