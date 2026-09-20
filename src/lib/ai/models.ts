export function availableModels(): string[] {
  return [...new Set((process.env.SAT_AI_ALLOWED_MODELS || process.env.SAT_AI_MODEL || "gpt-4o-mini")
    .split(",").map(model => model.trim()).filter(Boolean))];
}
