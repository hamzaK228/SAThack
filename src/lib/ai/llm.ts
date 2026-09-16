/** OpenAI-compatible chat completion helper. Returns "" when no API key is set. */
export async function chatCompletion(
  prompt: string,
  opts: { json?: boolean; temperature?: number; model?: string | null } = {}
): Promise<string> {
  const key = process.env.SAT_AI_API_KEY;
  if (!key) return "";
  const base = (process.env.SAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = opts.model || process.env.SAT_AI_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.4,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}
