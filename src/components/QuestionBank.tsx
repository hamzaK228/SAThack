import { Reveal } from "./Reveal";

const domains = [
  { icon: "🧮", name: "Algebra", count: 615, tone: "lime" },
  { icon: "📈", name: "Advanced Math", count: 537, tone: "cyan" },
  { icon: "🧩", name: "Problem-Solving & Data", count: 421, tone: "violet" },
  { icon: "📐", name: "Geometry & Trigonometry", count: 348, tone: "pink" },
  { icon: "🔍", name: "Information & Ideas", count: 555, tone: "lime" },
  { icon: "✍️", name: "Craft & Structure", count: 471, tone: "cyan" },
  { icon: "💬", name: "Expression of Ideas", count: 398, tone: "violet" },
  { icon: "📝", name: "Standard English Conventions", count: 421, tone: "pink" },
];

export default function QuestionBank() {
  return (
    <section className="section" id="bank">
      <div className="wrap">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Question bank</p>
            <h2>
              Every question, <span className="grad">organized for you</span>
            </h2>
            <p className="section-sub">
              3,766 available College Board questions, sorted into the 8 SAT domains — so you practice
              exactly what&apos;s costing you points.
            </p>
          </Reveal>
        </div>

        <div className="bank-grid">
          {domains.map((d, i) => (
            <Reveal key={d.name} delay={i * 0.05}>
              <div className={`bank-card ${d.tone}`}>
                <span className="bank-icon" aria-hidden="true">
                  {d.icon}
                </span>
                <span className="bank-name">{d.name}</span>
                <span className="bank-count">{d.count} questions</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
