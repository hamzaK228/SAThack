import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { getPracticeTests } from "@/lib/practice-tests";
import { getCurrentUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const file = (await getPracticeTests()).find((test) => test.id === id);
  if (!file) return new Response("Not found", { status: 404 });
  const headers = new Headers({ "Content-Type": "application/pdf", "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}` });
  let start = 0;
  let end = file.size - 1;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    if (!match[1]) start = Math.max(0, file.size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  return new Response(Readable.toWeb(createReadStream(file.path, { start, end })) as ReadableStream,
    { status: range ? 206 : 200, headers });
}
