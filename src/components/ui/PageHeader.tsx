import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({ action }: PageHeaderProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("page-titlebar-actions"));
    return () => setTarget(null);
  }, []);

  if (!action) return null;
  if (target) return createPortal(action, target);

  return null;
}
