import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({ className, variant = "secondary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: "border-transparent bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18),0_8px_18px_rgb(0_113_227_/_0.18)] hover:-translate-y-px",
    secondary: "border-transparent bg-white/70 text-ink shadow-[inset_0_1px_0_rgb(255_255_255_/_0.9),0_3px_14px_rgb(16_24_40_/_0.05)] hover:bg-white/95 dark:bg-white/10 dark:hover:bg-white/15",
    ghost: "border-transparent bg-transparent text-muted hover:text-ink hover:bg-white/50 dark:hover:bg-white/10",
    danger: "border-transparent bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300",
  };
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
