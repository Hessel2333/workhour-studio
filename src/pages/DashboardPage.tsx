import { Clock3, Database, Wand2 } from "lucide-react";
import { CategoryChart } from "../components/Chart";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import type { TimesheetEntry, WorkspaceState } from "../data/types";
import { generateAutofillEntries } from "../features/autofill";
import { getEntryProjectColor, getNatureColor } from "../features/schedule/presentation";
import { getAutofillTemplates } from "../features/templates/templateState";
import { dateForMonthDay, daysInMonth, durationHours, getWeekday } from "../lib/time";
import { cn } from "../lib/utils";

type DashboardPageProps = {
  state: WorkspaceState;
  month: string;
  save: (patch: Partial<WorkspaceState>, message?: string) => Promise<void>;
};

export function DashboardPage({ state, month, save }: DashboardPageProps) {
  const monthEntries = state.entries.filter((entry) => entry.workDate.startsWith(month));
  const hours = monthEntries.reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0);
  const workDays = Array.from({ length: daysInMonth(month) }, (_, index) => dateForMonthDay(month, index + 1))
    .filter((date) => getWeekday(date) <= 5).length;
  const target = workDays * (
    durationHours(state.profile.defaultStart, state.profile.lunchStart)
    + durationHours(state.profile.lunchEnd, state.profile.defaultEnd)
  );
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = state.entries
    .filter((entry) => entry.workDate === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const createAutofillEntries = async () => {
    const generated = generateAutofillEntries(
      month,
      state.profile,
      getAutofillTemplates(state, month),
      state.entries,
      Date.now() % 1_000_000,
    );
    await save({ entries: [...state.entries, ...generated] }, `已补全 ${generated.length} 条记录`);
  };

  return (
    <>
      <PageHeader
        title="仪表盘"
        description="查看本月完成度、今日记录和最近工时。"
        action={<Button onClick={createAutofillEntries}><Wand2 className="size-4" />自动补全</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard label="本月工时" value={`${hours.toFixed(1)}h`} hint={`目标 ${target.toFixed(1)}h`} />
        <StatCard label="完成度" value={`${target ? Math.min(100, Math.round((hours / target) * 100)) : 0}%`} hint="按工作日规则估算" />
        <StatCard label="本月记录" value={String(monthEntries.length)} hint="补全后可在日程中直接调整" />
        <StatCard label="项目库" value={String(state.projects.length)} hint={`${state.projects.filter((project) => project.isFavorite).length} 个常用项目`} />
      </div>
      <div className="dashboard-main-grid mt-5">
        <Card>
          <CardHeader title="今日时间轴" />
          <div className="space-y-3 p-5">
            {todayEntries.length
              ? todayEntries.map((entry) => <TimelineRow key={entry.id} entry={entry} />)
              : <EmptyState icon={<Clock3 className="size-5" />} title="今天还没有记录" text="可以从日程页维护时间块，或在工时表中直接新增记录。" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="本月最近记录" action={<Badge tone="blue">{monthEntries.length}</Badge>} />
          <div className="max-h-96 space-y-3 overflow-auto p-5 scrollbar-soft">
            {monthEntries.slice(-8).reverse().map((entry) => <TimelineRow key={entry.id} entry={entry} compact />)}
            {monthEntries.length === 0 ? <EmptyState icon={<Wand2 className="size-5" />} title="暂无记录" text="点击自动补全后，可以在日程页直接调整。" /> : null}
          </div>
        </Card>
      </div>
      <div className="dashboard-main-grid mt-5">
        <Card><CardHeader title="类别分布" /><div className="p-4"><CategoryChart entries={monthEntries} /></div></Card>
        <Card><CardHeader title="最近记录" /><RecentEntries entries={state.entries.slice(0, 8)} /></Card>
      </div>
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute right-4 top-4 size-10 rounded-full bg-accent/10" />
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-[-0.04em] text-ink">{value}</div>
      <div className="mt-2 text-xs text-muted">{hint}</div>
    </Card>
  );
}

function TimelineRow({ entry, compact = false }: { entry: TimesheetEntry; compact?: boolean }) {
  const hours = durationHours(entry.startTime, entry.endTime).toFixed(1);
  return (
    <div
      className={cn("dashboard-time-block", compact && "compact")}
      style={{ ["--block-color" as string]: getEntryProjectColor(entry), ["--nature-color" as string]: getNatureColor(entry.workNature) }}
    >
      <strong>{entry.projectName && entry.projectName !== "备注" ? entry.projectName : entry.remark || entry.workCategory}</strong>
      <div className="dashboard-time-meta">
        <span className="dashboard-type-dot" />
        <span>{entry.workForm ? `${entry.workNature} · ${entry.workForm}` : entry.workNature}</span>
      </div>
      {!compact ? <span className="dashboard-time-range">{entry.startTime} - {entry.endTime}</span> : null}
      <span className="dashboard-duration">{hours}</span>
    </div>
  );
}

function RecentEntries({ entries }: { entries: TimesheetEntry[] }) {
  if (!entries.length) {
    return <div className="p-5"><EmptyState icon={<Database className="size-5" />} title="暂无记录" text="导入 Excel 或新增工时后会显示在这里。" /></div>;
  }
  return (
    <div className="overflow-auto scrollbar-soft">
      <table className="table-glass w-full min-w-[620px] text-left text-sm">
        <thead className="border-b border-line/10 text-xs text-muted"><tr><th className="px-5 py-3 font-medium">日期</th><th className="px-5 py-3 font-medium">时间</th><th className="px-5 py-3 font-medium">类别</th><th className="px-5 py-3 font-medium">内容</th></tr></thead>
        <tbody>{entries.map((entry) => (
          <tr key={entry.id} className="border-b border-line/10">
            <td className="px-5 py-3">{entry.workDate}</td>
            <td className="px-5 py-3 text-muted">{entry.startTime}-{entry.endTime}</td>
            <td className="px-5 py-3">{entry.workCategory}</td>
            <td className="px-5 py-3 text-muted">{entry.remark || entry.projectName || "未填写备注"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
