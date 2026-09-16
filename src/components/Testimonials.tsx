import { Reveal } from "./Reveal";

const quotes = [
  {
    text: "I raised my score from 1300 to 1550 in ten weeks. The plan made every session feel focused.",
    before: "1300",
    after: "1550",
    name: "Parsa",
    initials: "P",
  },
  {
    text: "The cleanest SAT interface I've used. Analytics showed me exactly where to focus each week.",
    before: "1430",
    after: "1550",
    name: "Miu",
    initials: "M",
  },
  {
    text: "Adaptive practice zeroed in on what I kept missing. Mock scores started jumping every week.",
    before: "1200",
    after: "1520",
    name: "Shikhar",
    initials: "S",
  },
];

export default function Testimonials() {
  return (
    <section className="section" id="testimonials">
      <div className="wrap">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Results</p>
            <h2>
              Real students, <span className="grad">real score jumps</span>
            </h2>
          </Reveal>
        </div>
        <div className="quote-grid">
          {quotes.map((q, i) => (
            <Reveal key={q.text} delay={i * 0.1}>
              <figure className="quote">
                <div className="quote-stars" aria-label="5 out of 5 stars">
                  {"★★★★★".split("").map((s, j) => (
                    <span key={j}>{s}</span>
                  ))}
                </div>
                <blockquote>“{q.text}”</blockquote>
                <figcaption>
                  <div className="quote-person">
                    <span className="quote-avatar">{q.initials}</span>
                    <span>
                      <span className="quote-before">{q.before}</span> →{" "}
                      <span className="quote-after">{q.after}</span>
                    </span>
                    <span className="quote-name">— {q.name}</span>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}


