import { createId } from "../data/defaults";
import type { ImportExportJob, TemplatePreset, WorkspaceState } from "../data/types";

const now = () => new Date().toISOString();
const backupFormat = "workhour-studio.workspace";
const backupVersion = 1;

type WorkspaceBackup = {
  format: typeof backupFormat;
  version: number;
  exportedAt: string;
  data: WorkspaceState;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const downloadJson = (fileName: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const templatePresetFormat = "workhour-studio.template-preset";
const templatePresetVersion = 1;

export function exportWorkspaceJson(state: WorkspaceState): ImportExportJob {
  const exportedAt = now();
  const fileName = `workhour-studio-${exportedAt.slice(0, 10)}.json`;
  const backup: WorkspaceBackup = {
    format: backupFormat,
    version: backupVersion,
    exportedAt,
    data: state,
  };
  downloadJson(fileName, backup);

  return {
    id: createId("job"),
    kind: "json_export",
    fileName,
    status: "success",
    summary: `导出 ${state.entries.length} 条工时记录、${state.projects.length} 个项目、${state.templates.length} 个模板`,
    createdAt: exportedAt,
  };
}

export async function importWorkspaceBackupJson(file: File) {
  const raw = JSON.parse(await file.text()) as unknown;
  if (!isRecord(raw) || raw.format !== backupFormat || !isRecord(raw.data)) return null;
  const data = raw.data as Partial<WorkspaceState>;
  if (!isRecord(data.profile)) throw new Error("数据文件缺少基础设置");

  const workspace: WorkspaceState = {
    profile: data.profile as WorkspaceState["profile"],
    projects: Array.isArray(data.projects) ? data.projects as WorkspaceState["projects"] : [],
    aliases: Array.isArray(data.aliases) ? data.aliases as WorkspaceState["aliases"] : [],
    templates: Array.isArray(data.templates) ? data.templates as WorkspaceState["templates"] : [],
    monthlyTemplateSettings: Array.isArray(data.monthlyTemplateSettings) ? data.monthlyTemplateSettings as WorkspaceState["monthlyTemplateSettings"] : [],
    templatePresets: Array.isArray(data.templatePresets) ? data.templatePresets as WorkspaceState["templatePresets"] : [],
    blocks: Array.isArray(data.blocks) ? data.blocks as WorkspaceState["blocks"] : [],
    entries: Array.isArray(data.entries) ? data.entries as WorkspaceState["entries"] : [],
    jobs: Array.isArray(data.jobs) ? data.jobs as WorkspaceState["jobs"] : [],
  };
  const job: ImportExportJob = {
    id: createId("job"),
    kind: "json_import",
    fileName: file.name,
    status: "success",
    summary: `恢复 ${workspace.entries.length} 条工时记录、${workspace.projects.length} 个项目、${workspace.templates.length} 个模板`,
    createdAt: now(),
  };

  return { workspace, job, summary: job.summary || "" };
}

export function exportTemplatePresetJson(preset: TemplatePreset): ImportExportJob {
  const exportedAt = now();
  const safeName = preset.name.replace(/[\\/:*?"<>|]/g, "_").trim() || "模板方案";
  const fileName = `workhour-template-${safeName}-${exportedAt.slice(0, 10)}.json`;
  downloadJson(fileName, {
    format: templatePresetFormat,
    version: templatePresetVersion,
    exportedAt,
    preset,
  });

  return {
    id: createId("job"),
    kind: "json_export",
    fileName,
    status: "success",
    summary: `导出模板方案“${preset.name}”`,
    createdAt: exportedAt,
  };
}

export async function importTemplatePresetJson(file: File) {
  const raw = JSON.parse(await file.text()) as unknown;
  if (!isRecord(raw) || raw.format !== templatePresetFormat || !isRecord(raw.preset)) {
    throw new Error("请选择 Workhour Studio 模板方案文件");
  }
  const preset = raw.preset as Partial<TemplatePreset>;
  if (!preset.name || !Array.isArray(preset.settings)) throw new Error("模板方案内容不完整");
  return {
    id: createId("template_preset"),
    name: String(preset.name),
    settings: (preset.settings as unknown[])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .map((item) => ({
        templateId: String(item.templateId || ""),
        enabled: Boolean(item.enabled),
        weight: Number(item.weight || 1),
      }))
      .filter((item) => item.templateId),
    createdAt: now(),
    updatedAt: now(),
  } satisfies TemplatePreset;
}
