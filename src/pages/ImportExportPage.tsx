import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { createId } from "../data/defaults";
import type { Project, WorkTemplate, WorkspaceState } from "../data/types";
import { exportMonthExcel, importConfigJson, importExcelWorkbook, mergeContinuousEntries } from "../features/excel";
import {
  clampTemplateWeight,
  getMonthTemplateSettings,
  isTemplateAllowed,
  normalizeRemarkOptions,
  templateSignature,
} from "../features/templates/templateState";
import { exportWorkspaceJson, importWorkspaceBackupJson } from "../features/workspaceBackup";

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const now = () => new Date().toISOString();

type ImportExportPageProps = {
  state: WorkspaceState;
  month: string;
  save: (patch: Partial<WorkspaceState>, message?: string) => Promise<void>;
  setNotice: (value: string) => void;
};

function mergeImportedTemplates(incoming: WorkTemplate[], retained: WorkTemplate[], projects: Project[], preferredBySignature = new Map<string, WorkTemplate>()) {
  const templates = new Map<string, WorkTemplate>();
  const normalizedIncoming = incoming.map((template) => {
    const preferred = preferredBySignature.get(templateSignature(template));
    return preferred ? { ...template, id: preferred.id, enabled: preferred.enabled, archived: preferred.archived ?? template.archived, createdAt: preferred.createdAt || template.createdAt } : template;
  });
  [...retained, ...normalizedIncoming].filter((template) => isTemplateAllowed(template, projects)).forEach((template) => {
    const key = templateSignature(template);
    const existing = templates.get(key);
    if (!existing) {
      templates.set(key, { ...template, remarkOptions: normalizeRemarkOptions(template), weight: clampTemplateWeight(template.weight || 1) });
      return;
    }
    const remarkOptions = [...new Set([...normalizeRemarkOptions(existing), ...normalizeRemarkOptions(template)])].slice(0, 12);
    templates.set(key, { ...existing, remark: existing.remark || remarkOptions[0], remarkOptions, weight: clampTemplateWeight(Math.max(existing.weight || 1, template.weight || 1)), updatedAt: now() });
  });
  return [...templates.values()];
}

