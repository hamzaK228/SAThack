"use client";
import Link from "next/link";
export default function GlobalError({retry}:{retry:()=>void}) {
  return <html lang="en"><body><main style={{padding:32,fontFamily:"system-ui"}}><h1>SAThack could not load</h1><p>Please try again.</p><button onClick={retry}>Retry</button><p><Link href="/">Home</Link></p></main></body></html>;
}
