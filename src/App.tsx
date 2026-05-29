import {
  BookOpen,
  CalendarDays,
  ChartPie,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings,
  Sun,
  Table2,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { BreakdownPieChart, CategoryChart, TrendBarChart } from "./components/Chart";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Card, CardHeader } from "./components/ui/Card";
import { EmptyState } from "./components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "./components/ui/Form";
import { GuideDocs } from "./components/GuideDocs";
import { PageHeader } from "./components/ui/PageHeader";
import { createId } from "./data/defaults";
import type { PageKey, Project, ThemeMode, TimesheetEntry, WorkTemplate, WorkspaceState } from "./data/types";
import { generateAutofillDrafts } from "./features/autofill";
import { exportMonthExcel, importConfigJson, importExcelWorkbook, mergeContinuousEntries } from "./features/excel";
import { loadWorkspace, saveStatePatch } from "./lib/db";
import { cn } from "./lib/utils";
import {
  dateForMonthDay,
  daysInMonth,
  durationHours,
  fromMinutes,
  getWeekDates,
  getWeekday,
  monthKey,
  overlaps,
  shiftDate,
  toIsoDate,
  toMinutes,
} from "./lib/time";

const pages: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { key: "schedule", label: "日程", icon: CalendarDays },
  { key: "projects", label: "项目库", icon: FolderKanban },
  { key: "templates", label: "模板库", icon: Wand2 },
  { key: "timesheet", label: "工时表", icon: Table2 },
  { key: "analytics", label: "分析", icon: ChartPie },
  { key: "guide", label: "说明", icon: BookOpen },
  { key: "importExport", label: "导入导出", icon: FileSpreadsheet },
  { key: "settings", label: "设置", icon: Settings },
];

const workNatureOptions = ["科研工作", "事务性工作", "请假"];
const workCategoryOptionsByNature: Record<string, string[]> = {
  科研工作: ["总部项目", "公司项目", "院控项目", "创新创效", "探索项目", "其他科研生产"],
  事务性工作: ["实验室日常维护", "会议", "其他事务性", "出差"],
  请假: ["请假"],
};
const workFormOptionsByNature: Record<string, string[]> = {
  科研工作: ["测试实验", "合成实验", "文字撰写", "基地会议", "学术会议", "行业会议", "学习培训", "资料调研", "样品寄送", "物资采购", "自由交流", "其他"],
  事务性工作: ["文字撰写", "基地会议", "客户走访", "学术会议", "行业会议", "其他外出交流", "学习培训", "自由交流", "资料调研", "其他"],
  请假: ["其他"],
};
const workCategoryOptions = [...new Set(Object.values(workCategoryOptionsByNature).flat())];
const workFormOptions = [...new Set(Object.values(workFormOptionsByNature).flat())];
const importedProjectPurgeKey = "workhour-studio.imported-projects-purged-v1";
const templateLibraryResetKey = "workhour-studio.template-library-reset-v1";
const stale2025CleanupKey = "workhour-studio.stale-2025-cleanup-v1";
const projectColorPalette = ["#007aff", "#ff9500", "#af52de", "#5856d6", "#ff2d55", "#64d2ff", "#8e8e93", "#bf5af2"];
const weekTimelineStart = 7 * 60;
const weekTimelineEnd = 20 * 60;
const weekSlotHeight = 30;
const minInteractiveBlockMinutes = 30;

type WorkSelection = {
  workNature: string;
  workCategory: string;
  workForm: string;
  projectName?: string;
};

type ConfirmRequest = {
  title: string;
  text: string;
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
};

const getWorkCategoryOptions = (workNature: string) => workCategoryOptionsByNature[workNature] || workCategoryOptions;
const getWorkFormOptions = (workNature: string) => workFormOptionsByNature[workNature] || workFormOptions;
const withCurrentOption = (options: string[], current?: string) => current && !options.includes(current) ? [current, ...options] : options;
const legacyTransactionalNature = "\u975e\u79d1\u7814\u5de5\u4f5c";
const normalizeWorkNatureValue = (value: string) => value === legacyTransactionalNature ? "事务性工作" : value || "事务性工作";

function getProjectOptions(projects: Project[], workCategory: string) {
  const activeProjects = projects.filter((project) => project.status !== "closed");
  if (workCategory === "探索项目") return activeProjects.filter((project) => project.category === "探索项目" || project.name.includes("探索"));
  if (["总部项目", "公司项目", "院控项目", "创新创效"].includes(workCategory)) {
    return activeProjects.filter((project) => project.category === workCategory || project.category.includes(workCategory) || workCategory.includes(project.category));
  }
  return [];
}

function normalizeWorkSelection<T extends WorkSelection>(draft: T, patch: Partial<T>, projects: Project[] = []) {
  const next = { ...draft, ...patch };
  next.workNature = normalizeWorkNatureValue(next.workNature);
  const categoryOptions = getWorkCategoryOptions(next.workNature);
  if (!categoryOptions.includes(next.workCategory)) next.workCategory = categoryOptions[0] || "";
  const formOptions = getWorkFormOptions(next.workNature);
  if (!formOptions.includes(next.workForm)) next.workForm = formOptions[0] || "";
  const projectOptions = getProjectOptions(projects, next.workCategory);
  const hasSelectedProject = projectOptions.some((project) => project.name === next.projectName);
  if (next.projectName && next.projectName !== "备注" && !hasSelectedProject && next.workCategory !== draft.workCategory) {
    next.projectName = "";
  }
  return next;
}

function projectExists(projects: Project[], projectName?: string) {
  if (!projectName || projectName === "备注") return true;
  return projects.some((project) => project.name === projectName);
}

function getAutofillTemplates(state: WorkspaceState) {
  return state.templates.map((template) => projectExists(state.projects, template.projectName) ? template : { ...template, projectName: "备注", projectId: undefined });
}

function sanitizeWorkspaceData(workspace: WorkspaceState) {
  const normalizeProjectName = (projectName?: string) => projectExists(workspace.projects, projectName) ? projectName : "备注";
  const normalizedEntries = workspace.entries
    .filter((entry) => entry.workDate >= "2026-01-01")
    .map((entry) => ({
      ...entry,
      workNature: normalizeWorkNatureValue(entry.workNature),
      projectName: entry.status === "draft" || entry.source === "autofill" ? normalizeProjectName(entry.projectName) : entry.projectName,
    }));
  const normalizedTemplates = workspace.templates.map((template) => ({
    ...template,
    workNature: normalizeWorkNatureValue(template.workNature),
    projectName: normalizeProjectName(template.projectName),
    projectId: projectExists(workspace.projects, template.projectName) ? template.projectId : undefined,
  }));
  const normalizedBlocks = workspace.blocks.filter((block) => block.workDate >= "2026-01-01");
  const normalizedJobs = workspace.jobs.filter((job) => !job.periodEnd || job.periodEnd >= "2026-01");

  const changed =
    normalizedEntries.length !== workspace.entries.length ||
    normalizedEntries.some((entry, index) => entry.workNature !== workspace.entries[index]?.workNature || entry.projectName !== workspace.entries[index]?.projectName) ||
    normalizedTemplates.some((template, index) => template.workNature !== workspace.templates[index]?.workNature || template.projectName !== workspace.templates[index]?.projectName || template.projectId !== workspace.templates[index]?.projectId) ||
    normalizedBlocks.length !== workspace.blocks.length ||
    normalizedJobs.length !== workspace.jobs.length;

  return {
    changed,
    patch: {
      entries: normalizedEntries,
      templates: normalizedTemplates,
      blocks: normalizedBlocks,
      jobs: normalizedJobs,
    } satisfies Partial<WorkspaceState>,
  };
}

const now = () => new Date().toISOString();

function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && prefersDark));
}

