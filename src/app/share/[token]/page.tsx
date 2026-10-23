import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { levelFor } from "@/lib/gamification";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shared progress | SAThack",
  robots: { index: false, follow: false },
};

type SharedTest = {
  total: number | null;
  rw: number | null;
  math: number | null;
  completedAt: string;
};

type SharedPayload = {
  username: string | null;
  xp: number;
  questions: number;
  accuracy: number;
  activeDays: number;
  tests: SharedTest[];
  expiresAt: string;
};

export default async function SharedProgressPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("shared_progress", { p_token: token });
  const payload = (data ?? null) as SharedPayload | null;
  if (!payload) notFound();

  const xp = Number(payload.xp) || 0;
  const level = levelFor(xp);
  const name = payload.username?.trim() || "A SAThack student";
  const tests = Array.isArray(payload.tests) ? payload.tests : [];

  return (
    <main className="share-shell">
      <section className="share-card" aria-label={`Progress shared by ${name}`}>
        <header className="share-head">
          <span className="share-eyebrow">Shared progress</span>
          <h1>{name}</h1>
          <p>
            Read-only snapshot · expires {payload.expiresAt.slice(0, 10)} · no answers or email are included.
          </p>
        </header>

        <div className="share-level">
          <span className="share-level-badge">{level.level}</span>
          <div>
            <strong>{level.title}</strong>
            <span>{xp.toLocaleString()} XP · 🔥 {payload.activeDays} active days</span>
          </div>
        </div>

        <div className="share-stat-grid">
          <div><span>Questions practised</span><strong>{Number(payload.questions).toLocaleString()}</strong></div>
          <div><span>Accuracy</span><strong>{payload.accuracy}%</strong></div>
          <div><span>Practice tests</span><strong>{tests.length}</strong></div>
        </div>

        <h2 className="share-section-title">Recent practice tests</h2>
        {tests.length === 0 ? (
          <p className="share-empty">No completed practice tests yet.</p>
        ) : (
          <ul className="share-tests">
            {tests.map((test) => (
              <li key={`${test.completedAt}-${test.total}`}>
                <span>{new Date(test.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span>RW {test.rw ?? "—"} · Math {test.math ?? "—"}</span>
                <strong>{test.total ?? "—"}</strong>
              </li>
            ))}
          </ul>
        )}

        <footer className="share-foot">
          <span>This link was shared by the student and can be revoked at any time.</span>
          <Link className="btn btn-primary" href="/">SAThack</Link>
        </footer>
      </section>
    </main>
  );
}
