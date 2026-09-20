function toNumber(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  if (Number.isFinite(number)) return number;
  const fraction = text.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  return null;
}

export function isCorrectAnswer(selected: string, answer: string): boolean {
  if (!selected.trim() || !answer.trim()) return false;
  return answer.split(/,\s+/).some((accepted) => {
    if (selected.trim().toLowerCase() === accepted.trim().toLowerCase()) return true;
    const actual = toNumber(selected);
    const expected = toNumber(accepted);
    return actual !== null && expected !== null && Math.abs(actual - expected) < 1e-6;
  });
}