function App() {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [page, setPage] = useState<PageKey>("dashboard");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [scheduleMode, setScheduleMode] = useState<"day" | "week">("week");
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleUndoEntries, setScheduleUndoEntries] = useState<TimesheetEntry[] | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    loadWorkspace()
      .then(async (workspace) => {
        const shouldPurgeImportedProjects = !localStorage.getItem(importedProjectPurgeKey);
        const shouldResetTemplates = !localStorage.getItem(templateLibraryResetKey);
        const shouldCleanupStale2025 = !localStorage.getItem(stale2025CleanupKey);
        const importedProjects = workspace.projects.filter((project) => project.source === "excel");
        const sanitized = sanitizeWorkspaceData(workspace);
        const patch: Partial<WorkspaceState> = {};
        if (shouldPurgeImportedProjects && importedProjects.length > 0) {
          patch.projects = workspace.projects.filter((project) => project.source !== "excel");
        }
        if (shouldResetTemplates && workspace.templates.length > 0) {
          patch.templates = [];
        }
        if (sanitized.changed) {
          Object.assign(patch, sanitized.patch);
          if (shouldResetTemplates && workspace.templates.length > 0) patch.templates = [];
        }
        if (Object.keys(patch).length > 0) {
          const next = await saveStatePatch(patch, workspace);
          localStorage.setItem(importedProjectPurgeKey, now());
          localStorage.setItem(templateLibraryResetKey, now());
          localStorage.setItem(stale2025CleanupKey, now());
          setState(next);
          applyTheme(next.profile.theme);
          return;
        }
        if (shouldPurgeImportedProjects) localStorage.setItem(importedProjectPurgeKey, now());
        if (shouldResetTemplates) localStorage.setItem(templateLibraryResetKey, now());
        if (shouldCleanupStale2025) localStorage.setItem(stale2025CleanupKey, now());
        setState(workspace);
        applyTheme(workspace.profile.theme);
      })
      .catch((error) => setNotice(`启动失败：${String(error)}`))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (state) applyTheme(state.profile.theme);
  }, [state?.profile.theme]);

  useEffect(() => {
    if (!state || !notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice, state]);

  const save = async (patch: Partial<WorkspaceState>, message?: string) => {
    if (!state) return;
    const next = await saveStatePatch(patch, state);
    setState(next);
    if (message) setNotice(message);
  };

  const confirmAction = (request: ConfirmRequest) => setConfirmRequest(request);

  const runConfirmedAction = async () => {
    const request = confirmRequest;
    if (!request) return;
    setConfirmRequest(null);
    await request.onConfirm();
  };

  const saveScheduleEntries = async (entries: TimesheetEntry[], message: string) => {
    if (!state) return;
    setScheduleUndoEntries(state.entries);
    await save({ entries }, message);
  };

  const undoScheduleAction = async () => {
    if (!state || !scheduleUndoEntries) return;
    const entries = scheduleUndoEntries;
    setScheduleUndoEntries(null);
    await save({ entries }, "已撤销");
  };

  const copyPreviousDay = async () => {
    if (!state) return;
    const sourceDate = shiftDate(scheduleDate, -1);
    const copied = state.entries
      .filter((entry) => entry.workDate === sourceDate)
      .map((entry) => ({
        ...entry,
        id: createId("entry"),
        workDate: scheduleDate,
        source: "manual" as const,
        createdAt: now(),
        updatedAt: now(),
      }));
    if (!copied.length) return;
    await saveScheduleEntries(mergeContinuousEntries([...state.entries.filter((entry) => entry.workDate !== scheduleDate), ...copied]), "已复制昨日");
  };

  const deleteScheduleDay = async () => {
    if (!state) return;
    const count = state.entries.filter((entry) => entry.workDate === scheduleDate).length;
    if (!count) return;
    confirmAction({
      title: "删除当日记录？",
      text: `${scheduleDate} 的 ${count} 条记录会被移除，可在日程页撤销最近一次日程操作。`,
      confirmText: "删除",
      onConfirm: async () => {
        await saveScheduleEntries(state.entries.filter((entry) => entry.workDate !== scheduleDate), "已删除当日记录");
      },
    });
  };

  const generateScheduleDrafts = async (scope: "day" | "week") => {
    if (!state) return;
    const dates = scope === "week" ? getWeekDates(scheduleDate) : [scheduleDate];
    const dateSet = new Set(dates);
    const months = [...new Set(dates.map((date) => date.slice(0, 7)))];
    const templates = getAutofillTemplates(state);
    const drafts = months
      .flatMap((item) => generateAutofillDrafts(item, state.profile, templates, state.entries))
      .filter((entry) => dateSet.has(entry.workDate));
    const entries = state.entries.filter((entry) => !(entry.status === "draft" && dateSet.has(entry.workDate)));
    await saveScheduleEntries([...entries, ...drafts], scope === "week" ? `已为本周生成 ${drafts.length} 条草稿` : `已为 ${scheduleDate} 生成草稿`);
  };

  if (!state) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas text-ink">
        <div className="surface flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
          <Loader2 className="size-4 animate-spin text-accent" />
          {busy ? "正在打开工作台" : notice || "启动失败"}
        </div>
      </div>
    );
  }

  const pageProps = { state, month, save, setNotice, confirmAction, scheduleMode, setScheduleMode, scheduleDate, setScheduleDate };
  const currentPage = pages.find((item) => item.key === page);

  return (
    <div className="app-grid">
      <aside className="sidebar-shell hidden px-3 py-4 md:flex md:flex-col">
        <div className="mb-6 flex flex-col gap-2 px-2 pb-3">
          <div className="brand-mark text-white"><Clock3 className="size-3.5" /></div>
          <div>
            <div className="text-base font-bold tracking-[-0.03em] text-ink">工时</div>
            <div className="text-xs leading-5 text-muted">任务与记录</div>
          </div>
        </div>
        <nav className="space-y-1.5">
          {pages.filter((item) => item.key !== "guide").map((item) => (
            <button key={item.key} onClick={() => setPage(item.key)} aria-current={page === item.key ? "page" : undefined} className={cn("nav-item w-full", page === item.key && "active")}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-1.5 px-1 pb-3">
          <button onClick={() => setPage("guide")} aria-current={page === "guide" ? "page" : undefined} className={cn("nav-item w-full", page === "guide" && "active")}>
            说明
          </button>
        </div>
        <div className="sidebar-footer space-y-2 px-1 pt-4">
          <ThemeSwitch value={state.profile.theme} onChange={(theme) => save({ profile: { ...state.profile, theme, updatedAt: now() } })} compact />
          <Button className="w-full justify-center" variant="ghost" onClick={() => setPage("importExport")}><Upload className="size-4" />导入</Button>
          <Button className="w-full justify-center" variant="secondary" onClick={() => setPage("importExport")}><Download className="size-4" />导出</Button>
        </div>
      </aside>

      <main className="workspace-shell min-w-0">
        <header className="main-toolbar sticky top-0 z-20 px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2 md:flex" aria-hidden="true">
                <span className="traffic-light close" />
                <span className="traffic-light minimize" />
                <span className="traffic-light expand" />
              </div>
              <div className="flex items-center gap-2 md:hidden">
                <Clock3 className="size-5 text-accent" />
                <span className="text-sm font-semibold">{currentPage?.label}</span>
              </div>
              <div className="hidden md:block">
                <div className="text-sm font-bold tracking-[-0.02em] text-ink">{currentPage?.label}</div>
              </div>
            </div>
            {page === "schedule" ? (
              <ScheduleTitleToolbar
                mode={scheduleMode}
                selectedDate={scheduleDate}
                onModeChange={setScheduleMode}
                onDateChange={setScheduleDate}
                canUndo={Boolean(scheduleUndoEntries)}
                onUndo={undoScheduleAction}
                onCopyPreviousDay={copyPreviousDay}
                onGenerateDrafts={generateScheduleDrafts}
                onDeleteDay={deleteScheduleDay}
              />
            ) : ["dashboard", "timesheet", "importExport"].includes(page) ? (
              <div className="pill-control p-1">
                <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-8 w-36 border-0 bg-white/90 text-center shadow-sm dark:bg-white/10" />
              </div>
            ) : <div />}
          </div>
        </header>

        <div className="main-stage">
          <MobileNav active={page} onChange={setPage} />
          {page === "dashboard" && <Dashboard {...pageProps} />}
          {page === "schedule" && <SchedulePage {...pageProps} />}
          {page === "projects" && <ProjectsPage {...pageProps} />}
          {page === "templates" && <TemplatesPage {...pageProps} />}
          {page === "timesheet" && <TimesheetPage {...pageProps} />}
          {page === "analytics" && <AnalyticsPage {...pageProps} />}
          {page === "guide" && <GuideDocs />}
          {page === "importExport" && <ImportExportPage {...pageProps} />}
          {page === "settings" && <SettingsPage {...pageProps} />}
        </div>
      </main>
      {notice ? <div className="notice-toast" role="status" aria-live="polite">{notice}</div> : null}
      {confirmRequest ? (
        <ConfirmDialog
          request={confirmRequest}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={runConfirmedAction}
        />
      ) : null}
    </div>
  );
}

function ThemeSwitch({ value, onChange, compact = false }: { value: ThemeMode; onChange: (value: ThemeMode) => void; compact?: boolean }) {
  return (
    <div className={cn("pill-control flex p-1", compact && "w-full justify-center")} role="group" aria-label="主题切换">
      {[
        { key: "light", icon: Sun, label: "浅色" },
        { key: "dark", icon: Moon, label: "深色" },
        { key: "system", icon: Settings, label: "系统" },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.key} title={item.label} aria-label={item.label} onClick={() => onChange(item.key as ThemeMode)} className={cn("flex size-8 items-center justify-center rounded-lg text-muted transition hover:text-ink", value === item.key && "bg-white text-ink shadow-sm dark:bg-white/15")}>
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

function ConfirmDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <button className="confirm-backdrop" aria-label="取消操作" onClick={onCancel} />
      <section className="confirm-panel surface" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div>
          <h2 id="confirm-title" className="text-base font-semibold tracking-[-0.02em] text-ink">{request.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{request.text}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="danger" onClick={onConfirm}>{request.confirmText || "确认"}</Button>
        </div>
      </section>
    </>
  );
}

function ScheduleTitleToolbar({
  mode,
  selectedDate,
  onModeChange,
  onDateChange,
  canUndo,
  onUndo,
  onCopyPreviousDay,
  onGenerateDrafts,
  onDeleteDay,
}: {
  mode: "day" | "week";
  selectedDate: string;
  onModeChange: (mode: "day" | "week") => void;
  onDateChange: (date: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onCopyPreviousDay: () => void;
  onGenerateDrafts: (scope: "day" | "week") => void;
  onDeleteDay: () => void;
}) {
  const [autofillScope, setAutofillScope] = useState<"day" | "week">("day");

  return (
    <div className="title-schedule-toolbar">
      <button className="toolbar-month-chip">{selectedDate.slice(0, 7).replace("-", "年")}月</button>
      <div className="toolbar-segmented">
        <button className={cn(mode === "day" && "active")} onClick={() => onModeChange("day")}>日视图</button>
        <button className={cn(mode === "week" && "active")} onClick={() => onModeChange("week")}>周视图</button>
      </div>
      <div className="toolbar-date-nav">
        <button className="toolbar-icon-button" onClick={() => onDateChange(shiftDate(selectedDate, mode === "week" ? -7 : -1))} aria-label={mode === "week" ? "上一周" : "上一天"}><ChevronLeft className="size-4" /></button>
        <Input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
        <button className="toolbar-icon-button" onClick={() => onDateChange(shiftDate(selectedDate, mode === "week" ? 7 : 1))} aria-label={mode === "week" ? "下一周" : "下一天"}><ChevronRight className="size-4" /></button>
      </div>
      <button className="toolbar-soft-button" disabled={!canUndo} onClick={onUndo}>撤销</button>
      <button className="toolbar-soft-button" onClick={onCopyPreviousDay}>复制昨日</button>
      <div className="toolbar-autofill-control">
        <button className="toolbar-soft-button" onClick={() => onGenerateDrafts(autofillScope)}>自动补全</button>
        <select value={autofillScope} onChange={(event) => setAutofillScope(event.target.value as "day" | "week")} aria-label="自动补全范围">
          <option value="day">补全当日</option>
          <option value="week">补全本周</option>
        </select>
      </div>
      <button className="toolbar-soft-button" onClick={() => onDateChange(new Date().toISOString().slice(0, 10))}>回到本周</button>
      <button className="toolbar-danger-button" onClick={onDeleteDay}>删除当日</button>
    </div>
  );
}

function MobileNav({ active, onChange }: { active: PageKey; onChange: (page: PageKey) => void }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
      {pages.map((item) => (
        <Button key={item.key} variant={active === item.key ? "primary" : "secondary"} aria-current={active === item.key ? "page" : undefined} onClick={() => onChange(item.key)} className="shrink-0">
          {item.label}
        </Button>
      ))}
    </div>
  );
}

type PageProps = {
  state: WorkspaceState;
  month: string;
  scheduleMode: "day" | "week";
  setScheduleMode: (mode: "day" | "week") => void;
  scheduleDate: string;
  setScheduleDate: (date: string) => void;
  save: (patch: Partial<WorkspaceState>, message?: string) => Promise<void>;
  setNotice: (value: string) => void;
  confirmAction: (request: ConfirmRequest) => void;
};

function Dashboard({ state, month, save }: PageProps) {
  const monthEntries = state.entries.filter((entry) => entry.workDate.startsWith(month));
  const confirmed = monthEntries.filter((entry) => entry.status === "confirmed");
  const drafts = monthEntries.filter((entry) => entry.status === "draft");
  const hours = confirmed.reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0);
  const workDays = Array.from({ length: daysInMonth(month) }, (_, index) => dateForMonthDay(month, index + 1)).filter((date) => getWeekday(date) <= 5).length;
  const target = workDays * (durationHours(state.profile.defaultStart, state.profile.lunchStart) + durationHours(state.profile.lunchEnd, state.profile.defaultEnd));
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = state.entries.filter((entry) => entry.workDate === today).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const createDrafts = async () => {
    const generated = generateAutofillDrafts(month, state.profile, getAutofillTemplates(state), state.entries);
    const withoutOldDrafts = state.entries.filter((entry) => !(entry.status === "draft" && entry.workDate.startsWith(month)));
    await save({ entries: [...withoutOldDrafts, ...generated] }, `已生成 ${generated.length} 条补全草稿`);
  };

  const confirmDrafts = async () => {
    const entries = mergeContinuousEntries(state.entries.map((entry) => (entry.status === "draft" ? { ...entry, status: "confirmed" as const, updatedAt: now() } : entry)));
    await save({ entries }, "补全草稿已确认");
  };

  return (
    <>
      <PageHeader
        title="仪表盘"
        description="查看本月完成度、今日记录和待确认草稿。"
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={createDrafts}><Wand2 className="size-4" />生成补全草稿</Button>
            <Button variant="primary" disabled={drafts.length === 0} onClick={confirmDrafts}><Check className="size-4" />确认草稿</Button>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard label="本月工时" value={`${hours.toFixed(1)}h`} hint={`目标 ${target.toFixed(1)}h`} />
        <StatCard label="完成度" value={`${target ? Math.min(100, Math.round((hours / target) * 100)) : 0}%`} hint="按工作日规则估算" />
        <StatCard label="补全草稿" value={String(drafts.length)} hint="确认后写入正式工时" />
        <StatCard label="项目库" value={String(state.projects.length)} hint={`${state.projects.filter((project) => project.isFavorite).length} 个常用项目`} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader title="今日时间轴" />
          <div className="space-y-3 p-5">
            {todayEntries.length ? todayEntries.map((entry) => <TimelineRow key={entry.id} entry={entry} />) : <EmptyState icon={<Clock3 className="size-5" />} title="今天还没有记录" text="可以从日程页维护时间块，或在工时表中直接新增记录。" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="待确认草稿" action={<Badge tone="amber">{drafts.length}</Badge>} />
          <div className="max-h-96 space-y-3 overflow-auto p-5 scrollbar-soft">
            {drafts.slice(0, 8).map((entry) => <TimelineRow key={entry.id} entry={entry} compact />)}
            {drafts.length === 0 ? <EmptyState icon={<Wand2 className="size-5" />} title="暂无草稿" text="点击生成补全草稿后，这里会显示待确认记录。" /> : null}
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card><CardHeader title="类别分布" /><div className="p-4"><CategoryChart entries={confirmed} /></div></Card>
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
  const color = getEntryProjectColor(entry);
  const hours = durationHours(entry.startTime, entry.endTime).toFixed(1);
  return (
    <div
      className={cn("dashboard-time-block", compact && "compact", entry.status === "draft" && "draft")}
      style={{ ["--block-color" as string]: color, ["--nature-color" as string]: getNatureColor(entry.workNature) }}
    >
      <strong>{entry.projectName && entry.projectName !== "备注" ? entry.projectName : entry.remark || entry.workCategory}</strong>
      <div className="dashboard-time-meta">
        <span className="dashboard-type-dot" />
        <span>{entry.workNature} · {entry.workForm}</span>
      </div>
      {!compact ? <span className="dashboard-time-range">{entry.startTime} - {entry.endTime}</span> : null}
      <span className="dashboard-duration">{hours}</span>
    </div>
  );
}

function ProjectSelect({
  value,
  projects,
  workCategory,
  onChange,
}: {
  value?: string;
  projects: Project[];
  workCategory: string;
  onChange: (value: string) => void;
}) {
  const options = getProjectOptions(projects, workCategory);
  const normalizedValue = value || "备注";
  const keepsCurrentValue = normalizedValue !== "备注" && !options.some((project) => project.name === normalizedValue);

  return (
    <Select value={normalizedValue} onChange={(event) => onChange(event.target.value)}>
      <option value="备注">备注 / 不关联项目</option>
      {keepsCurrentValue ? <option value={normalizedValue}>{normalizedValue}</option> : null}
      {options.map((project) => (
        <option key={project.id} value={project.name}>{project.name}</option>
      ))}
    </Select>
  );
}

function RecentEntries({ entries }: { entries: TimesheetEntry[] }) {
  if (!entries.length) return <div className="p-5"><EmptyState icon={<Database className="size-5" />} title="暂无记录" text="导入 Excel 或新增工时后会显示在这里。" /></div>;
  return (
    <div className="overflow-auto scrollbar-soft">
      <table className="table-glass w-full min-w-[620px] text-left text-sm">
        <thead className="border-b border-line/10 text-xs text-muted"><tr><th className="px-5 py-3 font-medium">日期</th><th className="px-5 py-3 font-medium">时间</th><th className="px-5 py-3 font-medium">类别</th><th className="px-5 py-3 font-medium">内容</th></tr></thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-line/10">
              <td className="px-5 py-3">{entry.workDate}</td>
              <td className="px-5 py-3 text-muted">{entry.startTime}-{entry.endTime}</td>
              <td className="px-5 py-3">{entry.workCategory}</td>
              <td className="px-5 py-3 text-muted">{entry.remark || entry.projectName || "未填写备注"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const stableIndex = (value: string, modulo: number) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash % modulo;
};

const getEntryProjectColor = (entry: TimesheetEntry) => {
  const key = entry.projectName && entry.projectName !== "备注" ? entry.projectName : entry.workCategory;
  return projectColorPalette[stableIndex(key || "default", projectColorPalette.length)];
};

const getNatureColor = (workNature: string) => {
  if (workNature.includes("请假")) return "#8e8e93";
  if (workNature.includes("事务")) return "#ff9500";
  if (workNature.includes("科研")) return "#007aff";
  return "#5856d6";
};

const formatDayHeader = (date: string) => {
  const [, , day] = date.split("-");
  const weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][getWeekday(date) - 1];
  return `${Number(day)}日${weekday}`;
};

type ScheduleInteraction =
  | {
      type: "move";
      entryId: string;
      date: string;
      duration: number;
      grabOffset: number;
      originClientX: number;
      originClientY: number;
      hasDragged: boolean;
      nextStart: number;
    }
  | {
      type: "resize-start" | "resize-end";
      entryId: string;
      date: string;
      startMinute: number;
      endMinute: number;
      nextMinute: number;
    };

const snapMinuteFromRect = (clientY: number, rect: DOMRect) => {
  const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  const minute = weekTimelineStart + ratio * (weekTimelineEnd - weekTimelineStart);
  return Math.round(minute / 30) * 30;
};

const clampInteractiveRange = (startMinute: number, endMinute: number) => {
  const start = Math.max(weekTimelineStart, Math.min(startMinute, weekTimelineEnd - minInteractiveBlockMinutes));
  const end = Math.max(start + minInteractiveBlockMinutes, Math.min(endMinute, weekTimelineEnd));
  return { start, end };
};

function SchedulePage({ state, month, save, confirmAction, scheduleMode: mode, scheduleDate: selectedDate, setScheduleDate: setSelectedDate }: PageProps) {
  const dayEntries = state.entries.filter((entry) => entry.workDate === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const slots = [];
  for (let minute = toMinutes(state.profile.defaultStart); minute < toMinutes(state.profile.defaultEnd); minute += 30) {
    const start = fromMinutes(minute);
    const end = fromMinutes(minute + 30);
    const entry = dayEntries.find((item) => overlaps(start, end, item.startTime, item.endTime));
    slots.push({ start, end, entry });
  }

  return (
    <>
      <PageHeader title="日程" description="按日或按周维护时间块，生成并确认补全草稿。" />
      {mode === "week" ? <WeekSchedule state={state} selectedDate={selectedDate} onSelectDate={setSelectedDate} save={save} confirmAction={confirmAction} /> : (
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="p-4">
            <Field label="日期"><Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></Field>
            <div className="mt-5 grid grid-cols-7 gap-1">
              {Array.from({ length: daysInMonth(month) }, (_, index) => {
                const date = dateForMonthDay(month, index + 1);
                const hasEntry = state.entries.some((entry) => entry.workDate === date);
                return <button key={date} onClick={() => setSelectedDate(date)} className={cn("h-9 rounded-lg border text-sm", selectedDate === date ? "border-accent bg-accent text-white" : hasEntry ? "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-400/10" : "border-line/10 bg-white/30 text-muted dark:bg-white/5")}>{index + 1}</button>;
              })}
            </div>
          </Card>
          <Card>
            <CardHeader title={`${selectedDate} 时间轴`} />
            <div className="p-5">
              <div className="grid gap-2">
                {slots.map((slot) => (
                  <div key={`${slot.start}-${slot.end}`} className="grid grid-cols-[90px_minmax(0,1fr)] items-stretch gap-3">
                    <div className="pt-2 text-sm font-medium text-muted">{slot.start}</div>
                    <div className={cn("rounded-2xl border px-3 py-2 text-sm", slot.entry ? "timeline-card border-white/50 dark:border-white/5" : "border-dashed border-line/20 bg-white/25 text-muted dark:bg-white/5")} style={{ ["--block-color" as string]: slot.entry ? getEntryProjectColor(slot.entry) : "#007aff" }}>
                      {slot.entry ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{slot.entry.remark || slot.entry.projectName || slot.entry.workCategory}</span><Badge tone={slot.entry.status === "draft" ? "amber" : "blue"}>{slot.entry.status === "draft" ? "草稿" : "已确认"}</Badge></div> : "空白"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function WeekSchedule({
  state,
  selectedDate,
  onSelectDate,
  save,
  confirmAction,
}: {
  state: WorkspaceState;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  save: (patch: Partial<WorkspaceState>, message?: string) => Promise<void>;
  confirmAction: (request: ConfirmRequest) => void;
}) {
  const suppressClickUntilRef = useRef(0);
  const interactionRef = useRef<ScheduleInteraction | null>(null);
  const [interaction, setInteraction] = useState<ScheduleInteraction | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const weekDates = getWeekDates(selectedDate);
  const today = new Date().toISOString().slice(0, 10);
  const timeSlots = Array.from({ length: (weekTimelineEnd - weekTimelineStart) / 30 }, (_, index) => weekTimelineStart + index * 30);
  const hourMarkers = Array.from({ length: (weekTimelineEnd - weekTimelineStart) / 60 + 1 }, (_, index) => weekTimelineStart + index * 60);
  const weekEntries = state.entries.filter((entry) => weekDates.includes(entry.workDate)).sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const entriesByDate = new Map(weekDates.map((date) => [date, weekEntries.filter((entry) => entry.workDate === date)]));
  const favoriteProjects = state.projects.filter((project) => project.isFavorite).slice(0, 3);
  const quickTemplates = state.templates.filter((template) => template.enabled).slice(0, 3);
  const selectedEntry = selectedEntryId ? state.entries.find((entry) => entry.id === selectedEntryId) : undefined;

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  const updateEntry = async (id: string, patch: Partial<TimesheetEntry>, message = "时间块已更新") => {
    await save({ entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: now() } : entry)) }, message);
  };

  const deleteEntry = (entry: TimesheetEntry) => {
    confirmAction({
      title: "删除时间块？",
      text: `${entry.workDate} ${entry.startTime}-${entry.endTime} 的记录会被移除。`,
      confirmText: "删除",
      onConfirm: async () => {
        setSelectedEntryId(null);
        await save({ entries: state.entries.filter((item) => item.id !== entry.id) }, "时间块已删除");
      },
    });
  };

  useEffect(() => {
    if (!interaction) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      setInteraction((current) => {
        if (!current) return current;
        if (current.type === "move") {
          const body = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-week-day-body='true']");
          const rect = body?.getBoundingClientRect();
          if (!body || !rect) return current;
          const pointerMinute = snapMinuteFromRect(event.clientY, rect);
          return {
            ...current,
            date: body.dataset.date || current.date,
            hasDragged: current.hasDragged || Math.abs(event.clientY - current.originClientY) > 4 || Math.abs(event.clientX - current.originClientX) > 4,
            nextStart: pointerMinute - current.grabOffset,
          };
        }

        const body = document.querySelector<HTMLElement>(`[data-week-day-body='true'][data-date='${current.date}']`);
        const rect = body?.getBoundingClientRect();
        if (!rect) return current;
        return { ...current, nextMinute: snapMinuteFromRect(event.clientY, rect) };
      });
    };

    const handlePointerUp = async () => {
      const current = interactionRef.current;
      setInteraction(null);
      if (!current) return;
      const entry = state.entries.find((item) => item.id === current.entryId);
      if (!entry) return;

      if (current.type === "move") {
        if (!current.hasDragged) return;
        const range = clampInteractiveRange(current.nextStart, current.nextStart + current.duration);
        suppressClickUntilRef.current = performance.now() + 280;
        await updateEntry(entry.id, { workDate: current.date, startTime: fromMinutes(range.start), endTime: fromMinutes(range.end) });
        onSelectDate(current.date);
        return;
      }

      const range = current.type === "resize-start"
        ? clampInteractiveRange(Math.min(current.nextMinute, current.endMinute - minInteractiveBlockMinutes), current.endMinute)
        : clampInteractiveRange(current.startMinute, Math.max(current.nextMinute, current.startMinute + minInteractiveBlockMinutes));
      suppressClickUntilRef.current = performance.now() + 280;
      await updateEntry(entry.id, { startTime: fromMinutes(range.start), endTime: fromMinutes(range.end) });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [interaction, onSelectDate, state.entries]);

  const previewEntry = (entry: TimesheetEntry) => {
    if (!interaction || interaction.entryId !== entry.id) return entry;
    if (interaction.type === "move" && interaction.hasDragged) {
      const range = clampInteractiveRange(interaction.nextStart, interaction.nextStart + interaction.duration);
      return { ...entry, workDate: interaction.date, startTime: fromMinutes(range.start), endTime: fromMinutes(range.end) };
    }
    if (interaction.type === "resize-start" || interaction.type === "resize-end") {
      const range = interaction.type === "resize-start"
        ? clampInteractiveRange(Math.min(interaction.nextMinute, interaction.endMinute - minInteractiveBlockMinutes), interaction.endMinute)
        : clampInteractiveRange(interaction.startMinute, Math.max(interaction.nextMinute, interaction.startMinute + minInteractiveBlockMinutes));
      return { ...entry, startTime: fromMinutes(range.start), endTime: fromMinutes(range.end) };
    }
    return entry;
  };

  return (
    <div className="worktrail-week-layout">
      <aside className="worktrail-rail panel-card">
        <div className="worktrail-rail-title">工作项</div>
        <div className="worktrail-stack">
          {favoriteProjects.map((project) => (
            <div key={project.id} className="worktrail-palette-card">
              <div className="worktrail-card-head">
                <span className="worktrail-chip" style={{ ["--project-color" as string]: projectColorPalette[stableIndex(project.name, projectColorPalette.length)] }}>{project.code || project.category}</span>
                <span>{project.status === "active" ? "进行中" : project.status === "paused" ? "暂停" : "已结束"}</span>
              </div>
              <strong>{project.name}</strong>
              <div className="worktrail-card-meta"><span>{project.category}</span><span>{weekEntries.filter((entry) => entry.projectName === project.name).reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0).toFixed(1)}h</span></div>
            </div>
          ))}
        </div>
        <div className="worktrail-rail-title secondary">其他</div>
        <div className="worktrail-stack">
          {quickTemplates.map((template) => <div key={template.id} className="worktrail-quick-card"><strong>{template.remark || template.name}</strong><span>{template.workNature} · {template.workForm}</span></div>)}
        </div>
      </aside>
      <div className="worktrail-board">
        <div className="worktrail-board-inner">
          <div className="worktrail-time-axis" style={{ height: ((weekTimelineEnd - weekTimelineStart) / 30) * weekSlotHeight + 44 }}>
            {hourMarkers.map((minute) => <div key={minute} className="worktrail-time-label" style={{ top: 44 + ((minute - weekTimelineStart) / 30) * weekSlotHeight }}>{fromMinutes(minute)}</div>)}
          </div>
          <div className="worktrail-day-columns">
            {weekDates.map((date) => {
              const baseEntries = entriesByDate.get(date) || [];
              const interactingEntry = interaction?.entryId ? weekEntries.find((entry) => entry.id === interaction.entryId) : undefined;
              const renderedInteractingEntry = interactingEntry ? previewEntry(interactingEntry) : undefined;
              const entries = renderedInteractingEntry?.workDate === date && !baseEntries.some((entry) => entry.id === renderedInteractingEntry.id)
                ? [...baseEntries, interactingEntry!]
                : baseEntries;
              return (
                <section key={date} className={cn("worktrail-day-column", date === selectedDate && "selected")}>
                  <button className={cn("worktrail-day-header", date === selectedDate && "selected", date === today && "today")} onClick={() => onSelectDate(date)}><strong>{formatDayHeader(date)}</strong></button>
                  <div className={cn("worktrail-day-body", date === today && "today")} data-week-day-body="true" data-date={date} style={{ height: ((weekTimelineEnd - weekTimelineStart) / 30) * weekSlotHeight }}>
                    {timeSlots.map((minute) => <div key={minute} className={cn("worktrail-slot", minute % 60 === 0 ? "major" : "minor", minute >= 8 * 60 && minute < 18 * 60 && "within-workday")} style={{ height: weekSlotHeight }} />)}
                    {entries.map((entry) => {
                      const rendered = previewEntry(entry);
                      if (rendered.workDate !== date) return null;
                      const start = Math.max(weekTimelineStart, toMinutes(rendered.startTime));
                      const end = Math.min(weekTimelineEnd, toMinutes(rendered.endTime));
                      if (end <= weekTimelineStart || start >= weekTimelineEnd) return null;
                      const top = ((start - weekTimelineStart) / 30) * weekSlotHeight;
                      const height = Math.max(weekSlotHeight, ((end - start) / 30) * weekSlotHeight);
                      return (
                        <article
                          key={entry.id}
                          className={cn("worktrail-time-block interactive", rendered.status === "draft" && "draft", selectedEntryId === entry.id && "selected", interaction?.entryId === entry.id && "interacting")}
                          style={{ top, height, ["--block-color" as string]: getEntryProjectColor(rendered), ["--nature-color" as string]: getNatureColor(rendered.workNature) }}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (performance.now() < suppressClickUntilRef.current) return;
                            setSelectedEntryId(entry.id);
                            onSelectDate(rendered.workDate);
                          }}
                        >
                          <button
                            type="button"
                            className="worktrail-resize-handle top"
                            aria-label="调整开始时间"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setInteraction({
                                type: "resize-start",
                                entryId: entry.id,
                                date,
                                startMinute: toMinutes(rendered.startTime),
                                endMinute: toMinutes(rendered.endTime),
                                nextMinute: toMinutes(rendered.startTime),
                              });
                            }}
                          />
                          <button
                            type="button"
                            className="worktrail-block-body"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              const body = event.currentTarget.closest<HTMLElement>("[data-week-day-body='true']");
                              const rect = body?.getBoundingClientRect();
                              if (!rect) return;
                              const pointerMinute = snapMinuteFromRect(event.clientY, rect);
                              setInteraction({
                                type: "move",
                                entryId: entry.id,
                                date,
                                duration: toMinutes(rendered.endTime) - toMinutes(rendered.startTime),
                                grabOffset: pointerMinute - toMinutes(rendered.startTime),
                                originClientX: event.clientX,
                                originClientY: event.clientY,
                                hasDragged: false,
                                nextStart: toMinutes(rendered.startTime),
                              });
                            }}
                          >
                            <strong>{rendered.projectName && rendered.projectName !== "备注" ? rendered.projectName : rendered.remark || rendered.workCategory}</strong>
                            <div className="worktrail-type-row"><span className="worktrail-type-dot" /><span>{rendered.workNature} · {rendered.workForm}</span></div>
                            <span>{rendered.startTime} - {rendered.endTime}</span>
                            <span className="worktrail-duration">{durationHours(rendered.startTime, rendered.endTime).toFixed(1)}</span>
                          </button>
                          <button
                            type="button"
                            className="worktrail-resize-handle bottom"
                            aria-label="调整结束时间"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setInteraction({
                                type: "resize-end",
                                entryId: entry.id,
                                date,
                                startMinute: toMinutes(rendered.startTime),
                                endMinute: toMinutes(rendered.endTime),
                                nextMinute: toMinutes(rendered.endTime),
                              });
                            }}
                          />
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
      {selectedEntry ? (
        <EntryEditorModal
          entry={selectedEntry}
          projects={state.projects}
          onClose={() => setSelectedEntryId(null)}
          onDelete={() => deleteEntry(selectedEntry)}
          onSave={(patch) => {
            updateEntry(selectedEntry.id, patch, "时间块已保存");
            setSelectedEntryId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EntryEditorModal({
  entry,
  projects,
  onClose,
  onSave,
  onDelete,
}: {
  entry: TimesheetEntry;
  projects: Project[];
  onClose: () => void;
  onSave: (patch: Partial<TimesheetEntry>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState({
    workDate: entry.workDate,
    startTime: entry.startTime,
    endTime: entry.endTime,
    workNature: entry.workNature,
    workCategory: entry.workCategory,
    projectName: entry.projectName || "",
    workForm: entry.workForm,
    remark: entry.remark || "",
    collaborator: entry.collaborator || "",
    status: entry.status,
  });

  const submit = () => {
    onSave({
      ...draft,
      projectName: draft.projectName || "备注",
      remark: draft.remark || undefined,
      collaborator: draft.collaborator || undefined,
      status: draft.status,
    });
  };

  return (
    <>
      <button className="entry-editor-backdrop" aria-label="关闭编辑" onClick={onClose} />
      <aside className="entry-editor-panel panel-card">
        <div className="entry-editor-head">
          <div>
            <div className="text-sm font-bold text-ink">编辑时间块</div>
            <div className="mt-1 text-xs text-muted">{draft.workDate} · {draft.startTime}-{draft.endTime}</div>
          </div>
          <button className="toolbar-icon-button" onClick={onClose} aria-label="关闭"><X className="size-4" /></button>
        </div>
        <div className="entry-editor-form">
          <Field label="日期"><Input type="date" value={draft.workDate} onChange={(e) => setDraft({ ...draft, workDate: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始"><Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></Field>
            <Field label="结束"><Input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="工作性质"><Select value={draft.workNature} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workNature: e.target.value }, projects))}>{withCurrentOption(workNatureOptions, draft.workNature).map((item) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="工作类别"><Select value={draft.workCategory} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workCategory: e.target.value }, projects))}>{withCurrentOption(getWorkCategoryOptions(draft.workNature), draft.workCategory).map((item) => <option key={item}>{item}</option>)}</Select></Field>
          </div>
          <Field label="关联项目">
            <ProjectSelect value={draft.projectName} projects={projects} workCategory={draft.workCategory} onChange={(projectName) => setDraft({ ...draft, projectName })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="工作形式"><Select value={draft.workForm} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workForm: e.target.value }, projects))}>{withCurrentOption(getWorkFormOptions(draft.workNature), draft.workForm).map((item) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="状态"><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TimesheetEntry["status"] })}><option value="confirmed">已确认</option><option value="draft">草稿</option></Select></Field>
          </div>
          <Field label="备注"><Textarea value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} /></Field>
          <Field label="共同完成人"><Input value={draft.collaborator} onChange={(e) => setDraft({ ...draft, collaborator: e.target.value })} /></Field>
        </div>
        <div className="entry-editor-actions">
          <Button variant="danger" onClick={onDelete}><Trash2 className="size-4" />删除</Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button variant="primary" onClick={submit}><Check className="size-4" />保存</Button>
          </div>
        </div>
      </aside>
    </>
  );
}

function ProjectsPage({ state, save, confirmAction }: PageProps) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ name: "", code: "", category: "探索项目" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const projects = state.projects.filter((project) => [project.name, project.code, project.category].join(" ").toLowerCase().includes(query.toLowerCase()));
  const isEditing = Boolean(editingId);

  const resetDraft = () => { setEditingId(null); setDraft({ name: "", code: "", category: "探索项目" }); };
  const startEditProject = (project: Project) => { setEditingId(project.id); setDraft({ name: project.name, code: project.code || "", category: project.category }); };

  const addProject = async () => {
    if (!draft.name.trim()) return;
    const project: Project = { id: createId("project"), name: draft.name.trim(), code: draft.code.trim() || undefined, category: draft.category, status: "active", source: "manual", isFavorite: true, createdAt: now(), updatedAt: now() };
    await save({ projects: [project, ...state.projects] }, "项目已加入项目库");
    resetDraft();
  };

  const saveProject = async () => {
    if (!editingId || !draft.name.trim()) return;
    await save({ projects: state.projects.map((project) => project.id === editingId ? { ...project, name: draft.name.trim(), code: draft.code.trim() || undefined, category: draft.category, source: "manual", updatedAt: now() } : project) }, "项目已更新");
    resetDraft();
  };

  const toggleFavorite = async (project: Project) => save({ projects: state.projects.map((item) => item.id === project.id ? { ...item, isFavorite: !item.isFavorite, updatedAt: now() } : item) });
  const removeProject = (project: Project) => {
    confirmAction({
      title: "删除项目？",
      text: `“${project.name}”会从项目库移除，已有工时记录不会被删除。`,
      confirmText: "删除",
      onConfirm: async () => {
        await save({ projects: state.projects.filter((item) => item.id !== project.id) }, "项目已从项目库移除");
        if (editingId === project.id) resetDraft();
      },
    });
  };
  const sourceLabel = (source: Project["source"]) => source === "excel" ? "导入" : source === "json" ? "配置" : source === "script" ? "脚本" : "手动";

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="p-5">
        <div className="space-y-4">
          <div><div className="text-base font-semibold text-ink">{isEditing ? "编辑项目" : "新增项目"}</div><div className="mt-1 text-sm text-muted">{isEditing ? "保存后会作为手动维护项目保留。" : "把常用项目加入本地项目库。"}</div></div>
          <Field label="项目名称"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="输入项目名称" /></Field>
          <Field label="项目号"><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="可选" /></Field>
          <Field label="项目类别"><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{workCategoryOptions.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={isEditing ? saveProject : addProject}>{isEditing ? <Check className="size-4" /> : <Plus className="size-4" />}{isEditing ? "保存项目" : "新增项目"}</Button>
            {isEditing ? <Button variant="ghost" onClick={resetDraft}><X className="size-4" />取消</Button> : null}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="项目池" action={<div className="relative w-64"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索项目" /></div>} />
        {projects.length === 0 ? <div className="p-5"><EmptyState icon={<FolderKanban className="size-5" />} title={query ? "没有匹配项目" : "暂无项目"} text={query ? "换个关键词，或新增一个常用项目。" : "先把常用项目加入项目库，后续填报会更快。"} /></div> : <div className="overflow-auto scrollbar-soft">
          <table className="table-glass w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-line/10 text-xs text-muted"><tr><th className="px-5 py-3">项目名称</th><th className="px-5 py-3">项目号</th><th className="px-5 py-3">类别</th><th className="px-5 py-3">来源</th><th className="px-5 py-3">常用</th><th className="px-5 py-3">操作</th></tr></thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-line/10">
                  <td className="px-5 py-3 font-medium">{project.name}</td><td className="px-5 py-3 text-muted">{project.code || "-"}</td><td className="px-5 py-3"><Badge tone="blue">{project.category}</Badge></td><td className="px-5 py-3 text-muted">{sourceLabel(project.source)}</td>
                  <td className="px-5 py-3"><Button variant="ghost" onClick={() => toggleFavorite(project)}>{project.isFavorite ? "常用" : "设为常用"}</Button></td>
                  <td className="px-5 py-3"><div className="flex gap-2"><Button variant="ghost" onClick={() => startEditProject(project)}><Pencil className="size-4" />编辑</Button><Button variant="danger" onClick={() => removeProject(project)}><Trash2 className="size-4" />删除</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </Card>
    </div>
  );
}

function TemplatesPage({ state, save, confirmAction }: PageProps) {
  const [draft, setDraft] = useState({ name: "", workNature: "科研工作", workCategory: "探索项目", projectName: "", workForm: "资料调研", remark: "", weight: 10, scheduleKind: "random" as WorkTemplate["scheduleKind"], weekday: 1, startTime: "08:00", endTime: "09:00" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"kind" | "nature" | "project">("nature");
  const isEditing = Boolean(editingId);
  const templateGroups = groupTemplates(state.templates, groupBy);

  const resetDraft = () => {
    setEditingId(null);
    setDraft({ name: "", workNature: "科研工作", workCategory: "探索项目", projectName: "", workForm: "资料调研", remark: "", weight: 10, scheduleKind: "random", weekday: 1, startTime: "08:00", endTime: "09:00" });
  };
  const startEditTemplate = (template: WorkTemplate) => {
    setEditingId(template.id);
    setDraft({
      name: template.name,
      workNature: template.workNature,
      workCategory: template.workCategory,
      projectName: template.projectName || "",
      workForm: template.workForm,
      remark: template.remark || "",
      weight: template.weight,
      scheduleKind: template.scheduleKind,
      weekday: template.weekday || 1,
      startTime: template.startTime || "08:00",
      endTime: template.endTime || "09:00",
    });
  };
  const templateFromDraft = (id = createId("template")): WorkTemplate => ({
    id,
    name: draft.name || draft.remark || draft.projectName || draft.workForm || "工作模板",
    workNature: draft.workNature,
    workCategory: draft.workCategory,
    projectName: draft.projectName || "备注",
    workForm: draft.workForm,
    remark: draft.remark || undefined,
    weight: Number(draft.weight) || 1,
    scheduleKind: draft.scheduleKind,
    weekday: draft.scheduleKind === "random" ? undefined : Number(draft.weekday),
    startTime: draft.scheduleKind === "random" ? undefined : draft.startTime,
    endTime: draft.scheduleKind === "random" ? undefined : draft.endTime,
    enabled: true,
    createdAt: now(),
    updatedAt: now(),
  });
  const addTemplate = async () => {
    const template = templateFromDraft();
    await save({ templates: [template, ...state.templates] }, "模板已保存");
    resetDraft();
  };
  const saveTemplate = async () => {
    if (!editingId) return;
    const original = state.templates.find((template) => template.id === editingId);
    const next = templateFromDraft(editingId.startsWith("template_xlsx_") ? createId("template") : editingId);
    await save({ templates: state.templates.map((template) => template.id === editingId ? { ...next, enabled: original?.enabled ?? true, createdAt: original?.createdAt || next.createdAt, updatedAt: now() } : template) }, "模板已更新");
    resetDraft();
  };
  const toggleTemplate = (template: WorkTemplate) => save({ templates: state.templates.map((item) => item.id === template.id ? { ...item, enabled: !item.enabled, updatedAt: now() } : item) });
  const removeTemplate = (template: WorkTemplate) => {
    confirmAction({
      title: "删除模板？",
      text: `“${template.name}”会从模板库移除，不影响已经生成的工时记录。`,
      confirmText: "删除",
      onConfirm: async () => {
        await save({ templates: state.templates.filter((item) => item.id !== template.id) }, "模板已删除");
        if (editingId === template.id) resetDraft();
      },
    });
  };
  const clearTemplates = () => {
    confirmAction({
      title: "清空模板库？",
      text: `当前 ${state.templates.length} 个模板都会被移除。这个操作不会删除项目和工时记录。`,
      confirmText: "清空",
      onConfirm: async () => {
        await save({ templates: [] }, "模板库已清空");
        resetDraft();
      },
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-5">
        <div className="grid gap-4">
          <div><div className="text-base font-semibold text-ink">{isEditing ? "编辑模板" : "新增模板"}</div><div className="mt-1 text-sm text-muted">模板用于自动补全草稿。</div></div>
          <Field label="模板名称"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：资料调研" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="工作性质"><Select value={draft.workNature} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workNature: e.target.value }, state.projects))}>{withCurrentOption(workNatureOptions, draft.workNature).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="工作类别"><Select value={draft.workCategory} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workCategory: e.target.value }, state.projects))}>{withCurrentOption(getWorkCategoryOptions(draft.workNature), draft.workCategory).map((item) => <option key={item}>{item}</option>)}</Select></Field></div>
          <Field label="关联项目"><ProjectSelect value={draft.projectName} projects={state.projects} workCategory={draft.workCategory} onChange={(projectName) => setDraft({ ...draft, projectName })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="工作形式"><Select value={draft.workForm} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workForm: e.target.value }, state.projects))}>{withCurrentOption(getWorkFormOptions(draft.workNature), draft.workForm).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="权重"><Input type="number" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value) })} /></Field></div>
          <Field label="备注"><Textarea value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} /></Field>
          <Field label="类型"><Select value={draft.scheduleKind} onChange={(e) => setDraft({ ...draft, scheduleKind: e.target.value as WorkTemplate["scheduleKind"] })}><option value="random">随机模板</option><option value="fixed">固定安排</option><option value="weekend_lecture">周末讲堂</option></Select></Field>
          {draft.scheduleKind !== "random" ? <div className="grid grid-cols-3 gap-3"><Field label="周几"><Input type="number" min={1} max={7} value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })} /></Field><Field label="开始"><Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></Field><Field label="结束"><Input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></Field></div> : null}
          <div className="flex gap-2">
            <Button variant="primary" onClick={isEditing ? saveTemplate : addTemplate}><Plus className="size-4" />{isEditing ? "保存模板" : "新增模板"}</Button>
            {isEditing ? <Button variant="ghost" onClick={resetDraft}>取消</Button> : null}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="模板库"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value as "kind" | "nature" | "project")} className="h-8 w-32">
                <option value="nature">按性质</option>
                <option value="kind">按类型</option>
                <option value="project">按项目</option>
              </Select>
              <Button variant="danger" disabled={state.templates.length === 0} onClick={clearTemplates}>清空</Button>
            </div>
          }
        />
        <div className="space-y-5 p-5">
          {templateGroups.map((group) => (
            <section key={group.name} className="template-group">
              <div className="template-group-head"><span>{group.name}</span><Badge tone="gray">{group.items.length}</Badge></div>
              <div className="template-card-grid">
                {group.items.map((template) => (
                  <article key={template.id} className={cn("template-mini-card", !template.enabled && "disabled")}>
                    <div className="template-mini-top">
                      <strong>{template.name}</strong>
                      <Badge tone={template.scheduleKind === "random" ? "blue" : template.scheduleKind === "fixed" ? "gray" : "amber"}>{template.scheduleKind === "random" ? "随机" : template.scheduleKind === "fixed" ? "固定" : "讲堂"}</Badge>
                    </div>
                    <div className="template-mini-meta">{template.workNature} · {template.workCategory}</div>
                    <div className="template-mini-meta">{template.projectName || "备注"} · {template.workForm}</div>
                    {template.remark ? <p>{template.remark}</p> : null}
                    <div className="template-mini-actions">
                      <Button variant="ghost" onClick={() => toggleTemplate(template)}>{template.enabled ? "停用" : "启用"}</Button>
                      <Button variant="ghost" onClick={() => startEditTemplate(template)}><Pencil className="size-4" />编辑</Button>
                      <Button variant="danger" onClick={() => removeTemplate(template)}><Trash2 className="size-4" />删除</Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {state.templates.length === 0 ? <EmptyState icon={<Wand2 className="size-5" />} title="暂无模板" text="可以手动新增模板，或导入旧 JSON 配置生成模板。" /> : null}
        </div>
      </Card>
    </div>
  );
}

function groupTemplates(templates: WorkTemplate[], groupBy: "kind" | "nature" | "project") {
  const label = (template: WorkTemplate) => {
    if (groupBy === "kind") return template.scheduleKind === "random" ? "随机模板" : template.scheduleKind === "fixed" ? "固定安排" : "周末讲堂";
    if (groupBy === "project") return template.projectName && template.projectName !== "备注" ? template.projectName : "备注 / 不关联项目";
    return template.workNature || "未分类";
  };
  const groups = new Map<string, WorkTemplate[]>();
  templates.forEach((template) => {
    const key = label(template);
    groups.set(key, [...(groups.get(key) || []), template]);
  });
  return [...groups.entries()].map(([name, items]) => ({
    name,
    items: [...items].sort((a, b) => `${a.workCategory}${a.projectName}${a.workForm}`.localeCompare(`${b.workCategory}${b.projectName}${b.workForm}`)),
  }));
}

function TimesheetPage({ state, month, save, confirmAction }: PageProps) {
  const [draft, setDraft] = useState({ workDate: `${month}-01`, startTime: "08:00", endTime: "09:00", workNature: "科研工作", workCategory: "探索项目", projectName: "", workForm: "资料调研", remark: "" });
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [formError, setFormError] = useState("");
  const entries = state.entries.filter((entry) => entry.workDate.startsWith(month)).sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const addEntry = async () => {
    if (toMinutes(draft.endTime) <= toMinutes(draft.startTime)) {
      setFormError("结束时间需要晚于开始时间。");
      return;
    }
    const hasOverlap = state.entries.some((entry) => entry.workDate === draft.workDate && overlaps(draft.startTime, draft.endTime, entry.startTime, entry.endTime));
    if (hasOverlap) {
      setFormError("这个时间段与已有记录重叠。");
      return;
    }
    setFormError("");
    const entry: TimesheetEntry = { id: createId("entry"), ...draft, status: "confirmed", source: "manual", createdAt: now(), updatedAt: now() };
    await save({ entries: mergeContinuousEntries([entry, ...state.entries]) }, "工时记录已保存");
  };
  const removeEntry = (entry: TimesheetEntry) => {
    confirmAction({
      title: "删除工时记录？",
      text: `${entry.workDate} ${entry.startTime}-${entry.endTime} 的记录会被移除。`,
      confirmText: "删除",
      onConfirm: () => save({ entries: state.entries.filter((item) => item.id !== entry.id) }, "记录已删除"),
    });
  };
  const updateEntry = async (id: string, patch: Partial<TimesheetEntry>) => {
    await save({ entries: state.entries.map((entry) => entry.id === id ? { ...entry, ...patch, updatedAt: now() } : entry) }, "记录已更新");
    setEditingEntry(null);
  };
  return (
    <>
      <Card className="mb-5 p-5">
        <div className="grid gap-3 lg:grid-cols-9">
          <Field label="日期"><Input type="date" value={draft.workDate} onChange={(e) => setDraft({ ...draft, workDate: e.target.value })} /></Field><Field label="开始"><Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></Field><Field label="结束"><Input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></Field>
          <Field label="性质"><Select value={draft.workNature} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workNature: e.target.value }, state.projects))}>{withCurrentOption(workNatureOptions, draft.workNature).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="类别"><Select value={draft.workCategory} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workCategory: e.target.value }, state.projects))}>{withCurrentOption(getWorkCategoryOptions(draft.workNature), draft.workCategory).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="项目"><ProjectSelect value={draft.projectName} projects={state.projects} workCategory={draft.workCategory} onChange={(projectName) => setDraft({ ...draft, projectName })} /></Field>
          <Field label="形式"><Select value={draft.workForm} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workForm: e.target.value }, state.projects))}>{withCurrentOption(getWorkFormOptions(draft.workNature), draft.workForm).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="备注"><Input value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} /></Field><div className="flex items-end"><Button variant="primary" onClick={addEntry} className="w-full"><Plus className="size-4" />新增</Button></div>
        </div>
        {formError ? <p className="mt-3 rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{formError}</p> : null}
      </Card>
      <Card>
        <CardHeader title={`${month} 工时记录`} action={<Badge tone="blue">{entries.reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0).toFixed(1)}h</Badge>} />
        {entries.length === 0 ? <div className="p-5"><EmptyState icon={<Table2 className="size-5" />} title="暂无工时记录" text="新增一条记录，或从导入导出页导入 Excel。" /></div> : <div className="overflow-auto scrollbar-soft">
          <table className="table-glass w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line/10 text-xs text-muted"><tr><th className="px-5 py-3">日期</th><th className="px-5 py-3">时间</th><th className="px-5 py-3">性质</th><th className="px-5 py-3">类别</th><th className="px-5 py-3">关联项目</th><th className="px-5 py-3">形式</th><th className="px-5 py-3">备注</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">操作</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-line/10"><td className="px-5 py-3">{entry.workDate}</td><td className="px-5 py-3 text-muted">{entry.startTime}-{entry.endTime}</td><td className="px-5 py-3">{entry.workNature}</td><td className="px-5 py-3">{entry.workCategory}</td><td className="px-5 py-3 text-muted">{entry.projectName || "备注"}</td><td className="px-5 py-3">{entry.workForm}</td><td className="px-5 py-3 text-muted">{entry.remark || "-"}</td><td className="px-5 py-3"><Badge tone={entry.status === "draft" ? "amber" : "blue"}>{entry.status === "draft" ? "草稿" : "已确认"}</Badge></td><td className="px-5 py-3"><div className="flex gap-2"><Button variant="ghost" onClick={() => setEditingEntry(entry)}><Pencil className="size-4" />编辑</Button><Button variant="ghost" onClick={() => removeEntry(entry)}>删除</Button></div></td></tr>)}</tbody>
          </table>
        </div>}
      </Card>
      {editingEntry ? (
        <EntryEditorModal
          entry={editingEntry}
          projects={state.projects}
          onClose={() => setEditingEntry(null)}
          onSave={(patch) => updateEntry(editingEntry.id, patch)}
          onDelete={() => {
            removeEntry(editingEntry);
            setEditingEntry(null);
          }}
        />
      ) : null}
    </>
  );
}

