import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const toneMap = {
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-400/10 dark:text-blue-200 dark:border-blue-400/20",
  amber: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:border-amber-400/20",
  gray: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-muted dark:border-white/10",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-400/10 dark:text-red-200 dark:border-red-400/20",
};

export function Badge({ className, tone = "gray", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof toneMap }) {
  return <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", toneMap[tone], className)} {...props} />;
}
