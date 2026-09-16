function levelFor(count: number): string {
  if (count <= 0) return "gh-0";
  if (count < 3) return "gh-1";
  if (count < 6) return "gh-2";
  if (count < 11) return "gh-3";
  return "gh-4";
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export default function ContributionGraph({
  days,
  weeks = 26,
}: {
  days: Record<string, number>;
  weeks?: number;
}) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1) - start.getDay());

  const cells: { key: string; count: number; future: boolean }[] = [];
  let total = 0;
  let firstKey = "";
  let lastKey = "";
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    const count = days[key] ?? 0;
    total += count;
    if (count > 0) {
      if (!firstKey) firstKey = key;
      lastKey = key;
    }
    cells.push({ key, count, future: date > end });
  }

  const range =
    firstKey && lastKey
      ? `${new Date(firstKey + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(lastKey + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : `last ${weeks} weeks`;

  return (
    <div className="gh-wrap">
      <div className="gh-body">
        <div className="gh-days">
          {DAY_LABELS.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className="gh-grid" style={{ gridTemplateRows: `repeat(7, 12px)` }}>
          {cells.map((c) => (
            <span
              key={c.key}
              className={`gh-cell ${c.future ? "gh-future" : levelFor(c.count)}`}
              title={`${c.key}: ${c.count} question${c.count === 1 ? "" : "s"}`}
            />
          ))}
        </div>
      </div>
      <div className="gh-footer">
        <span className="gh-total">
          {total} question{total === 1 ? "" : "s"} · {range}
        </span>
        <span className="gh-legend">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`gh-cell gh-${l}`} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