function AnalyticsPage({ state }: PageProps) {
  const today = toIsoDate(new Date());
  const [startDate, setStartDate] = useState(shiftDate(today, -30));
  const [endDate, setEndDate] = useState(today);
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  const entries = state.entries
    .filter((entry) => entry.status === "confirmed" && entry.workDate >= start && entry.workDate <= end)
    .sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const totalHours = entries.reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0);
  const activeDays = new Set(entries.map((entry) => entry.workDate)).size;
  const projectCount = new Set(entries.map((entry) => entry.projectName && entry.projectName !== "备注" ? entry.projectName : entry.remark || "备注")).size;
  const avgDailyHours = activeDays ? totalHours / activeDays : 0;
  const spanDays = dateDistance(start, end) + 1;
  const trendTitle = spanDays > 62 ? "每月趋势" : "每日趋势";
  const pieCards: Array<{ title: string; dimension: "workNature" | "workCategory" | "projectName" | "workForm" }> = [
    { title: "工作性质", dimension: "workNature" },
    { title: "工作类别", dimension: "workCategory" },
    { title: "关联项目", dimension: "projectName" },
    { title: "工作形式", dimension: "workForm" },
  ];

  const setThisMonth = () => {
    const key = monthKey(new Date());
    setStartDate(`${key}-01`);
    setEndDate(dateForMonthDay(key, daysInMonth(key)));
  };
  const setLastMonth = () => {
    const current = new Date();
    const lastMonth = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    const key = monthKey(lastMonth);
    setStartDate(`${key}-01`);
    setEndDate(dateForMonthDay(key, daysInMonth(key)));
  };
  const setPastDays = (days: number) => {
    setStartDate(shiftDate(today, 1 - days));
    setEndDate(today);
  };

  return (
    <>
      <PageHeader
        title="分析"
        description="按日期范围查看工时趋势和分布。"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setPastDays(30)}>近 30 天</Button>
            <Button variant="ghost" onClick={setThisMonth}>本月</Button>
            <Button variant="ghost" onClick={setLastMonth}>上月</Button>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="w-36" aria-label="开始日期" />
            <span className="text-xs font-medium text-muted">至</span>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="w-36" aria-label="结束日期" />
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard label="总工时" value={`${totalHours.toFixed(1)}h`} hint={`${start} 至 ${end}`} />
        <StatCard label="记录天数" value={String(activeDays)} hint={`范围共 ${spanDays} 天`} />
        <StatCard label="日均工时" value={`${avgDailyHours.toFixed(1)}h`} hint="按有记录日期计算" />
        <StatCard label="关联项目" value={String(projectCount)} hint={`${entries.length} 条正式记录`} />
      </div>
      <Card className="mt-5">
        <CardHeader title={trendTitle} action={<Badge tone="blue">{totalHours.toFixed(1)}h</Badge>} />
        <div className="p-4">
          <TrendBarChart entries={entries} startDate={start} endDate={end} />
        </div>
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {pieCards.map((card) => (
          <Card key={card.dimension}>
            <CardHeader title={card.title} />
            <div className="p-4">
              {entries.length ? <BreakdownPieChart entries={entries} dimension={card.dimension} /> : <EmptyState icon={<ChartPie className="size-5" />} title="暂无数据" text="选择包含正式工时的日期范围。" />}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function dateDistance(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

function ImportExportPage({ state, month, save, setNotice }: PageProps) {
  const [importing, setImporting] = useState<"excel" | "json" | null>(null);
  const templateSignature = (template: WorkTemplate) => [template.workNature, template.workCategory, template.projectName || "", template.workForm, template.remark || "", template.scheduleKind].join("\u0001");
  const handleFile = async (event: ChangeEvent<HTMLInputElement>, kind: "excel" | "json") => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImporting(kind);
      setNotice("正在导入文件");
      const result = kind === "excel" ? await importExcelWorkbook(file) : await importConfigJson(file);
      const retainedProjects = kind === "excel" ? state.projects.filter((project) => project.source !== "excel") : state.projects;
      const projectNames = new Set(retainedProjects.map((project) => project.name));
      const newProjects = (result.projects || []).filter((project) => !projectNames.has(project.name));
      const retainedTemplates = kind === "excel" ? state.templates.filter((template) => !template.id.startsWith("template_xlsx_")) : state.templates;
      const templateNames = new Set(retainedTemplates.map(templateSignature));
      const newTemplates = (result.templates || []).filter((template) => { const key = templateSignature(template); if (templateNames.has(key)) return false; templateNames.add(key); return true; });
      const entries = kind === "excel" ? mergeContinuousEntries([...state.entries.filter((entry) => entry.source !== "excel"), ...(result.entries || [])]) : result.entries ? mergeContinuousEntries([...state.entries, ...result.entries]) : state.entries;
      await save({ projects: [...newProjects, ...retainedProjects], templates: [...newTemplates, ...retainedTemplates], entries, jobs: [...result.jobs, ...state.jobs] }, result.summary);
    } catch (error) {
      const job = { id: createId("job"), kind: kind === "excel" ? "excel_import" as const : "json_import" as const, fileName: file.name, status: "failed" as const, errorText: String(error), createdAt: now() };
      await save({ jobs: [job, ...state.jobs] }, "导入失败");
    } finally {
      setImporting(null);
      event.target.value = "";
    }
  };
  const exportExcel = async () => {
    const job = exportMonthExcel(state.entries, month);
    await save({ jobs: [job, ...state.jobs] }, job.summary);
  };
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5"><Upload className="mb-4 size-6 text-accent" /><h2 className="font-semibold">导入 Excel</h2><p className="mt-1 text-sm text-muted">导入项目清单、一级二级菜单和 2026 年及以后的月度填报历史。</p><label className="mt-4 inline-flex"><input className="sr-only" type="file" accept=".xlsx,.xls" disabled={Boolean(importing)} onChange={(event) => handleFile(event, "excel")} /><span className="inline-flex h-9 items-center rounded-lg border border-line/10 bg-white/70 px-4 text-sm font-semibold transition hover:bg-white dark:bg-white/10">{importing === "excel" ? "正在导入" : "选择 Excel"}</span></label></Card>
        <Card className="p-5"><Upload className="mb-4 size-6 text-accent" /><h2 className="font-semibold">导入配置</h2><p className="mt-1 text-sm text-muted">导入保存的工作内容配置，转换为可复用模板。</p><label className="mt-4 inline-flex"><input className="sr-only" type="file" accept=".json" disabled={Boolean(importing)} onChange={(event) => handleFile(event, "json")} /><span className="inline-flex h-9 items-center rounded-lg border border-line/10 bg-white/70 px-4 text-sm font-semibold transition hover:bg-white dark:bg-white/10">{importing === "json" ? "正在导入" : "选择 JSON"}</span></label></Card>
        <Card className="p-5"><Download className="mb-4 size-6 text-accent" /><h2 className="font-semibold">导出月度 Excel</h2><p className="mt-1 text-sm text-muted">导出当前月份，字段顺序适配填报文件。</p><Button className="mt-4" variant="primary" onClick={exportExcel}>导出 {month}</Button></Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="导入导出历史" />
        {state.jobs.length === 0 ? <div className="p-5"><EmptyState icon={<FileSpreadsheet className="size-5" />} title="暂无导入导出历史" text="导入文件或导出月度 Excel 后，处理结果会显示在这里。" /></div> : <div className="overflow-auto scrollbar-soft">
          <table className="table-glass w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line/10 text-xs text-muted"><tr><th className="px-5 py-3">时间</th><th className="px-5 py-3">类型</th><th className="px-5 py-3">文件</th><th className="px-5 py-3">结果</th><th className="px-5 py-3">摘要</th></tr></thead>
            <tbody>{state.jobs.map((job) => <tr key={job.id} className="border-b border-line/10"><td className="px-5 py-3 text-muted">{job.createdAt.slice(0, 19).replace("T", " ")}</td><td className="px-5 py-3">{job.kind}</td><td className="px-5 py-3">{job.fileName}</td><td className="px-5 py-3"><Badge tone={job.status === "success" ? "blue" : "red"}>{job.status === "success" ? "成功" : "失败"}</Badge></td><td className="px-5 py-3 text-muted">{job.summary || job.errorText || "-"}</td></tr>)}</tbody>
          </table>
        </div>}
      </Card>
    </>
  );
}

function SettingsPage({ state, save }: PageProps) {
  const [profile, setProfile] = useState(state.profile);
  return (
    <>
      <PageHeader title="设置" description="维护默认作息、主题和显示偏好。" action={<Button variant="primary" onClick={() => save({ profile: { ...profile, updatedAt: now() } }, "设置已保存")}>保存设置</Button>} />
      <Card className="max-w-3xl p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="语言"><Select value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value as WorkspaceState["profile"]["language"] })}><option value="zh-CN">中文</option><option value="en-US">English</option></Select></Field>
          <Field label="默认开始"><Input type="time" value={profile.defaultStart} onChange={(e) => setProfile({ ...profile, defaultStart: e.target.value })} /></Field>
          <Field label="默认结束"><Input type="time" value={profile.defaultEnd} onChange={(e) => setProfile({ ...profile, defaultEnd: e.target.value })} /></Field>
          <Field label="午休开始"><Input type="time" value={profile.lunchStart} onChange={(e) => setProfile({ ...profile, lunchStart: e.target.value })} /></Field>
          <Field label="午休结束"><Input type="time" value={profile.lunchEnd} onChange={(e) => setProfile({ ...profile, lunchEnd: e.target.value })} /></Field>
        </div>
      </Card>
    </>
  );
}

export default App;
