import { availableModels } from "./models";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
/** How long a single model call may take before we fall back to the corpus. */
const DEFAULT_TIMEOUT_MS = 20_000;

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
    const body = JSON.stringify({
      model,
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    let res: ProviderResponse;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      res = await postJsonIpv4(`${base}/chat/completions`, body, key, timeoutMs);
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
