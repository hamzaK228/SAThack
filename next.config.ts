import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": ["./Practise tests/**/*"] },
  async headers() {
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://www.desmos.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://www.desmos.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://www.desmos.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.desmos.com",
      "frame-src 'self' https://www.desmos.com https://*.supabase.co",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: policy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  // The SAT book corpus is read from disk at runtime (src/lib/ai/knowledge.ts).
  // Trace it into the serverless bundle so it keeps working on Vercel.
  // Keep those readFileSync calls on inline literal paths — and add new corpus
  // files in both places — otherwise Turbopack falls back to tracing the whole
  // project ("Dynamic filesystem access causes tracing of the whole project").
  outputFileTracingIncludes: {
    "/*": ["./sat-corpus.json", "./sat-corpus-official.json"],
  },
};

export default nextConfig;
