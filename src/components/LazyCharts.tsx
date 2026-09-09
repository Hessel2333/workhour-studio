import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";

type Charts = typeof import("./Chart");
const Category = lazy(() => import("./Chart").then((m) => ({ default: m.CategoryChart })));
const Breakdown = lazy(() => import("./Chart").then((m) => ({ default: m.BreakdownPieChart })));
const Trend = lazy(() => import("./Chart").then((m) => ({ default: m.TrendBarChart })));
const TemplateWeight = lazy(() => import("./Chart").then((m) => ({ default: m.TemplateWeightChart })));
function LoadingChart({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="h-72 w-full flex items-center justify-center text-sm text-muted">正在加载图表…</div>}>{children}</Suspense>;
}

export const CategoryChart = (props: ComponentProps<Charts["CategoryChart"]>) => <LoadingChart><Category {...props} /></LoadingChart>;
export const BreakdownPieChart = (props: ComponentProps<Charts["BreakdownPieChart"]>) => <LoadingChart><Breakdown {...props} /></LoadingChart>;
export const TrendBarChart = (props: ComponentProps<Charts["TrendBarChart"]>) => <LoadingChart><Trend {...props} /></LoadingChart>;
export const TemplateWeightChart = (props: ComponentProps<Charts["TemplateWeightChart"]>) => <LoadingChart><TemplateWeight {...props} /></LoadingChart>;
