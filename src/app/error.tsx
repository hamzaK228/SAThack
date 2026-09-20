"use client";
import { useEffect } from "react";
import Link from "next/link";
export default function ErrorPage({error,retry}:{error:Error & {digest?:string};retry:()=>void}) {
  useEffect(()=>{console.error("[page]",{digest:error.digest,name:error.name});},[error]);
  return <main className="auth-shell"><h1>Could not load this page</h1><p>Please check your connection and try again.</p><button className="btn btn-primary" onClick={retry}>Try again</button><Link className="btn btn-ghost" href="/dashboard">Dashboard</Link></main>;
}
