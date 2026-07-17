import { ChartPie, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { BreakdownPieChart, TrendBarChart } from "../components/Chart";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import type { WorkspaceState } from "../data/types";
import { cn } from "../lib/utils";
import { dateForMonthDay, daysInMonth, durationHours, getWeekDates, monthKey, shiftDate, toIsoDate } from "../lib/time";

type AnalyticsGranularity = "week" | "month" | "quarter" | "year";

function shiftMonth(date: string, diffMonths: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setMonth(next.getMonth() + diffMonths);
  return toIsoDate(next);
}

function shiftYear(date: string, diffYears: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setFullYear(next.getFullYear() + diffYears);
  return toIsoDate(next);
}

function analyticsPeriod(date: string, granularity: AnalyticsGranularity) {
  const current = new Date(`${date}T00:00:00`);
  const year = current.getFullYear();
  const month = current.getMonth();
  if (granularity === "week") {
    const dates = getWeekDates(date);
    return { start: dates[0], end: dates[6], label: `${dates[0].slice(5).replace("-", "/")} - ${dates[6].slice(5).replace("-", "/")}` };
  }
  if (granularity === "month") {
    const key = monthKey(current);
    return { start: `${key}-01`, end: dateForMonthDay(key, daysInMonth(key)), label: `${year}年${month + 1}月` };
  }
  if (granularity === "quarter") {
    const quarter = Math.floor(month / 3);
    const startMonth = quarter * 3;
    const startKey = `${year}-${String(startMonth + 1).padStart(2, "0")}`;
    const endKey = `${year}-${String(startMonth + 3).padStart(2, "0")}`;
    return { start: `${startKey}-01`, end: dateForMonthDay(endKey, daysInMonth(endKey)), label: `${year}年第 ${quarter + 1} 季度` };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}年` };
}

function shiftAnalyticsAnchor(date: string, granularity: AnalyticsGranularity, direction: -1 | 1) {
  if (granularity === "week") return shiftDate(date, direction * 7);
  if (granularity === "month") return shiftMonth(date, direction);
  if (granularity === "quarter") return shiftMonth(date, direction * 3);
  return shiftYear(date, direction);
}

function AnalyticsTitleToolbar({ granularity, anchorDate, onGranularityChange, onAnchorDateChange }: {
  granularity: AnalyticsGranularity;
  anchorDate: string;
  onGranularityChange: (granularity: AnalyticsGranularity) => void;
  onAnchorDateChange: (date: string) => void;
}) {
  const period = analyticsPeriod(anchorDate, granularity);
  return (
    <div className="title-schedule-toolbar analytics-title-toolbar">
      <div className="toolbar-date-nav analytics-period-nav">
        <button className="toolbar-icon-button" onClick={() => onAnchorDateChange(shiftAnalyticsAnchor(anchorDate, granularity, -1))} aria-label="上一段"><ChevronLeft className="size-4" /></button>
        <div className="toolbar-period-label">{period.label}</div>
        <button className="toolbar-icon-button" onClick={() => onAnchorDateChange(shiftAnalyticsAnchor(anchorDate, granularity, 1))} aria-label="下一段"><ChevronRight className="size-4" /></button>
      </div>
      <div className="toolbar-segmented analytics-granularity">
        {(["week", "month", "quarter", "year"] as const).map((item) => <button key={item} className={cn(granularity === item && "active")} onClick={() => onGranularityChange(item)}>{{ week: "周", month: "月", quarter: "季度", year: "年" }[item]}</button>)}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <Card className="relative overflow-hidden p-5"><div className="absolute right-4 top-4 size-10 rounded-full bg-accent/10" /><div className="text-sm text-muted">{label}</div><div className="mt-2 text-3xl font-bold tracking-[-0.04em] text-ink">{value}</div><div className="mt-2 text-xs text-muted">{hint}</div></Card>;
}

export function AnalyticsPage({ state }: { state: WorkspaceState }) {
  const today = toIsoDate(new Date());
  const [granularity, setGranularity] = useState<AnalyticsGranularity>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const { start, end } = analyticsPeriod(anchorDate, granularity);
  const entries = state.entries.filter((entry) => entry.status === "confirmed" && entry.workDate >= start && entry.workDate <= end).sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const totalHours = entries.reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0);
  const activeDays = new Set(entries.map((entry) => entry.workDate)).size;
  const projectCount = new Set(entries.map((entry) => entry.projectName && entry.projectName !== "备注" ? entry.projectName : entry.remark || "备注")).size;
  const spanDays = Math.max(1, Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000) + 1);
  const pieCards = [
    { title: "工作性质", dimension: "workNature" as const },
    { title: "工作类别", dimension: "workCategory" as const },
    { title: "关联项目", dimension: "projectName" as const },
    { title: "工作形式", dimension: "workForm" as const },
  ];

  return (
    <>
      <PageHeader title="分析" action={<AnalyticsTitleToolbar granularity={granularity} anchorDate={anchorDate} onGranularityChange={setGranularity} onAnchorDateChange={setAnchorDate} />} />
      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard label="总工时" value={`${totalHours.toFixed(1)}h`} hint={`${start} 至 ${end}`} />
        <StatCard label="记录天数" value={String(activeDays)} hint={`范围共 ${spanDays} 天`} />
        <StatCard label="日均工时" value={`${(activeDays ? totalHours / activeDays : 0).toFixed(1)}h`} hint="按有记录日期计算" />
        <StatCard label="关联项目" value={String(projectCount)} hint={`${entries.length} 条正式记录`} />
      </div>
      <Card className="mt-5"><CardHeader title={spanDays > 62 ? "每月趋势" : "每日趋势"} action={<Badge tone="blue">{totalHours.toFixed(1)}h</Badge>} /><div className="p-4"><TrendBarChart entries={entries} startDate={start} endDate={end} /></div></Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {pieCards.map((card) => <Card key={card.dimension}><CardHeader title={card.title} /><div className="p-4">{entries.length ? <BreakdownPieChart entries={entries} dimension={card.dimension} /> : <EmptyState icon={<ChartPie className="size-5" />} title="暂无数据" text="选择包含正式工时的日期范围。" />}</div></Card>)}
      </div>
    </>
  );
}
