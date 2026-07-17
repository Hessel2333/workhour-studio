import {
  BookOpen,
  CalendarDays,
  ChartPie,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileDown,
  FileUp,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Settings,
  Sun,
  Table2,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { lazy, Suspense, type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TemplateWeightChart } from "./components/Chart";
import { Badge } from "./components/ui/Badge";
import { Button } from "./components/ui/Button";
import { Card, CardHeader } from "./components/ui/Card";
import { EmptyState } from "./components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "./components/ui/Form";
import { GuideDocs } from "./components/GuideDocs";
import { PageHeader } from "./components/ui/PageHeader";
import { createId } from "./data/defaults";
import type { MonthlyTemplateSetting, PageKey, Project, TemplatePreset, ThemeMode, TimesheetEntry, WorkTemplate, WorkspaceState } from "./data/types";
import { generateAutofillEntries } from "./features/autofill";
import { mergeContinuousEntries } from "./features/excel";
import { getEntryProjectColor, getNatureColor, projectColorPalette, stableIndex } from "./features/schedule/presentation";
import {
  applyMonthSettings,
  applyPresetToMonth,
  clampTemplateWeight,
  createMonthlyTemplateSetting,
  createTemplatePreset,
  getAutofillTemplates,
  getMonthTemplateSettings,
  isCommonTemplate,
  isTemplateAllowed,
  normalizeRemarkOptions,
  projectExists,
  requiresLinkedProject,
  templateSignature,
} from "./features/templates/templateState";
import { exportTemplatePresetJson, importTemplatePresetJson } from "./features/workspaceBackup";
import { loadWorkspace, saveStatePatch } from "./lib/db";
import { cn } from "./lib/utils";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import {
  dateForMonthDay,
  dateDistance,
  daysInMonth,
  durationHours,
  fromMinutes,
  getStartOfWeek,
  getWeekDates,
  getWeekday,
  monthKey,
  overlaps,
  shiftDate,
  toIsoDate,
  toMinutes,
} from "./lib/time";

const ImportExportPage = lazy(() =>
  import("./pages/ImportExportPage").then((module) => ({ default: module.ImportExportPage })),
);

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
  事务性工作: ["会议", "出差", "实验室日常维护", "财务报销", "HSE管理", "其他事务性", "来访接待", "党工团"],
  请假: ["请假"],
};
const standardWorkFormOptions = ["测试实验", "合成实验", "文字撰写", "基地会议", "客户走访", "学术会议", "行业会议", "其他外出交流", "学习培训", "自由交流", "资料调研", "样品寄送", "物资采购", "其他"];
const workFormOptionsByNature: Record<string, string[]> = {
  科研工作: standardWorkFormOptions,
  事务性工作: standardWorkFormOptions,
  请假: [],
};
const workCategoryOptions = [...new Set(Object.values(workCategoryOptionsByNature).flat())];
const workFormOptions = [...new Set(Object.values(workFormOptionsByNature).flat())];
const projectCategoryOptions = ["总部项目", "公司项目", "院控项目", "探索项目"];
const validProjectCategories = new Set(projectCategoryOptions);
const projectOwnerOptions: Array<{ value: NonNullable<Project["ownerScope"]>; label: string }> = [
  { value: "self", label: "本人负责" },
  { value: "other", label: "他人负责" },
];
const weekTimelineStart = 7 * 60;
const weekTimelineEnd = 20 * 60;
const weekSlotHeight = 30;
const weekHeaderOffset = 52;
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

type ScheduleClipboard = {
  entries: TimesheetEntry[];
  sourceDates: string[];
  sourceEntryIds: string[];
  copiedAt: string;
};

type ScheduleSlotSelection = {
  date: string;
  minute: number;
};

type ScheduleDateSelectionIntent = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

const getWorkCategoryOptions = (workNature: string) => workCategoryOptionsByNature[workNature] || workCategoryOptions;
const getWorkFormOptions = (workNature: string) => workFormOptionsByNature[workNature] || workFormOptions;
const withCurrentOption = (options: string[], current?: string) => current && !options.includes(current) ? [current, ...options] : options;
const legacyTransactionalNature = "\u975e\u79d1\u7814\u5de5\u4f5c";
const normalizeWorkNatureValue = (value: string) => value === legacyTransactionalNature ? "事务性工作" : value || "事务性工作";
const formatNatureForm = (workNature: string, workForm?: string) => workForm ? `${workNature} · ${workForm}` : workNature;
const formatCategoryForm = (workCategory: string, workForm?: string) => workForm ? `${workCategory} / ${workForm}` : workCategory;

function normalizeProjectCategory(name = "", code = "", category = "") {
  const raw = `${category} ${code} ${name}`.toUpperCase();
  if (validProjectCategories.has(category)) return category;
  if (raw.includes("NM")) return "院控项目";
  if (raw.includes("KF") || raw.includes("KY")) return "公司项目";
  if (raw.includes("总部")) return "总部项目";
  if (raw.includes("公司")) return "公司项目";
  if (raw.includes("院控")) return "院控项目";
  if (raw.includes("探索")) return "探索项目";
  return "探索项目";
}

