import Database from "@tauri-apps/plugin-sql";
import { createSeedState, defaultProfile } from "../data/defaults";
import { migrations } from "../data/migrations";
import type {
  ImportExportJob,
  Profile,
  Project,
  ProjectAlias,
  TimeBlock,
  TimesheetEntry,
  WorkTemplate,
  WorkspaceState,
} from "../data/types";

type SqlDb = Awaited<ReturnType<typeof Database.load>>;

const STORAGE_KEY = "workhour-studio.workspace";

let sqlDb: SqlDb | null | undefined;

const now = () => new Date().toISOString();

async function hasColumn(db: SqlDb, table: string, column: string) {
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
  collaborator: row.collaborator ? String(row.collaborator) : undefined,
  weight: Number(row.weight || 1),
  scheduleKind: (row.schedule_kind as WorkTemplate["scheduleKind"]) || "random",
  weekday: row.weekday ? Number(row.weekday) : undefined,
  startTime: row.start_time ? String(row.start_time) : undefined,
  endTime: row.end_time ? String(row.end_time) : undefined,
  enabled: Boolean(row.enabled),
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

async function getSqlDb() {
  if (sqlDb !== undefined) return sqlDb;
  if (!canUseTauri()) {
    sqlDb = null;
    return sqlDb;
  }
  try {
    sqlDb = await Database.load("sqlite:workhour-studio.db");
    for (const migration of migrations) {
      await sqlDb.execute(migration);
    }
    return sqlDb;
  } catch (error) {
    console.warn("SQLite unavailable, using browser storage fallback.", error);
    sqlDb = null;
    return sqlDb;
  }
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

export async function loadWorkspace(): Promise<WorkspaceState> {
  const db = await getSqlDb();
  if (!db) return loadFallback();

  const profileRows = await db.select<Record<string, unknown>[]>("SELECT * FROM profiles LIMIT 1");
  if (profileRows.length === 0) {
    await upsertProfile(defaultProfile);
  }

  const [profiles, projects, aliases, templates, blocks, entries, jobs] = await Promise.all([
    db.select<Record<string, unknown>[]>("SELECT * FROM profiles LIMIT 1"),
    db.select<Record<string, unknown>[]>("SELECT * FROM projects ORDER BY is_favorite DESC, updated_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM project_aliases ORDER BY created_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM work_templates ORDER BY enabled DESC, schedule_kind, updated_at DESC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM time_blocks ORDER BY work_date DESC, start_time ASC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM timesheet_entries ORDER BY work_date DESC, start_time ASC"),
    db.select<Record<string, unknown>[]>("SELECT * FROM import_exports ORDER BY created_at DESC LIMIT 100"),
  ]);

  return {
    profile: profiles[0] ? mapProfile(profiles[0]) : defaultProfile,
    projects: projects.map(mapProject),
    aliases: aliases.map(mapAlias),
    templates: templates.map(mapTemplate),
    blocks: blocks.map(mapBlock),
    entries: entries.map(mapEntry),
    jobs: jobs.map(mapJob),
  };
}

export async function replaceWorkspace(state: WorkspaceState) {
  const db = await getSqlDb();
  if (!db) {
    saveFallback(state);
    return;
  }

  await db.execute("DELETE FROM project_aliases");
  await db.execute("DELETE FROM time_blocks");
  await db.execute("DELETE FROM timesheet_entries");
  await db.execute("DELETE FROM work_templates");
  await db.execute("DELETE FROM projects");
  await db.execute("DELETE FROM import_exports");
  await db.execute("DELETE FROM profiles");

  await upsertProfile(state.profile);
  await Promise.all(state.projects.map(upsertProject));
  await Promise.all(state.aliases.map(upsertAlias));
  await Promise.all(state.templates.map(upsertTemplate));
  await Promise.all(state.blocks.map(upsertBlock));
  await Promise.all(state.entries.map(upsertEntry));
  await Promise.all(state.jobs.map(upsertJob));
}

export async function saveStatePatch(patch: Partial<WorkspaceState>, current: WorkspaceState) {
  const next = { ...current, ...patch };
  const db = await getSqlDb();
  if (!db) {
    saveFallback(next);
    return next;
  }
  if (patch.profile) await upsertProfile(patch.profile);
  if (patch.projects) {
    await db.execute("DELETE FROM projects");
    await Promise.all(patch.projects.map(upsertProject));
  }
  if (patch.aliases) {
    await db.execute("DELETE FROM project_aliases");
    await Promise.all(patch.aliases.map(upsertAlias));
  }
  if (patch.templates) {
    await db.execute("DELETE FROM work_templates");
    await Promise.all(patch.templates.map(upsertTemplate));
  }
  if (patch.blocks) {
    await db.execute("DELETE FROM time_blocks");
    await Promise.all(patch.blocks.map(upsertBlock));
  }
  if (patch.entries) {
    await db.execute("DELETE FROM timesheet_entries");
    await Promise.all(patch.entries.map(upsertEntry));
  }
  if (patch.jobs) {
    await db.execute("DELETE FROM import_exports");
    await Promise.all(patch.jobs.map(upsertJob));
  }
  return next;
}

export async function upsertProfile(profile: Profile) {
  const db = await getSqlDb();
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

export async function upsertProject(project: Project) {
  const db = await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO projects (id, name, code, category, status, begin_date, end_date, source, is_favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.code ?? null,
      project.category,
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

export async function upsertAlias(alias: ProjectAlias) {
  const db = await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO project_aliases (id, project_id, alias, match_mode, created_at) VALUES (?, ?, ?, ?, ?)`,
    [alias.id, alias.projectId, alias.alias, alias.matchMode, alias.createdAt || now()],
  );
}

export async function upsertTemplate(template: WorkTemplate) {
  const db = await getSqlDb();
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO work_templates
     (id, name, work_nature, work_category, project_id, project_name, work_form, remark, collaborator, weight, schedule_kind, weekday, start_time, end_time, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      template.id,
      template.name,
      template.workNature,
      template.workCategory,
      template.projectId ?? null,
      template.projectName ?? null,
      template.workForm,
      template.remark ?? null,
      template.collaborator ?? null,
      template.weight,
      template.scheduleKind,
      template.weekday ?? null,
      template.startTime ?? null,
      template.endTime ?? null,
      template.enabled ? 1 : 0,
      template.createdAt || now(),
      template.updatedAt || now(),
    ],
  );
}

export async function upsertBlock(block: TimeBlock) {
  const db = await getSqlDb();
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

export async function upsertEntry(entry: TimesheetEntry) {
  const db = await getSqlDb();
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

export async function upsertJob(job: ImportExportJob) {
  const db = await getSqlDb();
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
