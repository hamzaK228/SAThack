import { availableModels } from "./models";
/** How long a single model call may take before we fall back to the corpus. */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * OpenAI-compatible chat completion helper. Returns "" when no API key is set.
 *
 * The call is capped by an abort timeout (override with `SAT_AI_TIMEOUT_MS`):
 * it runs inside a server render — the study plan, the tutor, the lessons — and
 * a provider that stalls must degrade to the offline corpus instead of hanging
 * the page.
 */
export async function chatCompletion(
  prompt: string,
  opts: { json?: boolean; temperature?: number; model?: string | null } = {}
): Promise<string> {
  const key = process.env.SAT_AI_API_KEY;
  if (!key) return "";
  const base = (process.env.SAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const allowed = availableModels();
  const model = opts.model && allowed.includes(opts.model) ? opts.model : allowed[0];

  const configured = Number(process.env.SAT_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.4,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("[ai] Provider request failed", { status: res.status, model });
      return "";
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    console.error("[ai] Request failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return "";
  } finally {
    clearTimeout(timer);
  }
}
