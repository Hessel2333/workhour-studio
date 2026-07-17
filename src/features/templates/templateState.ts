import { createId } from "../../data/defaults";
import type { MonthlyTemplateSetting, Project, TemplatePreset, WorkTemplate, WorkspaceState } from "../../data/types";

const projectRequiredCategories = new Set(["总部项目", "公司项目", "院控项目", "创新创效", "探索项目", "其他科研生产"]);
const now = () => new Date().toISOString();

export const clampTemplateWeight = (weight: number) => Math.min(20, Math.max(1, Math.round(Number.isFinite(weight) ? weight : 10)));
export const requiresLinkedProject = (workCategory: string) => projectRequiredCategories.has(workCategory);
export const isCommonTemplate = (template: Pick<WorkTemplate, "enabled" | "archived">) => template.enabled && !template.archived;

export function projectExists(projects: Project[], projectName?: string) {
  if (!projectName || projectName === "备注") return true;
  return projects.some((project) => project.name === projectName);
}

export function isTemplateAllowed(template: Pick<WorkTemplate, "workCategory" | "projectName">, projects: Project[]) {
  if (!requiresLinkedProject(template.workCategory)) return true;
  return Boolean(template.projectName && template.projectName !== "备注" && projectExists(projects, template.projectName));
}

export const normalizeRemarkOptions = (template: Pick<WorkTemplate, "remark" | "remarkOptions">) =>
  [...new Set([...(template.remarkOptions || []), template.remark || ""].map((item) => item.trim()).filter(Boolean))].slice(0, 12);

export const templateSignature = (template: Pick<WorkTemplate, "workNature" | "workCategory" | "projectName" | "workForm" | "scheduleKind">) =>
  [template.workNature, template.workCategory, template.projectName || "", template.workForm, template.scheduleKind].join("\u0001");

export function createMonthlyTemplateSetting(month: string, template: WorkTemplate, patch: Partial<MonthlyTemplateSetting> = {}): MonthlyTemplateSetting {
  return {
    id: patch.id || createId("monthly_template"),
    month,
    templateId: template.id,
    enabled: patch.enabled ?? isCommonTemplate(template),
    weight: clampTemplateWeight(patch.weight ?? template.weight),
    createdAt: patch.createdAt || now(),
    updatedAt: patch.updatedAt || now(),
  };
}

export function getMonthTemplateSettings(state: WorkspaceState, month: string) {
  const templateIds = new Set(state.templates.map((template) => template.id));
  const completeSettings = (settings: MonthlyTemplateSetting[]) => {
    const configuredTemplateIds = new Set(settings.map((setting) => setting.templateId));
    return [...settings, ...state.templates.filter((template) => !configuredTemplateIds.has(template.id)).map((template) => createMonthlyTemplateSetting(month, template))];
  };
  const settings = (state.monthlyTemplateSettings || []).filter((setting) => setting.month === month && templateIds.has(setting.templateId));
  if (settings.length) return completeSettings(settings);
  const previousMonth = [...new Set((state.monthlyTemplateSettings || []).filter((setting) => setting.month < month && templateIds.has(setting.templateId)).map((setting) => setting.month))].sort().at(-1);
  if (!previousMonth) return completeSettings([]);
  return completeSettings((state.monthlyTemplateSettings || []).filter((setting) => setting.month === previousMonth && templateIds.has(setting.templateId)).map((setting) => ({ ...setting, id: createId("monthly_template"), month, createdAt: now(), updatedAt: now() })));
}

export function applyMonthSettings(templates: WorkTemplate[], settings: MonthlyTemplateSetting[]) {
  const settingsByTemplate = new Map(settings.map((setting) => [setting.templateId, setting]));
  return templates.map((template) => {
    const setting = settingsByTemplate.get(template.id);
    return setting ? { ...template, enabled: setting.enabled, weight: clampTemplateWeight(setting.weight) } : template;
  });
}

export function createTemplatePreset(name: string, settings: MonthlyTemplateSetting[]): TemplatePreset {
  return {
    id: createId("template_preset"),
    name: name.trim() || "未命名方案",
    settings: settings.map((setting) => ({ templateId: setting.templateId, enabled: setting.enabled, weight: clampTemplateWeight(setting.weight) })),
    createdAt: now(),
    updatedAt: now(),
  };
}

export function applyPresetToMonth(month: string, templates: WorkTemplate[], preset: TemplatePreset, existing: MonthlyTemplateSetting[]) {
  const presetByTemplate = new Map(preset.settings.map((setting) => [setting.templateId, setting]));
  return templates.map((template) => {
    const presetSetting = presetByTemplate.get(template.id);
    const current = existing.find((setting) => setting.templateId === template.id);
    return createMonthlyTemplateSetting(month, template, {
      ...current,
      enabled: presetSetting?.enabled ?? false,
      weight: presetSetting?.weight ?? current?.weight ?? template.weight,
      id: current?.id,
      createdAt: current?.createdAt,
      updatedAt: now(),
    });
  });
}

export function getAutofillTemplates(state: WorkspaceState, month: string) {
  return applyMonthSettings(state.templates, getMonthTemplateSettings(state, month))
    .filter(isCommonTemplate)
    .filter((template) => isTemplateAllowed(template, state.projects))
    .map((template) => projectExists(state.projects, template.projectName) ? template : { ...template, projectName: "备注", projectId: undefined });
}
