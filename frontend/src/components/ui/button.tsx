import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-[#10b981] font-semibold text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,.24)] hover:bg-emerald-300",
        scan: "bg-[#06b6d4] font-semibold text-zinc-950 shadow-[0_0_20px_rgba(6,182,212,.22)] hover:bg-cyan-300",
        destructive: "bg-rose-500/90 text-white shadow-[0_0_20px_rgba(244,63,94,.30)] hover:bg-rose-400",
        outline: "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10",
        ghost: "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
      },
      size: { default: "h-9 px-4", sm: "h-8 px-3 text-xs" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
