import { getCurrentUser } from "@/lib/supabase/auth";
import AIChat from "@/components/dashboard/AIChat";
import { getTutorContext } from "@/lib/tutor-context";

export const dynamic = "force-dynamic";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { q } = await searchParams;

  // The starting chips are the student's own weak spot and today's step, so the
  // first thing they tap is already about their work, not a generic question.
  const context = await getTutorContext();
  const weakest = context?.weakSkills[0];
  const firstStep = context?.mission[0];
  const suggestions = [
    weakest ? `Explain ${weakest.skill} — I'm at ${weakest.accuracy}%` : null,
    firstStep ? `How should I approach "${firstStep.title}"?` : null,
    "Where should I focus this week, and why?",
    "How does the adaptive scoring work?",
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">AI Tutor</h1>
          <p className="dash-sub">
            Your personal SAT expert — grounded in your SAT books, your question bank, your weakest measured skills
            and today&apos;s plan.
          </p>
        </div>
      </div>
      <AIChat suggestions={suggestions} initialQuestion={q?.slice(0, 500)} />
    </div>
  );
}
