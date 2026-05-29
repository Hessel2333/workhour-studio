import type { ReactNode } from "react";

export function PageHeader({ action }: { title: string; description?: string; action?: ReactNode }) {
  if (!action) return null;
  return (
    <div className="mb-5 flex justify-end">
      {action}
    </div>
  );
}
