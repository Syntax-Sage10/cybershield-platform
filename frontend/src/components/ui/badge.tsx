import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      safe: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      scan: "border-amber-400/30 bg-amber-400/10 text-amber-300",
      threat: "border-rose-400/30 bg-rose-400/10 text-rose-300",
      muted: "border-white/10 bg-white/5 text-zinc-400",
    },
  },
  defaultVariants: { variant: "muted" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, variant, ...p }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...p} />
);
