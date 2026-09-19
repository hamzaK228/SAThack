import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type PracticeTest = { id: string; title: string; year: string; filename: string; path: string; size: number; answerKey: boolean; remote?: boolean };

export const getPracticeTests = cache(async (): Promise<PracticeTest[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("practice_test_catalog").select("id,title,year,filename,storage_path,size,answer_key").eq("published",true).order("year",{ascending:false});
  if(error) throw new Error("Could not load practice tests.");
  if(data?.length) return data.map(row=>({id:row.id,title:row.title,year:row.year,filename:row.filename,path:row.storage_path,size:row.size,answerKey:row.answer_key,remote:true}));
  if(process.env.VERCEL) return [];
  const root = path.join(process.cwd(), "Practise tests");
  let folders;
  try { folders = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const groups = await Promise.all(folders.filter((folder) => folder.isDirectory()).map(async (folder) => {
    const entries = await readdir(path.join(root, folder.name), { withFileTypes: true });
    return Promise.all(entries.filter((file) => file.isFile() && /\.pdf$/i.test(file.name)).map(async (file) => {
      const relative = `${folder.name}/${file.name}`;
      const fullPath = path.join(root, relative);
      return { id: createHash("sha256").update(relative).digest("hex").slice(0, 24),
        title: file.name.replace(/\.pdf$/i, ""), year: folder.name, filename: file.name,
        path: fullPath, size: (await stat(fullPath)).size, answerKey: /\bANSW\b/i.test(file.name) };
    }));
  }));
  return groups.flat().sort((a, b) => b.year.localeCompare(a.year) || a.title.localeCompare(b.title, undefined, { numeric: true }));
});
