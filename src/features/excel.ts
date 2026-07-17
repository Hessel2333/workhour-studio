import * as XLSX from "xlsx";
import { createId } from "../data/defaults";
import type { ImportExportJob, ImportResult, Profile, Project, TimesheetEntry, WorkTemplate } from "../data/types";
import { dateForMonthDay, durationHours, fromMinutes, sameEntryBody, toMinutes } from "../lib/time";

type RawRow = Record<string, unknown>;
type ExportCell = string | number | null;

const now = () => new Date().toISOString();

const normalizeHeader = (value: unknown) => String(value ?? "").replace(/\s+/g, "");

const parseSheetMonth = (sheetName: string) => {
  const match = sheetName.match(/^\s*(20\d{2})年(\d{1,2})月\s*$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    year,
    month,
    key: `${year}-${String(month).padStart(2, "0")}`,
  };
};

const text = (value: unknown) => String(value ?? "").trim();
const legacyTransactionalNature = "\u975e\u79d1\u7814\u5de5\u4f5c";
const normalizeWorkNature = (value: unknown, fallback = "事务性工作") => {
  const textValue = text(value);
  if (textValue === legacyTransactionalNature) return "事务性工作";
  return textValue || fallback;
};

const normalizeTime = (value: unknown) => {
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    if (value >= 0 && value < 1) return fromMinutes(Math.round(value * 24 * 60));
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  return "";
};

const findHeaderRow = (rows: unknown[][]) =>
  rows.findIndex((row) => row.some((cell) => normalizeHeader(cell).includes("开始时间")));

const columnMap = (header: unknown[]) => {
  const map: Record<string, number> = {};
  header.forEach((cell, index) => {
    const value = normalizeHeader(cell);
    if (value.includes("月日")) map.day = index;
    if (value.includes("开始时间")) map.startTime = index;
    if (value.includes("结束时间")) map.endTime = index;
    if (value === "工作性质") map.workNature = index;
    if (value === "工作类别") map.workCategory = index;
    if (value.includes("关联项目") || value.includes("内容属性")) map.projectName = index;
    if (value === "工作形式") map.workForm = index;
    if (value === "备注") map.remark = index;
    if (value === "共同完成人") map.collaborator = index;
  });
  return map;
};

const isSameEntry = (a: TimesheetEntry, b: TimesheetEntry) =>
  a.workDate === b.workDate && sameEntryBody(a, b) && a.source === b.source && a.status === b.status;

export const mergeContinuousEntries = (entries: TimesheetEntry[]) => {
  const sorted = [...entries].sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const merged: TimesheetEntry[] = [];
  for (const entry of sorted) {
    const last = merged[merged.length - 1];
    if (last && isSameEntry(last, entry) && last.endTime === entry.startTime) {
      last.endTime = entry.endTime;
      last.updatedAt = now();
    } else {
      merged.push({ ...entry });
    }
  }
  return merged;
};

const findSheetRows = (workbook: XLSX.WorkBook, names: string[]) => {
  const target = new Set(names.map(normalizeHeader));
  const sheetName = workbook.SheetNames.find((name) => target.has(normalizeHeader(name)));
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null });
};

const findHeaderByLabels = (rows: unknown[][], labels: string[]) => {
  const targets = labels.map(normalizeHeader);
  return rows.findIndex((row) => targets.every((label) => row.some((cell) => normalizeHeader(cell).includes(label))));
};

const indexByHeader = (header: unknown[], labels: string[]) => {
  const targets = labels.map(normalizeHeader);
  return header.findIndex((cell) => {
    const value = normalizeHeader(cell);
    return targets.some((label) => value.includes(label));
  });
};

const templateKey = (template: Pick<WorkTemplate, "workNature" | "workCategory" | "projectName" | "workForm" | "scheduleKind">) =>
  [template.workNature, template.workCategory, template.projectName || "", template.workForm, template.scheduleKind].join("\u0001");

