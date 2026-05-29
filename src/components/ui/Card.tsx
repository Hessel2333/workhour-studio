import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface rounded-[24px]", className)} {...props} />;
}

export function CardHeader({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/10 px-5 py-4">
      <div>
        <h2 className="text-base font-bold tracking-[-0.02em] text-ink">{title}</h2>
        {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
