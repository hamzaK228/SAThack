import { Reveal } from "./Reveal";

const tasks = [
  {
    title: "RW grammar: complete vs. incomplete sentences",
    meta: "45 min · 15 questions · light timed",
    criteria: "Pass: 13/15, all misses logged",
  },
  {
    title: "Math: linear equations and systems",
    meta: "60 min · 18 questions · untimed then timed",
    criteria: "Pass: correct setup on 15/18",
  },
  {
    title: "Review yesterday's misses",
    meta: "20 min · error log",
    criteria: "Pass: every miss has a rule explanation",
  },
];

export default function StudyPlan() {
  return (
    <section className="section" id="plan">
      <div className="wrap">
        <div className="section-head">
          <Reveal>
            <p className="eyebrow">Study plan</p>
            <h2>
              A plan that <span className="grad">rebalances every week</span>
            </h2>
            <p className="section-sub">
              Built to your test date and weekly hours. Replanned the moment your data changes.
            </p>
          </Reveal>
        </div>

        <div className="plan-grid">
          <Reveal>
            <div className="plan-card">
              <div className="plan-head">
                <div>
                  <span className="plan-week">Week 1 of 8</span>
                  <h3>Diagnostic repair &amp; fast rule gains</h3>
                </div>
                <span className="plan-tag">sample</span>
              </div>
              <ul className="task-list">
                {tasks.map((task) => (
                  <li className="task" key={task.title}>
                    <div className="task-main">
                      <span className="task-title">{task.title}</span>
                      <span className="task-meta">{task.meta}</span>
                    </div>
                    <span className="task-criteria">{task.criteria}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="plan-side">
              <div className="panel">
                <h4>Section priority</h4>
                <div className="priority-row">
                  <span>Math</span>
                  <span className="priority-bar">
                    <span style={{ ["--w" as string]: "55%" }}></span>
                  </span>
                  <span className="priority-val">55%</span>
                </div>
                <div className="priority-row">
                  <span>Reading &amp; Writing</span>
                  <span className="priority-bar">
                    <span style={{ ["--w" as string]: "45%" }}></span>
                  </span>
                  <span className="priority-val">45%</span>
                </div>
              </div>

              <div className="panel">
                <h4>Score strategy</h4>
                <dl className="kv">
                  <div>
                    <dt>Target RW</dt>
                    <dd>700</dd>
                  </div>
                  <div>
                    <dt>Target Math</dt>
                    <dd>700</dd>
                  </div>
                  <div>
                    <dt>Forecast</dt>
                    <dd className="ok">1330–1420</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>medium</dd>
                  </div>
                </dl>
              </div>

              <div className="panel">
                <h4>Replan triggers</h4>
                <ul className="plain-list">
                  <li>Practice test completed</li>
                  <li>Two missed study days</li>
                  <li>Accuracy below 60% on a priority drill</li>
                  <li>Target score or test date changes</li>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

