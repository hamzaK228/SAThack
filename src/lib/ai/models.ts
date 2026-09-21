export function availableModels(): string[] {
  return [...new Set((process.env.SAT_AI_ALLOWED_MODELS || process.env.SAT_AI_MODEL || "glm-5.3-flash")
    .split(",").map(model => model.trim()).filter(Boolean))];
}
