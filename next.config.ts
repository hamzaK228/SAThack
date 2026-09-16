import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SAT book corpus is read from disk at runtime (src/lib/ai/knowledge.ts).
  // Trace it into the serverless bundle so it keeps working on Vercel.
  outputFileTracingIncludes: {
    "/*": ["./sat-corpus.json", "./sat-corpus-official.json"],
  },
};

export default nextConfig;
