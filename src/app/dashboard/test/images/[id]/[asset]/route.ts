import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getDigitalExam } from "@/lib/digital-practice";
import { getPracticeTests } from "@/lib/practice-tests";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; asset: string }> }) {
  if (!await getCurrentUser()) return new Response("Unauthorized", { status: 401 });
  const { id, asset } = await params;
  if (!/^(?:q-\d+|page-\d+)\.webp$/.test(asset)) return new Response("Not found", { status: 404 });
  const exam = await getDigitalExam(id);
  if (!exam) return new Response("Not found", { status: 404 });
  const valid = asset.startsWith("q-") ? exam.questions.some((question) => `${question.id}.webp` === asset)
    : Number(asset.slice(5, -5)) < exam.pageCount;
  if (!valid) return new Response("Not found", { status: 404 });
  if((await getPracticeTests()).find(test=>test.id===id)?.remote) {
    const supabase=await createClient();
    const {data,error}=await supabase.storage.from("practice-tests").createSignedUrl(`${id}/${asset}`,3600);
    if(error)return new Response("Image unavailable",{status:503});
    return new Response(null,{status:307,headers:{Location:data.signedUrl,"Cache-Control":"private, max-age=1800"}});
  }
  try {
    const root=process.env.PRACTICE_TESTS_ROOT;
    if(!root)return new Response("Local test storage is not configured",{status:503});
    const file=new URL(`.digital/${id}/${asset}`,pathToFileURL(`${root}/`));
    await stat(file);
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response("Not found", { status: 404 });
    throw error;
  }
}
