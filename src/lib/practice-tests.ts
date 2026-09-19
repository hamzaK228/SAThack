import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { cache } from "react";

export type PracticeTest = { id: string; title: string; year: string; filename: string; path: string; size: number; answerKey: boolean };

export const getPracticeTests = cache(async (): Promise<PracticeTest[]> => {
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