const normalizeRemarkOptions = (values: Array<string | undefined>) =>
  [...new Set(values.map((value) => text(value)).filter(Boolean))].slice(0, 12);

const projectRequiredCategories = new Set(["总部项目", "公司项目", "院控项目", "创新创效", "探索项目", "其他科研生产"]);
const requiresProject = (workCategory: string) => projectRequiredCategories.has(workCategory);
const hasLinkedProject = (projectName?: string) => Boolean(projectName && projectName !== "备注");
const defaultExportStart = "08:00";
const defaultExportEnd = "17:00";
const validProjectCategories = new Set(["总部项目", "公司项目", "院控项目", "探索项目"]);

const normalizeProjectCategory = (name = "", code = "", category = "") => {
  const raw = `${category} ${code} ${name}`.toUpperCase();
  if (validProjectCategories.has(category)) return category;
  if (raw.includes("NM")) return "院控项目";
  if (raw.includes("KF") || raw.includes("KY")) return "公司项目";
  if (raw.includes("总部")) return "总部项目";
  if (raw.includes("公司")) return "公司项目";
  if (raw.includes("院控")) return "院控项目";
  if (raw.includes("探索")) return "探索项目";
  return "探索项目";
};

const pushTemplate = (templates: Map<string, WorkTemplate>, template: Omit<WorkTemplate, "id" | "createdAt" | "updatedAt">) => {
  if (!template.workNature || !template.workCategory) return;
  if (template.workNature !== "请假" && !template.workForm) return;
  if (requiresProject(template.workCategory) && !hasLinkedProject(template.projectName)) return;
  const next: WorkTemplate = {
    id: createId("template_xlsx"),
    ...template,
    workNature: normalizeWorkNature(template.workNature, "事务性工作"),
    createdAt: now(),
    updatedAt: now(),
  };
  const key = templateKey(next);
  if (!templates.has(key)) templates.set(key, next);
};

