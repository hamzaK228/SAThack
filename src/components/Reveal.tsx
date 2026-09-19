import type { ReactNode } from "react";

export function Reveal({children,className}:{children:ReactNode;className?:string;delay?:number;y?:number}) {
  return <div className={className}>{children}</div>;
}

export function CountUp({to,prefix="",suffix="",comma=false}:{to:number;prefix?:string;suffix?:string;comma?:boolean;duration?:number}) {
  const value=Math.round(to);
  return <span>{prefix}{comma ? value.toLocaleString("en-US") : value}{suffix}</span>;
}
