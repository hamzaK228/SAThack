import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AdaptiveLesson, { type LessonProfile } from "@/components/dashboard/AdaptiveLesson";
import { knowledgeForTopic } from "@/lib/ai/knowledge";
import { lessonForDomain } from "@/lib/lesson-content";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Attempt = {
  question_id: string | null;
  is_correct: boolean | null;
  created_at: string;
};

function accuracy(rows: Attempt[]): number | null {
  if (!rows.length) return null;
  return Math.round((rows.filter((row) => row.is_correct).length / rows.length) * 100);
}

export default async function LessonPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; skill?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await searchParams;
  const lesson = lessonForDomain(params.domain);
  const supabase = await createClient();
  const { data } = await supabase
    .from("practice_attempts")
    .select("question_id,is_correct,created_at")
    .eq("user_id", user.id)
    .eq("domain", lesson.domain)
    .order("created_at", { ascending: false })
    .limit(200);
  const attempts = (data ?? []) as Attempt[];

  const questionIds = [...new Set(attempts.map((row) => row.question_id).filter(Boolean))] as string[];
  const skillByQuestion = new Map<string, string>();
  if (questionIds.length) {
    const { data: questions } = await supabase
      .from("questions")
      .select("id,skill")
      .in("id", questionIds.slice(0, 200));
    for (const question of questions ?? []) {
      if (question.skill?.trim()) skillByQuestion.set(question.id, question.skill.trim());
    }
  }

  const skillStats = new Map<string, { correct: number; total: number }>();
  for (const attempt of attempts) {
    const attemptSkill = attempt.question_id ? skillByQuestion.get(attempt.question_id) : undefined;
    if (!attemptSkill) continue;
    const stat = skillStats.get(attemptSkill) ?? { correct: 0, total: 0 };
    stat.total += 1;
    if (attempt.is_correct) stat.correct += 1;
    skillStats.set(attemptSkill, stat);
  }

  const weakestSkill = [...skillStats.entries()]
    .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))[0]?.[0];
  const requestedSkill = params.skill?.trim().slice(0, 120);
  const focusSkill = requestedSkill || weakestSkill || lesson.skills[0];
  const overallAccuracy = accuracy(attempts);
  const recentAccuracy = accuracy(attempts.slice(0, 10));
  const earlierAccuracy = accuracy(attempts.slice(10, 20));
  const trend = recentAccuracy !== null && earlierAccuracy !== null ? recentAccuracy - earlierAccuracy : null;

  const band: LessonProfile["band"] = attempts.length < 5
    ? "starting"
    : (overallAccuracy ?? 0) < 60
      ? "repair"
      : (overallAccuracy ?? 0) < 80
        ? "building"
        : "mastery";
  const difficulty: LessonProfile["difficulty"] = band === "mastery" ? "hard" : band === "building" ? "medium" : "easy";
  const recommendedMinutes = band === "repair" ? 30 : band === "starting" ? 25 : band === "building" ? 20 : 15;
  const profile: LessonProfile = {
    attempts: attempts.length,
    accuracy: overallAccuracy,
    band,
    difficulty,
    focusSkill,
    trend,
    recommendedMinutes,
  };

  const practiceParams = new URLSearchParams({ domain: lesson.domain, difficulty });
  if (focusSkill) practiceParams.set("skill", focusSkill);
  const practiceHref = `/dashboard/session?${practiceParams.toString()}`;

  const sourceNotes = knowledgeForTopic([lesson.domain], [focusSkill], 6)
    .filter((chunk) => chunk.text.length > 90 && !/telegram|isbn|copyright|table of contents/i.test(chunk.text))
    .slice(0, 3)
    .map((chunk) => ({
      book: chunk.book,
      page: chunk.page,
      chunk: chunk.chunk,
      text: chunk.text.length > 620 ? `${chunk.text.slice(0, 617)}…` : chunk.text,
    }));

  return (
    <div className="dash-page lesson-page">
      <Link className="lesson-back" href="/dashboard/plan"><ArrowLeft size={15} /> Back to study plan</Link>
      <AdaptiveLesson
        key={`${lesson.domain}-${focusSkill}`}
        lesson={lesson}
        profile={profile}
        sourceNotes={sourceNotes}
        practiceHref={practiceHref}
      />
    </div>
  );
}
