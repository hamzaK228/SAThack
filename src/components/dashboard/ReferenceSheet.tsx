import MathText from "@/components/MathText";

const formulas = [
  { k: "Circle", v: "$A=\\pi r^2$" },
  { k: "Circle", v: "$C=2\\pi r$" },
  { k: "Rectangle", v: "$A=lw$" },
  { k: "Triangle", v: "$A=\\frac{1}{2}bh$" },
  { k: "Box volume", v: "$V=lwh$" },
  { k: "Cylinder", v: "$V=\\pi r^2 h$" },
  { k: "Sphere", v: "$V=\\frac{4}{3}\\pi r^3$" },
  { k: "Cone", v: "$V=\\frac{1}{3}\\pi r^2 h$" },
  { k: "Pyramid", v: "$V=\\frac{1}{3}lwh$" },
  { k: "Pythagorean", v: "$a^2+b^2=c^2$" },
  { k: "Circle", v: "$360°=2\\pi\\text{ rad}$" },
  { k: "30-60-90", v: "$x,\\ x\\sqrt{3},\\ 2x$" },
  { k: "45-45-90", v: "$x,\\ x,\\ x\\sqrt{2}$" },
];

export default function ReferenceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="ref-sheet">
      <div className="ref-sheet-head">
        <span className="ref-sheet-title">Reference sheet</span>
        <button className="ref-sheet-close" onClick={onClose} aria-label="Close reference sheet">
          ×
        </button>
      </div>
      <div className="ref-sheet-grid">
        {formulas.map((f, i) => (
          <div className="ref-item" key={i}>
            <span className="ref-key">{f.k}</span>
            <span className="ref-val">
              <MathText text={f.v} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

