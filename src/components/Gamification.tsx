import { Reveal } from "./Reveal";

const cards = [
  {
    icon: "⚡",
    title: "Level up as you study",
    text: "Earn XP for every question, hit mastery thresholds, and watch your streak grow. Practice that actually pulls you back.",
    badge: "Level 12 · 340 XP",
    tone: "lime",
  },
  {
    icon: "🏆",
    title: "Achievements that mean something",
    text: "Unlock badges for closing a weak domain, hitting a score milestone, or keeping a 30-day streak. Celebrate real progress.",
    badge: "GOATED! 90% Algebra mastery",
    tone: "violet",
  },
  {
    icon: "🛰️",
    title: "Compete on the leaderboard",
    text: "Weekly resets, accuracy and difficulty ratings, and a friends list. See exactly where you stand — and grind to the top.",
    badge: "Top 1% this week",
    tone: "cyan",
  },
];

export default function Gamification() {
  return (
    <section className="section" id="game">
      <div className="wrap">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Play to win</p>
            <h2>
              Less like a classroom. <span className="grad">More like a game.</span>
            </h2>
            <p className="section-sub">
              Prep doesn&apos;t have to be a grind. SAThack turns every session into progress you can
              see, celebrate, and compete over.
            </p>
          </Reveal>
        </div>

        <div className="game-grid">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.1}>
              <div className="game-card">
                <div className="game-icon" aria-hidden="true">
                  {c.icon}
                </div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
                <span className={`game-badge ${c.tone}`}>{c.badge}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
