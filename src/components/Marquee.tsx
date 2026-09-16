const items = [
  { name: "Parsa", before: "1300", after: "1570" },
  { name: "Nguyen", before: "1260", after: "1540" },
  { name: "Miu", before: "1300", after: "1580" },
  { name: "John", before: "1470", after: "1550" },
  { name: "Diego", before: "920", after: "1380" },
  { name: "Shikhar", before: "1000", after: "1520" },
  { name: "Trung", before: "1400", after: "1500" },
  { name: "Tobe", before: "1280", after: "1450" },
];

export default function Marquee() {
  const row = [...items, ...items];
  return (
    <div className="marquee" aria-label="Student score improvements">
      <div className="marquee-track">
        {row.map((it, i) => (
          <div className="marquee-item" key={`${it.name}-${i}`}>
            <strong>{it.name}</strong>
            <span>
              {it.before} → {it.after}
            </span>
            <span className="lift">+{Number(it.after) - Number(it.before)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
