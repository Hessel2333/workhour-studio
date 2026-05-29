import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ className, variant = "secondary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: "border-transparent bg-ink text-panel hover:bg-ink/88 active:scale-[0.98] dark:bg-white dark:text-canvas dark:hover:bg-white/88",
    secondary: "border-line/10 bg-white/70 text-ink hover:bg-white active:scale-[0.98] dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15",
    ghost: "border-transparent bg-transparent text-muted hover:bg-black/[0.035] hover:text-ink active:scale-[0.98] dark:hover:bg-white/10",
    danger: "border-red-500/10 bg-red-500/10 text-red-600 hover:bg-red-500/15 active:scale-[0.98] dark:text-red-300",
  };
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
