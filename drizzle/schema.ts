import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  language: text("language").notNull().default("zh-CN"),
  theme: text("theme").notNull().default("system"),
  defaultStart: text("default_start").notNull().default("08:00"),
  defaultEnd: text("default_end").notNull().default("17:00"),
  lunchStart: text("lunch_start").notNull().default("11:30"),
  lunchEnd: text("lunch_end").notNull().default("13:00"),
  excelPath: text("excel_path"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  category: text("category").notNull(),
  status: text("status").notNull().default("active"),
  beginDate: text("begin_date"),
  endDate: text("end_date"),
  source: text("source").notNull().default("manual"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectAliases = sqliteTable("project_aliases", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  alias: text("alias").notNull(),
  matchMode: text("match_mode").notNull().default("fuzzy"),
  createdAt: text("created_at").notNull(),
});

export const workTemplates = sqliteTable("work_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  workNature: text("work_nature").notNull(),
  workCategory: text("work_category").notNull(),
  projectId: text("project_id"),
  projectName: text("project_name"),
  workForm: text("work_form").notNull(),
  remark: text("remark"),
  collaborator: text("collaborator"),
  weight: real("weight").notNull().default(1),
  scheduleKind: text("schedule_kind").notNull().default("random"),
  weekday: integer("weekday"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const timeBlocks = sqliteTable("time_blocks", {
  id: text("id").primaryKey(),
  workDate: text("work_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  templateId: text("template_id"),
  projectId: text("project_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("planned"),
  source: text("source").notNull().default("manual"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const timesheetEntries = sqliteTable("timesheet_entries", {
  id: text("id").primaryKey(),
  workDate: text("work_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  workNature: text("work_nature").notNull(),
  workCategory: text("work_category").notNull(),
  projectId: text("project_id"),
  projectName: text("project_name"),
  workForm: text("work_form").notNull(),
  remark: text("remark"),
  collaborator: text("collaborator"),
  status: text("status").notNull().default("confirmed"),
  source: text("source").notNull().default("manual"),
  exportedAt: text("exported_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const importExports = sqliteTable("import_exports", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  status: text("status").notNull(),
  summary: text("summary"),
  errorText: text("error_text"),
  createdAt: text("created_at").notNull(),
});
