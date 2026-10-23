export function availableModels(): string[] {
  return [...new Set((process.env.SAT_AI_ALLOWED_MODELS || process.env.SAT_AI_MODEL || "deepseek-flash")
    .split(",").map(model => model.trim()).filter(Boolean))];
}
