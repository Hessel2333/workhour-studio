import type { MonthlyTemplateSetting, Profile, Project, TemplatePreset, TimesheetEntry, WorkTemplate, WorkspaceState } from "./types";

const now = () => new Date().toISOString();

export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export const defaultProfile: Profile = {
  id: "profile_default",
  language: "zh-CN",
  theme: "system",
  defaultStart: "08:00",
  defaultEnd: "17:00",
  lunchStart: "11:30",
  lunchEnd: "13:00",
  createdAt: now(),
  updatedAt: now(),
};

export const seedProjects: Project[] = [
  {
    id: createId("project"),
    name: "研究院智慧信息系统建设与应用探索",
    category: "探索项目",
    ownerScope: "self",
    status: "active",
    source: "manual",
    isFavorite: true,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: createId("project"),
    name: "滚塑成型聚合物微观结构表征",
    code: "25NM022",
    category: "院控项目",
    ownerScope: "self",
    status: "active",
    source: "manual",
    isFavorite: true,
    createdAt: now(),
    updatedAt: now(),
  },
];

export const seedTemplates: WorkTemplate[] = [
  {
    id: createId("template"),
    name: "资料调研",
    workNature: "科研工作",
    workCategory: "探索项目",
    projectName: "研究院智慧信息系统建设与应用探索",
    workForm: "资料调研",
    remark: "信息化系统方案调研",
    remarkOptions: ["信息化系统方案调研"],
    weight: 20,
    scheduleKind: "random",
    enabled: true,
    archived: false,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: createId("template"),
    name: "实验室维护",
    workNature: "事务性工作",
    workCategory: "实验室日常维护",
    projectName: "备注",
    workForm: "其他",
    remark: "核磁补充液氮",
    remarkOptions: ["核磁补充液氮"],
    collaborator: "张敏",
    weight: 1,
    scheduleKind: "fixed",
    weekday: 1,
    startTime: "13:00",
    endTime: "17:00",
    enabled: true,
    archived: false,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: createId("template"),
    name: "周末讲堂",
    workNature: "科研工作",
    workCategory: "其他科研",
    projectName: "备注",
    workForm: "基地会议",
    remark: "周末讲堂",
    remarkOptions: ["周末讲堂"],
    weight: 1,
    scheduleKind: "weekend_lecture",
    weekday: 6,
    startTime: "09:00",
    endTime: "11:30",
    enabled: true,
    archived: false,
    createdAt: now(),
    updatedAt: now(),
  },
];

export const seedEntries: TimesheetEntry[] = [
  {
    id: createId("entry"),
    workDate: new Date().toISOString().slice(0, 10),
    startTime: "08:00",
    endTime: "09:30",
    workNature: "科研工作",
    workCategory: "探索项目",
    projectName: "研究院智慧信息系统建设与应用探索",
    workForm: "资料调研",
    remark: "信息化系统方案demo搭建",
    status: "confirmed",
    source: "manual",
    createdAt: now(),
    updatedAt: now(),
  },
];

export const seedMonthlyTemplateSettings: MonthlyTemplateSetting[] = seedTemplates.map((template) => ({
  id: createId("monthly_template"),
  month: new Date().toISOString().slice(0, 7),
  templateId: template.id,
  enabled: template.enabled && !template.archived,
  weight: template.weight,
  createdAt: now(),
  updatedAt: now(),
}));

export const seedTemplatePresets: TemplatePreset[] = [{
  id: createId("template_preset"),
  name: "默认方案",
  settings: seedMonthlyTemplateSettings.map((setting) => ({
    templateId: setting.templateId,
    enabled: setting.enabled,
    weight: setting.weight,
  })),
  createdAt: now(),
  updatedAt: now(),
}];

export const createSeedState = (): WorkspaceState => ({
  profile: { ...defaultProfile },
  projects: [...seedProjects],
  aliases: [],
  templates: [...seedTemplates],
  monthlyTemplateSettings: [...seedMonthlyTemplateSettings],
  templatePresets: [...seedTemplatePresets],
  blocks: [],
  entries: [...seedEntries],
  jobs: [],
});