function getProjectOptions(projects: Project[], workCategory: string) {
  const activeProjects = projects.filter((project) => project.status !== "closed");
  if (projectCategoryOptions.includes(workCategory)) return activeProjects.filter((project) => project.category === workCategory);
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

function sanitizeWorkspaceData(workspace: WorkspaceState) {
  const normalizedProjects = workspace.projects.map((project) => {
    const category = normalizeProjectCategory(project.name, project.code, project.category);
    const movedRemark = validProjectCategories.has(project.category) ? "" : project.category;
    const remark = [project.remark, movedRemark].map((item) => item?.trim()).filter(Boolean).join(" / ") || undefined;
    return {
      ...project,
      category,
      remark,
      ownerScope: project.ownerScope === "other" ? "other" as const : "self" as const,
    };
  });
  const normalizeProjectName = (projectName?: string) => projectExists(normalizedProjects, projectName) ? projectName : "备注";
  const normalizedEntries = workspace.entries
    .filter((entry) => entry.workDate >= "2026-01-01")
    .map((entry) => ({
      ...entry,
      status: "confirmed" as const,
      workNature: normalizeWorkNatureValue(entry.workNature),
      projectName: entry.source === "autofill" ? normalizeProjectName(entry.projectName) : entry.projectName,
    }));
  const normalizedTemplates = workspace.templates
    .map((template) => ({
      ...template,
      workNature: normalizeWorkNatureValue(template.workNature),
      remarkOptions: normalizeRemarkOptions(template),
      projectName: normalizeProjectName(template.projectName),
      projectId: projectExists(workspace.projects, template.projectName) ? template.projectId : undefined,
      weight: clampTemplateWeight(template.weight),
      enabled: Boolean(template.enabled),
      archived: Boolean(template.archived),
    }))
    .filter((template) => isTemplateAllowed(template, workspace.projects));
  const normalizedBlocks = workspace.blocks.filter((block) => block.workDate >= "2026-01-01");
  const normalizedJobs = workspace.jobs.filter((job) => !job.periodEnd || job.periodEnd >= "2026-01");
  const templateIds = new Set(normalizedTemplates.map((template) => template.id));
  const normalizedMonthlyTemplateSettings = (workspace.monthlyTemplateSettings || [])
    .filter((setting) => templateIds.has(setting.templateId))
    .map((setting) => ({
      ...setting,
      enabled: Boolean(setting.enabled),
      weight: clampTemplateWeight(setting.weight),
    }));
  const normalizedTemplatePresets = (workspace.templatePresets || [])
    .map((preset) => ({
      ...preset,
      name: preset.name?.trim() || "未命名方案",
      settings: (preset.settings || [])
        .filter((setting) => templateIds.has(setting.templateId))
        .map((setting) => ({
          templateId: setting.templateId,
          enabled: Boolean(setting.enabled),
          weight: clampTemplateWeight(setting.weight),
        })),
    }))
    .filter((preset) => preset.settings.length);

  const changed =
    !(workspace.templatePresets) ||
    !(workspace.monthlyTemplateSettings) ||
    normalizedEntries.length !== workspace.entries.length ||
    normalizedEntries.some((entry, index) => entry.status !== workspace.entries[index]?.status || entry.workNature !== workspace.entries[index]?.workNature || entry.projectName !== workspace.entries[index]?.projectName) ||
    normalizedProjects.some((project, index) =>
      project.category !== workspace.projects[index]?.category ||
      project.remark !== workspace.projects[index]?.remark ||
      project.ownerScope !== (workspace.projects[index]?.ownerScope ?? "self")) ||
    normalizedTemplates.length !== workspace.templates.length ||
    normalizedTemplates.some((template, index) =>
      template.workNature !== workspace.templates[index]?.workNature ||
      template.projectName !== workspace.templates[index]?.projectName ||
      template.projectId !== workspace.templates[index]?.projectId ||
      template.weight !== clampTemplateWeight(workspace.templates[index]?.weight || 10) ||
      template.enabled !== Boolean(workspace.templates[index]?.enabled) ||
      template.archived !== Boolean(workspace.templates[index]?.archived) ||
      (template.remarkOptions || []).join("\u0001") !== (workspace.templates[index]?.remarkOptions || []).join("\u0001")) ||
    normalizedBlocks.length !== workspace.blocks.length ||
    normalizedJobs.length !== workspace.jobs.length ||
    normalizedMonthlyTemplateSettings.length !== (workspace.monthlyTemplateSettings || []).length ||
    normalizedMonthlyTemplateSettings.some((setting, index) =>
      setting.enabled !== Boolean((workspace.monthlyTemplateSettings || [])[index]?.enabled) ||
      setting.weight !== clampTemplateWeight((workspace.monthlyTemplateSettings || [])[index]?.weight || 10)) ||
    normalizedTemplatePresets.length !== (workspace.templatePresets || []).length;

  return {
    changed,
    patch: {
      entries: normalizedEntries,
      projects: normalizedProjects,
      templates: normalizedTemplates,
      monthlyTemplateSettings: normalizedMonthlyTemplateSettings,
      templatePresets: normalizedTemplatePresets,
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
  const initialScheduleDate = new Date().toISOString().slice(0, 10);
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [page, setPage] = useState<PageKey>("dashboard");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [scheduleMode, setScheduleMode] = useState<"day" | "week">("week");
  const [scheduleDate, setScheduleDate] = useState(initialScheduleDate);
  const [scheduleSelectedDates, setScheduleSelectedDates] = useState<string[]>([initialScheduleDate]);
  const [scheduleSelectionAnchorDate, setScheduleSelectionAnchorDate] = useState(initialScheduleDate);
  const [scheduleSelectedEntryId, setScheduleSelectedEntryId] = useState<string | null>(null);
  const [scheduleSelectedSlot, setScheduleSelectedSlot] = useState<ScheduleSlotSelection | null>(null);
  const [scheduleClipboard, setScheduleClipboard] = useState<ScheduleClipboard | null>(null);
  const [scheduleUndoEntries, setScheduleUndoEntries] = useState<TimesheetEntry[] | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    loadWorkspace()
      .then(async (workspace) => {
        const sanitized = sanitizeWorkspaceData(workspace);
        const patch: Partial<WorkspaceState> = {};
        if (sanitized.changed) {
          Object.assign(patch, sanitized.patch);
        }
        if (Object.keys(patch).length > 0) {
          const next = await saveStatePatch(patch, workspace);
          setState(next);
          applyTheme(next.profile.theme);
          return;
        }
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

  const focusScheduleDate = (date: string) => {
    if (!date) return;
    setScheduleDate(date);
    setScheduleSelectedDates([date]);
    setScheduleSelectionAnchorDate(date);
    setScheduleSelectedEntryId(null);
    setScheduleSelectedSlot(null);
  };

  const changeScheduleMode = (mode: "day" | "week") => {
    setScheduleMode(mode);
    if (mode === "day") setScheduleSelectedDates([scheduleDate]);
  };

  const selectScheduleDateColumn = (date: string, intent: ScheduleDateSelectionIntent = {}) => {
    setScheduleDate(date);
    setScheduleSelectedEntryId(null);
    setScheduleSelectedSlot(null);
    const isAdditive = Boolean(intent.ctrlKey || intent.metaKey);
    if (intent.shiftKey) {
      const weekDates = getWeekDates(date);
      const anchor = weekDates.includes(scheduleSelectionAnchorDate) ? scheduleSelectionAnchorDate : weekDates[0];
      const start = Math.min(weekDates.indexOf(anchor), weekDates.indexOf(date));
      const end = Math.max(weekDates.indexOf(anchor), weekDates.indexOf(date));
      setScheduleSelectedDates(weekDates.slice(start, end + 1));
      return;
    }
    if (isAdditive) {
      setScheduleSelectedDates((dates) => {
        const next = dates.includes(date) ? dates.filter((item) => item !== date) : [...dates, date];
        return next.length ? next.sort() : [date];
      });
      setScheduleSelectionAnchorDate(date);
      return;
    }
    setScheduleSelectedDates([date]);
    setScheduleSelectionAnchorDate(date);
  };

  const toggleScheduleWeekSelection = () => {
    setScheduleSelectedEntryId(null);
    setScheduleSelectedSlot(null);
    const weekDates = getWeekDates(scheduleDate);
    const selectedSet = new Set(scheduleSelectedDates);
    const isWeekSelected = weekDates.every((date) => selectedSet.has(date));
    setScheduleSelectedDates(isWeekSelected ? [scheduleDate] : weekDates);
    setScheduleSelectionAnchorDate(isWeekSelected ? scheduleDate : weekDates[0]);
  };

  const selectScheduleEntry = (entryId: string | null) => {
    setScheduleSelectedEntryId(entryId);
    if (entryId) {
      setScheduleSelectedSlot(null);
      setScheduleSelectedDates([]);
    }
  };

  const selectScheduleSlot = (slot: ScheduleSlotSelection | null) => {
    setScheduleSelectedSlot(slot);
    if (slot) {
      setScheduleSelectedEntryId(null);
      setScheduleSelectedDates([]);
    }
  };

  const selectedScheduleDates = scheduleSelectedDates;
  const selectedScheduleDateSet = new Set(selectedScheduleDates);
  const selectedScheduleEntryCount = state?.entries.filter((entry) => selectedScheduleDateSet.has(entry.workDate)).length || 0;
  const selectedScheduleEntry = state && scheduleSelectedEntryId ? state.entries.find((entry) => entry.id === scheduleSelectedEntryId) : undefined;
  const canCopySchedule = Boolean(selectedScheduleEntry) || selectedScheduleEntryCount > 0;
  const canDeleteScheduleSelection = Boolean(selectedScheduleEntry) || selectedScheduleEntryCount > 0;
  const deleteScheduleTitle = selectedScheduleEntry
    ? `删除选中日程 ${selectedScheduleEntry.startTime}-${selectedScheduleEntry.endTime}`
    : `已选 ${selectedScheduleDates.length} 天，${selectedScheduleEntryCount} 条记录`;
  const clipboardSummary = scheduleClipboard
    ? scheduleClipboard.sourceDates.length === 1 && scheduleClipboard.entries.length === 1
      ? "已复制 1 条"
      : `已复制 ${scheduleClipboard.sourceDates.length} 天 · ${scheduleClipboard.entries.length} 条`
    : "";
  const pasteScheduleTitle = scheduleSelectedSlot
    ? `粘贴到 ${scheduleSelectedSlot.date} ${fromMinutes(scheduleSelectedSlot.minute)}`
    : (clipboardSummary || "暂无复制内容");

  const copyScheduleSelection = () => {
    if (!state) return;
    const selectedEntry = scheduleSelectedEntryId ? state.entries.find((entry) => entry.id === scheduleSelectedEntryId) : undefined;
    const entries = selectedEntry
      ? [selectedEntry]
      : state.entries.filter((entry) => selectedScheduleDateSet.has(entry.workDate)).sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
    if (!entries.length) {
      setNotice("没有可复制的日程");
      return;
    }
    setScheduleClipboard({
      entries,
      sourceDates: [...new Set(entries.map((entry) => entry.workDate))].sort(),
      sourceEntryIds: selectedEntry ? [selectedEntry.id] : entries.map((entry) => entry.id),
      copiedAt: now(),
    });
    setNotice(selectedEntry ? "已复制 1 条日程" : `已复制 ${new Set(entries.map((entry) => entry.workDate)).size} 天 · ${entries.length} 条记录`);
  };

  const pasteScheduleClipboard = async () => {
    if (!state || !scheduleClipboard) return;
    if (scheduleSelectedSlot) {
      const earliestMinute = Math.min(...scheduleClipboard.entries.map((entry) => toMinutes(entry.startTime)));
      const pasted: TimesheetEntry[] = [];
      let skipped = 0;
      scheduleClipboard.entries.forEach((entry) => {
        const duration = toMinutes(entry.endTime) - toMinutes(entry.startTime);
        const offset = toMinutes(entry.startTime) - earliestMinute;
        const range = clampInteractiveRange(scheduleSelectedSlot.minute + offset, scheduleSelectedSlot.minute + offset + duration);
        const startTime = fromMinutes(range.start);
        const endTime = fromMinutes(range.end);
        const conflicts = [...state.entries, ...pasted].some((item) => item.workDate === scheduleSelectedSlot.date && overlaps(startTime, endTime, item.startTime, item.endTime));
        if (conflicts) {
          skipped += 1;
          return;
        }
        pasted.push({
          ...entry,
          id: createId("entry"),
          workDate: scheduleSelectedSlot.date,
          startTime,
          endTime,
          source: "manual",
          exportedAt: undefined,
          createdAt: now(),
          updatedAt: now(),
        });
      });
      if (!pasted.length) {
        setNotice(skipped ? `未粘贴，${skipped} 条记录与已有日程冲突` : "没有可粘贴的日程");
        return;
      }
      setScheduleSelectedSlot(null);
      setScheduleSelectedEntryId(pasted[0].id);
      await saveScheduleEntries(mergeContinuousEntries([...state.entries, ...pasted]), skipped ? `已粘贴 ${pasted.length} 条，跳过 ${skipped} 条冲突` : `已粘贴 ${pasted.length} 条记录`);
      return;
    }
    const targetDates = selectedScheduleDates.length ? [...selectedScheduleDates].sort() : [scheduleDate];
    const sourceDates = scheduleClipboard.sourceDates.length ? scheduleClipboard.sourceDates : [...new Set(scheduleClipboard.entries.map((entry) => entry.workDate))].sort();
    const isSingleSourceDate = sourceDates.length === 1;
    const shouldMapSelectedDates = !isSingleSourceDate && targetDates.length === sourceDates.length;
    const sourceBaseDate = isSingleSourceDate ? sourceDates[0] : getStartOfWeek(sourceDates[0]);
    const targetBaseDate = isSingleSourceDate ? targetDates[0] : getStartOfWeek(targetDates[0]);
    const existingEntries = [...state.entries];
    const pasted: TimesheetEntry[] = [];
    let skipped = 0;

    const targetDateForEntry = (entry: TimesheetEntry) => {
      if (isSingleSourceDate) return targetDates;
      if (shouldMapSelectedDates) {
        const index = sourceDates.indexOf(entry.workDate);
        return [targetDates[index] || targetDates[0]];
      }
      const offset = dateDistance(sourceBaseDate, entry.workDate);
      return [shiftDate(targetBaseDate, offset)];
    };

    scheduleClipboard.entries.forEach((entry) => {
      targetDateForEntry(entry).forEach((workDate) => {
        const conflicts = [...existingEntries, ...pasted].some((item) => item.workDate === workDate && overlaps(entry.startTime, entry.endTime, item.startTime, item.endTime));
        if (conflicts) {
          skipped += 1;
          return;
        }
        pasted.push({
          ...entry,
          id: createId("entry"),
          workDate,
          source: "manual",
          exportedAt: undefined,
          createdAt: now(),
          updatedAt: now(),
        });
      });
    });

    if (!pasted.length) {
      setNotice(skipped ? `未粘贴，${skipped} 条记录与已有日程冲突` : "没有可粘贴的记录");
      return;
    }
    setScheduleSelectedEntryId(null);
    await saveScheduleEntries(mergeContinuousEntries([...state.entries, ...pasted]), skipped ? `已粘贴 ${pasted.length} 条，跳过 ${skipped} 条冲突` : `已粘贴 ${pasted.length} 条记录`);
  };

  const deleteSelectedScheduleDates = async () => {
    if (!state) return;
    if (selectedScheduleEntry) {
      setScheduleSelectedEntryId(null);
      await saveScheduleEntries(state.entries.filter((entry) => entry.id !== selectedScheduleEntry.id), "已删除选中日程");
      return;
    }
    const dateSet = new Set(selectedScheduleDates);
    const count = state.entries.filter((entry) => dateSet.has(entry.workDate)).length;
    if (!count) return;
    if (dateSet.size === 1) {
      await saveScheduleEntries(state.entries.filter((entry) => !dateSet.has(entry.workDate)), "已删除当日日程");
      return;
    }
    confirmAction({
      title: "删除选中记录？",
      text: `选中的 ${dateSet.size} 天共 ${count} 条记录会被移除，可在日程页撤销最近一次日程操作。`,
      confirmText: "删除",
      onConfirm: async () => {
        await saveScheduleEntries(state.entries.filter((entry) => !dateSet.has(entry.workDate)), "已删除选中记录");
      },
    });
  };

  useEffect(() => {
    if (page !== "schedule") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void deleteSelectedScheduleDates();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        copyScheduleSelection();
      }
      if (key === "v") {
        event.preventDefault();
        void pasteScheduleClipboard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [page, state, scheduleSelectedEntryId, scheduleSelectedDates, scheduleSelectedSlot, scheduleClipboard, scheduleDate]);

  const generateSelectedScheduleEntries = async () => {
    if (!state) return;
    const dateSet = new Set(selectedScheduleDates);
    const months = [...new Set([...dateSet].map((date) => date.slice(0, 7)))];
    const seedSalt = Date.now() % 1_000_000;
    const generatedEntries = months
      .flatMap((item) => generateAutofillEntries(item, state.profile, getAutofillTemplates(state, item), state.entries, seedSalt))
      .filter((entry) => dateSet.has(entry.workDate));
    if (!generatedEntries.length) {
      setNotice("选中日期没有可补全空档");
      return;
    }
    await saveScheduleEntries([...state.entries, ...generatedEntries], `已补全选中日期 ${generatedEntries.length} 条记录`);
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

  const pageProps = {
    state,
    month,
    save,
    saveScheduleEntries,
    setNotice,
    confirmAction,
    scheduleMode,
    setScheduleMode: changeScheduleMode,
    scheduleDate,
    setScheduleDate: focusScheduleDate,
    scheduleSelectedDates: selectedScheduleDates,
    scheduleSelectedEntryId,
    setScheduleSelectedEntryId: selectScheduleEntry,
    scheduleSelectedSlot,
    setScheduleSelectedSlot: selectScheduleSlot,
    scheduleClipboard,
    onToggleScheduleDate: selectScheduleDateColumn,
    onToggleScheduleWeekSelection: toggleScheduleWeekSelection,
  };
  const currentPage = pages.find((item) => item.key === page);

  return (
    <div className="app-grid">
      <aside className="sidebar-shell hidden px-3 py-4 md:flex md:flex-col">
        <div className="sidebar-brand mb-6 px-2 pb-3">
          <div className="brand-mark text-white"><Clock3 className="size-3.5" /></div>
          <div>
            <div className="text-base font-bold tracking-[-0.03em] text-ink">Workhour Studio</div>
          </div>
        </div>
        <nav className="space-y-1.5">
          {pages.filter((item) => item.key !== "guide").map((item) => (
            <button key={item.key} onClick={() => setPage(item.key)} aria-current={page === item.key ? "page" : undefined} className={cn("nav-item w-full", page === item.key && "active")}>
              <item.icon className="nav-item-icon" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-1.5 px-1 pb-3">
          <button onClick={() => setPage("guide")} aria-current={page === "guide" ? "page" : undefined} className={cn("nav-item w-full", page === "guide" && "active")}>
            <BookOpen className="nav-item-icon" />
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
        <header className="main-toolbar sticky top-0 z-20">
          <div className="titlebar-inner">
            <div className="titlebar-leading">
              <div className="flex items-center gap-2 md:hidden">
                <Clock3 className="size-5 text-accent" />
                <span className="titlebar-title">{currentPage?.label}</span>
              </div>
              <div className="hidden md:block">
                <div className="titlebar-title">{currentPage?.label}</div>
              </div>
            </div>
            <div className="titlebar-actions">
              <div className="titlebar-system-actions">
                {page === "schedule" ? (
                  <ScheduleTitleToolbar
                    mode={scheduleMode}
                    selectedDate={scheduleDate}
                    selectedCount={selectedScheduleDates.length}
                    selectedEntryCount={selectedScheduleEntryCount}
                    selectedEntryLabel={selectedScheduleEntry ? `${selectedScheduleEntry.startTime}-${selectedScheduleEntry.endTime}` : ""}
                    canCopy={canCopySchedule}
                    canPaste={Boolean(scheduleClipboard)}
                    canDelete={canDeleteScheduleSelection}
                    deleteTitle={deleteScheduleTitle}
                    clipboardSummary={clipboardSummary}
                    pasteTitle={pasteScheduleTitle}
                    onModeChange={changeScheduleMode}
                    onDateChange={focusScheduleDate}
                    canUndo={Boolean(scheduleUndoEntries)}
                    onUndo={undoScheduleAction}
                    onCopy={copyScheduleSelection}
                    onPaste={pasteScheduleClipboard}
                    onGenerateSelected={generateSelectedScheduleEntries}
                    onDeleteSelected={deleteSelectedScheduleDates}
                  />
                ) : ["dashboard", "timesheet", "importExport"].includes(page) ? (
                  <div className="pill-control p-1">
                    <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-8 w-36 border-0 bg-white/90 text-center shadow-sm dark:bg-white/10" />
                  </div>
                ) : null}
              </div>
              <div id="page-titlebar-actions" className="titlebar-page-actions" />
            </div>
          </div>
        </header>

        <div className="main-stage">
          <MobileNav active={page} onChange={setPage} />
          {page === "dashboard" && <DashboardPage state={state} month={month} save={save} />}
          {page === "schedule" && <SchedulePage {...pageProps} />}
          {page === "projects" && <ProjectsPage {...pageProps} />}
          {page === "templates" && <TemplatesPage {...pageProps} />}
          {page === "timesheet" && <TimesheetPage {...pageProps} />}
          {page === "analytics" && <AnalyticsPage {...pageProps} />}
          {page === "guide" && <GuideDocs />}
          {page === "importExport" && (
            <Suspense fallback={<div className="p-6 text-sm text-muted">正在加载导入导出…</div>}>
              <ImportExportPage state={state} month={month} save={save} setNotice={setNotice} />
            </Suspense>
          )}
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
    <div className={cn("pill-control theme-switch flex p-1", compact && "w-full justify-center")} role="group" aria-label="主题切换">
      {[
        { key: "light", icon: Sun, label: "浅色" },
        { key: "dark", icon: Moon, label: "深色" },
        { key: "system", icon: Settings, label: "系统" },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.key} title={item.label} aria-label={item.label} onClick={() => onChange(item.key as ThemeMode)} className={cn("flex size-8 items-center justify-center rounded-full text-muted transition hover:text-ink", value === item.key && "bg-white text-ink shadow-sm dark:bg-white/15")}>
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
  selectedCount,
  selectedEntryCount,
  selectedEntryLabel,
  canCopy,
  canPaste,
  canDelete,
  deleteTitle,
  clipboardSummary,
  pasteTitle,
  onModeChange,
  onDateChange,
  canUndo,
  onUndo,
  onCopy,
  onPaste,
  onGenerateSelected,
  onDeleteSelected,
}: {
  mode: "day" | "week";
  selectedDate: string;
  selectedCount: number;
  selectedEntryCount: number;
  selectedEntryLabel: string;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  deleteTitle: string;
  clipboardSummary: string;
  pasteTitle: string;
  onModeChange: (mode: "day" | "week") => void;
  onDateChange: (date: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onGenerateSelected: () => void;
  onDeleteSelected: () => void;
}) {
  const copyTitle = selectedEntryLabel ? `复制选中日程 ${selectedEntryLabel}` : `复制选中 ${selectedCount} 天，${selectedEntryCount} 条记录`;

  return (
    <div className="title-schedule-toolbar schedule-title-toolbar">
      <div className="schedule-toolbar-left">
        <button className="toolbar-month-chip">{selectedDate.slice(0, 7).replace("-", "年")}月</button>
        <div className="toolbar-segmented">
          <button className={cn(mode === "day" && "active")} onClick={() => onModeChange("day")}>日视图</button>
          <button className={cn(mode === "week" && "active")} onClick={() => onModeChange("week")}>周视图</button>
        </div>
      </div>
      <div className="toolbar-date-nav schedule-period-nav">
        <button className="toolbar-icon-button" onClick={() => onDateChange(shiftDate(selectedDate, mode === "week" ? -7 : -1))} aria-label={mode === "week" ? "上一周" : "上一天"}><ChevronLeft className="size-4" /></button>
        <Input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
        <button className="toolbar-icon-button" onClick={() => onDateChange(shiftDate(selectedDate, mode === "week" ? 7 : 1))} aria-label={mode === "week" ? "下一周" : "下一天"}><ChevronRight className="size-4" /></button>
      </div>
      <div className="schedule-toolbar-right">
        <button className="toolbar-soft-button" disabled={!canUndo} onClick={onUndo}>撤销</button>
        <button className="toolbar-soft-button" disabled={!canCopy} title={copyTitle} onClick={onCopy}>复制</button>
        <button className="toolbar-soft-button" disabled={!canPaste} title={pasteTitle} onClick={onPaste}>粘贴</button>
        {clipboardSummary ? <span className="toolbar-copy-status">{clipboardSummary}</span> : null}
        <button className="toolbar-soft-button" title={`已选 ${selectedCount} 天`} onClick={onGenerateSelected}>补全选中</button>
        <button className="toolbar-soft-button" onClick={() => onDateChange(new Date().toISOString().slice(0, 10))}>回到本周</button>
        <button className="toolbar-danger-button" disabled={!canDelete} title={deleteTitle} onClick={onDeleteSelected}>删除选中</button>
      </div>
    </div>
  );
}

function shiftMonth(date: string, diffMonths: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setMonth(next.getMonth() + diffMonths);
  return toIsoDate(next);
}

function TemplateMonthNav({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const monthDate = `${month}-01`;
  return (
    <div className="toolbar-date-nav template-month-nav">
      <button className="toolbar-icon-button" onClick={() => onChange(shiftMonth(monthDate, -1).slice(0, 7))} aria-label="上个月"><ChevronLeft className="size-4" /></button>
      <Input type="month" value={month} onChange={(event) => onChange(event.target.value)} />
      <button className="toolbar-icon-button" onClick={() => onChange(shiftMonth(monthDate, 1).slice(0, 7))} aria-label="下个月"><ChevronRight className="size-4" /></button>
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
  scheduleSelectedDates: string[];
  scheduleSelectedEntryId: string | null;
  setScheduleSelectedEntryId: (entryId: string | null) => void;
  scheduleSelectedSlot: ScheduleSlotSelection | null;
  setScheduleSelectedSlot: (slot: ScheduleSlotSelection | null) => void;
  scheduleClipboard: ScheduleClipboard | null;
  onToggleScheduleDate: (date: string, intent?: ScheduleDateSelectionIntent) => void;
  onToggleScheduleWeekSelection: () => void;
  save: (patch: Partial<WorkspaceState>, message?: string) => Promise<void>;
  saveScheduleEntries: (entries: TimesheetEntry[], message: string) => Promise<void>;
  setNotice: (value: string) => void;
  confirmAction: (request: ConfirmRequest) => void;
};

function ProjectSelect({
  value,
  projects,
  workCategory,
  required = false,
  onChange,
}: {
  value?: string;
  projects: Project[];
  workCategory: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const options = getProjectOptions(projects, workCategory);
  const normalizedValue = required ? value || "" : value || "备注";
  const keepsCurrentValue = Boolean(normalizedValue) && normalizedValue !== "备注" && !options.some((project) => project.name === normalizedValue);

  return (
    <Select value={normalizedValue} onChange={(event) => onChange(event.target.value)}>
      {required ? <option value="">选择项目</option> : <option value="备注">备注 / 不关联项目</option>}
      {keepsCurrentValue ? <option value={normalizedValue}>{normalizedValue}</option> : null}
      {options.map((project) => (
        <option key={project.id} value={project.name}>{project.name}</option>
      ))}
    </Select>
  );
}

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
    }
  | {
      type: "create";
      date: string;
      originClientX: number;
      originClientY: number;
      startMinute: number;
      nextMinute: number;
      hasDragged: boolean;
    };

type SchedulePaletteDrag =
  | { kind: "project"; id: string }
  | { kind: "template"; id: string };

type SchedulePalettePointerDrag = SchedulePaletteDrag & {
  originClientX: number;
  originClientY: number;
  clientX: number;
  clientY: number;
  hasDragged: boolean;
};

type ScheduleDropPreview = {
  date: string;
  kind: SchedulePaletteDrag["kind"];
  id: string;
  startMinute: number;
  endMinute: number;
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

const createScheduleDragPreview = (title: string, badge: string) => {
  const preview = document.createElement("div");
  const chip = document.createElement("span");
  const label = document.createElement("strong");
  preview.className = "worktrail-drag-preview";
  chip.textContent = badge;
  label.textContent = title;
  preview.append(chip, label);
  document.body.append(preview);
  return preview;
};

function SchedulePage({
  state,
  month,
  save,
  saveScheduleEntries,
  setNotice,
  confirmAction,
  scheduleMode: mode,
  scheduleDate: selectedDate,
  setScheduleDate: setSelectedDate,
  scheduleSelectedDates,
    scheduleSelectedEntryId,
    setScheduleSelectedEntryId: selectScheduleEntry,
    scheduleSelectedSlot,
    setScheduleSelectedSlot: selectScheduleSlot,
    scheduleClipboard,
  onToggleScheduleDate,
  onToggleScheduleWeekSelection,
}: PageProps) {
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
      <PageHeader title="日程" description="按日或按周维护时间块，自动补全后可直接调整。" />
      {mode === "week" ? (
        <WeekSchedule
          state={state}
          selectedDate={selectedDate}
          selectedDates={scheduleSelectedDates}
          selectedEntryId={scheduleSelectedEntryId}
          selectedSlot={scheduleSelectedSlot}
          clipboard={scheduleClipboard}
          onSelectDate={setSelectedDate}
          onSelectEntry={selectScheduleEntry}
          onSelectSlot={selectScheduleSlot}
          onToggleDate={onToggleScheduleDate}
          onToggleWeekSelection={onToggleScheduleWeekSelection}
          save={save}
          saveScheduleEntries={saveScheduleEntries}
          setNotice={setNotice}
          confirmAction={confirmAction}
        />
      ) : (
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
                      {slot.entry ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{slot.entry.remark || slot.entry.projectName || slot.entry.workCategory}</span><Badge tone="blue">记录</Badge></div> : "空白"}
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
  selectedDates,
  selectedEntryId,
  selectedSlot,
  clipboard,
  onSelectDate,
  onSelectEntry,
  onSelectSlot,
  onToggleDate,
  onToggleWeekSelection,
  save,
  saveScheduleEntries,
  setNotice,
  confirmAction,
}: {
  state: WorkspaceState;
  selectedDate: string;
  selectedDates: string[];
  selectedEntryId: string | null;
  selectedSlot: ScheduleSlotSelection | null;
  clipboard: ScheduleClipboard | null;
  onSelectDate: (date: string) => void;
  onSelectEntry: (entryId: string | null) => void;
  onSelectSlot: (slot: ScheduleSlotSelection | null) => void;
  onToggleDate: (date: string, intent?: ScheduleDateSelectionIntent) => void;
  onToggleWeekSelection: () => void;
  save: (patch: Partial<WorkspaceState>, message?: string) => Promise<void>;
  saveScheduleEntries: (entries: TimesheetEntry[], message: string) => Promise<void>;
  setNotice: (value: string) => void;
  confirmAction: (request: ConfirmRequest) => void;
}) {
  const suppressClickUntilRef = useRef(0);
  const interactionRef = useRef<ScheduleInteraction | null>(null);
  const interactionFrameRef = useRef<number | null>(null);
  const paletteDragRef = useRef<SchedulePalettePointerDrag | null>(null);
  const paletteFrameRef = useRef<number | null>(null);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [interaction, setInteraction] = useState<ScheduleInteraction | null>(null);
  const [draggingPaletteItem, setDraggingPaletteItem] = useState<SchedulePaletteDrag | null>(null);
  const [dropPreview, setDropPreview] = useState<ScheduleDropPreview | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [dragSelectingDate, setDragSelectingDate] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [editingFixedProject, setEditingFixedProject] = useState<Project | null>(null);
  const [isAddingFixedProject, setIsAddingFixedProject] = useState(false);
  const weekDates = getWeekDates(selectedDate);
  const selectedDateSet = new Set(selectedDates);
  const isWeekSelected = weekDates.every((date) => selectedDateSet.has(date));
  const today = toIsoDate(currentTime);
  const currentMinute = currentTime.getHours() * 60 + currentTime.getMinutes();
  const showCurrentTimeLine = currentMinute >= weekTimelineStart && currentMinute <= weekTimelineEnd;
  const timeSlots = Array.from({ length: (weekTimelineEnd - weekTimelineStart) / 30 }, (_, index) => weekTimelineStart + index * 30);
  const hourMarkers = Array.from({ length: (weekTimelineEnd - weekTimelineStart) / 60 + 1 }, (_, index) => weekTimelineStart + index * 60);
  const weekEntries = state.entries.filter((entry) => weekDates.includes(entry.workDate)).sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const entriesByDate = new Map(weekDates.map((date) => [date, weekEntries.filter((entry) => entry.workDate === date)]));
  const favoriteProjects = state.projects.filter((project) => project.isFavorite);
  const quickTemplates = getAutofillTemplates(state, selectedDate.slice(0, 7)).slice(0, 3);
  const editingEntry = editingEntryId ? state.entries.find((entry) => entry.id === editingEntryId) : undefined;
  const copiedEntryIds = new Set(clipboard?.sourceEntryIds || []);
  const copiedDates = new Set(clipboard?.sourceDates || []);
  const movingPreview = (() => {
    if (!interaction || interaction.type !== "move" || !interaction.hasDragged) return undefined;
    const entry = weekEntries.find((item) => item.id === interaction.entryId);
    if (!entry) return undefined;
    const range = clampInteractiveRange(interaction.nextStart, interaction.nextStart + interaction.duration);
    return { ...entry, workDate: interaction.date, startTime: fromMinutes(range.start), endTime: fromMinutes(range.end) };
  })();
  const createPreview = (() => {
    if (!interaction || interaction.type !== "create" || !interaction.hasDragged) return undefined;
    const range = clampInteractiveRange(Math.min(interaction.startMinute, interaction.nextMinute), Math.max(interaction.startMinute, interaction.nextMinute));
    return { date: interaction.date, startMinute: range.start, endMinute: range.end };
  })();

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  useEffect(() => () => {
    if (interactionFrameRef.current) window.cancelAnimationFrame(interactionFrameRef.current);
    if (paletteFrameRef.current) window.cancelAnimationFrame(paletteFrameRef.current);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dragSelectingDate) return undefined;
    const stopSelecting = () => setDragSelectingDate(null);
    window.addEventListener("pointerup", stopSelecting, { once: true });
    window.addEventListener("pointercancel", stopSelecting, { once: true });
    return () => {
      window.removeEventListener("pointerup", stopSelecting);
      window.removeEventListener("pointercancel", stopSelecting);
    };
  }, [dragSelectingDate]);

  const scheduleInteractionState = (next: ScheduleInteraction | null) => {
    interactionRef.current = next;
    if (interactionFrameRef.current) return;
    interactionFrameRef.current = window.requestAnimationFrame(() => {
      interactionFrameRef.current = null;
      setInteraction(interactionRef.current);
    });
  };

  const finishInteractionState = (next: ScheduleInteraction | null) => {
    interactionRef.current = next;
    if (interactionFrameRef.current) {
      window.cancelAnimationFrame(interactionFrameRef.current);
      interactionFrameRef.current = null;
    }
    setInteraction(next);
  };

  useEffect(() => {
    const clearDragState = () => {
      setDraggingPaletteItem(null);
      setDropPreview(null);
      dragPreviewRef.current?.remove();
      dragPreviewRef.current = null;
    };

    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    return () => {
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
      clearDragState();
    };
  }, []);

  const updateEntry = async (id: string, patch: Partial<TimesheetEntry>, message = "时间块已更新") => {
    await saveScheduleEntries(state.entries.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: now() } : entry)), message);
  };

  const saveFixedProject = async (project: Project | null, draft: Pick<Project, "name" | "code" | "category" | "ownerScope" | "remark" | "status">) => {
    if (!draft.name.trim()) return;
    if (project) {
      await save({
        projects: state.projects.map((item) => item.id === project.id ? {
          ...item,
          name: draft.name.trim(),
          code: draft.code?.trim() || undefined,
          category: draft.category,
          ownerScope: draft.ownerScope ?? "self",
          remark: draft.remark?.trim() || undefined,
          status: draft.status,
          isFavorite: true,
          source: "manual",
          updatedAt: now(),
        } : item),
      }, "固定项目已更新");
      setEditingFixedProject(null);
      return;
    }
    const nextProject: Project = {
      id: createId("project"),
      name: draft.name.trim(),
      code: draft.code?.trim() || undefined,
      category: draft.category,
      ownerScope: draft.ownerScope ?? "self",
      remark: draft.remark?.trim() || undefined,
      status: draft.status,
      source: "manual",
      isFavorite: true,
      createdAt: now(),
      updatedAt: now(),
    };
    await save({ projects: [nextProject, ...state.projects] }, "固定项目已新增");
    setIsAddingFixedProject(false);
  };

  const removeFixedProject = (project: Project) => {
    confirmAction({
      title: "移出固定项目？",
      text: `“${project.name}”会从日程左侧移出，项目库和已有工时记录会保留。`,
      confirmText: "移出",
      onConfirm: async () => {
        await save({ projects: state.projects.map((item) => item.id === project.id ? { ...item, isFavorite: false, updatedAt: now() } : item) }, "已移出固定项目");
      },
    });
  };

  const deleteEntry = (entry: TimesheetEntry) => {
    confirmAction({
      title: "删除时间块？",
      text: `${entry.workDate} ${entry.startTime}-${entry.endTime} 的记录会被移除。`,
      confirmText: "删除",
      onConfirm: async () => {
        onSelectEntry(null);
        setEditingEntryId(null);
        await saveScheduleEntries(state.entries.filter((item) => item.id !== entry.id), "时间块已删除");
      },
    });
  };

  const getPaletteItem = (item: SchedulePaletteDrag) => {
    if (item.kind === "project") {
      const project = state.projects.find((entry) => entry.id === item.id);
      if (!project) return undefined;
      const normalized = normalizeWorkSelection({
        workNature: "科研工作",
        workCategory: project.category,
        workForm: getWorkFormOptions("科研工作")[0] || "资料调研",
        projectName: project.name,
      }, {}, state.projects);
      return {
        ...item,
        title: project.name,
        badge: project.code || project.category,
        duration: 60,
        entryPatch: {
          workNature: normalized.workNature,
          workCategory: normalized.workCategory,
          projectId: project.id,
          projectName: project.name,
          workForm: normalized.workForm,
          remark: project.name,
          source: "manual" as const,
        },
      };
    }

    const template = state.templates.find((entry) => entry.id === item.id);
    if (!template) return undefined;
    const duration = template.startTime && template.endTime
      ? Math.max(minInteractiveBlockMinutes, toMinutes(template.endTime) - toMinutes(template.startTime))
      : 60;
    return {
      ...item,
      title: template.remark || template.name,
      badge: template.projectName && template.projectName !== "备注" ? template.projectName : template.workCategory,
      duration,
      entryPatch: {
        workNature: template.workNature,
        workCategory: template.workCategory,
        projectId: template.projectId,
        projectName: template.projectName || "备注",
        workForm: template.workForm,
        remark: template.remark || template.name,
        collaborator: template.collaborator,
        source: "template" as const,
      },
    };
  };

  const readPaletteDrag = (event: DragEvent<HTMLElement>): SchedulePaletteDrag | null => {
    const kind = (draggingPaletteItem?.kind || event.dataTransfer.getData("worktrail-kind")) as SchedulePaletteDrag["kind"] | "";
    const id = draggingPaletteItem?.id || event.dataTransfer.getData("worktrail-id");
    return (kind === "project" || kind === "template") && id ? { kind, id } : null;
  };

  const createEntryFromDrop = async (item: SchedulePaletteDrag, date: string, minute: number) => {
    const paletteItem = getPaletteItem(item);
    if (!paletteItem) return;
    const range = clampInteractiveRange(minute, minute + paletteItem.duration);
    const entry: TimesheetEntry = {
      id: createId("entry"),
      workDate: date,
      startTime: fromMinutes(range.start),
      endTime: fromMinutes(range.end),
      status: "confirmed",
      createdAt: now(),
      updatedAt: now(),
      ...paletteItem.entryPatch,
    };
    await saveScheduleEntries(mergeContinuousEntries([entry, ...state.entries]), "已排入日程");
    onSelectDate(date);
  };

  const createEntryFromRange = async (date: string, startMinute: number, endMinute: number) => {
    const range = clampInteractiveRange(Math.min(startMinute, endMinute), Math.max(startMinute, endMinute));
    const startTime = fromMinutes(range.start);
    const endTime = fromMinutes(range.end);
    const conflicts = state.entries.some((entry) => entry.workDate === date && overlaps(startTime, endTime, entry.startTime, entry.endTime));
    if (conflicts) {
      setNotice("新建时间段与已有日程冲突");
      return;
    }
    const template = quickTemplates[0] || state.templates.find((item) => item.enabled && item.scheduleKind === "random");
    const fallbackWorkNature = "事务性工作";
    const fallbackWorkCategory = "其他事务性";
    const fallbackWorkForm = getWorkFormOptions(fallbackWorkNature)[0] || "其他";
    const entry: TimesheetEntry = {
      id: createId("entry"),
      workDate: date,
      startTime,
      endTime,
      workNature: template?.workNature || fallbackWorkNature,
      workCategory: template?.workCategory || fallbackWorkCategory,
      projectId: template?.projectId,
      projectName: template?.projectName || "备注",
      workForm: template?.workForm || fallbackWorkForm,
      remark: template?.remark || template?.name || "",
      collaborator: template?.collaborator,
      status: "confirmed",
      source: "manual",
      createdAt: now(),
      updatedAt: now(),
    };
    await saveScheduleEntries(mergeContinuousEntries([entry, ...state.entries]), "已新建日程");
    onSelectDate(date);
    onSelectEntry(entry.id);
    onSelectSlot(null);
    setEditingEntryId(entry.id);
  };

  const clearPaletteDrag = () => {
    paletteDragRef.current = null;
    setDraggingPaletteItem(null);
    setDropPreview(null);
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = null;
    if (paletteFrameRef.current) {
      window.cancelAnimationFrame(paletteFrameRef.current);
      paletteFrameRef.current = null;
    }
  };

  const moveDragPreview = (clientX: number, clientY: number) => {
    const preview = dragPreviewRef.current;
    if (!preview) return;
    if (paletteFrameRef.current) return;
    paletteFrameRef.current = window.requestAnimationFrame(() => {
      paletteFrameRef.current = null;
      const current = paletteDragRef.current;
      if (!current || !dragPreviewRef.current) return;
      dragPreviewRef.current.style.transform = `translate3d(${current.clientX + 12}px, ${current.clientY + 12}px, 0)`;
    });
    preview.style.transform = `translate3d(${clientX + 12}px, ${clientY + 12}px, 0)`;
  };

  const beginPalettePointerDrag = (event: React.PointerEvent<HTMLElement>, item: SchedulePaletteDrag) => {
    if (event.button !== 0) return;
    const paletteItem = getPaletteItem(item);
    if (!paletteItem) return;
    event.preventDefault();
    event.stopPropagation();
    dragPreviewRef.current?.remove();
    dragPreviewRef.current = createScheduleDragPreview(paletteItem.title, paletteItem.badge);
    paletteDragRef.current = {
      ...item,
      originClientX: event.clientX,
      originClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      hasDragged: false,
    };
    setDraggingPaletteItem(item);
    moveDragPreview(event.clientX, event.clientY);
  };

  useEffect(() => {
    if (!interaction) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const current = interactionRef.current;
      if (!current) return;
      if (current.type === "move") {
        const body = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-week-day-body='true']");
        const rect = body?.getBoundingClientRect();
        if (!body || !rect) return;
        const pointerMinute = snapMinuteFromRect(event.clientY, rect);
        scheduleInteractionState({
          ...current,
          date: body.dataset.date || current.date,
          hasDragged: current.hasDragged || Math.abs(event.clientY - current.originClientY) > 4 || Math.abs(event.clientX - current.originClientX) > 4,
          nextStart: pointerMinute - current.grabOffset,
        });
        return;
      }

      if (current.type === "create") {
        const body = document.querySelector<HTMLElement>(`[data-week-day-body='true'][data-date='${current.date}']`);
        const rect = body?.getBoundingClientRect();
        if (!rect) return;
        scheduleInteractionState({
          ...current,
          hasDragged: current.hasDragged || Math.abs(event.clientY - current.originClientY) > 4 || Math.abs(event.clientX - current.originClientX) > 4,
          nextMinute: snapMinuteFromRect(event.clientY, rect),
        });
        return;
      }

      const body = document.querySelector<HTMLElement>(`[data-week-day-body='true'][data-date='${current.date}']`);
      const rect = body?.getBoundingClientRect();
      if (!rect) return;
      scheduleInteractionState({ ...current, nextMinute: snapMinuteFromRect(event.clientY, rect) });
    };

    const handlePointerUp = async () => {
      const current = interactionRef.current;
      finishInteractionState(null);
      if (!current) return;

      if (current.type === "move") {
        const entry = state.entries.find((item) => item.id === current.entryId);
        if (!entry) return;
        if (!current.hasDragged) return;
        const range = clampInteractiveRange(current.nextStart, current.nextStart + current.duration);
        suppressClickUntilRef.current = performance.now() + 280;
        await updateEntry(entry.id, { workDate: current.date, startTime: fromMinutes(range.start), endTime: fromMinutes(range.end) });
        onSelectDate(current.date);
        return;
      }

      if (current.type === "create") {
        const range = clampInteractiveRange(Math.min(current.startMinute, current.nextMinute), Math.max(current.startMinute, current.nextMinute));
        suppressClickUntilRef.current = performance.now() + 280;
        if (!current.hasDragged) {
          onSelectDate(current.date);
          onSelectEntry(null);
          onSelectSlot({ date: current.date, minute: current.startMinute });
          return;
        }
        await createEntryFromRange(current.date, range.start, range.end);
        return;
      }

      const entry = state.entries.find((item) => item.id === current.entryId);
      if (!entry) return;

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

  useEffect(() => {
    if (!draggingPaletteItem) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const current = paletteDragRef.current;
      if (!current) return;
      current.clientX = event.clientX;
      current.clientY = event.clientY;
      current.hasDragged = current.hasDragged || Math.abs(event.clientY - current.originClientY) > 4 || Math.abs(event.clientX - current.originClientX) > 4;
      moveDragPreview(event.clientX, event.clientY);

      const body = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-week-day-body='true']");
      const paletteItem = getPaletteItem(current);
      if (!body || !paletteItem) {
        setDropPreview(null);
        return;
      }
      const rect = body.getBoundingClientRect();
      const date = body.dataset.date || selectedDate;
      const startMinute = snapMinuteFromRect(event.clientY, rect);
      const range = clampInteractiveRange(startMinute, startMinute + paletteItem.duration);
      setDropPreview((previous) => (
        previous?.date === date &&
        previous.kind === current.kind &&
        previous.id === current.id &&
        previous.startMinute === range.start &&
        previous.endMinute === range.end
          ? previous
          : { date, kind: current.kind, id: current.id, startMinute: range.start, endMinute: range.end }
      ));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = paletteDragRef.current;
      const body = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-week-day-body='true']");
      if (current?.hasDragged && body) {
        const rect = body.getBoundingClientRect();
        const date = body.dataset.date || selectedDate;
        const startMinute = snapMinuteFromRect(event.clientY, rect);
        void createEntryFromDrop(current, date, startMinute);
      }
      clearPaletteDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", clearPaletteDrag, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", clearPaletteDrag);
    };
  }, [draggingPaletteItem, selectedDate, state.projects, state.templates, state.entries]);

  const previewEntry = (entry: TimesheetEntry) => {
    if (!interaction || interaction.type === "create" || interaction.entryId !== entry.id) return entry;
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
        <div className="worktrail-rail-title with-action">
          <span>工作项</span>
          <button className="toolbar-icon-button compact" onClick={() => setIsAddingFixedProject(true)} aria-label="新增固定项目"><Plus className="size-4" /></button>
        </div>
        <div className="worktrail-stack">
          {favoriteProjects.length === 0 ? <div className="worktrail-empty">暂无固定项目</div> : null}
          {favoriteProjects.map((project) => (
            <div
              key={project.id}
              className={cn("worktrail-palette-card", draggingPaletteItem?.kind === "project" && draggingPaletteItem.id === project.id && "dragging")}
              onPointerDown={(event) => beginPalettePointerDrag(event, { kind: "project", id: project.id })}
            >
              <div className="worktrail-card-head">
                <span className="worktrail-chip" style={{ ["--project-color" as string]: projectColorPalette[stableIndex(project.name, projectColorPalette.length)] }}>{project.code || project.category}</span>
                <span>{project.status === "active" ? "进行中" : project.status === "paused" ? "暂停" : "已结束"}</span>
              </div>
              <strong>{project.name}</strong>
              <div className="worktrail-card-meta"><span>{project.category}</span><span>{weekEntries.filter((entry) => entry.projectName === project.name).reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0).toFixed(1)}h</span></div>
              <div className="worktrail-card-actions">
                <button onPointerDown={(event) => event.stopPropagation()} onClick={() => setEditingFixedProject(project)} aria-label="编辑固定项目"><Pencil className="size-4" /></button>
                <button onPointerDown={(event) => event.stopPropagation()} onClick={() => removeFixedProject(project)} aria-label="移出固定项目"><Trash2 className="size-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="worktrail-rail-title secondary">其他</div>
        <div className="worktrail-stack">
          {quickTemplates.map((template) => (
            <div
              key={template.id}
              className={cn("worktrail-quick-card", draggingPaletteItem?.kind === "template" && draggingPaletteItem.id === template.id && "dragging")}
              onPointerDown={(event) => beginPalettePointerDrag(event, { kind: "template", id: template.id })}
            >
              <strong>{template.remark || template.name}</strong><span>{formatNatureForm(template.workNature, template.workForm)}</span>
            </div>
          ))}
        </div>
      </aside>
      <div className="worktrail-board panel-card">
        <div className="worktrail-board-inner">
          <div className="worktrail-time-axis" style={{ height: ((weekTimelineEnd - weekTimelineStart) / 30) * weekSlotHeight + weekHeaderOffset }}>
            <button
              type="button"
              className={cn("worktrail-week-select-all", isWeekSelected && "selected")}
              onClick={onToggleWeekSelection}
              aria-label={isWeekSelected ? "取消全选本周" : "全选本周"}
            >
              {isWeekSelected ? "已全选" : "全选"}
            </button>
            {hourMarkers.map((minute) => <div key={minute} className="worktrail-time-label" style={{ top: weekHeaderOffset + ((minute - weekTimelineStart) / 30) * weekSlotHeight }}>{fromMinutes(minute)}</div>)}
          </div>
          <div className="worktrail-day-columns">
            {weekDates.map((date) => {
              const isDateSelected = selectedDateSet.has(date);
              const showDateSelection = isDateSelected && !selectedEntryId && !selectedSlot;
              const baseEntries = entriesByDate.get(date) || [];
              const interactingEntry = interaction && interaction.type !== "create" ? weekEntries.find((entry) => entry.id === interaction.entryId) : undefined;
              const renderedInteractingEntry = interactingEntry ? previewEntry(interactingEntry) : undefined;
              const entries = renderedInteractingEntry?.workDate === date && !baseEntries.some((entry) => entry.id === renderedInteractingEntry.id)
                ? [...baseEntries, interactingEntry!]
                : baseEntries;
              return (
                <section key={date} className={cn("worktrail-day-column", showDateSelection && "selected")}>
                  <button
                    className={cn("worktrail-day-header", showDateSelection && "selected", copiedDates.has(date) && "copied", date === selectedDate && "focused", date === today && "today")}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      onToggleDate(date, { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
                      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) setDragSelectingDate(date);
                    }}
                    onPointerEnter={() => {
                      if (!dragSelectingDate || dragSelectingDate === date) return;
                      onToggleDate(date, { shiftKey: true });
                    }}
                  >
                    <strong>{formatDayHeader(date)}</strong>
                  </button>
                  <div
                    className={cn("worktrail-day-body", showDateSelection && "selected", date === today && "today", dropPreview?.date === date && "drop-target")}
                    data-week-day-body="true"
                    data-date={date}
                    style={{ height: ((weekTimelineEnd - weekTimelineStart) / 30) * weekSlotHeight }}
                    onDragOver={(event) => {
                      const item = readPaletteDrag(event);
                      if (!item) return;
                      const paletteItem = getPaletteItem(item);
                      if (!paletteItem) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      const rect = event.currentTarget.getBoundingClientRect();
                      const startMinute = snapMinuteFromRect(event.clientY, rect);
                      const range = clampInteractiveRange(startMinute, startMinute + paletteItem.duration);
                      setDropPreview({ date, kind: item.kind, id: item.id, startMinute: range.start, endMinute: range.end });
                    }}
                    onDragLeave={(event) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                      setDropPreview((current) => (current?.date === date ? null : current));
                    }}
                    onDrop={(event) => {
                      const item = readPaletteDrag(event);
                      if (!item) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const startMinute = snapMinuteFromRect(event.clientY, rect);
                      setDraggingPaletteItem(null);
                      setDropPreview(null);
                      dragPreviewRef.current?.remove();
                      dragPreviewRef.current = null;
                      void createEntryFromDrop(item, date, startMinute);
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || draggingPaletteItem || interactionRef.current) return;
                      if ((event.target as HTMLElement).closest(".worktrail-time-block, .worktrail-drop-preview, .worktrail-move-preview, .worktrail-create-preview, .worktrail-resize-handle")) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const minute = snapMinuteFromRect(event.clientY, rect);
                      const isOccupiedMinute = entries.some((entry) => {
                        const start = toMinutes(entry.startTime);
                        const end = toMinutes(entry.endTime);
                        return minute >= start && minute < end;
                      });
                      if (isOccupiedMinute) return;
                      event.preventDefault();
                      onSelectEntry(null);
                      onSelectSlot({ date, minute });
                      finishInteractionState({
                        type: "create",
                        date,
                        originClientX: event.clientX,
                        originClientY: event.clientY,
                        startMinute: minute,
                        nextMinute: minute + minInteractiveBlockMinutes,
                        hasDragged: false,
                      });
                    }}
                  >
                    {timeSlots.map((minute, slotIndex) => <div key={minute} className={cn("worktrail-slot", minute % 60 === 0 ? "major" : "minor", slotIndex === 0 && "first", slotIndex === timeSlots.length - 1 && "last", minute >= 8 * 60 && minute < 18 * 60 && "within-workday", selectedSlot?.date === date && selectedSlot.minute === minute && "selected")} style={{ height: weekSlotHeight }} />)}
                    {date === today && showCurrentTimeLine ? (
                      <div className="worktrail-now-line" style={{ top: ((currentMinute - weekTimelineStart) / 30) * weekSlotHeight }}>
                        <span>{fromMinutes(currentMinute)}</span>
                      </div>
                    ) : null}
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
                          className={cn(
                            "worktrail-time-block interactive",
                            selectedEntryId === entry.id && "selected",
                            copiedEntryIds.has(entry.id) && "copied",
                            interaction?.type !== "create" && interaction?.entryId === entry.id && "interacting",
                            interaction?.type === "move" && interaction.entryId === entry.id && interaction.hasDragged && "drag-origin",
                          )}
                          style={{ top, height, ["--block-color" as string]: getEntryProjectColor(rendered), ["--nature-color" as string]: getNatureColor(rendered.workNature) }}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (performance.now() < suppressClickUntilRef.current) return;
                            onSelectDate(rendered.workDate);
                            onSelectEntry(entry.id);
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setEditingEntryId(entry.id);
                          }}
                        >
                          <button
                            type="button"
                            className="worktrail-resize-handle top"
                            aria-label="调整开始时间"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              finishInteractionState({
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
                              finishInteractionState({
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
                            <div className="worktrail-type-row"><span className="worktrail-type-dot" /><span>{formatNatureForm(rendered.workNature, rendered.workForm)}</span></div>
                            <span>{rendered.startTime} - {rendered.endTime}</span>
                            <span className="worktrail-duration">{durationHours(rendered.startTime, rendered.endTime).toFixed(1)}</span>
                          </button>
                          <button
                            type="button"
                            className="worktrail-resize-handle bottom"
                            aria-label="调整结束时间"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              finishInteractionState({
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
                    {dropPreview?.date === date ? (() => {
                      const paletteItem = getPaletteItem(dropPreview);
                      return paletteItem ? (
                        <div
                          className="worktrail-drop-preview"
                          style={{
                            top: ((dropPreview.startMinute - weekTimelineStart) / 30) * weekSlotHeight,
                            height: ((dropPreview.endMinute - dropPreview.startMinute) / 30) * weekSlotHeight,
                            ["--block-color" as string]: dropPreview.kind === "project"
                              ? projectColorPalette[stableIndex(paletteItem.title, projectColorPalette.length)]
                              : projectColorPalette[stableIndex(paletteItem.badge, projectColorPalette.length)],
                          }}
                        >
                          <strong>{paletteItem.title}</strong>
                          <span>{fromMinutes(dropPreview.startMinute)} - {fromMinutes(dropPreview.endMinute)}</span>
                          <span className="worktrail-duration">{((dropPreview.endMinute - dropPreview.startMinute) / 60).toFixed(1)}</span>
                        </div>
                      ) : null;
                    })() : null}
                    {createPreview?.date === date ? (
                      <div
                        className="worktrail-create-preview"
                        style={{
                          top: ((createPreview.startMinute - weekTimelineStart) / 30) * weekSlotHeight,
                          height: ((createPreview.endMinute - createPreview.startMinute) / 30) * weekSlotHeight,
                          ["--block-color" as string]: "#007aff",
                        }}
                      >
                        <strong>新建日程</strong>
                        <span>{fromMinutes(createPreview.startMinute)} - {fromMinutes(createPreview.endMinute)}</span>
                        <span className="worktrail-duration">{((createPreview.endMinute - createPreview.startMinute) / 60).toFixed(1)}</span>
                      </div>
                    ) : null}
                    {movingPreview?.workDate === date ? (
                      <div
                        className="worktrail-move-preview"
                        style={{
                          top: ((toMinutes(movingPreview.startTime) - weekTimelineStart) / 30) * weekSlotHeight,
                          height: ((toMinutes(movingPreview.endTime) - toMinutes(movingPreview.startTime)) / 30) * weekSlotHeight,
                          ["--block-color" as string]: getEntryProjectColor(movingPreview),
                          ["--nature-color" as string]: getNatureColor(movingPreview.workNature),
                        }}
                      >
                        <strong>{movingPreview.projectName && movingPreview.projectName !== "备注" ? movingPreview.projectName : movingPreview.remark || movingPreview.workCategory}</strong>
                        <div className="worktrail-type-row"><span className="worktrail-type-dot" /><span>{formatNatureForm(movingPreview.workNature, movingPreview.workForm)}</span></div>
                        <span>{movingPreview.startTime} - {movingPreview.endTime}</span>
                        <span className="worktrail-duration">{durationHours(movingPreview.startTime, movingPreview.endTime).toFixed(1)}</span>
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
      {editingEntry ? (
        <EntryEditorModal
          entry={editingEntry}
          projects={state.projects}
          onClose={() => setEditingEntryId(null)}
          onDelete={() => deleteEntry(editingEntry)}
          onSave={(patch) => {
            updateEntry(editingEntry.id, patch, "时间块已保存");
            setEditingEntryId(null);
          }}
        />
      ) : null}
      {isAddingFixedProject || editingFixedProject ? (
        <FixedProjectEditorModal
          project={editingFixedProject}
          onClose={() => { setIsAddingFixedProject(false); setEditingFixedProject(null); }}
          onSave={(draft) => saveFixedProject(editingFixedProject, draft)}
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
  });
  const workFormChoices = getWorkFormOptions(draft.workNature);

  const submit = () => {
    onSave({
      ...draft,
      workForm: workFormChoices.length ? draft.workForm : "",
      projectName: draft.projectName || "备注",
      remark: draft.remark || undefined,
      collaborator: draft.collaborator || undefined,
      status: "confirmed",
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
          {workFormChoices.length ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="工作形式"><Select value={draft.workForm} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workForm: e.target.value }, projects))}>{withCurrentOption(workFormChoices, draft.workForm).map((item) => <option key={item}>{item}</option>)}</Select></Field>
              <Field label="共同完成人"><Input value={draft.collaborator} onChange={(e) => setDraft({ ...draft, collaborator: e.target.value })} /></Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="工作形式"><Input value="无需填写" disabled /></Field>
              <Field label="共同完成人"><Input value={draft.collaborator} onChange={(e) => setDraft({ ...draft, collaborator: e.target.value })} /></Field>
            </div>
          )}
          <Field label="备注"><Textarea value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} /></Field>
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

type FixedProjectDraft = Pick<Project, "name" | "code" | "category" | "ownerScope" | "remark" | "status">;

function FixedProjectEditorModal({
  project,
  onClose,
  onSave,
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (draft: FixedProjectDraft) => void;
}) {
  const [draft, setDraft] = useState<FixedProjectDraft>({
    name: project?.name || "",
    code: project?.code || "",
    category: project?.category && validProjectCategories.has(project.category) ? project.category : "探索项目",
    ownerScope: project?.ownerScope || "self",
    remark: project?.remark || "",
    status: project?.status || "active",
  });

  const submit = () => {
    if (!draft.name.trim()) return;
    onSave(draft);
  };

  return (
    <>
      <button className="entry-editor-backdrop" aria-label="关闭固定项目编辑" onClick={onClose} />
      <aside className="entry-editor-panel fixed-project-editor panel-card">
        <div className="entry-editor-head">
          <div>
            <div className="text-sm font-bold text-ink">{project ? "编辑固定项目" : "新增固定项目"}</div>
            <div className="mt-1 text-xs text-muted">{project ? "同步更新项目库中的项目资料。" : "新增后会显示在日程左侧，可拖入时间轴。"}</div>
          </div>
          <button className="toolbar-icon-button" onClick={onClose} aria-label="关闭"><X className="size-4" /></button>
        </div>
        <div className="entry-editor-form">
          <Field label="项目名称"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="项目号"><Input value={draft.code || ""} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="可选" /></Field>
            <Field label="项目类别"><Select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{projectCategoryOptions.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="项目归属"><Select value={draft.ownerScope || "self"} onChange={(event) => setDraft({ ...draft, ownerScope: event.target.value as NonNullable<Project["ownerScope"]> })}>{projectOwnerOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></Field>
            <Field label="状态"><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Project["status"] })}><option value="active">进行中</option><option value="paused">暂停</option><option value="closed">已结束</option></Select></Field>
          </div>
          <Field label="备注"><Input value={draft.remark || ""} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} placeholder="团队、来源或其他说明" /></Field>
        </div>
        <div className="entry-editor-actions">
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
  const [draft, setDraft] = useState({ name: "", code: "", category: "探索项目", ownerScope: "self" as NonNullable<Project["ownerScope"]>, remark: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [projectView, setProjectView] = useState<"pool" | "add">("pool");
  const [ownerFilter, setOwnerFilter] = useState<"all" | NonNullable<Project["ownerScope"]>>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [projectGroupBy, setProjectGroupBy] = useState<"owner" | "category">("category");
  const ownerLabel = (ownerScope?: Project["ownerScope"]) => projectOwnerOptions.find((option) => option.value === (ownerScope ?? "self"))?.label || "本人负责";
  const projects = state.projects.filter((project) =>
    (ownerFilter === "all" || (project.ownerScope ?? "self") === ownerFilter) &&
    (categoryFilter === "all" || project.category === categoryFilter));
  const projectGroups = (() => {
    const label = (project: Project) => projectGroupBy === "owner" ? ownerLabel(project.ownerScope) : project.category;
    const groups = new Map<string, Project[]>();
    projects.forEach((project) => groups.set(label(project), [...(groups.get(label(project)) || []), project]));
    return [...groups.entries()].map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => `${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`)),
    }));
  })();
  const isEditing = Boolean(editingId);

  const resetDraft = () => { setEditingId(null); setDraft({ name: "", code: "", category: "探索项目", ownerScope: "self", remark: "" }); };
  const startEditProject = (project: Project) => {
    setEditingId(project.id);
    setDraft({ name: project.name, code: project.code || "", category: normalizeProjectCategory(project.name, project.code, project.category), ownerScope: project.ownerScope ?? "self", remark: project.remark || "" });
    setProjectView("add");
  };

  const addProject = async () => {
    if (!draft.name.trim()) return;
    const project: Project = { id: createId("project"), name: draft.name.trim(), code: draft.code.trim() || undefined, category: draft.category, ownerScope: draft.ownerScope, remark: draft.remark.trim() || undefined, status: "active", source: "manual", isFavorite: true, createdAt: now(), updatedAt: now() };
    await save({ projects: [project, ...state.projects] }, "项目已加入项目库");
    resetDraft();
    setProjectView("pool");
  };

  const saveProject = async () => {
    if (!editingId || !draft.name.trim()) return;
    await save({ projects: state.projects.map((project) => project.id === editingId ? { ...project, name: draft.name.trim(), code: draft.code.trim() || undefined, category: draft.category, ownerScope: draft.ownerScope, remark: draft.remark.trim() || undefined, source: "manual", updatedAt: now() } : project) }, "项目已更新");
    resetDraft();
    setProjectView("pool");
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
    <>
      <PageHeader
        title="项目库"
        action={
          <div className="project-titlebar-actions">
            <div className="project-title-tabs">
              <div className="template-viewbar project-viewbar" role="tablist" aria-label="项目库视图">
                <button className={projectView === "pool" ? "active" : ""} onClick={() => { resetDraft(); setProjectView("pool"); }} role="tab" aria-selected={projectView === "pool"}>项目池</button>
                <button className={projectView === "add" ? "active" : ""} onClick={() => { resetDraft(); setProjectView("add"); }} role="tab" aria-selected={projectView === "add"}>{isEditing ? "编辑项目" : "新增项目"}</button>
              </div>
            </div>
          </div>
        }
      />
      <div className="project-page panel-card">
        {projectView === "pool" ? (
          <>
            <div className="project-toolbar">
              <div className="project-filter-row">
                <div className="toolbar-segmented compact project-filter-switch" role="group" aria-label="项目归属筛选">
                  <button className={cn(ownerFilter === "all" && "active")} onClick={() => setOwnerFilter("all")} type="button">全部</button>
                  <button className={cn(ownerFilter === "self" && "active")} onClick={() => setOwnerFilter("self")} type="button">本人负责</button>
                  <button className={cn(ownerFilter === "other" && "active")} onClick={() => setOwnerFilter("other")} type="button">他人负责</button>
                </div>
                <div className="toolbar-segmented compact project-filter-switch wide" role="group" aria-label="项目类别筛选">
                  <button className={cn(categoryFilter === "all" && "active")} onClick={() => setCategoryFilter("all")} type="button">全部类型</button>
                  {projectCategoryOptions.map((category) => (
                    <button key={category} className={cn(categoryFilter === category && "active")} onClick={() => setCategoryFilter(category)} type="button">{category.replace("项目", "")}</button>
                  ))}
                </div>
                <div className="toolbar-segmented compact project-filter-switch" role="group" aria-label="项目分组方式">
                  <button className={cn(projectGroupBy === "category" && "active")} onClick={() => setProjectGroupBy("category")} type="button">按类型</button>
                  <button className={cn(projectGroupBy === "owner" && "active")} onClick={() => setProjectGroupBy("owner")} type="button">按归属</button>
                </div>
              </div>
              <Badge tone="blue">{projects.length}</Badge>
            </div>
            {projects.length === 0 ? (
              <EmptyState icon={<FolderKanban className="size-5" />} title="暂无匹配项目" text="切换归属或项目类型，或新增一个常用项目。" />
            ) : (
              projectGroups.map((group) => (
                <section key={group.name} className="project-group">
                  <div className="project-group-head"><span>{group.name}</span><Badge tone="gray">{group.items.length}</Badge></div>
                  <div className="project-card-grid">
                    {group.items.map((project) => (
                      <article key={project.id} className={cn("project-mini-card", !project.isFavorite && "muted")}>
                        <div className="project-mini-top">
                          <Badge tone="blue">{project.code || project.category}</Badge>
                          <Badge tone={project.ownerScope === "other" ? "gray" : "blue"}>{ownerLabel(project.ownerScope)}</Badge>
                        </div>
                        <strong>{project.name}</strong>
                        <div className="project-mini-meta">{project.category} · {sourceLabel(project.source)}</div>
                        {project.remark ? <p>{project.remark}</p> : null}
                        <div className="project-mini-actions">
                          <Button variant="ghost" onClick={() => toggleFavorite(project)}>{project.isFavorite ? "常用" : "设为常用"}</Button>
                          <Button variant="ghost" onClick={() => startEditProject(project)}><Pencil className="size-4" />编辑</Button>
                          <Button variant="danger" onClick={() => removeProject(project)}><Trash2 className="size-4" />删除</Button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </>
        ) : (
          <div className="project-form-panel">
            <div><div className="text-base font-semibold text-ink">{isEditing ? "编辑项目" : "新增项目"}</div><div className="mt-1 text-sm text-muted">{isEditing ? "保存后会作为手动维护项目保留。" : "把常用项目加入本地项目库。"}</div></div>
            <Field label="项目名称"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="输入项目名称" /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="项目号"><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="可选" /></Field>
              <Field label="项目类别"><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{projectCategoryOptions.map((item) => <option key={item}>{item}</option>)}</Select></Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="项目归属"><Select value={draft.ownerScope} onChange={(e) => setDraft({ ...draft, ownerScope: e.target.value as NonNullable<Project["ownerScope"]> })}>{projectOwnerOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></Field>
              <Field label="备注"><Input value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} placeholder="团队、来源或其他说明" /></Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={isEditing ? saveProject : addProject}>{isEditing ? <Check className="size-4" /> : <Plus className="size-4" />}{isEditing ? "保存项目" : "新增项目"}</Button>
              {isEditing ? <Button variant="ghost" onClick={() => { resetDraft(); setProjectView("pool"); }}><X className="size-4" />取消</Button> : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TemplatesPage({ state, month, save, confirmAction }: PageProps) {
  const [draft, setDraft] = useState({ name: "", workNature: "科研工作", workCategory: "探索项目", projectName: "", workForm: "资料调研", remark: "", weight: 10, scheduleKind: "random" as WorkTemplate["scheduleKind"], weekday: 1, startTime: "08:00", endTime: "09:00" });
  const [editingTemplate, setEditingTemplate] = useState<WorkTemplate | null>(null);
  const [groupBy, setGroupBy] = useState<"kind" | "nature" | "project">("project");
  const [templateView, setTemplateView] = useState<"common" | "all" | "add">("common");
  const [commonTemplateMode, setCommonTemplateMode] = useState<"cards" | "charts">("cards");
  const [templateMonth, setTemplateMonth] = useState(month);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [formError, setFormError] = useState("");
  const presetInputRef = useRef<HTMLInputElement>(null);
  const monthSettings = getMonthTemplateSettings(state, templateMonth);
  const monthTemplates = applyMonthSettings(state.templates, monthSettings);
  const commonTemplates = monthTemplates.filter(isCommonTemplate);
  const visibleTemplates = templateView === "common" ? commonTemplates : monthTemplates;
  const templateGroups = groupTemplates(visibleTemplates, groupBy);
  const totalWeight = commonTemplates.reduce((sum, template) => sum + clampTemplateWeight(template.weight), 0);
  const templatePresets = state.templatePresets || [];
  const selectedPreset = templatePresets.find((preset) => preset.id === selectedPresetId) || templatePresets[0];
  const projectRequired = requiresLinkedProject(draft.workCategory);
  const draftWorkFormChoices = getWorkFormOptions(draft.workNature);

  useEffect(() => {
    if (!templatePresets.length) {
      if (selectedPresetId) setSelectedPresetId("");
      return;
    }
    if (!selectedPresetId || !templatePresets.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId(templatePresets[0].id);
    }
  }, [selectedPresetId, templatePresets]);

  useEffect(() => {
    const persistedMonthlySettings = state.monthlyTemplateSettings || [];
    const currentTemplateIds = new Set(state.templates.map((template) => template.id));
    const currentSettings = persistedMonthlySettings.filter((setting) => setting.month === templateMonth && currentTemplateIds.has(setting.templateId));
    if (!state.templates.length || currentSettings.length === currentTemplateIds.size) return;
    void save({
      monthlyTemplateSettings: [
        ...persistedMonthlySettings.filter((setting) => setting.month !== templateMonth),
        ...getMonthTemplateSettings(state, templateMonth),
      ],
    });
  }, [save, state, templateMonth]);

  const saveTemplateMonthSettings = (settings: MonthlyTemplateSetting[], message?: string) => save({
    monthlyTemplateSettings: [
      ...(state.monthlyTemplateSettings || []).filter((setting) => setting.month !== templateMonth),
      ...settings,
    ],
  }, message);

  const updateTemplateMonthSetting = (template: WorkTemplate, patch: Partial<MonthlyTemplateSetting>, message?: string) => {
    const existing = monthSettings.find((setting) => setting.templateId === template.id);
    const setting = createMonthlyTemplateSetting(templateMonth, template, {
      ...existing,
      ...patch,
      id: existing?.id,
      month: templateMonth,
      templateId: template.id,
      createdAt: existing?.createdAt,
      updatedAt: now(),
    });
    return saveTemplateMonthSettings([
      ...monthSettings.filter((item) => item.templateId !== template.id),
      setting,
    ], message);
  };

  const saveCurrentAsPreset = async () => {
    const name = window.prompt("方案名称", `${templateMonth} 常用模板`);
    if (name === null) return;
    const preset = createTemplatePreset(name, monthSettings);
    await save({ templatePresets: [preset, ...templatePresets] }, "模板方案已保存");
    setSelectedPresetId(preset.id);
  };

  const updateSelectedPreset = async () => {
    if (!selectedPreset) return;
    const updatedPreset: TemplatePreset = {
      ...selectedPreset,
      settings: createTemplatePreset(selectedPreset.name, monthSettings).settings,
      updatedAt: now(),
    };
    await save({
      templatePresets: templatePresets.map((preset) => preset.id === selectedPreset.id ? updatedPreset : preset),
    }, "模板方案已更新");
  };

  const applySelectedPreset = async () => {
    if (!selectedPreset) return;
    await saveTemplateMonthSettings(
      applyPresetToMonth(templateMonth, state.templates, selectedPreset, monthSettings),
      `已切换到“${selectedPreset.name}”`,
    );
  };

  const deleteSelectedPreset = () => {
    if (!selectedPreset) return;
    confirmAction({
      title: "删除模板方案？",
      text: `“${selectedPreset.name}”会从方案列表移除，不影响模板库和已生成的工时。`,
      confirmText: "删除",
      onConfirm: async () => {
        await save({ templatePresets: templatePresets.filter((preset) => preset.id !== selectedPreset.id) }, "模板方案已删除");
        setSelectedPresetId("");
      },
    });
  };

  const exportSelectedPreset = async () => {
    const preset = selectedPreset || createTemplatePreset(`${templateMonth} 常用模板`, monthSettings);
    const job = exportTemplatePresetJson(preset);
    await save({ jobs: [job, ...state.jobs] }, "模板方案已导出");
  };

  const importTemplatePreset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const preset = await importTemplatePresetJson(file);
      await save({ templatePresets: [preset, ...templatePresets] }, "模板方案已导入");
      setSelectedPresetId(preset.id);
    } catch (error) {
      const failedJob = {
        id: createId("job"),
        kind: "json_import" as const,
        fileName: file.name,
        status: "failed" as const,
        errorText: String(error),
        createdAt: now(),
      };
      await save({ jobs: [failedJob, ...state.jobs] }, "模板方案导入失败");
    }
  };

  const resetDraft = () => {
    setFormError("");
    setDraft({ name: "", workNature: "科研工作", workCategory: "探索项目", projectName: "", workForm: "资料调研", remark: "", weight: 10, scheduleKind: "random", weekday: 1, startTime: "08:00", endTime: "09:00" });
  };
  const startEditTemplate = (template: WorkTemplate) => setEditingTemplate(template);
  const remarkOptions = [...new Set(draft.remark.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, 12);
  const templateFromDraft = (id = createId("template")): WorkTemplate => {
    const projectName = draft.projectName || "备注";
    const workForm = draftWorkFormChoices.length ? draft.workForm : "";
    const name = draft.name || (projectName !== "备注" ? `${projectName}${workForm ? ` / ${workForm}` : ""}` : formatCategoryForm(draft.workCategory, workForm));
    return {
      id,
      name,
      workNature: draft.workNature,
      workCategory: draft.workCategory,
      projectName,
      workForm,
      remark: remarkOptions[0],
      remarkOptions,
      weight: clampTemplateWeight(draft.weight),
      scheduleKind: draft.scheduleKind,
      weekday: draft.scheduleKind === "random" ? undefined : Number(draft.weekday),
      startTime: draft.scheduleKind === "random" ? undefined : draft.startTime,
      endTime: draft.scheduleKind === "random" ? undefined : draft.endTime,
      enabled: true,
      archived: false,
      createdAt: now(),
      updatedAt: now(),
    };
  };
  const validateTemplate = () => {
    if (projectRequired && (!draft.projectName || draft.projectName === "备注" || !projectExists(state.projects, draft.projectName))) {
      setFormError("这个工作类别必须选择项目库中的具体项目。");
      return false;
    }
    setFormError("");
    return true;
  };
  const addTemplate = async () => {
    if (!validateTemplate()) return;
    const template = templateFromDraft();
    await save({
      templates: [template, ...state.templates],
      monthlyTemplateSettings: [
        ...(state.monthlyTemplateSettings || []),
        createMonthlyTemplateSetting(templateMonth, template, { enabled: true, weight: template.weight }),
      ],
    }, "模板已保存");
    resetDraft();
    setTemplateView("common");
  };
  const saveEditedTemplate = async (next: WorkTemplate) => {
    if (!editingTemplate) return;
    const existingSetting = monthSettings.find((setting) => setting.templateId === editingTemplate.id);
    const replacement: WorkTemplate = {
      ...next,
      id: editingTemplate.id.startsWith("template_xlsx_") ? createId("template") : editingTemplate.id,
      enabled: editingTemplate.enabled,
      archived: editingTemplate.archived ?? false,
      createdAt: editingTemplate.createdAt || next.createdAt,
      updatedAt: now(),
    };
    const replacementSetting = createMonthlyTemplateSetting(templateMonth, replacement, {
      enabled: existingSetting?.enabled ?? isCommonTemplate(editingTemplate),
      weight: next.weight,
      createdAt: existingSetting?.createdAt,
      updatedAt: now(),
    });
    await save({
      templates: state.templates.map((template) => template.id === editingTemplate.id ? replacement : template),
      monthlyTemplateSettings: [
        ...(state.monthlyTemplateSettings || []).filter((setting) => !(setting.month === templateMonth && setting.templateId === editingTemplate.id)),
        replacementSetting,
      ],
    }, "模板已更新");
    setEditingTemplate(null);
  };
  const setTemplateCommon = (template: WorkTemplate, enabled: boolean) => updateTemplateMonthSetting(template, { enabled, weight: template.weight }, enabled ? "已加入本月常用" : "已从本月常用移出");
  const copyTemplate = async (template: WorkTemplate) => {
    const sourceSetting = monthSettings.find((setting) => setting.templateId === template.id);
    const copiedTemplate: WorkTemplate = {
      ...template,
      id: createId("template"),
      name: `${template.name} 副本`,
      enabled: true,
      archived: false,
      remarkOptions: normalizeRemarkOptions(template),
      createdAt: now(),
      updatedAt: now(),
    };
    await save({
      templates: [copiedTemplate, ...state.templates],
      monthlyTemplateSettings: [
        ...(state.monthlyTemplateSettings || []),
        createMonthlyTemplateSetting(templateMonth, copiedTemplate, {
          enabled: sourceSetting?.enabled ?? isCommonTemplate(template),
          weight: sourceSetting?.weight ?? template.weight,
        }),
      ],
    }, "模板已复制");
    setTemplateView("common");
    setEditingTemplate(copiedTemplate);
  };
  const archiveTemplate = (template: WorkTemplate) => save({ templates: state.templates.map((item) => item.id === template.id ? { ...item, enabled: false, archived: true, updatedAt: now() } : item) }, "模板已归档");
  const restoreTemplate = (template: WorkTemplate) => save({ templates: state.templates.map((item) => item.id === template.id ? { ...item, archived: false, updatedAt: now() } : item) }, "模板已恢复");
  const removeTemplate = (template: WorkTemplate) => {
    confirmAction({
      title: "删除模板？",
      text: `“${template.name}”会从模板库移除，不影响已经生成的工时记录。`,
      confirmText: "删除",
      onConfirm: async () => {
        await save({
          templates: state.templates.filter((item) => item.id !== template.id),
          monthlyTemplateSettings: (state.monthlyTemplateSettings || []).filter((setting) => setting.templateId !== template.id),
        }, "模板已删除");
        if (editingTemplate?.id === template.id) setEditingTemplate(null);
      },
    });
  };
  const clearTemplates = () => {
    confirmAction({
      title: "清空模板库？",
      text: `当前 ${state.templates.length} 个模板都会被移除。这个操作不会删除项目和工时记录。`,
      confirmText: "清空",
      onConfirm: async () => {
        await save({ templates: [], monthlyTemplateSettings: [] }, "模板库已清空");
        resetDraft();
      },
    });
  };
  const pauseCommonTemplates = () => {
    if (!commonTemplates.length) return;
    confirmAction({
      title: "全部移出常用？",
      text: `${commonTemplates.length} 个模板会保留在全部模板中，但不再作为常用模板参与自动补全。`,
      confirmText: "移出常用",
      onConfirm: async () => {
        await saveTemplateMonthSettings(monthSettings.map((setting) => ({ ...setting, enabled: false, updatedAt: now() })), "已全部移出本月常用");
      },
    });
  };

  const renderGroupSwitch = () => (
    <div className="toolbar-segmented compact template-group-switch" role="group" aria-label="模板分组方式">
      <button className={cn(groupBy === "project" && "active")} onClick={() => setGroupBy("project")} type="button">按项目</button>
      <button className={cn(groupBy === "nature" && "active")} onClick={() => setGroupBy("nature")} type="button">按性质</button>
      <button className={cn(groupBy === "kind" && "active")} onClick={() => setGroupBy("kind")} type="button">按类型</button>
    </div>
  );

  const renderTemplateList = (showToolbar = true) => (
    <>
      {showToolbar ? (
        <div className="template-toolbar">
          <div />
          <div className="template-toolbar-actions">
            {renderGroupSwitch()}
            {templateView === "common" ? <Button variant="ghost" disabled={commonTemplates.length === 0} onClick={pauseCommonTemplates}>全部移出常用</Button> : null}
            {templateView === "all" ? <Button variant="danger" disabled={state.templates.length === 0} onClick={clearTemplates}>清空全部</Button> : null}
          </div>
        </div>
      ) : null}
      {templateGroups.map((group) => (
        <section key={group.name} className="template-group">
          <div className="template-group-head"><span>{group.name}</span><Badge tone="gray">{group.items.length}</Badge></div>
          <div className="template-card-grid">
            {group.items.map((template) => (
              <article key={template.id} className={cn("template-mini-card", !isCommonTemplate(template) && "disabled", template.archived && "archived")}>
                <div className="template-mini-top">
                  <strong>{template.name}</strong>
                  <Badge tone={template.archived ? "amber" : isCommonTemplate(template) ? "blue" : "gray"}>{template.archived ? "已归档" : isCommonTemplate(template) ? "常用补全" : "仅保留"}</Badge>
                </div>
                <div className="template-mini-top compact">
                  <Badge tone={template.scheduleKind === "random" ? "blue" : template.scheduleKind === "fixed" ? "gray" : "amber"}>{template.scheduleKind === "random" ? "随机" : template.scheduleKind === "fixed" ? "固定" : "讲堂"}</Badge>
                </div>
                <div className="template-mini-meta">{template.workNature} · {template.workCategory}</div>
                <div className="template-mini-meta">{template.projectName || "备注"} · {template.workForm || "无需填写形式"}</div>
                <div className="template-mini-meta">补全权重 {clampTemplateWeight(template.weight)}</div>
                {normalizeRemarkOptions(template).length ? <p>{normalizeRemarkOptions(template).slice(0, 3).join(" / ")}{normalizeRemarkOptions(template).length > 3 ? ` 等 ${normalizeRemarkOptions(template).length} 条` : ""}</p> : null}
                <div className="template-mini-actions">
                  {templateView === "common" ? (
                    <Button variant="ghost" onClick={() => setTemplateCommon(template, false)}>移出常用</Button>
                  ) : template.archived ? (
                    <Button variant="ghost" onClick={() => restoreTemplate(template)}>恢复</Button>
                  ) : isCommonTemplate(template) ? (
                    <Button variant="ghost" onClick={() => setTemplateCommon(template, false)}>移出常用</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setTemplateCommon(template, true)}>设为常用</Button>
                  )}
                  <Button variant="ghost" onClick={() => copyTemplate(template)}><Plus className="size-4" />复制</Button>
                  <Button variant="ghost" onClick={() => startEditTemplate(template)}><Pencil className="size-4" />编辑</Button>
                  {templateView === "all" && !template.archived ? <Button variant="ghost" onClick={() => archiveTemplate(template)}>归档</Button> : null}
                  {templateView === "all" ? <Button variant="danger" onClick={() => removeTemplate(template)}><Trash2 className="size-4" />删除</Button> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {visibleTemplates.length === 0 ? (
        <EmptyState
          icon={<Wand2 className="size-5" />}
          title={templateView === "common" ? "暂无常用模板" : "暂无模板"}
          text={templateView === "common" ? "手动新增或从全部模板中设为常用后，自动补全才会主动使用它们。" : "全部模板会保留完整历史，需要主动补全时再设为常用。"}
        />
      ) : null}
    </>
  );

  const renderCommonCharts = () => (
    commonTemplates.length ? (
      <section className="template-group">
        <div className="template-group-head">
          <span>常用模板权重</span>
          <Badge tone="blue">{totalWeight}</Badge>
        </div>
        <div className="template-chart-panel">
          <div className="template-chart-grid">
            <div className="template-chart-block wide">
              <div className="template-chart-title">模板权重排行</div>
              <TemplateWeightChart templates={commonTemplates} dimension="template" type="bar" />
            </div>
            <div className="template-chart-block">
              <div className="template-chart-title">项目分布</div>
              <TemplateWeightChart templates={commonTemplates} dimension="projectName" type="pie" />
            </div>
            <div className="template-chart-block">
              <div className="template-chart-title">性质分布</div>
              <TemplateWeightChart templates={commonTemplates} dimension="workNature" type="pie" />
            </div>
            <div className="template-chart-block">
              <div className="template-chart-title">类别分布</div>
              <TemplateWeightChart templates={commonTemplates} dimension="workCategory" type="bar" />
            </div>
            <div className="template-chart-block">
              <div className="template-chart-title">形式分布</div>
              <TemplateWeightChart templates={commonTemplates} dimension="workForm" type="bar" />
            </div>
          </div>
        </div>
      </section>
    ) : (
      <EmptyState
        icon={<ChartPie className="size-5" />}
        title="暂无常用模板"
        text="手动新增或从全部模板中设为常用后，这里会显示权重分布。"
      />
    )
  );

  return (
    <>
      <PageHeader
        title="模板库"
        action={
          <div className="template-titlebar-actions">
            <TemplateMonthNav month={templateMonth} onChange={setTemplateMonth} />
            <div className="template-title-tabs">
              <div className="template-viewbar" role="tablist" aria-label="模板库视图">
                <button className={templateView === "common" ? "active" : ""} onClick={() => setTemplateView("common")} role="tab" aria-selected={templateView === "common"}>常用模板</button>
                <button className={templateView === "all" ? "active" : ""} onClick={() => setTemplateView("all")} role="tab" aria-selected={templateView === "all"}>全部模板</button>
                <button className={templateView === "add" ? "active" : ""} onClick={() => setTemplateView("add")} role="tab" aria-selected={templateView === "add"}>新增模板</button>
              </div>
            </div>
          </div>
        }
      />
      <div className="template-page panel-card">
        {templateView === "common" ? (
          <>
            <div className="template-preset-bar">
              <div className="template-preset-main">
                <span className="template-preset-label">方案</span>
                <Select value={selectedPreset?.id || ""} onChange={(event) => setSelectedPresetId(event.target.value)}>
                  {templatePresets.length ? templatePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  )) : <option value="">暂无方案</option>}
                </Select>
                <Button variant="primary" disabled={!selectedPreset} onClick={applySelectedPreset}><Check className="size-4" />应用</Button>
                <Button variant="ghost" disabled={!selectedPreset} onClick={updateSelectedPreset}>更新</Button>
                <Button variant="ghost" onClick={saveCurrentAsPreset}><Plus className="size-4" />保存为</Button>
              </div>
              <div className="template-preset-actions">
                <input ref={presetInputRef} className="sr-only" type="file" accept=".json" onChange={importTemplatePreset} />
                <Button variant="ghost" onClick={() => presetInputRef.current?.click()}><FileUp className="size-4" />导入</Button>
                <Button variant="ghost" onClick={exportSelectedPreset}><FileDown className="size-4" />导出</Button>
                <Button variant="danger" disabled={!selectedPreset} onClick={deleteSelectedPreset}><Trash2 className="size-4" />删除</Button>
              </div>
            </div>
            <div className="template-common-switchbar">
              <div className="toolbar-segmented compact template-mode-switch" role="tablist" aria-label="常用模板显示方式">
                <button className={cn(commonTemplateMode === "cards" && "active")} onClick={() => setCommonTemplateMode("cards")} role="tab" aria-selected={commonTemplateMode === "cards"}>卡片列表</button>
                <button className={cn(commonTemplateMode === "charts" && "active")} onClick={() => setCommonTemplateMode("charts")} role="tab" aria-selected={commonTemplateMode === "charts"}>图表</button>
              </div>
              <div className="template-common-actions">
                {renderGroupSwitch()}
                <Badge tone="blue">{commonTemplates.length}</Badge>
                <Button variant="ghost" disabled={commonTemplates.length === 0} onClick={pauseCommonTemplates}>全部移出常用</Button>
              </div>
            </div>
            {commonTemplateMode === "cards" ? renderTemplateList(false) : renderCommonCharts()}
          </>
        ) : null}
        {templateView === "all" ? renderTemplateList() : null}
        {templateView === "add" ? (
          <div className="template-form-panel">
              <div><div className="text-base font-semibold text-ink">新增模板</div><div className="mt-1 text-sm text-muted">新增模板会自动加入常用模板，用于后续补全。</div></div>
              <Field label="模板名称"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：资料调研" /></Field>
              <div className="grid gap-3 md:grid-cols-2"><Field label="工作性质"><Select value={draft.workNature} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workNature: e.target.value }, state.projects))}>{withCurrentOption(workNatureOptions, draft.workNature).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="工作类别"><Select value={draft.workCategory} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workCategory: e.target.value }, state.projects))}>{withCurrentOption(getWorkCategoryOptions(draft.workNature), draft.workCategory).map((item) => <option key={item}>{item}</option>)}</Select></Field></div>
              <Field label="关联项目"><ProjectSelect required={projectRequired} value={draft.projectName} projects={state.projects} workCategory={draft.workCategory} onChange={(projectName) => setDraft({ ...draft, projectName })} /></Field>
              {draftWorkFormChoices.length ? (
                <div className="grid gap-3 md:grid-cols-2"><Field label="工作形式"><Select value={draft.workForm} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workForm: e.target.value }, state.projects))}>{withCurrentOption(draftWorkFormChoices, draft.workForm).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="补全权重"><Input type="number" min={1} max={20} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: clampTemplateWeight(Number(e.target.value)) })} /></Field></div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2"><Field label="工作形式"><Input value="无需填写" disabled /></Field><Field label="补全权重"><Input type="number" min={1} max={20} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: clampTemplateWeight(Number(e.target.value)) })} /></Field></div>
              )}
              <Field label="备注备选"><Textarea value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} placeholder="每行一个常用备注" /></Field>
              <Field label="类型"><Select value={draft.scheduleKind} onChange={(e) => setDraft({ ...draft, scheduleKind: e.target.value as WorkTemplate["scheduleKind"] })}><option value="random">随机模板</option><option value="fixed">固定安排</option><option value="weekend_lecture">周末讲堂</option></Select></Field>
              {draft.scheduleKind !== "random" ? <div className="grid gap-3 md:grid-cols-3"><Field label="周几"><Input type="number" min={1} max={7} value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })} /></Field><Field label="开始"><Input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></Field><Field label="结束"><Input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></Field></div> : null}
              {formError ? <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{formError}</div> : null}
              <div className="flex gap-2">
                <Button variant="primary" onClick={addTemplate}><Plus className="size-4" />新增模板</Button>
              </div>
          </div>
        ) : null}
      </div>
      {editingTemplate ? (
        <TemplateEditorModal
          template={editingTemplate}
          projects={state.projects}
          onClose={() => setEditingTemplate(null)}
          onSave={saveEditedTemplate}
        />
      ) : null}
    </>
  );
}

function TemplateEditorModal({
  template,
  projects,
  onClose,
  onSave,
}: {
  template: WorkTemplate;
  projects: Project[];
  onClose: () => void;
  onSave: (template: WorkTemplate) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: template.name,
    workNature: template.workNature,
    workCategory: template.workCategory,
    projectName: template.projectName || "",
    workForm: template.workForm,
    remark: normalizeRemarkOptions(template).join("\n"),
    weight: clampTemplateWeight(template.weight),
    scheduleKind: template.scheduleKind,
    weekday: template.weekday || 1,
    startTime: template.startTime || "08:00",
    endTime: template.endTime || "09:00",
  });
  const [formError, setFormError] = useState("");
  const projectRequired = requiresLinkedProject(draft.workCategory);
  const workFormChoices = getWorkFormOptions(draft.workNature);
  const remarkOptions = [...new Set(draft.remark.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, 12);

  const submit = async () => {
    if (projectRequired && (!draft.projectName || draft.projectName === "备注" || !projectExists(projects, draft.projectName))) {
      setFormError("这个工作类别必须选择项目库中的具体项目。");
      return;
    }
    const projectName = draft.projectName || "备注";
    const workForm = workFormChoices.length ? draft.workForm : "";
    const name = draft.name || (projectName !== "备注" ? `${projectName}${workForm ? ` / ${workForm}` : ""}` : formatCategoryForm(draft.workCategory, workForm));
    await onSave({
      ...template,
      name,
      workNature: draft.workNature,
      workCategory: draft.workCategory,
      projectName,
      workForm,
      remark: remarkOptions[0],
      remarkOptions,
      weight: clampTemplateWeight(draft.weight),
      scheduleKind: draft.scheduleKind,
      weekday: draft.scheduleKind === "random" ? undefined : Number(draft.weekday),
      startTime: draft.scheduleKind === "random" ? undefined : draft.startTime,
      endTime: draft.scheduleKind === "random" ? undefined : draft.endTime,
      updatedAt: now(),
    });
  };

  return createPortal(
    <>
      <button className="entry-editor-backdrop" aria-label="关闭编辑" onClick={onClose} />
      <aside className="entry-editor-panel template-editor-panel panel-card">
        <div className="entry-editor-head">
          <div>
            <div className="text-sm font-bold text-ink">编辑模板</div>
            <div className="mt-1 text-xs text-muted">{formatCategoryForm(template.workCategory, template.workForm)}</div>
          </div>
          <button className="toolbar-icon-button" onClick={onClose} aria-label="关闭"><X className="size-4" /></button>
        </div>
        <div className="entry-editor-form">
          <Field label="模板名称"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="工作性质"><Select value={draft.workNature} onChange={(event) => setDraft(normalizeWorkSelection(draft, { workNature: event.target.value }, projects))}>{withCurrentOption(workNatureOptions, draft.workNature).map((item) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="工作类别"><Select value={draft.workCategory} onChange={(event) => setDraft(normalizeWorkSelection(draft, { workCategory: event.target.value }, projects))}>{withCurrentOption(getWorkCategoryOptions(draft.workNature), draft.workCategory).map((item) => <option key={item}>{item}</option>)}</Select></Field>
          </div>
          <Field label="关联项目"><ProjectSelect required={projectRequired} value={draft.projectName} projects={projects} workCategory={draft.workCategory} onChange={(projectName) => setDraft({ ...draft, projectName })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            {workFormChoices.length ? <Field label="工作形式"><Select value={draft.workForm} onChange={(event) => setDraft(normalizeWorkSelection(draft, { workForm: event.target.value }, projects))}>{withCurrentOption(workFormChoices, draft.workForm).map((item) => <option key={item}>{item}</option>)}</Select></Field> : <Field label="工作形式"><Input value="无需填写" disabled /></Field>}
            <Field label="补全权重"><Input type="number" min={1} max={20} value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: clampTemplateWeight(Number(event.target.value)) })} /></Field>
          </div>
          <Field label="备注备选"><Textarea value={draft.remark} onChange={(event) => setDraft({ ...draft, remark: event.target.value })} placeholder="每行一个常用备注" /></Field>
          <Field label="类型"><Select value={draft.scheduleKind} onChange={(event) => setDraft({ ...draft, scheduleKind: event.target.value as WorkTemplate["scheduleKind"] })}><option value="random">随机模板</option><option value="fixed">固定安排</option><option value="weekend_lecture">周末讲堂</option></Select></Field>
          {draft.scheduleKind !== "random" ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="周几"><Input type="number" min={1} max={7} value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })} /></Field>
              <Field label="开始"><Input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></Field>
              <Field label="结束"><Input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></Field>
            </div>
          ) : null}
          {formError ? <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{formError}</div> : null}
        </div>
        <div className="entry-editor-actions">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button className="ml-auto" variant="primary" onClick={submit}><Check className="size-4" />保存</Button>
        </div>
      </aside>
    </>,
    document.body,
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
  const draftWorkFormChoices = getWorkFormOptions(draft.workNature);
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
    const entry: TimesheetEntry = { id: createId("entry"), ...draft, workForm: draftWorkFormChoices.length ? draft.workForm : "", status: "confirmed", source: "manual", createdAt: now(), updatedAt: now() };
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
          {draftWorkFormChoices.length ? <Field label="形式"><Select value={draft.workForm} onChange={(e) => setDraft(normalizeWorkSelection(draft, { workForm: e.target.value }, state.projects))}>{withCurrentOption(draftWorkFormChoices, draft.workForm).map((item) => <option key={item}>{item}</option>)}</Select></Field> : <Field label="形式"><Input value="无需填写" disabled /></Field>}<Field label="备注"><Input value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} /></Field><div className="flex items-end"><Button variant="primary" onClick={addEntry} className="w-full"><Plus className="size-4" />新增</Button></div>
        </div>
        {formError ? <p className="mt-3 rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{formError}</p> : null}
      </Card>
      <Card>
        <CardHeader title={`${month} 工时记录`} action={<Badge tone="blue">{entries.reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0).toFixed(1)}h</Badge>} />
        {entries.length === 0 ? <div className="p-5"><EmptyState icon={<Table2 className="size-5" />} title="暂无工时记录" text="新增一条记录，或从导入导出页导入 Excel。" /></div> : <div className="overflow-auto scrollbar-soft">
          <table className="table-glass w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line/10 text-xs text-muted"><tr><th className="px-5 py-3">日期</th><th className="px-5 py-3">时间</th><th className="px-5 py-3">性质</th><th className="px-5 py-3">类别</th><th className="px-5 py-3">关联项目</th><th className="px-5 py-3">形式</th><th className="px-5 py-3">备注</th><th className="px-5 py-3">操作</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-line/10"><td className="px-5 py-3">{entry.workDate}</td><td className="px-5 py-3 text-muted">{entry.startTime}-{entry.endTime}</td><td className="px-5 py-3">{entry.workNature}</td><td className="px-5 py-3">{entry.workCategory}</td><td className="px-5 py-3 text-muted">{entry.projectName || "备注"}</td><td className="px-5 py-3">{entry.workForm || "-"}</td><td className="px-5 py-3 text-muted">{entry.remark || "-"}</td><td className="px-5 py-3"><div className="flex gap-2"><Button variant="ghost" onClick={() => setEditingEntry(entry)}><Pencil className="size-4" />编辑</Button><Button variant="ghost" onClick={() => removeEntry(entry)}>删除</Button></div></td></tr>)}</tbody>
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

export default App;
