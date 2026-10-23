import { availableModels } from "./models";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
/** How long a single model call may take before we fall back to the corpus. */
const DEFAULT_TIMEOUT_MS = 20_000;
/** Ceiling even if the environment asks for longer (the old 120 s env value
 *  could hold a dashboard/plan render past the serverless function limit). */
const MAX_TIMEOUT_MS = 20_000;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ProviderResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

function errorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN";
  const cause = error.cause as { code?: unknown } | undefined;
  return typeof cause?.code === "string" ? cause.code : error.name;
}

/**
 * Some hosts resolve the Z.AI endpoint to IPv6 first even when outbound IPv6
 * is unavailable. Undici then reports a generic `fetch failed`. Retry once
 * through Node's HTTPS client with IPv4 pinned before using the local planner.
 */
function postJsonIpv4(url: string, body: string, key: string, timeoutMs: number): Promise<ProviderResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = (target.protocol === "http:" ? httpRequest : httpsRequest)(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        family: 4,
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode ?? 500;
          resolve({ ok: status >= 200 && status < 300, status, text: async () => payload });
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("AI provider request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

/**
 * OpenAI-compatible chat completion helper. Returns "" when no API key is set
 * or the provider is unavailable — callers degrade to their local fallback.
 *
 * Takes a full message list so the tutor can hold a system prompt and a real
 * conversation; a single prompt goes in as one user message.
 *
 * The call is capped by an abort timeout (override with `SAT_AI_TIMEOUT_MS`):
 * it runs inside a server render — the study plan, the tutor, the lessons — and
 * a provider that stalls must degrade to the offline corpus instead of hanging
 * the page.
 */
export async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number; model?: string | null; maxTokens?: number } = {}
): Promise<string> {
  const key = process.env.SAT_AI_API_KEY;
  if (!key || messages.length === 0) return "";
  const base = (process.env.SAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const allowed = availableModels();
  const model = opts.model && allowed.includes(opts.model) ? opts.model : allowed[0];

  const configured = Number(process.env.SAT_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configured) && configured > 0
    ? Math.min(configured, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isBigModel = new URL(base).hostname.endsWith("bigmodel.cn");
    const body = JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2048,
      ...(model.toLowerCase().startsWith("glm-5.3")
        ? { thinking: { type: "enabled" }, reasoning_effort: "low" }
        : {}),
      // The DeepSeek models bill their reasoning tokens like any other, and a
      // tutoring answer does not need them: the same reply cost 15 tokens instead
      // of 55 on a trivial prompt. Guarded by model name so no other provider is
      // ever sent a field it does not know.
      ...(model.toLowerCase().includes("deepseek")
        ? { thinking: { type: "disabled" } }
        : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages,
    });
    let res: ProviderResponse;
    try {
      // Vercel's fetch can wait on an unreachable IPv6 route to BigModel until
      // our global abort fires. BigModel publishes an IPv4 endpoint, so use the
      // already-bounded Node transport first for that provider.
      res = isBigModel
        ? await postJsonIpv4(`${base}/chat/completions`, body, key, timeoutMs)
        : await fetch(`${base}/chat/completions`, {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body,
          });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (isBigModel) {
        res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body,
        });
      } else {
        res = await postJsonIpv4(`${base}/chat/completions`, body, key, timeoutMs);
      }
    }
    if (!res.ok) {
      console.warn("[ai] Provider request declined; using local fallback", { status: res.status, model });
      return "";
    }
    const json = JSON.parse(await res.text()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    console.warn("[ai] Provider unavailable; using local fallback", { code: errorCode(error) });
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Single-prompt convenience wrapper around {@link chat}. */
export async function chatCompletion(
  prompt: string,
  opts: { json?: boolean; temperature?: number; model?: string | null; maxTokens?: number } = {}
): Promise<string> {
  return chat([{ role: "user", content: prompt }], opts);
}
