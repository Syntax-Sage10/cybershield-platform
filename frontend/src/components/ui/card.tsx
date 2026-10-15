import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLElement>) => (
  <section className={cn("glass rounded-xl", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center justify-between gap-3 px-5 pt-4", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("flex items-center gap-2 text-sm font-semibold text-zinc-100", className)} {...p} />
);
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-5 pb-5 pt-3", className)} {...p} />
);
