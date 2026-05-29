import type { ReactNode } from "react";

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-[22px] border border-dashed border-line/20 bg-white/20 px-6 py-10 text-center dark:bg-white/5">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-black/5 text-muted dark:bg-white/5">{icon}</div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{text}</p>
    </div>
  );
}
