import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtRate(bps: number): string {
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} MB/s`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(1)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

export const shortHash = (h?: string | null) => (h ? `${h.slice(0, 12)}…` : "none");
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false });
