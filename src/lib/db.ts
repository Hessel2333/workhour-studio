import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { validateWorkspace } from "../data/validateWorkspace";
import { createSeedState, defaultProfile } from "../data/defaults";
import { migrations } from "../data/migrations";
import type {
  ImportExportJob,
  MonthlyTemplateSetting,
  Profile,
  Project,
  ProjectAlias,
  TemplatePreset,
  TemplatePresetSetting,
  TimeBlock,
  TimesheetEntry,
  WorkTemplate,
  WorkspaceState,
} from "../data/types";

type SqlDb = Awaited<ReturnType<typeof Database.load>>;
type SqlExecutor = Pick<SqlDb, "select" | "execute">;
type Statement = { query: string; values: unknown[] };

const STORAGE_KEY = "workhour-studio.workspace";

let sqlDb: SqlDb | null | undefined;
let initialization: Promise<SqlDb | null> | undefined;
let writes: Promise<unknown> = Promise.resolve();

const now = () => new Date().toISOString();

function parseStringArray(value: unknown) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : undefined;
  } catch {
    return undefined;
  }
}

function parsePresetSettings(value: unknown): TemplatePresetSetting[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .map((item) => ({
        templateId: String(item.templateId || item.template_id || ""),
        enabled: Boolean(item.enabled),
        weight: Number(item.weight || 1),
      }))
      .filter((item) => item.templateId);
  } catch {
    return [];
  }
}