const importProjectList = (workbook: XLSX.WorkBook) => {
  const rows = findSheetRows(workbook, ["项目清单"]);
  const headerIndex = findHeaderByLabels(rows, ["关联项目"]);
  if (headerIndex < 0) return [] as Project[];

  const header = rows[headerIndex];
  const nameIndex = indexByHeader(header, ["关联项目", "项目名称"]);
  const categoryIndex = indexByHeader(header, ["项目类别", "类别"]);
  const remarkIndex = indexByHeader(header, ["备注"]);
  const codeIndex = indexByHeader(header, ["项目号", "项目编号"]);
  const projects = new Map<string, Project>();

  for (const row of rows.slice(headerIndex + 1)) {
    const name = text(row[nameIndex]);
    if (!name || name === "备注") continue;
    const code = text(row[codeIndex]);
    const rawCategory = categoryIndex >= 0 ? text(row[categoryIndex]) : "";
    const remark = remarkIndex >= 0 ? text(row[remarkIndex]) : "";
    const category = normalizeProjectCategory(name, code, rawCategory);
    if (!projects.has(name)) {
      projects.set(name, {
        id: createId("project"),
        name,
        code: code || undefined,
        category,
        remark: remark || undefined,
        ownerScope: "self",
        status: "active",
        source: "excel",
        isFavorite: true,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }

  return [...projects.values()];
};

const importMenuTemplates = (workbook: XLSX.WorkBook) => {
  const rows = findSheetRows(workbook, ["一级和二级彩蛋", "一级和二级菜单"]);
  if (!rows.length) return [];
  const header = rows[0];
  const templates = new Map<string, WorkTemplate>();

  header.forEach((cell, column) => {
    const workNature = normalizeWorkNature(cell, "");
    if (!workNature) return;
    for (const row of rows.slice(1)) {
      const workCategory = text(row[column]);
      if (!workCategory) continue;
      pushTemplate(templates, {
        name: `${workNature} / ${workCategory}`,
        workNature,
        workCategory,
        projectName: "备注",
        workForm: workCategory === "会议" ? "基地会议" : "其他",
        remark: "",
        collaborator: "",
        weight: 1,
        scheduleKind: "random",
        enabled: false,
      });
    }
  });

  return [...templates.values()];
};

const importHistoryTemplates = (entries: TimesheetEntry[], projects: Project[]) => {
  const projectByName = new Map(projects.map((project) => [project.name, project]));
  const templates = new Map<string, { template: WorkTemplate; count: number; remarks: Map<string, number> }>();

  entries.forEach((entry) => {
    const project = entry.projectName && entry.projectName !== "备注" ? projectByName.get(entry.projectName) : undefined;
    if (entry.projectName && entry.projectName !== "备注" && !project) return;
    const workCategory = project ? project.category : entry.workCategory;
    const projectName = project?.name || "备注";
    if (requiresProject(workCategory) && !hasLinkedProject(projectName)) return;
    const template: WorkTemplate = {
      id: createId("template_xlsx"),
      name: projectName !== "备注" ? `${projectName}${entry.workForm ? ` / ${entry.workForm}` : ""}` : `${entry.workCategory}${entry.workForm ? ` / ${entry.workForm}` : ""}`,
      workNature: entry.workNature,
      workCategory,
      projectName,
      workForm: entry.workForm,
      remark: "",
      remarkOptions: normalizeRemarkOptions([entry.remark]),
      collaborator: "",
      weight: 1,
      scheduleKind: "random",
      enabled: false,
      createdAt: now(),
      updatedAt: now(),
    };
    const key = templateKey(template);
    const current = templates.get(key);
    const remark = text(entry.remark);
    if (current) {
      current.count += 1;
      if (remark) current.remarks.set(remark, (current.remarks.get(remark) || 0) + 1);
      current.template.updatedAt = now();
    } else {
      const remarks = new Map<string, number>();
      if (remark) remarks.set(remark, 1);
      templates.set(key, { template, count: 1, remarks });
    }
  });

  return [...templates.values()].map(({ template, count, remarks }) => {
    const remarkOptions = [...remarks.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([remark]) => remark)
      .slice(0, 12);
    return {
      ...template,
      remark: remarkOptions[0] || undefined,
      remarkOptions,
      weight: Math.min(20, Math.max(1, Math.round(Math.log2(count + 1) * 4))),
    };
  });
};

export async function importExcelWorkbook(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const entries: TimesheetEntry[] = [];
  const projects = importProjectList(workbook);

  for (const sheetName of workbook.SheetNames) {
    const parsed = parseSheetMonth(sheetName);
    if (!parsed || parsed.year < 2026) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const headerIndex = findHeaderRow(rows);
    if (headerIndex < 0) continue;
    const map = columnMap(rows[headerIndex]);
    if (map.startTime === undefined || map.endTime === undefined) continue;

    let currentDay = 0;
    for (const row of rows.slice(headerIndex + 1)) {
      const rawDay = row[map.day];
      if (rawDay !== null && rawDay !== undefined && String(rawDay).trim() !== "") {
        currentDay = Number(String(rawDay).replace(/[^\d]/g, ""));
      }
      if (!currentDay) continue;
      const startTime = normalizeTime(row[map.startTime]);
      const endTime = normalizeTime(row[map.endTime]);
      if (!startTime || !endTime) continue;

      const body: RawRow = {
        workNature: row[map.workNature],
        workCategory: row[map.workCategory],
        projectName: row[map.projectName],
        workForm: row[map.workForm],
        remark: row[map.remark],
        collaborator: row[map.collaborator],
      };
      const hasContent = Object.values(body).some((value) => String(value ?? "").trim());
      if (!hasContent) continue;

      const workNature = normalizeWorkNature(body.workNature, "科研工作");
      entries.push({
        id: createId("entry"),
        workDate: dateForMonthDay(parsed.key, currentDay),
        startTime,
        endTime,
        workNature,
        workCategory: String(body.workCategory || "其他科研生产"),
        projectName: String(body.projectName || "备注"),
        workForm: workNature === "请假" ? "" : String(body.workForm || "其他"),
        remark: body.remark ? String(body.remark) : undefined,
        collaborator: body.collaborator ? String(body.collaborator) : undefined,
        status: "confirmed",
        source: "excel",
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }

  const merged = mergeContinuousEntries(entries);
  const months = new Set(merged.map((entry) => entry.workDate.slice(0, 7)));
  const sortedMonths = [...months].sort();
  const templateMap = new Map<string, WorkTemplate>();
  const menuTemplates = importMenuTemplates(workbook);
  const historyTemplates = importHistoryTemplates(merged, projects);
  [
    ...menuTemplates,
    ...historyTemplates,
  ].forEach((template) => {
    const key = templateKey(template);
    if (!templateMap.has(key)) templateMap.set(key, template);
  });
  const templates = [...templateMap.values()];
  const jobs: ImportExportJob[] = [
    {
      id: createId("job"),
      kind: "excel_import",
      fileName: file.name,
      periodStart: sortedMonths[0],
      periodEnd: sortedMonths.at(-1),
      status: "success",
      summary: `导入 ${months.size} 个月，${merged.length} 条 2026 年及以后工时记录，${projects.length} 个项目，${templates.length} 个模板`,
      createdAt: now(),
    },
  ];

  return {
    entries: merged,
    projects,
    templates,
    jobs,
    summary: jobs[0].summary || "",
  };
}

export async function importConfigJson(file: File): Promise<ImportResult> {
  const text = await file.text();
  const json = JSON.parse(text);
  const templates: WorkTemplate[] = [];

  for (const item of json.随机时段工作内容 || []) {
    const workNature = normalizeWorkNature(item.工作性质, "科研工作");
    templates.push({
      id: createId("template"),
      name: item.备注 || item.工作形式 || "工作模板",
      workNature,
      workCategory: item.工作类别 || "其他科研生产",
      projectName: item.关联项目 || item.内容属性 || "备注",
      workForm: workNature === "请假" ? "" : item.工作形式 || "其他",
      remark: item.备注 || "",
      remarkOptions: normalizeRemarkOptions([item.备注]),
      collaborator: item.共同完成人 || "",
      weight: Number(item.权重 || 1),
      scheduleKind: "random",
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  for (const item of json.固定时段工作内容 || []) {
    const fixed = item.固定时段 || {};
    const workNature = normalizeWorkNature(item.工作性质, "事务性工作");
    templates.push({
      id: createId("template"),
      name: item.描述 || item.备注 || "固定安排",
      workNature,
      workCategory: item.工作类别 || "其他事务性",
      projectName: item.关联项目 || item.内容属性 || "备注",
      workForm: workNature === "请假" ? "" : item.工作形式 || "其他",
      remark: item.备注 || "",
      remarkOptions: normalizeRemarkOptions([item.备注]),
      collaborator: item.共同完成人 || "",
      weight: 1,
      scheduleKind: "fixed",
      weekday: Number(fixed.周几 || 1),
      startTime: `${String(fixed.开始时间_时 ?? 8).padStart(2, "0")}:${String(fixed.开始时间_分 ?? 0).padStart(2, "0")}`,
      endTime: `${String(fixed.结束时间_时 ?? 9).padStart(2, "0")}:${String(fixed.结束时间_分 ?? 0).padStart(2, "0")}`,
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  if (json.周末讲堂模板) {
    const item = json.周末讲堂模板;
    const workNature = normalizeWorkNature(item.工作性质, "科研工作");
    templates.push({
      id: createId("template"),
      name: item.备注 || "周末讲堂",
      workNature,
      workCategory: item.工作类别 || "其他科研",
      projectName: item.关联项目 || item.内容属性 || "备注",
      workForm: workNature === "请假" ? "" : item.工作形式 || "基地会议",
      remark: item.备注 || "周末讲堂",
      remarkOptions: normalizeRemarkOptions([item.备注 || "周末讲堂"]),
      collaborator: item.共同完成人 || "",
      weight: 1,
      scheduleKind: "weekend_lecture",
      weekday: 6,
      startTime: `${String(item.开始小时 ?? 9).padStart(2, "0")}:${String(item.开始分钟 ?? 0).padStart(2, "0")}`,
      endTime: `${String(item.结束小时 ?? 11).padStart(2, "0")}:${String(item.结束分钟 ?? 30).padStart(2, "0")}`,
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  const usableTemplates = templates.filter((template) => !requiresProject(template.workCategory) || hasLinkedProject(template.projectName));
  const jobs: ImportExportJob[] = [
    {
      id: createId("job"),
      kind: "json_import",
      fileName: file.name,
      status: "success",
      summary: `导入 ${usableTemplates.length} 个模板`,
      createdAt: now(),
    },
  ];
  return { templates: usableTemplates, jobs, summary: jobs[0].summary || "" };
}

const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const getExportRange = (profile?: Profile) => {
  const start = toMinutes(profile?.defaultStart || defaultExportStart);
  const end = toMinutes(profile?.defaultEnd || defaultExportEnd);
  if (end <= start) {
    return { start: toMinutes(defaultExportStart), end: toMinutes(defaultExportEnd) };
  }
  return { start, end };
};

const findSlotEntry = (dayEntries: TimesheetEntry[], slotStart: string, slotEnd: string) =>
  dayEntries.find((entry) => toMinutes(entry.startTime) < toMinutes(slotEnd) && toMinutes(entry.endTime) > toMinutes(slotStart));

export function exportMonthExcel(entries: TimesheetEntry[], month: string, profile?: Profile) {
  const [year, mon] = month.split("-");
  const yearNumber = Number(year);
  const monthNumber = Number(mon);
  const monthEntries = entries
    .filter((entry) => entry.workDate.startsWith(month))
    .sort((a, b) => `${a.workDate} ${a.startTime}`.localeCompare(`${b.workDate} ${b.startTime}`));
  const rows: ExportCell[][] = [[`   ${monthNumber}月日`, "开始时间", "结束时间", "工作性质", "工作类别", "关联项目", "工作形式", "备注", "共同完成人"]];
  let slotCount = 0;
  const dayCount = getDaysInMonth(yearNumber, monthNumber);
  const { start, end } = getExportRange(profile);

  for (let day = 1; day <= dayCount; day += 1) {
    const workDate = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEntries = monthEntries.filter((entry) => entry.workDate === workDate);
    let isFirstSlotOfDay = true;

    for (let minute = start; minute < end; minute += 30) {
      const slotStart = fromMinutes(minute);
      const slotEnd = fromMinutes(minute + 30);
      const entry = findSlotEntry(dayEntries, slotStart, slotEnd);
      rows.push([
        isFirstSlotOfDay ? day : null,
        slotStart,
        slotEnd,
        entry?.workNature || null,
        entry?.workCategory || null,
        entry?.projectName && entry.projectName !== "备注" ? entry.projectName : null,
        entry?.workForm || null,
        entry?.remark || null,
        entry?.collaborator || null,
      ]);
      if (entry) slotCount += 1;
      isFirstSlotOfDay = false;
    }

    if (day < dayCount) rows.push([]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 34 },
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, `${year}年${monthNumber}月`);
  XLSX.writeFile(wb, `工时_${year}年${monthNumber}月.xlsx`);

  return {
    id: createId("job"),
    kind: "excel_export" as const,
    fileName: `工时_${year}年${monthNumber}月.xlsx`,
    periodStart: month,
    periodEnd: month,
    status: "success" as const,
    summary: `导出 ${dayCount} 天，${slotCount} 个有效半小时时段，合计 ${monthEntries.reduce((sum, entry) => sum + durationHours(entry.startTime, entry.endTime), 0)} 小时`,
    createdAt: now(),
  };
}
