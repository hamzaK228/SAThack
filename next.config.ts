import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