export function ImportExportPage({ state, month, save, setNotice }: ImportExportPageProps) {
  const [importing, setImporting] = useState<"excel" | "json" | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>, kind: "excel" | "json") => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice("文件超过 20 MB，请拆分后再导入");
      event.target.value = "";
      return;
    }
    try {
      setImporting(kind);
      setNotice("正在导入文件");
      if (kind === "json") {
        const backup = await importWorkspaceBackupJson(file);
        if (backup) {
          await save({ ...backup.workspace, jobs: [backup.job, ...backup.workspace.jobs] }, backup.summary);
          return;
        }
      }
      const result = kind === "excel" ? await importExcelWorkbook(file) : await importConfigJson(file);
      const retainedProjects = kind === "excel" ? state.projects.filter((project) => project.source !== "excel") : state.projects;
      const projectNames = new Set(retainedProjects.map((project) => project.name));
      const projects = [...(result.projects || []).filter((project) => !projectNames.has(project.name)), ...retainedProjects];
      const retainedTemplates = kind === "excel" ? state.templates.filter((template) => !template.id.startsWith("template_xlsx_")) : state.templates;
      const preferredBySignature = new Map<string, WorkTemplate>();
      state.templates.forEach((template) => {
        const key = templateSignature(template);
        const existing = preferredBySignature.get(key);
        if (!existing || existing.id.startsWith("template_xlsx_")) preferredBySignature.set(key, template);
      });
      const templates = mergeImportedTemplates(result.templates || [], retainedTemplates, projects, preferredBySignature);
      const templateIds = new Set(templates.map((template) => template.id));
      const monthlyTemplateSettings = (state.monthlyTemplateSettings || []).filter((setting) => templateIds.has(setting.templateId));
      const entries = kind === "excel"
        ? mergeContinuousEntries([...state.entries.filter((entry) => entry.source !== "excel"), ...(result.entries || [])])
        : result.entries ? mergeContinuousEntries([...state.entries, ...result.entries]) : state.entries;
      const currentMonthSettings = getMonthTemplateSettings({ ...state, projects, templates, entries, monthlyTemplateSettings }, month);
      await save({
        projects,
        templates,
        entries,
        monthlyTemplateSettings: [...monthlyTemplateSettings.filter((setting) => setting.month !== month), ...currentMonthSettings],
        jobs: [...result.jobs, ...state.jobs],
      }, result.summary);
    } catch (error) {
      const job = { id: createId("job"), kind: kind === "excel" ? "excel_import" as const : "json_import" as const, fileName: file.name, status: "failed" as const, errorText: String(error), createdAt: now() };
      await save({ jobs: [job, ...state.jobs] }, "导入失败");
    } finally {
      setImporting(null);
      event.target.value = "";
    }
  };

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="p-5"><Upload className="mb-4 size-6 text-accent" /><h2 className="font-semibold">导入 Excel</h2><p className="mt-1 text-sm text-muted">导入项目清单、菜单和月度填报历史，单个文件最大 20 MB。</p><label className="mt-4 inline-flex"><input className="sr-only" type="file" accept=".xlsx,.xls" disabled={Boolean(importing)} onChange={(event) => void handleFile(event, "excel")} /><span className="inline-flex h-9 items-center rounded-lg border border-line/10 bg-white/70 px-4 text-sm font-semibold transition hover:bg-white dark:bg-white/10">{importing === "excel" ? "正在导入" : "选择 Excel"}</span></label></Card>
        <Card className="p-5"><Upload className="mb-4 size-6 text-accent" /><h2 className="font-semibold">导入数据</h2><p className="mt-1 text-sm text-muted">恢复 Workhour Studio 数据文件；旧配置会自动转为模板。</p><label className="mt-4 inline-flex"><input className="sr-only" type="file" accept=".json" disabled={Boolean(importing)} onChange={(event) => void handleFile(event, "json")} /><span className="inline-flex h-9 items-center rounded-lg border border-line/10 bg-white/70 px-4 text-sm font-semibold transition hover:bg-white dark:bg-white/10">{importing === "json" ? "正在导入" : "选择 JSON"}</span></label></Card>
        <Card className="p-5"><Download className="mb-4 size-6 text-accent" /><h2 className="font-semibold">导出数据</h2><p className="mt-1 text-sm text-muted">保存项目、模板、月度权重、日程和工时记录。</p><Button className="mt-4" variant="primary" onClick={() => { const job = exportWorkspaceJson(state); void save({ jobs: [job, ...state.jobs] }, job.summary); }}>导出数据</Button></Card>
        <Card className="p-5"><Download className="mb-4 size-6 text-accent" /><h2 className="font-semibold">导出 Excel</h2><p className="mt-1 text-sm text-muted">导出当前月份中的全部工时记录。</p><Button className="mt-4" variant="primary" onClick={() => { const job = exportMonthExcel(state.entries, month, state.profile); void save({ jobs: [job, ...state.jobs] }, job.summary); }}>导出 {month}</Button></Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="导入导出历史" />
        {state.jobs.length === 0 ? <div className="p-5"><EmptyState icon={<FileSpreadsheet className="size-5" />} title="暂无导入导出历史" text="导入文件或导出数据后，处理结果会显示在这里。" /></div> : <div className="overflow-auto scrollbar-soft"><table className="table-glass w-full min-w-[760px] text-left text-sm"><thead className="border-b border-line/10 text-xs text-muted"><tr><th className="px-5 py-3">时间</th><th className="px-5 py-3">类型</th><th className="px-5 py-3">文件</th><th className="px-5 py-3">结果</th><th className="px-5 py-3">摘要</th></tr></thead><tbody>{state.jobs.map((job) => <tr key={job.id} className="border-b border-line/10"><td className="px-5 py-3 text-muted">{job.createdAt.slice(0, 19).replace("T", " ")}</td><td className="px-5 py-3">{job.kind}</td><td className="px-5 py-3">{job.fileName}</td><td className="px-5 py-3"><Badge tone={job.status === "success" ? "blue" : "red"}>{job.status === "success" ? "成功" : "失败"}</Badge></td><td className="px-5 py-3 text-muted">{job.summary || job.errorText || "-"}</td></tr>)}</tbody></table></div>}
      </Card>
    </>
  );
}
