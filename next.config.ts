import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const production = process.env.NODE_ENV === "production";
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://www.desmos.com${production ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline' https://www.desmos.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://www.desmos.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.desmos.com",
      "frame-src 'self' https://www.desmos.com https://*.supabase.co",
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(production ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: policy },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
      },
      ...(production
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
        : []),
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/dashboard/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/auth/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
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