async function hasColumn(db: SqlExecutor, table: string, column: string) {
  const rows = await db.select<Array<{ name?: string }>>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

const mapProfile = (row: Record<string, unknown>): Profile => ({
  id: String(row.id),
  language: (row.language as Profile["language"]) || "zh-CN",
  theme: (row.theme as Profile["theme"]) || "system",
  defaultStart: String(row.default_start || "08:00"),
  defaultEnd: String(row.default_end || "17:00"),
  lunchStart: String(row.lunch_start || "11:30"),
  lunchEnd: String(row.lunch_end || "13:00"),
  excelPath: row.excel_path ? String(row.excel_path) : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapProject = (row: Record<string, unknown>): Project => ({
  id: String(row.id),
  name: String(row.name),
  code: row.code ? String(row.code) : undefined,
  category: String(row.category),
  remark: row.remark ? String(row.remark) : undefined,
  ownerScope: row.owner_scope === "other" ? "other" : "self",
  status: (row.status as Project["status"]) || "active",
  beginDate: row.begin_date ? String(row.begin_date) : undefined,
  endDate: row.end_date ? String(row.end_date) : undefined,
  source: (row.source as Project["source"]) || "manual",
  isFavorite: Boolean(row.is_favorite),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapTemplate = (row: Record<string, unknown>): WorkTemplate => ({
  id: String(row.id),
  name: String(row.name),
  workNature: String(row.work_nature),
  workCategory: String(row.work_category),
  projectId: row.project_id ? String(row.project_id) : undefined,
  projectName: row.project_name ? String(row.project_name) : undefined,
  workForm: String(row.work_form),
  remark: row.remark ? String(row.remark) : undefined,
  remarkOptions: parseStringArray(row.remark_options),
  collaborator: row.collaborator ? String(row.collaborator) : undefined,
  weight: Number(row.weight || 1),
  scheduleKind: (row.schedule_kind as WorkTemplate["scheduleKind"]) || "random",
  weekday: row.weekday ? Number(row.weekday) : undefined,
  startTime: row.start_time ? String(row.start_time) : undefined,
  endTime: row.end_time ? String(row.end_time) : undefined,
  enabled: Boolean(row.enabled),
  archived: Boolean(row.archived),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapMonthlyTemplateSetting = (row: Record<string, unknown>): MonthlyTemplateSetting => ({
  id: String(row.id),
  month: String(row.month),
  templateId: String(row.template_id),
  enabled: Boolean(row.enabled),
  weight: Number(row.weight || 1),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapTemplatePreset = (row: Record<string, unknown>): TemplatePreset => ({
  id: String(row.id),
  name: String(row.name),
  settings: parsePresetSettings(row.settings_json),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapEntry = (row: Record<string, unknown>): TimesheetEntry => ({
  id: String(row.id),
  workDate: String(row.work_date),
  startTime: String(row.start_time),
  endTime: String(row.end_time),
  workNature: String(row.work_nature),
  workCategory: String(row.work_category),
  projectId: row.project_id ? String(row.project_id) : undefined,
  projectName: row.project_name ? String(row.project_name) : undefined,
  workForm: String(row.work_form),
  remark: row.remark ? String(row.remark) : undefined,
  collaborator: row.collaborator ? String(row.collaborator) : undefined,
  status: (row.status as TimesheetEntry["status"]) || "confirmed",
  source: (row.source as TimesheetEntry["source"]) || "manual",
  exportedAt: row.exported_at ? String(row.exported_at) : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapAlias = (row: Record<string, unknown>): ProjectAlias => ({
  id: String(row.id),
  projectId: String(row.project_id),
  alias: String(row.alias),
  matchMode: (row.match_mode as ProjectAlias["matchMode"]) || "fuzzy",
  createdAt: String(row.created_at),
});

const mapBlock = (row: Record<string, unknown>): TimeBlock => ({
  id: String(row.id),
  workDate: String(row.work_date),
  startTime: String(row.start_time),
  endTime: String(row.end_time),
  templateId: row.template_id ? String(row.template_id) : undefined,
  projectId: row.project_id ? String(row.project_id) : undefined,
  title: String(row.title),
  status: (row.status as TimeBlock["status"]) || "planned",
  source: (row.source as TimeBlock["source"]) || "manual",
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapJob = (row: Record<string, unknown>): ImportExportJob => ({
  id: String(row.id),
  kind: row.kind as ImportExportJob["kind"],
  fileName: String(row.file_name),
  periodStart: row.period_start ? String(row.period_start) : undefined,
  periodEnd: row.period_end ? String(row.period_end) : undefined,
  status: row.status as ImportExportJob["status"],
  summary: row.summary ? String(row.summary) : undefined,
  errorText: row.error_text ? String(row.error_text) : undefined,
  createdAt: String(row.created_at),
});

const canUseTauri = () => Boolean("__TAURI_INTERNALS__" in window);

async function getSqlDb(): Promise<SqlDb | null> {
  if (sqlDb !== undefined) return sqlDb;
  if (!canUseTauri()) return (sqlDb = null);
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      const db = await Database.load("sqlite:workhour-studio.db");
      for (const migration of migrations) await db.execute(migration);
      for (const [table, column, definition] of [
        ["work_templates", "remark_options", "TEXT"],
        ["work_templates", "archived", "INTEGER NOT NULL DEFAULT 0"],
        ["projects", "remark", "TEXT"],
        ["projects", "owner_scope", "TEXT NOT NULL DEFAULT 'self'"],
      ]) {
        if (!(await hasColumn(db, table, column))) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
      sqlDb = db;
      return db;
    } catch (error) {
      throw new Error(`无法打开本地 SQLite 数据库。原数据未改为浏览器存储，请关闭应用后重试。${String(error)}`);
    } finally {
      initialization = undefined;
    }
  })();
  return initialization;
}

function enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
  const pending = writes.then(work);
  writes = pending.catch(() => undefined);
  return pending;
}

async function atomicWrite(db: SqlDb, work: (writer: SqlExecutor) => Promise<void>) {
  const statements: Statement[] = [];
  const writer: SqlExecutor = {
    select: (query, values) => db.select(query, values),
    execute: async (query, values = []) => {
      statements.push({ query, values });
      return { rowsAffected: 0, lastInsertId: 0 };
    },
  };
  await work(writer);
  if (statements.length) await invoke("save_workspace_batch", { statements });
}

const loadFallback = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = createSeedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(raw) as WorkspaceState;
};

const saveFallback = (state: WorkspaceState) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

async function syncCollection<T extends { id: string }>(
  db: SqlExecutor,
  table: string,
  currentItems: T[] | undefined,
  nextItems: T[],
  upsert: (item: T, db?: SqlExecutor) => Promise<void>,
) {
  const currentById = new Map((currentItems || []).map((item) => [item.id, item]));
  const nextById = new Map(nextItems.map((item) => [item.id, item]));

  await Promise.all(
    [...currentById.keys()]
      .filter((id) => !nextById.has(id))
      .map((id) => db.execute(`DELETE FROM ${table} WHERE id = ?`, [id])),
  );

  await Promise.all(
    nextItems
      .filter((item) => JSON.stringify(currentById.get(item.id)) !== JSON.stringify(item))
      .map((item) => upsert(item, db)),
  );
}

export async function loadWorkspace(): Promise<WorkspaceState> {
  const db = await getSqlDb();
  if (!db) return loadFallback();

  const profileRows = await db.select<Record<string, unknown>[]>("SELECT * FROM profiles LIMIT 1");
  if (profileRows.length === 0) {
    await upsertProfile(defaultProfile);
  }

  const [profiles, projects, aliases, templates, monthlyTemplateSettings, templatePresets, blocks, entries, jobs] = await Promise.all([
    db.select<Record<string, unknown>[]>("SELECT * FROM profiles LIMIT 1"),
    db.select<Record<string, unknown>[]>("SELECT * FROM projects ORDER BY is_favorite DESC, updated_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM project_aliases ORDER BY created_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM work_templates ORDER BY enabled DESC, schedule_kind, updated_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM monthly_template_settings ORDER BY month DESC, updated_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM template_presets ORDER BY updated_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM time_blocks ORDER BY work_date DESC, start_time ASC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM timesheet_entries ORDER BY work_date DESC, start_time ASC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM import_exports ORDER BY created_at DESC LIMIT 100"),
  ]);

  return {
    profile: profiles[0] ? mapProfile(profiles[0]) : defaultProfile,
    projects: projects.map(mapProject),
    aliases: aliases.map(mapAlias),
    templates: templates.map(mapTemplate),
    monthlyTemplateSettings: monthlyTemplateSettings.map(mapMonthlyTemplateSetting),
    templatePresets: templatePresets.map(mapTemplatePreset),
    blocks: blocks.map(mapBlock),
    entries: entries.map(mapEntry),
    jobs: jobs.map(mapJob),
  };
}

export function replaceWorkspace(state: WorkspaceState) {
  const validated = validateWorkspace(state);
  return enqueueWrite(async () => {
    const db = await getSqlDb();
    if (!db) { saveFallback(validated); return; }
    await atomicWrite(db, async (writer) => {
      for (const table of ["project_aliases", "time_blocks", "timesheet_entries", "monthly_template_settings", "template_presets", "work_templates", "projects", "import_exports", "profiles"]) {
        await writer.execute(`DELETE FROM ${table}`);
      }
      const empty = { ...validated, projects: [], aliases: [], templates: [], monthlyTemplateSettings: [], templatePresets: [], blocks: [], entries: [], jobs: [] };
      await writePatch(validated, empty, writer);
    });
  });
}

export function saveStatePatch(patch: Partial<WorkspaceState>, current: WorkspaceState) {
  return enqueueWrite(async () => {
    const next = { ...current, ...patch };
    const db = await getSqlDb();
    if (!db) { saveFallback(next); return next; }
    await atomicWrite(db, (writer) => writePatch(patch, current, writer));
    return next;
  });
}

async function writePatch(patch: Partial<WorkspaceState>, current: WorkspaceState, db: SqlExecutor) {
  if (patch.profile) {
    await db.execute("DELETE FROM profiles WHERE id <> ?", [patch.profile.id]);
    await upsertProfile(patch.profile, db);
  }
  if (patch.projects) {
    await syncCollection(db, "projects", current.projects, patch.projects, upsertProject);
  }
  if (patch.aliases) {
    await syncCollection(db, "project_aliases", current.aliases, patch.aliases, upsertAlias);
  }
  if (patch.templates) {
    await syncCollection(db, "work_templates", current.templates, patch.templates, upsertTemplate);
  }
  if (patch.monthlyTemplateSettings) {
    await syncCollection(db, "monthly_template_settings", current.monthlyTemplateSettings, patch.monthlyTemplateSettings, upsertMonthlyTemplateSetting);
  }
  if (patch.templatePresets) {
    await syncCollection(db, "template_presets", current.templatePresets, patch.templatePresets, upsertTemplatePreset);
  }
  if (patch.blocks) {
    await syncCollection(db, "time_blocks", current.blocks, patch.blocks, upsertBlock);
  }
  if (patch.entries) {
    await syncCollection(db, "timesheet_entries", current.entries, patch.entries, upsertEntry);
  }
  if (patch.jobs) {
    await syncCollection(db, "import_exports", current.jobs, patch.jobs, upsertJob);
  }
}

export async function upsertProfile(profile: Profile, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  const values = [
    profile.id,
    profile.language,
    profile.theme,
    profile.defaultStart,
    profile.defaultEnd,
    profile.lunchStart,
    profile.lunchEnd,
    profile.excelPath ?? null,
    profile.createdAt || now(),
    profile.updatedAt || now(),
  ];

  if (await hasColumn(db, "profiles", "display_name")) {
    await db.execute(
      `INSERT OR REPLACE INTO profiles (id, display_name, language, theme, default_start, default_end, lunch_start, lunch_end, excel_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [profile.id, "", ...values.slice(1)],
    );
    return;
  }

  await db.execute(
    `INSERT OR REPLACE INTO profiles (id, language, theme, default_start, default_end, lunch_start, lunch_end, excel_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values,
  );
}

export async function upsertProject(project: Project, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO projects (id, name, code, category, remark, owner_scope, status, begin_date, end_date, source, is_favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.code ?? null,
      project.category,
      project.remark ?? null,
      project.ownerScope ?? "self",
      project.status,
      project.beginDate ?? null,
      project.endDate ?? null,
      project.source,
      project.isFavorite ? 1 : 0,
      project.createdAt || now(),
      project.updatedAt || now(),
    ],
  );
}

export async function upsertAlias(alias: ProjectAlias, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO project_aliases (id, project_id, alias, match_mode, created_at) VALUES (?, ?, ?, ?, ?)`,
    [alias.id, alias.projectId, alias.alias, alias.matchMode, alias.createdAt || now()],
  );
}

export async function upsertTemplate(template: WorkTemplate, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO work_templates
     (id, name, work_nature, work_category, project_id, project_name, work_form, remark, remark_options, collaborator, weight, schedule_kind, weekday, start_time, end_time, enabled, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      template.id,
      template.name,
      template.workNature,
      template.workCategory,
      template.projectId ?? null,
      template.projectName ?? null,
      template.workForm,
      template.remark ?? null,
      template.remarkOptions?.length ? JSON.stringify(template.remarkOptions) : null,
      template.collaborator ?? null,
      template.weight,
      template.scheduleKind,
      template.weekday ?? null,
      template.startTime ?? null,
      template.endTime ?? null,
      template.enabled ? 1 : 0,
      template.archived ? 1 : 0,
      template.createdAt || now(),
      template.updatedAt || now(),
    ],
  );
}

export async function upsertMonthlyTemplateSetting(setting: MonthlyTemplateSetting, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO monthly_template_settings
     (id, month, template_id, enabled, weight, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      setting.id,
      setting.month,
      setting.templateId,
      setting.enabled ? 1 : 0,
      setting.weight,
      setting.createdAt || now(),
      setting.updatedAt || now(),
    ],
  );
}

export async function upsertTemplatePreset(preset: TemplatePreset, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO template_presets
     (id, name, settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      preset.id,
      preset.name,
      JSON.stringify(preset.settings || []),
      preset.createdAt || now(),
      preset.updatedAt || now(),
    ],
  );
}

export async function upsertBlock(block: TimeBlock, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO time_blocks
     (id, work_date, start_time, end_time, template_id, project_id, title, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      block.id,
      block.workDate,
      block.startTime,
      block.endTime,
      block.templateId ?? null,
      block.projectId ?? null,
      block.title,
      block.status,
      block.source,
      block.createdAt || now(),
      block.updatedAt || now(),
    ],
  );
}

export async function upsertEntry(entry: TimesheetEntry, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO timesheet_entries
     (id, work_date, start_time, end_time, work_nature, work_category, project_id, project_name, work_form, remark, collaborator, status, source, exported_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.workDate,
      entry.startTime,
      entry.endTime,
      entry.workNature,
      entry.workCategory,
      entry.projectId ?? null,
      entry.projectName ?? null,
      entry.workForm,
      entry.remark ?? null,
      entry.collaborator ?? null,
      entry.status,
      entry.source,
      entry.exportedAt ?? null,
      entry.createdAt || now(),
      entry.updatedAt || now(),
    ],
  );
}

export async function upsertJob(job: ImportExportJob, database?: SqlExecutor) {
  const db = database ?? await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO import_exports
     (id, kind, file_name, period_start, period_end, status, summary, error_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.kind,
      job.fileName,
      job.periodStart ?? null,
      job.periodEnd ?? null,
      job.status,
      job.summary ?? null,
      job.errorText ?? null,
      job.createdAt || now(),
    ],
  );
}
