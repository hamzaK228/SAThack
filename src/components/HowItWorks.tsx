import { Reveal } from "./Reveal";

const steps = [
  {
    num: "01",
    title: "Diagnose",
    text: "A two-stage adaptive diagnostic mirrors the real Digital SAT and returns a score you can trust — then maps the exact domains losing you the most points.",
    chips: [
      { label: "RW module", time: "32 min" },
      { label: "Math module", time: "35 min" },
    ],
  },
  {
    num: "02",
    title: "Plan",
    text: "Set your target and test date. SAThack schedules practice, review, and full-length mocks week by week — and rebalances the moment your accuracy shifts.",
    chips: [
      { label: "This week", time: "Week 3 of 8" },
      { label: "Priority", time: "Algebra" },
    ],
  },
  {
    num: "03",
    title: "Practice",
    text: "Targeted drills, timed modules, and error-log review built around your weakest skills. Every miss is logged, explained, and resurfaced for retry.",
    chips: [
      { label: "Drill", time: "18 questions" },
      { label: "Review", time: "misses first" },
    ],
  },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how">
      <div className="wrap">
        <div className="section-head">
          <Reveal>
            <p className="eyebrow">The loop</p>
            <h2>
              From a real score to test day, <span className="grad">in three steps</span>
            </h2>
            <p className="section-sub">
              No generic topic lists. Every step is driven by where you actually stand.
            </p>
          </Reveal>
        </div>

        <div className="steps">
          {steps.map((s, i) => (
            <Reveal key={s.num} delay={i * 0.1}>
              <article className="step">
                <span className="step-num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {s.chips.map((chip) => (
                  <div className="step-chip" key={chip.label}>
                    <span className="chip-label">{chip.label}</span>
                    <span className="chip-time">{chip.time}</span>
                  </div>
                ))}
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

