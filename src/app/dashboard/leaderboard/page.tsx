import { createClient } from "@/lib/supabase/server";
import { CountUp, Reveal } from "@/components/Reveal";
import { badgesFor, levelFor, streakFrom, xpFor, type ProgressStats } from "@/lib/gamification";

export const dynamic = "force-dynamic";

type LeaderRow = {
  user_id: string;
  display_name: string;
  xp: number;
  questions: number;
  accuracy: number;
  streak: number;
  is_me: boolean;
};

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // --- my progress (derived, never stored) --------------------------------
  const { count: attempts } = await supabase
    .from("practice_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  const { count: correct } = await supabase
    .from("practice_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_correct", true);
  const { count: tests } = await supabase
    .from("test_sessions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "completed");
  const { count: vocabReviews } = await supabase
    .from("vocab_progress")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gt("times_seen", 0);

  const stamps: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("practice_attempts")
      .select("created_at")
      .eq("user_id", user.id)
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as { created_at: string }[];
    stamps.push(...rows.map((r) => r.created_at));
    if (rows.length < PAGE) break;
  }

  const { streak, bestStreak, activeDays } = streakFrom(stamps);
  const stats: ProgressStats = {
    attempts: attempts ?? 0,
    correct: correct ?? 0,
    tests: tests ?? 0,
    vocabReviews: vocabReviews ?? 0,
    activeDays,
    streak,
    bestStreak,
  };

  const xp = xpFor(stats);
  const level = levelFor(xp);
  const badges = badgesFor(stats);
  const accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
  const pct = Math.round((level.into / level.span) * 100);

  // --- ranking (SECURITY DEFINER RPC; see the migration) -------------------
  const { data: board, error: boardError } = await supabase.rpc("leaderboard", { limit_count: 25 });
  const rows = (board ?? []) as LeaderRow[];
  const myRank = rows.findIndex((r) => r.is_me) + 1;
  const earned = badges.filter((b) => b.earned);
  const nextBadge = badges.find((b) => !b.earned);
  const MEDALS = ["🥇", "🥈", "🥉"];

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Progress</h1>
          <p className="dash-sub">XP, levels and badges — earned from real work, never bought.</p>
        </div>
      </div>

      <Reveal>
        <div className="dash-card level-card">
          <div className="level-head">
            <span className="level-badge" aria-hidden="true">
              {level.level}
            </span>
            <div className="level-text">
              <p className="level-title">{level.title}</p>
              <p className="dash-sub">
                Level {level.level} · {xp.toLocaleString()} XP
              </p>
            </div>
            <span className="level-next">
              <CountUp to={level.toNext} /> XP to {level.nextTitle}
            </span>
          </div>
          <div
            className="checklist-bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="level-foot">
            <span>
              {pct}% through {level.title} → {level.nextTitle}
            </span>
            <span className="level-xp-total">{xp.toLocaleString()} XP total</span>
          </div>
        </div>
      </Reveal>

      <div className="dash-stat-grid">
        <Reveal>
          <div className="dash-stat-card">
            <span className="dash-stat-label">🔥 Streak</span>
            <span className="dash-stat-value accent">
              <CountUp to={streak} suffix="d" />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Best streak</span>
            <span className="dash-stat-value">
              <CountUp to={bestStreak} suffix="d" />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Accuracy</span>
            <span className="dash-stat-value">
              <CountUp to={accuracy} suffix="%" />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Active days</span>
            <span className="dash-stat-value">
              <CountUp to={activeDays} />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Questions answered</span>
            <span className="dash-stat-value">
              <CountUp to={stats.attempts} />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.3}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Practice tests</span>
            <span className="dash-stat-value">
              <CountUp to={stats.tests} />
            </span>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">
            🏅 Badges ({earned.length}/{badges.length})
          </h2>
          {nextBadge && (
            <div className="badge-next">
              <span className="badge-next-icon" aria-hidden="true">
                {nextBadge.icon}
              </span>
              <div>
                <span className="badge-next-label">Next up</span>
                <p className="badge-next-text">
                  <strong>{nextBadge.name}</strong> — {nextBadge.hint}
                </p>
              </div>
            </div>
          )}
          <div className="badge-grid">
            {badges.map((b) => (
              <div className={`badge${b.earned ? " earned" : ""}`} key={b.id}>
                <span className="badge-icon" aria-hidden="true">
                  {b.earned ? b.icon : "🔒"}
                </span>
                <span className="badge-name">{b.name}</span>
                <span className="badge-hint">{b.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">🏆 Leaderboard</h2>
          {boardError || rows.length === 0 ? (
            <p className="dash-sub">
              Cross-user ranking needs the <code>leaderboard()</code> function — run{" "}
              <code>migrations/2026-09-15-polish.sql</code> in the Supabase SQL editor to switch it on.
              Everything above is already live.
            </p>
          ) : (
            <>
              {myRank > 0 && (
                <p className="dash-sub" style={{ marginBottom: "0.75rem" }}>
                  You&apos;re <strong>#{myRank}</strong> of {rows.length}.
                </p>
              )}
              <div className="board-wrap">
                <table className="board">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Student</th>
                      <th scope="col">XP</th>
                      <th scope="col">Questions</th>
                      <th scope="col">Accuracy</th>
                      <th scope="col">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.user_id} className={r.is_me ? "me" : ""}>
                        <td className="board-rank">{MEDALS[i] ?? i + 1}</td>
                        <td>
                          {r.display_name}
                          {r.is_me ? " (you)" : ""}
                        </td>
                        <td>{Number(r.xp).toLocaleString()}</td>
                        <td>{r.questions}</td>
                        <td>{r.accuracy}%</td>
                        <td>{r.streak}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Reveal>
    </div>
  );
}
