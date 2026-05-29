import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const control =
  "h-9 w-full rounded-full border border-line/10 bg-white/80 px-3 text-sm text-ink outline-none shadow-[inset_0_1px_0_rgb(255_255_255_/_0.9)] transition placeholder:text-muted/70 focus:border-accent/50 focus:ring-4 focus:ring-accent/15 dark:bg-white/10 dark:border-white/10";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, "min-h-20 rounded-2xl py-2", props.className)} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
