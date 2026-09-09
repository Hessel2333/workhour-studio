import type { Profile, WorkspaceState } from "./types";

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => Boolean(value && typeof value === "object" && !Array.isArray(value));
const fail = (path: string): never => { throw new Error(`数据格式不正确：${path}。未覆盖本地数据。`); };
const text = (value: unknown) => typeof value === "string";
const nonempty = (value: unknown) => text(value) && (value as string).trim().length > 0;
const timestamp = (value: unknown) => nonempty(value) && Number.isFinite(Date.parse(value as string));
const time = (value: unknown) => text(value) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value as string);
const date = (value: unknown) => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value as string)
  && Number.isFinite(Date.parse(value as string)) && new Date(value as string).toISOString().slice(0, 10) === value;
const month = (value: unknown) => text(value) && /^\d{4}-(0[1-9]|1[0-2])$/.test(value as string);
const weight = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 20;
const bool = (value: unknown) => typeof value === "boolean";
const oneOf = (...choices: string[]) => (value: unknown) => choices.includes(value as string);

function field(row: Row, key: string, check: (value: unknown) => boolean, path: string, optional = false) {
  if (optional && (row[key] === undefined || row[key] === null)) return;
  if (!check(row[key])) fail(`${path}.${key}`);
}

export function validateProfile(value: unknown): asserts value is Profile {
  if (!record(value)) fail("profile");
  const row = value as Row;
  field(row, "id", nonempty, "profile");
  field(row, "language", oneOf("zh-CN", "en-US"), "profile");
  field(row, "theme", oneOf("light", "dark", "system"), "profile");
  for (const key of ["defaultStart", "defaultEnd", "lunchStart", "lunchEnd"]) field(row, key, time, "profile");
  if ((row.defaultEnd as string) <= (row.defaultStart as string)) fail("profile：结束时间必须晚于开始时间");
  if ((row.lunchEnd as string) < (row.lunchStart as string)) fail("profile：午休结束不能早于开始");
  for (const key of ["createdAt", "updatedAt"]) field(row, key, timestamp, "profile");
  field(row, "excelPath", text, "profile", true);
}

// Version 1 predates monthly settings and presets. Only these two collections
// may be absent in an old backup; missing core collections are never empty data.
export function validateWorkspace(value: unknown): WorkspaceState {
  if (!record(value)) fail("workspace");
  const data = value as Row;
  validateProfile(data.profile);
  const normalized: Row = { ...data, monthlyTemplateSettings: data.monthlyTemplateSettings === undefined ? [] : data.monthlyTemplateSettings, templatePresets: data.templatePresets === undefined ? [] : data.templatePresets };
  for (const collection of ["projects", "aliases", "templates", "monthlyTemplateSettings", "templatePresets", "blocks", "entries", "jobs"] as const) {
    const items = normalized[collection];
    if (!Array.isArray(items)) fail(collection);
    const ids = new Set<string>();
    const monthlyKeys = new Set<string>();
    (items as unknown[]).forEach((item, index) => {
      const path = `${collection}[${index}]`;
      if (!record(item)) fail(path);
      const row = item as Row;
      const check = (key: string, test: (v: unknown) => boolean, optional = false) => field(row, key, test, path, optional);
      check("id", nonempty);
      if (ids.has(row.id as string)) fail(`${path}.id 重复`);
      ids.add(row.id as string);
      check("createdAt", timestamp);
      if (collection !== "aliases" && collection !== "jobs") check("updatedAt", timestamp);
      for (const key of ["projectId", "projectName", "remark", "collaborator"]) check(key, text, true);
      if (collection === "projects") {
        for (const key of ["name", "category"]) check(key, nonempty);
        check("code", text, true); check("ownerScope", oneOf("self", "other"), true);
        check("status", oneOf("active", "closed", "paused")); check("isFavorite", bool);
        check("source", oneOf("manual", "excel", "json", "script"));
        for (const key of ["beginDate", "endDate"]) check(key, date, true);
      } else if (collection === "aliases") {
        check("projectId", nonempty); check("alias", nonempty); check("matchMode", oneOf("exact", "fuzzy"));
      } else if (collection === "templates") {
        for (const key of ["name", "workNature", "workCategory"]) check(key, nonempty);
        check("workForm", text);
        check("enabled", bool); check("archived", bool, true); check("weight", weight);
        check("scheduleKind", oneOf("random", "fixed", "weekend_lecture"));
        check("remarkOptions", (v) => Array.isArray(v) && v.every(text), true);
        check("weekday", (v) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 7, row.scheduleKind !== "fixed");
        for (const key of ["startTime", "endTime"]) check(key, time, row.scheduleKind === "random");
        if (row.scheduleKind !== "random" && (row.endTime as string) <= (row.startTime as string)) fail(`${path} 时间范围`);
      } else if (collection === "monthlyTemplateSettings") {
        check("month", month); check("templateId", nonempty); check("enabled", bool); check("weight", weight);
        const key = `${row.month}/${row.templateId}`;
        if (monthlyKeys.has(key)) fail(`${path} 月度模板设置重复`);
        monthlyKeys.add(key);
      } else if (collection === "templatePresets") {
        check("name", nonempty);
        check("settings", (v) => Array.isArray(v) && v.every((s) => record(s) && nonempty(s.templateId) && bool(s.enabled) && weight(s.weight)));
      } else if (collection === "entries" || collection === "blocks") {
        check("workDate", date); check("startTime", time); check("endTime", (v) => time(v) || v === "24:00");
        if ((row.endTime as string) <= (row.startTime as string)) fail(`${path} 时间范围`);
        if (collection === "entries") {
          for (const key of ["workNature", "workCategory"]) check(key, nonempty);
          check("workForm", text);
          check("status", oneOf("confirmed")); check("source", oneOf("manual", "excel", "autofill", "template"));
          check("exportedAt", timestamp, true);
        } else {
          check("title", nonempty); check("templateId", text, true);
          check("status", oneOf("planned", "done", "skipped")); check("source", oneOf("manual", "template", "excel"));
        }
      } else {
        check("kind", oneOf("excel_import", "excel_export", "json_import", "json_export"));
        check("fileName", nonempty); check("status", oneOf("success", "failed"));
        for (const key of ["summary", "errorText", "periodStart", "periodEnd"]) check(key, text, true);
      }
    });
  }
  return normalized as unknown as WorkspaceState;
}
