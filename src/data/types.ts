export type ThemeMode = "light" | "dark" | "system";
export type PageKey = "dashboard" | "schedule" | "projects" | "templates" | "timesheet" | "analytics" | "guide" | "importExport" | "settings";
export type EntryStatus = "confirmed" | "draft";
export type TemplateKind = "random" | "fixed" | "weekend_lecture";

export interface Profile {
  id: string;
  language: "zh-CN" | "en-US";
  theme: ThemeMode;
  defaultStart: string;
  defaultEnd: string;
  lunchStart: string;
  lunchEnd: string;
  excelPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  code?: string;
  category: string;
  status: "active" | "closed" | "paused";
  beginDate?: string;
  endDate?: string;
  source: "manual" | "excel" | "json" | "script";
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAlias {
  id: string;
  projectId: string;
  alias: string;
  matchMode: "exact" | "fuzzy";
  createdAt: string;
}

export interface WorkTemplate {
  id: string;
  name: string;
  workNature: string;
  workCategory: string;
  projectId?: string;
  projectName?: string;
  workForm: string;
  remark?: string;
  remarkOptions?: string[];
  collaborator?: string;
  weight: number;
  scheduleKind: TemplateKind;
  weekday?: number;
  startTime?: string;
  endTime?: string;
  enabled: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyTemplateSetting {
  id: string;
  month: string;
  templateId: string;
  enabled: boolean;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimeBlock {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  templateId?: string;
  projectId?: string;
  title: string;
  status: "planned" | "done" | "skipped";
  source: "manual" | "template" | "excel";
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetEntry {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  workNature: string;
  workCategory: string;
  projectId?: string;
  projectName?: string;
  workForm: string;
  remark?: string;
  collaborator?: string;
  status: EntryStatus;
  source: "manual" | "excel" | "autofill" | "template";
  exportedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportExportJob {
  id: string;
  kind: "excel_import" | "excel_export" | "json_import" | "json_export";
  fileName: string;
  periodStart?: string;
  periodEnd?: string;
  status: "success" | "failed";
  summary?: string;
  errorText?: string;
  createdAt: string;
}

export interface WorkspaceState {
  profile: Profile;
  projects: Project[];
  aliases: ProjectAlias[];
  templates: WorkTemplate[];
  monthlyTemplateSettings: MonthlyTemplateSetting[];
  blocks: TimeBlock[];
  entries: TimesheetEntry[];
  jobs: ImportExportJob[];
}

export interface ImportResult {
  projects?: Project[];
  templates?: WorkTemplate[];
  entries?: TimesheetEntry[];
  jobs: ImportExportJob[];
  summary: string;
}
