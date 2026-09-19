import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root=path.resolve(process.env.PRACTICE_TESTS_ROOT || "Practise tests");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun=process.argv.includes("--dry-run");
if(!dryRun && (!url || !key)) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell. Never use a public service-role variable.");
const db=dryRun ? null : createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket="practice-tests";
if(db){
  const {data,error}=await db.storage.getBucket(bucket);
  if(error){const result=await db.storage.createBucket(bucket,{public:false,fileSizeLimit:100*1024*1024,allowedMimeTypes:["application/pdf","image/webp"]});if(result.error)throw result.error;}
  else if(data.public)throw new Error("The practice-tests bucket must be private.");
}
async function upload(local,remote,type){
  if(!db)return;
  const bytes=await readFile(local);
  for(let attempt=0;attempt<3;attempt++){
    const {error}=await db.storage.from(bucket).upload(remote,bytes,{contentType:type,cacheControl:"31536000",upsert:true});
    if(!error)return;
    if(attempt===2)throw new Error(`Upload failed for ${remote}: ${error.message}`);
    await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
}
let total=0;let bytes=0;
for(const folder of await readdir(root,{withFileTypes:true})){
  if(!folder.isDirectory() || folder.name.startsWith("."))continue;
  for(const file of await readdir(path.join(root,folder.name),{withFileTypes:true})){
    if(!file.isFile() || !/\.pdf$/i.test(file.name))continue;
    const relative=`${folder.name}/${file.name}`;
    const id=createHash("sha256").update(relative).digest("hex").slice(0,24);
    const answerKey=/\bANSW\b/i.test(file.name);
    let manifest=null;
    if(!answerKey){
      try{manifest=JSON.parse(await readFile(path.join(root,".digital",id,"exam.json"),"utf8"));}
      catch(error){if(error.code!=="ENOENT")throw error;}
      if(manifest && (manifest.id!==id || !Array.isArray(manifest.questions) || !Array.isArray(manifest.modules)))throw new Error(`Invalid manifest: ${id}`);
    }
    const assets=manifest ? [...manifest.questions.map(q=>`${q.id}.webp`),...Array.from({length:manifest.pageCount},(_,i)=>`page-${i}.webp`)] : [];
    if(assets.some(asset=>!/^(q-\d+|page-\d+)\.webp$/.test(asset)))throw new Error(`Invalid asset name: ${id}`);
    for(const asset of assets)bytes+=(await stat(path.join(root,".digital",id,asset))).size;
    const source=path.join(root,relative);const size=(await stat(source)).size;bytes+=size;
    await upload(source,`${id}/source.pdf`,"application/pdf");
    for(let i=0;i<assets.length;i+=4)await Promise.all(assets.slice(i,i+4).map(asset=>upload(path.join(root,".digital",id,asset),`${id}/${asset}`,"image/webp")));
    if(db){
      const {error}=await db.from("practice_test_catalog").upsert({id,title:file.name.replace(/\.pdf$/i,""),year:folder.name,filename:file.name,size,answer_key:answerKey,storage_path:`${id}/source.pdf`,manifest,published:true});
      if(error)throw error;
    }
    total++;console.log(`${dryRun ? "Validated" : "Published"}: ${id} (${assets.length} images)`);
  }
}
console.log(`${total} PDFs; ${(bytes/1024/1024).toFixed(1)} MiB. ${dryRun ? "No uploads made." : "Published."}`);
