import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import GuestDuel from "@/components/GuestDuel";
import type { GuestDuelQuestion } from "@/components/GuestDuel";
import fallbackQuestions from "@/data/guest-duel-questions.json";

export const dynamic = "force-dynamic";

export default async function GuestDuelPage() {
  const supabase = await createClient();
  const [math, reading, user] = await Promise.all([
    supabase.rpc("guest_duel_questions", { chosen_subject: "math" }),
    supabase.rpc("guest_duel_questions", { chosen_subject: "reading_writing" }),
    getCurrentUser(),
  ]);
  const mathQuestions = math.data?.length ? math.data : fallbackQuestions.math;
  const readingQuestions = reading.data?.length ? reading.data : fallbackQuestions.reading_writing;

  return (
    <main className="trial-page">
      <nav className="trial-nav">
        <Link className="brand" href="/"><span className="brand-prompt">&gt;</span><span>SAThack</span></Link>
        <span>Guest duel · one free match</span>
        {user ? (
          <Link className="btn btn-primary" href="/dashboard">Dashboard</Link>
        ) : (
          <Link className="btn btn-primary" href="/auth">Sign in</Link>
        )}
      </nav>
      <GuestDuel
        questions={{
          math: mathQuestions as GuestDuelQuestion[],
          reading_writing: readingQuestions as GuestDuelQuestion[],
        }}
      />
    </main>
  );
}
