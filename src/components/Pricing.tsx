import Link from "next/link";
import { Reveal } from "./Reveal";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/ forever",
    features: [
      "Speed drills with three pace modes",
      "Review queue for every missed question",
      "Core analytics — accuracy, streak, activity",
      "Formula sheet reference",
    ],
    cta: "Start for free",
    featured: false,
  },
  {
    name: "Pro",
    price: "$20",
    period: "/ month",
    features: [
      "Everything in Free",
      "3,767 real College Board questions — every domain, every skill",
      "AI study plan built to your test date",
      "AI explanations for every question",
      "Advanced score analysis — every topic, every mock",
    ],
    cta: "Upgrade to Pro",
    featured: true,
  },
  {
    name: "Max",
    price: "$35",
    period: "/ month",
    features: [
      "Everything in Pro",
      "Unlimited AI tutor messages",
      "Priority support",
      "Early access to new features",
    ],
    cta: "Go Max",
    featured: false,
  },
];

export default function Pricing() {
  return (
    <section className="section" id="pricing">
      <div className="wrap">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Pricing</p>
            <h2>
              Start free. <span className="grad">Go Pro when you&apos;re ready.</span>
            </h2>
          </Reveal>
        </div>
        <div className="pricing-grid">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div className={`price-card${p.featured ? " featured" : ""}`}>
                {p.featured && <span className="price-tag">Most popular</span>}
                <h3>{p.name}</h3>
                <p className="price">
                  <span className="price-num">{p.price}</span>
                  {p.period}
                </p>
                <ul className="plain-list">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link
                  className={`btn ${p.featured ? "btn-primary" : "btn-ghost"} btn-block`}
                  href="/auth"
                >
                  {p.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

